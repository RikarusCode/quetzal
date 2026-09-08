# Quetzal in the browser: feasibility and implementation plan

Research date: 2026-09-08. Status: proposed architecture; no runtime proof yet.

## 1. The intended experience

A player opens a link, selects a compatible Emerald ROM on their device, and
starts Quetzal without installing an emulator. They can create or join a friend
lobby, play their own trainer, leave, and return to their progress. Eventually
an account or private recovery code restores saves on another device. That new
device still needs the player's ROM.

Quetzal provides the game, multiplayer mechanics, and gameplay improvements;
this project supplies browser emulation, connectivity, persistence, and the
surrounding experience. It should preserve the full game rather than recreate a
subset of Pokemon in JavaScript.

The creator's site advertises updated Pokemon/mechanics, cooperative exploration
and trainer challenges, selectable characters, and overworld Pokemon. The
download page currently identifies v0.8.4 and a clean USA Emerald input. Its
multiplayer information page is under construction, so exact progression,
joining, and recovery behavior must be established experimentally. Do not infer
those rules from the promotional description. [S1-S3]

Working defaults while preferences are pending:

- Two players on desktop Chrome/Edge first; Android/iPhone and four players later.
- Each player owns an independent save, including the ability to play solo.
- Private friend sessions first; no public matchmaking or competitive economy.
- Cloudflare is the preferred backend, contingent on transport measurements.
- A shared run groups player saves and a pinned game version; it is not one
  merged cartridge save. Dedicated co-op slots can be offered later.

## 2. The feasibility answer

**Source-level verdict: promising and worth a bounded prototype. Browser-level
verdict: unproven.** The likely task is to expose the existing packet interface
in a custom browser frontend, rather than reimplement wireless hardware.

Evidence inspected:

| Finding | Implication | Evidence |
| --- | --- | --- |
| gpSP registers `RETRO_ENVIRONMENT_SET_NETPACKET_INTERFACE`; receive dispatch reaches RFU | There is an existing frontend boundary to bridge | S4, `libretro/libretro.c`, approximately lines 440-511 and 657-658 |
| gpSP's Makefile has an Emscripten target producing a static archive with a `.bc` name | A web build path exists, but this is not a ready browser application | S5, approximately lines 425-428 |
| The RFU path polls for incoming packets while processing emulated time | Asynchronous browser delivery may require scheduler work | S6, `rfu_update` |
| The libretro API specifies connection lifecycle, addressing, ordering and polling | Implement a frontend contract, not arbitrary packet forwarding | S7 |
| gpSP exposes cartridge backup memory through libretro | Local save persistence has a straightforward integration point | S4, approximately lines 1247-1263 |

These source URLs track upstream master, not a reproducible revision. Pin a
commit before development; line numbers may move. No successful Emscripten
build, Quetzal execution, multiplayer session, or benchmark was performed here.

The inspected RFU implementation delegates network access to callbacks. That is
positive evidence against a compulsory native-socket/thread dependency in this
path, not an audit of every dependency in gpSP or RetroArch. [S4, S6]

Libretro documented separate-console wireless netplay for gpSP in RetroArch
1.17. This supports the architecture but does not certify today's Quetzal patch
with our proposed browser build. [S8]

### Where the earlier advice needs refinement

1. Add a native baseline first. Otherwise game configuration problems can be
   mistaken for WebAssembly bugs.
2. Two local instances prove substantial integration, but do not prove internet
   latency tolerance, background-tab behavior, or recovery.
3. WebSocket is a reasonable initial transport, not a guaranteed transparent
   replacement. Queuing and TCP stalls must fit the game's timing tolerances.
4. Save export belongs in the earliest persistence prototype, so debugging does
   not strand progress.
5. A working socket reconnect does not mean a live game session can reconnect.

## 3. Proposed architecture

```text
Browser A                                      Browser B
local ROM -> patch -> gpSP WASM                 local ROM -> patch -> gpSP WASM
                     |                                              |
              netpacket adapter                              netpacket adapter
                     |                                              |
                     +----- local channel / WSS room relay ---------+

Each browser: trainer save -> IndexedDB -> optional cloud save API
Backend: Worker API + one Durable Object per room
Later: D1 metadata/ownership, R2 versioned save blobs
```

The server routes emulator packets and manages membership. Game logic runs in
each browser. A Durable Object is not an authoritative emulator and does not
make all players share a single game state.

### Browser runtime

Start with a minimal TypeScript page and a small C libretro host linked with
gpSP through Emscripten. Supply input, video, audio, core options, virtual-file
loading, save access, and netpacket callbacks. Use one isolated WASM instance
per player, preferably in a dedicated Worker. Render to canvas and feed browser
audio with a bounded buffer. Add framework/UI machinery only when useful.

