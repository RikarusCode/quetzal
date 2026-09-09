# Quetzal browser multiplayer project

## Product intent

Build a website where players open the site and play the full Quetzal game,
with a pinned, prepatched ROM supplied automatically by the website. Connect
independent trainers through shared lobbies. Preserve progress locally and,
later, through private recovery codes and optional accounts.

Explicit product decision (2026-09-08): remove Emerald patching and user ROM
selection/upload from the planned website. The user chose website-provided
Quetzal content and acknowledged distribution concerns. Do not reintroduce
bring-your-own-ROM onboarding as a requirement. The existing picker and loopback
fixture were prototype tools. Automatic loading is now implemented for the
packaged website and local development. The playtest is deployed at
https://quetzal.deployhost.workers.dev (2026-09-08). The user requested the Worker
name `quetzal`, then changed the account subdomain from `rikcroy` to `customsite`
and finally `deployhost`.
The asset host is `quetzal-assets.deployhost.workers.dev`; keep its URL in the
artifact lock and packaging script aligned. Runtime URLs use the current origin.
The old `quetzal-playtest` Worker has not been deleted, but old `rikcroy`/`customsite` hostnames
are not guaranteed reachable after the account rename. Saves/settings stay tied
to each browser origin; migration requires export/import. The account rename
keeps the `quetzal` Worker and room binding; the earlier Worker rename created a
separate room namespace. Historical experiment URLs record their original dates.

Read `docs/IMPLEMENTATION_PLAN.md` before implementing. It contains the research,
architecture, milestone acceptance criteria, and unresolved decisions.

## Current status

Input preparation completed, dated 2026-09-08. See
`docs/experiments/001-input-preparation.md` and `rom-inputs.json` alongside it.
A local BPS patch reproduces the supplied Quetzal ROM byte-for-byte; incompatible
source rejection was tested. gpSP revision
`8d268a6bb2cd799f8f2791ebb544a7ef550cfc6f` now builds with Emscripten 6.0.9.
Browser boot and new-game input have been visually verified. The core smoke
test passes for video/audio, two isolated instances and packet lifecycle.
Native RetroArch boot and a direct two-instance native core harness also work.
The user reported a successful browser save -> refresh test on 2026-09-08.
The user confirmed browser in-game multiplayer works after the link-mode fix
on 2026-09-08. This is an initial local co-op success; session duration, shared
battle/trade flows and multiplayer save/rejoin have not yet been reported.
Native in-game multiplayer and internet play remain unverified. The user is
handling manual gameplay testing; do not spend turns
manually progressing trainers unless requested. See `docs/TESTING.md`.

Configuration correction (2026-09-08): the initial frontend forced RFU, but
Quetzal co-op needs Pokémon Gen3 link-cable mode (`gpsp_serial=mul_poke`).
User reported host gameplay stuck with frames still advancing and zero packets.
The rebuilt frontend now selects `mul_poke`; the actual WASM serial controller
passes a two-core parent/child handshake, packet receive and continued-frame test.
The user subsequently confirmed the in-game retest works. Native baseline
scripts now use the same corrected mode.
The old RFU-first research assumption must not be treated as established fact.

Confirmed scope update (2026-09-08): up to four players per room, one default
browser-local save slot, and user-created/renamed/deleted additional slots.
No room code exists until Create room; joining automatically assigns a guest ID.
Save slot names and IDs are independent of room/player identities. Existing A/B
saves migrate without changing their keys or bytes. Desktop Chrome/Edge remains
the working default; full mobile gameplay support is a later compatibility target.

## Execution priorities

1. Establish a native Quetzal/gpSP multiplayer baseline and pin inputs.
2. Boot that same game in a minimal browser harness; persist cartridge saves.
3. Demonstrate independent browser instances exchanging actual game packets.
4. Demonstrate internet play under measured latency through a relay.
5. Only after those gates, implement the polished lobby and recovery experience.

Do not substitute a mock lobby, exchanged button inputs, or an ordinary
single-console netplay demo for Quetzal wireless multiplayer. Do not describe a
successful build or packet echo as proof that the game works.

## Engineering constraints

- Prefer a small libretro frontend over rewriting RFU or porting all RetroArch.
- Keep core calls on the emulator's owning thread. Test packet delivery timing.
- Keep local and internet transports behind the same packet interface.
- Pin core revision, toolchain, patch, ROM hashes, BIOS mode, and core settings.
- Never silently upgrade active runs or merge divergent binary save files.
- Use cartridge saves as durable progress. Exact multiplayer save-state resume
  is a separate research problem. Disable time manipulation while linked.
- Keep room identity, trainer/save ownership, and connection identity separate.
- Room codes must not authorize access to a player's private cloud saves.
- Keep ROMs, BIOS dumps, personal saves, and credentials out of git and logs.
  Use synthetic/homebrew fixtures in CI. The operator-supplied patched ROM is
  a versioned hosting artifact, separate from source control and save storage;
  it is intentionally served to players. Do not build a user ROM upload endpoint.
