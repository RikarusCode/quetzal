# Save slots and four-player rooms — 2026-09-08

User requested one default save slot, arbitrary additional named slots with
warned removal, and explicit room creation/joining with four-player support.

## Implementation

- IndexedDB v2 adds slot metadata, preserving the original saves store and
  `${gameHash}:A/B` keys. First-use migration only creates legacy slots with
  existing saves; an empty browser gets one My trainer slot. Migration is one
  read/write transaction and tested with concurrent initialization.
- Slot UUIDs are independent of names and player numbers. Rename preserves saves;
  removal deletes the slot and its current/previous save atomically. Last-slot
  removal is disallowed. Import/export still uses cartridge saves, not snapshots.
- Web Locks protect the active slot against a second emulator, import or deletion.
  Slots can be renamed during play; switching/removing the active slot needs reload.
- Create room generates a random code only when clicked and starts hosting.
  Join requires an existing host. Codes/invite links are copyable. The room shows
  host/guest role, four spaces, current membership and meaningful error states.
- Protocol/build v2 supports IDs 0–3. The server assigns IDs and stamps senders.
  Byte 3 of the 32-byte packet envelope is the recipient (255 for broadcast).
  Native broadcasts reach all other peers; targeted messages reach only one.
- The same-browser carrier also assigns four IDs and supplies rosters. The
  LocalLink adapter keeps native callbacks on the emulator owner and tracks
  every peer's epoch, heartbeat and packets rather than one remote player.
- Guest departure keeps the room and publishes a smaller roster. Remaining cores
  clear queued data and restart their serial session. A replacement can reuse
  the number with a fresh epoch. Quetzal in-game rejoining remains necessary.
  Host departure closes the group; no transparent resume/host migration is claimed.
- Core start clears serial protocol and pending IRQ state; native receive rejects
  out-of-range peer IDs. The pinned gpSP already implements four serial peers,
  including guest-to-guest discovery. No upstream core rewrite was needed.

## Verification

- 23 local unit/integration tests passed, zero skipped or failed.
- Save tests cover fresh default, concurrent initialization, A/B migration,
  previous-backup preservation, rename, invalid names and isolated deletion.
- Local and WebSocket tests cover four-way fan-out, sender identity, targeting,
  full/missing rooms, count changes, replacement IDs, stale epochs, backpressure,
  malformed packets and host departure. Existing two-core boot/save tests pass.
- Four real WASM cores discover each other in the native SIOMULTI0–3 registers
  through the local relay at added RTT 0/50/100/150/250 ms. Representative measured
  peer RTT: 27/84/134/182/276 ms. These are feasibility measurements, not gameplay limits.
- Initial tests caught shared membership-array mutation in BroadcastChannel and
  a test assuming a two-device serial cycle budget. Four words need 4 × 2621
  cycles. Both were corrected; native restart also now clears a pending IRQ.
- Isolated headless Edge UI test passed: initial single slot, add/rename/persistence,
  synthetic-save import/export equality, remove warning/cancellation, cross-tab
  active-slot exclusion, four games booted without trainer progression, room
  errors/counts, guest leave/rejoin, host closure, and 390px layout without overflow.
  No personal browser profile or save was used. Screenshots were visually inspected.
- Deployment dry run: 27 assets; Worker 8.95 KiB, gzip 3.06 KiB.

Browser UI command: set `PLAYWRIGHT_MODULE` to an installed Playwright `index.mjs`,
then run `node tests/ui/save-rooms.mjs`. It uses the installed Edge browser and a
fresh temporary profile. `UI_TEST_URL` defaults to http://127.0.0.1:8787.

## Hosted deployment

Published at https://quetzal-playtest.rikcroy.workers.dev with version
`fbb2feac-c1fe-4b23-8fd1-941b389238bc` (Worker startup 6 ms).
All ten hosted relay tests passed, zero skipped or failed. Four real WASM devices
discovered every peer at added RTT 0/50/100/150/250 ms; measured peer RTT in that
run was 67/130/166/285/348 ms. Public game bytes matched the pinned hash.
The full isolated browser UI scenario also passed on the public HTTPS origin,
including four actual browser emulator workers connected through Cloudflare.

## Remaining acceptance

User-led two/three/four-player Quetzal gameplay, shared interactions, save/rejoin,
and extended sessions on separate devices remain unverified. A connected room
and a real serial handshake must not be presented as proof of those behaviors.