Begin with the portable interpreter. The Emscripten target does not enable the
native dynarec; native performance cannot be assumed to carry over. Measure
Quetzal's busy scenes, not just its title screen. [S5]

Build a diagnostic interface that reports frame duration, emulated speed, audio
underruns, incoming/outgoing packet counts, queue age, and disconnect reasons.
Use a reproducible build script, preferably containerized or documented for WSL
on this Windows workstation, and pin the SDK and dependencies.

### Packet adapter and scheduling

Implement this transport-independent contract:

- Start/stop a session and preserve the host/client identities.
- Send targeted or broadcast bytes, including explicit flush behavior.
- Deliver received bytes with their actual sender identity.
- Apply host-side connection acceptance/disconnection callbacks correctly.
- Bound payload sizes, queues, and pending work; reject stale session epochs.

Use host ID 0, distinct client IDs, and the API's broadcast sentinel. Preserve
reliable ordering and don't invoke core callbacks concurrently. These are API
requirements, not details to invent in the room server. [S7]

Begin by yielding between frames and delivering queued packets before the next
frame. A Worker receiving WebSocket or MessagePort events cannot process those
events while synchronous WASM occupies that same worker. Moving the emulator
off the UI thread alone does not solve intra-frame receive polling. Emscripten
requires cooperative control of the browser event loop. [S9]

If measurements show that frame-boundary delivery is insufficient, evaluate:

1. A separate network worker writing a bounded SharedArrayBuffer queue; the
   emulator owner drains it at polling points. Never mutate RFU state from the
   network thread. Use correct atomic publication and queue overflow handling.
2. Cooperative yield points in the emulator and, if appropriate, Emscripten
   asynchronous suspension. Measure overhead and reentrancy before adoption.

Shared-memory/threaded configurations require cross-origin isolation headers
and introduce deployment/browser constraints. Do not require them unless the
simple path fails. They also do not defeat OS suspension of a browser. [S10]

### ROM and patch flow

Accept a local `.gba` first. Hash its bytes; match an explicitly supported base
revision rather than accepting the extension or title header alone. Apply a
verified patch locally and verify the output hash. Record base hash, patch hash,
language, game version, core build, BIOS mode, serial mode, and relevant options
as a compatibility manifest. Actual hashes must come from the selected release
and local verification; they are not established by this research.

Support browser-side patching when the patch's distribution terms permit it;
otherwise accept a separately selected patch or supported prepatched local ROM.
Do not assume another site's patcher permits reuse of its assets or service.
The normal production flow should not upload game bytes. [S2]

Test gpSP's bundled BIOS first. Its options acknowledge compatibility differences
with the original BIOS. If a user-supplied BIOS proves necessary, that changes
the promised Emerald-only onboarding and must be reported. Explicitly test RFU
mode rather than trusting ROM auto-detection; record RTC behavior as well. [S11]

### Cloudflare transport

After local proof, use a small localhost WebSocket relay with the same message
envelope, then a Worker routing authenticated connections to one room Durable
Object. Separate lobby control messages from binary emulator payloads. Persist
membership/session metadata needed for recovery; do not write every packet to
durable storage. Reconstruct appropriate connection metadata after hibernation,
and fail closed into a new game session if continuity cannot be preserved.
Cloudflare documents WebSocket coordination and hibernation support. [S12]

Measure actual player-to-player relay latency. A room lives in a particular
location; it is not simultaneously local to every participant. Location hints
are best effort. [S13]

Use bounded queues and monitor `bufferedAmount`; ordinary browser WebSockets
do not provide automatic backpressure. Drop the connection with a recoverable
error when overloaded rather than silently losing required packets. [S14]

If relay latency fails acceptance, compare a reliable ordered WebRTC data
channel while retaining the Durable Object for signaling/membership. This adds
NAT traversal and potentially TURN, so adopt it only with measured benefit.
Neither transport repairs a scheduler bug or an RFU incompatibility.

## 4. Persistence and resume semantics

There are three different kinds of state:

| State | Purpose | Initial policy |
| --- | --- | --- |
| Cartridge save | Trainer progress written by the game | Durable source of truth |
| Emulator snapshot | Exact CPU/RAM/device state | Optional solo convenience, pinned to build |
| Live connection | RFU/session/packet state | Ephemeral; re-establish on return |

Copy cartridge save bytes at safe emulator boundaries, detect changes, and keep
versioned IndexedDB records with checksums. Avoid promoting partially written
game saves; verify the selected patch's save-completion behavior. Keep the last
known good revision and provide import/export immediately. Persist periodically
and after completed saves, not solely on unload. Test round trips with native
gpSP. Decide and record how any RTC sidecar data is preserved.