- Preserve emulator licensing and corresponding source. Keep content delivery
  replaceable without deleting trainer saves or silently upgrading active runs.
- Report milestone evidence and limitations honestly. Record failed experiments
  and actual metrics so later agents do not repeat unsupported assumptions.

## Next implementation deliverable

Record a longer local session and multiplayer save/reload/rejoin with the user's
manual gameplay testing. Initial local co-op is confirmed; do not repeat manual
trainer progression or block relay work on re-proving that result. Next engineering
step was implemented in `services/relay`: a Worker + Durable Object WebSocket
relay tested in Wrangler's local runtime. It passes device-level WASM handshakes
with injected RTT through 250 ms. The packaged player automatically loads and
verifies website-provided game content. See experiment 004 and the relay README.
The user explicitly authorized Cloudflare sign-in and deployment, then completed
OAuth. Deployment succeeded on 2026-09-08. Hosted integration tests passed eight
of nine initially; the connection-opening timeout passed on targeted rerun.
Real WASM cable handshakes passed through the hosted relay, including injected
RTT through 250 ms. See experiment 004 for evidence and the deployment version.
Next: user-led gameplay on two devices, preferably separate networks. Hosted
device handshakes do not establish sustained internet gameplay compatibility.
Do not call the local BroadcastChannel connection internet multiplayer. Current
save persistence uses a stability heuristic; game-aware completion detection
still needs work. Web Locks now prevent opening, importing into, or deleting an
active save slot from another current-build tab. Accounts, friends,
avatars, and spectator mode are not prerequisites for this deliverable.

Four-player implementation: protocol/build v2 assigns host ID 0 and guest IDs
1–3, supplies rosters, and routes broadcasts to every other player. Guest departure
keeps the room but resets remaining native serial sessions; players must rejoin
inside Quetzal. Host departure closes the room. No host migration or transparent
live-game reconnect is promised. Native session restart clears protocol and pending
IRQ state. Twenty-three local tests and an isolated browser UI scenario passed;
real four-core handshakes pass through the local relay at added RTT through 250 ms.
The v2 update was deployed as `fbb2feac-c1fe-4b23-8fd1-941b389238bc` on the
old name. The renamed deployment is `fc1bbdec-11b7-4919-993e-b50f512fb68d`.
All ten hosted relay tests and the isolated public-site browser UI scenario passed.
User-led four-player gameplay remains unverified. See experiment 005.

UI preference (2026-09-08): minimal emulator interface. No top brand banner,
marketing headings, decorative pills, gradients, or repeated helper paragraphs.
Keyboard settings belongs at the top right. Use restrained charcoal/gray with
blue actions, compact save/room controls, and source/license links only in the
footer. Fullscreen must show only the aspect-correct game image, with Escape to
exit; no app header, status, controls or padding in fullscreen. Keep actionable
errors and save-deletion warnings. See experiment 006 for UI verification.

Session controls (2026-09-08): Volume uses a persisted gain slider and mute.
End session confirms the save reminder, shuts down the worker/room/audio, drains
already-posted save writes, releases the slot lock and returns to Play. A new
session creates a fresh worker. It does not manufacture an in-game save. Only
active sessions register beforeunload; browsers display their own generic text.
Room controls derive disabled state from current readiness/connection state and
resynchronize on pageshow. The Room tooltip contains the multiplayer sequence.
See experiment 007 for automated lifecycle evidence.

Deployment preference (2026-09-08): use native Cloudflare Workers Builds from
GitHub `main` for routine changes; do not manually deploy each UI update. See
`deployment/README.md`. Never add ROM bytes to GitHub. `build:ci` retrieves pinned
inputs from the separate `quetzal-assets` static Worker and verifies the committed
checksum manifest. This Worker is for explicitly published build artifacts, not
routine code deployment. Core/frontend C changes require a matching rebuilt
artifact release; preserve previous version directories for rollback builds.

Playback architecture (2026-09-08): a page-lifetime loader worker retains one
verified ROM; each session still fetches and validates the release manifest.
Decompression/hashing run there while a fresh emulator worker prepares WASM.
Versioned game assets are immutable; do not add a wildcard no-cache header,
because Cloudflare combines matching rules. The emulator recycles three RGBA
buffers through a requestAnimationFrame presenter. Never pace emulator/link
execution with display callbacks, which pause in background tabs. Audio uses a
direct MessagePort to an AudioWorklet with a fixed stereo ring/resampler. Wait
for the processor's readiness handshake before sending PCM: AudioContext can
report running before the device actually starts consuming samples. No C core,
game, link protocol, or save format change was needed. See experiment 009.
