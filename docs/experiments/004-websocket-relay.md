# WebSocket relay, 2026-09-08

Built a Cloudflare Worker with one hibernating Durable Object per two-player
room. Its exact implementation runs locally with Wrangler on port 8787. Browser
emulator owners retain the proven LocalLink state machine and frame-boundary
native receive; WebSocketChannel replaces the BroadcastChannel carrier.

Added pinned build validation, server-assigned sender identity, connection epochs,
bounded queues, packet validation, flow acknowledgments, role conflict/full-room
errors, origin checking, cleanup alarms and peer-departure propagation. Private
room codes are random 128-bit capabilities; they provide no access to trainer saves.
Added relay/peer RTT metrics and ordered receive-delay/jitter injection.

Packaged the user-selected automatic content flow: Play downloads the site's
compressed Quetzal ROM, decompresses locally and verifies the unchanged game hash.
Compressed size: 14,518,147 bytes. The generated site includes emulator source and
license materials. Game assets remain outside git; save formats/keys are unchanged.

## Evidence

- Final combined suite: 20 tests passed, zero skipped or failed.
- Existing emulator/video/audio/save isolation and control tests pass.
- Local-runtime WebSocket tests pass for packet ordering, authoritative sender,
  version and duplicate-host rejection, origin denial, malformed native packets,
  and closure after 256 unacknowledged packets.
- Actual WASM cores exchange the Pokémon cable handshake through WebSockets and
  read the child's 0xB9A0 handshake in the host's SIOMULTI1 register.
- Tested added RTT: 0, 50, 100, 150, 250 ms. First-run measured peer RTT respectively
  37, 101, 116, 185, 273 ms. These are illustrative local measurements, not latency
  targets or proof of sustained game compatibility.
- Downloaded the site's packaged asset, decompressed and matched the pinned SHA-256.
- Cloudflare type checking and deployment dry run pass; dry run saw 25 site assets
  and a 7.93 KiB Worker bundle before gzip.
- Browser UI: Play downloaded and booted the game without a picker; two browser
  workers connected via the local WebSocket relay and showed peer RTT around
  5–10 ms. Both remained at the title screen, so zero game packets was expected.
  Disconnect propagation was exercised without manual trainer progression.

## Open work

User-led Quetzal gameplay through WebSockets, multiplayer save/rejoin, and two
physical devices on separate internet connections remain unverified. The test
handshake cannot establish battle/trade compatibility or long-session stability.

## Hosted deployment and verification

The initial login request was rejected by automatic approval review. The user
subsequently explicitly authorized sign-in/deployment and completed OAuth.
Wrangler confirmed that `quetzal-playtest` did not exist before deployment.

- Published 2026-09-08: https://quetzal-playtest.rikcroy.workers.dev
- Version: `12b93203-e445-4af4-9315-3ed265282adc`.
- Worker startup: 4 ms; upload: 7.93 KiB (2.80 KiB gzip).
- Public `/health` returned 200 with the pinned compatibility ID.
- HTML and WASM returned 200 with COOP/COEP headers; WASM MIME was correct.
- Downloaded public game content, decompressed it and verified its pinned hash.
- Hosted integration run: eight passed, one failed. The failed case timed out
  opening a WebSocket after five seconds, before testing ordered packets. Its
  targeted rerun passed (2.60 seconds for the whole case); root cause was not
  established. Do not describe the initial run as entirely passing.
- All nine cases have therefore passed against the public endpoint, including
  real WASM serial handshakes at added RTT 0/50/100/150/250 ms. Measured peer RTT
  in that run: 102/173/351/231/366 ms, respectively. These include internet and
  scheduling variation and do not define gameplay latency limits.
- Opened the hosted page in the browser; its Play and connection UI rendered.
  No hosted trainer progression or in-game multiplayer was performed by the agent.

Next acceptance remains user-led gameplay on two devices, preferably separate
networks, followed by saves, refresh and rejoin. Save ownership remains local
to each browser origin; there is no account or cloud-save system yet.