Browser storage may be evicted or cleared. Request persistent storage where
available, surface failures, and always offer a downloadable backup. [S15]

**Copying save RAM does not make the game save unsaved gameplay.** Initial resume
means loading the last completed in-game save. An exact solo quick-resume can
be a separate feature, with fallback to cartridge saves. Live multiplayer
snapshots require coordinated emulator and transport recovery and are excluded
from the MVP. Disable rewind, fast-forward, individual pause, and snapshot
loading while linked, consistent with the netpacket model. [S7]

Later cloud flow: commit locally, upload a checksummed immutable save revision,
then atomically advance its metadata pointer using an expected prior revision.
Make retries idempotent. Preserve both versions on conflict; do not merge binary
saves or silently apply last-writer-wins. Prevent simultaneous writers to one
slot where possible, but still handle offline-device conflicts.

A short room code admits a player to a lobby. A separate high-entropy private
recovery credential authorizes a save vault; store a verifier, rate-limit use,
support revocation, and keep secrets out of logs. Optional accounts can claim
that vault without changing save IDs. Loss of local storage and the sole private
credential cannot be magically recovered.

For the first multiplayer release, disconnect means stop the old link, preserve
valid progress, and offer guided rejoining from a save. Do not promise host
migration or mid-battle continuity. A dedicated co-op run can group compatible
per-player slots and agreed checkpoints, but the website cannot impose new
in-game story synchronization rules without additional game-specific work.

## 5. Milestones and acceptance gates

All metrics below are proposed targets, not observed performance.

| Gate | Work | Required evidence to proceed |
| --- | --- | --- |
| 0: Baseline | Pin Quetzal release, core revision, toolchain, settings and content manifest; run two native gpSP instances | Both trainers connect, explore, exercise supported battle/trade flows, save and reload; exact steps recorded |
| 1: Browser solo | Minimal page, local ROM/patch, WASM input/video/audio | 30 minutes of play including busy overworld and battle scenes at approximately full emulated speed on the target desktop; no persistent audio failure |
| 2: Durable saves | IndexedDB, completed-save detection, import/export | Save then refresh and restart browser; native/browser save round trip; interrupted writes and quota failure preserve last good revision |
| 3: Local wireless | Two isolated instances, then two browser windows with BroadcastChannel or MessagePorts | Two different trainers see each other; 30-minute session; supported shared interactions; save/reload/rejoin; packet and timing traces |
| 4: Internet wireless | Local WSS-compatible relay, then Cloudflare relay | Two physical devices on separate networks complete a 60-minute session and return to their saves; reproduce on more than one session |
| 5: Usable private alpha | Room codes, invite links, controls, fullscreen, compatibility errors, guided disconnect recovery | Two users can independently load ROMs, join, play, save, leave, and rejoin without developer assistance |
| 6: Cross-device progress | Private recovery codes, then optional account linking, cloud version history | Restore on a fresh browser; retry uploads safely; simulate concurrent edits, offline work, revoked credentials and rollback |
| 7: Broader release | Mobile support, accessibility, four-player tests, upgrades and operational hardening | Device matrix and longer game-progression tests pass; no claim of full-game compatibility based only on early-game testing |

Gate 3 should also run two instances on one visible page for debugging, then
separate windows. Inactive tabs can throttle and obscure the actual cause of a
failed two-tab test. Backgrounding/screen lock remains an explicit lifecycle
test even if Workers improve foreground performance.

For gate 4, test added end-to-end RTT of 0/50/100/150/250 ms and jitter, reporting
actual total RTT including relay transit. Aim for stable play at 100 ms RTT
with modest jitter, and characterize failure beyond that. Use network-level
loss tests to expose TCP retransmission stalls; dropping application packets is
a distinct fault-injection test. Record latency percentiles, packet rate/bytes,
queue age, speed, disconnects, and save integrity. Exercise host departure,
Wi-Fi interruption, reload, laptop sleep, backgrounding, and deployment restart.

Longer compatibility testing should cover maps, story transitions, different
progress levels, in-game multiplayer restrictions, late-game/postgame saves,
and each supported language/version. Separate Quetzal bugs reproducible in the
native baseline from browser regressions.

## 6. Alternatives and decision rules

| Option | Assessment |
| --- | --- |
| Small gpSP/libretro browser frontend | Preferred: direct access to the needed interface and a small surface to debug |
| Existing browser emulator wrapper | Reuse only after verifying its actual core version, netpacket exposure, build control and save API; a netplay feature label is insufficient |
| Full RetroArch web frontend | Useful comparison, but likely adds unnecessary frontend/network adaptation scope |
| Different GBA emulator | Candidate only after proving the selected Quetzal multiplayer protocol, not merely GBA game execution |
| Reimplement RFU | Last resort after identifying a precise upstream limitation |
| Server emulation with video streaming | Separate architecture with recurring compute/streaming cost and ROM-handling implications; not the initial plan |

If native baseline fails, resolve version/settings compatibility first. If WASM
is too slow, profile before networking work. If local multiplayer fails, inspect
lifecycle, identities, serial mode, BIOS, and scheduling before changing RFU.
If local works but internet fails, measure latency and queueing before switching
transport. Stop expansion and record a concrete blocker when a gate cannot pass.

## 7. Effort, operating cost, and release scope

Planning estimates for one experienced developer working with coding assistance;
these are effort ranges, not promises:

- Baseline, build setup, browser solo and local saves: roughly 3-7 working days.
- Local wireless adapter and proof: another 3-10 days if frame-boundary delivery
  is sufficient; several additional weeks if scheduling changes are required.
- Internet relay, impairment tests and disconnect handling: roughly 3-10 days.
- Friendly private alpha, recovery codes and cloud saves: another 2-4 weeks.
- Broad mobile support, polished account flows and extended compatibility:
  several further weeks or months, depending on failures and scope.

A weekend is a sensible bounded research investment. A dependable public product
is a multi-week project even on the favorable path. Reserve the first 2-3 days
for pinned inputs, native baseline, a reproducible build attempt, and enough
instrumentation to identify the next bottleneck. A failure to finish the full
wireless proof in that time is not itself proof of infeasibility.

Estimate hosting only after measuring packets per second, bytes per player,
room size and concurrent hours. Budget Worker/DO requests and active duration,
asset delivery, save operations/storage, and authentication services. Idle-room
hibernation does not remove the cost of an active stream of packets. Recheck
current pricing at deployment; no dollar estimate is established here.

Before distributing the browser emulator, preserve gpSP's GPL notices and make
the corresponding modified source/build materials available under applicable
terms. Audit linked dependencies and patch distribution separately. This is a
release engineering requirement, not evidence that the patch is freely
redistributable. [S16]

Friends and avatars are ordinary later application work. Spectating is a
separate design task: streaming a player's rendered view may be simpler than
adding a synchronized spectator emulator. Do not treat it as an extra RFU player.

## 8. Suggested repository layout

```text
AGENTS.md
docs/IMPLEMENTATION_PLAN.md
docs/experiments/                 # steps, manifests, metrics, failure reports
apps/harness/                    # minimal browser emulator and diagnostics
packages/emulator/               # pinned source integration and C host
packages/protocol/               # transport envelopes and compatibility checks
packages/saves/                  # local persistence, versioning and validation
services/relay/                  # localhost relay, then Cloudflare room service
apps/web/                        # user-facing product after feasibility gates
tests/fixtures/                  # synthetic/homebrew only
```

Only create these directories when implementation needs them. Next session
should inspect installed build tools and arrange local test inputs; it should
not scaffold an account dashboard. A supplied compatible ROM and selected patch
will be needed to claim a successful Quetzal runtime test. No such files were
present in the initial repository.

## 9. Research sources

All accessed 2026-09-08. Upstream master links are research references; replace
with pinned commit links in the first experiment report.

- S1: [Quetzal creator site](https://www.pokemonquetzal.app/)
- S2: [Quetzal download and patcher page](https://www.pokemonquetzal.app/en/downloads/)
- S3: [Quetzal multiplayer information page](https://www.pokemonquetzal.app/en/info/multiplayer/)
- S4: [gpSP libretro integration source](https://github.com/libretro/gpsp/blob/master/libretro/libretro.c)
- S5: [gpSP Makefile](https://github.com/libretro/gpsp/blob/master/Makefile)
- S6: [gpSP RFU implementation](https://github.com/libretro/gpsp/blob/master/rfu.c)
- S7: [libretro netpacket API contract](https://github.com/libretro/RetroArch/blob/master/libretro-common/include/libretro.h)
- S8: [Libretro's separate-console netplay announcement](https://www.libretro.com/index.php/retroarch-1-17-new-netplay-features/)
- S9: [Emscripten runtime and browser execution model](https://emscripten.org/docs/porting/emscripten-runtime-environment.html)
- S10: [Emscripten threads and isolation requirements](https://emscripten.org/docs/porting/pthreads.html)
- S11: [gpSP serial, BIOS and RTC options](https://github.com/libretro/gpsp/blob/master/libretro/libretro_core_options.h)
- S12: [Durable Objects WebSockets and hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- S13: [Durable Object placement](https://developers.cloudflare.com/durable-objects/reference/data-location/)
- S14: [Browser WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- S15: [Browser storage persistence and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- S16: [gpSP license](https://github.com/libretro/gpsp/blob/master/COPYING)
