# Manual gameplay tests

Hosted site: https://quetzal.rikcroy.workers.dev

Moving from the previous `quetzal-playtest.rikcroy.workers.dev` address: export
your saves there and import them here before Play. The old site is still available
for that purpose. All players should use the new address and create a new room.

Save and export a backup before refreshing an older build. Everyone should refresh
for the four-player protocol update. If storage asks you to close other Quetzal
tabs, close those tabs and reload; this allows the one-time database upgrade.

## Save slots

A fresh browser has one slot, My trainer. Edit save slots lets you add slots,
rename them or remove them after a deletion warning. Keep at least one slot.
Existing A/B slots with saved progress migrate automatically with their bytes
unchanged. Select a slot before Play. Reload to switch slots after starting a game.
You can rename the active slot; you cannot remove it while it is running.

Use Import an existing save before Play to import into the selected slot. Import
asks before replacing existing progress. Export game save downloads that slot's
cartridge save (.srm), including before Play when a stored save exists. An active
slot cannot be opened, imported into or removed from another current-build tab.

Save slots are independent of multiplayer roles. Two different computers can
both use a slot called My trainer. Multiple windows in one browser must use
different slots. Clearing site data clears browser-local saves; exported backups
are separate. Port 4173, port 8787, workers.dev and different browser profiles
have separate storage. Export/import to move progress between them. There is no
account or cloud-save system yet.

## Rooms and four-player gameplay

1. On each device, select the desired save slot and press Play / Continue.
   Leave Connection settings on Internet relay, with test delay and jitter at 0.
2. One person clicks Create room. Their room code appears and hosting starts.
   Use Copy code or Copy invite link to share it with up to three friends.
3. Each guest clicks Join room, pastes the code and submits. Invite links prefill
   this form; they do not automatically start the game or join. Player numbers
   are assigned automatically. The host is player 1; guests are players 2–4.
4. Check that all pages show the same count (2/4, 3/4 or 4/4) and roster.
   This confirms the browser connection, not in-game multiplayer.
5. Use Quetzal's multiplayer menu to join each other as in the successful local
   two-player test. Confirm all trainers find each other and move independently.
6. Play for 15–30 minutes. Change maps and try available shared interactions.
   Record results for two players and then three/four if enough testers are available.
7. Save every trainer in-game, wait for Saved locally, and export backups.
   Leave the room, refresh, continue each trainer and create/join a room again.
8. Test a guest leaving and rejoining. The room stays open and the count updates;
   remaining players are prompted to rejoin multiplayer inside Quetzal because
   serial sessions reset. This is not seamless live-game reconnect. The host
   leaving closes the room for everyone; no automatic host migration exists.

Prefer separate physical devices/networks for the internet test. Keep games
visible; sleeping or background suspension may interrupt multiplayer. A missing
room should give a clear error, and a fifth player should see Room is full.
Play solo simply by skipping room creation/joining.

The agent has verified four real WASM serial controllers discovering all peers
through the relay, with injected RTT through 250 ms, plus browser room controls.
This does not prove four-player Quetzal gameplay, battles, trades or long sessions.
Longer milestone acceptance calls for repeated 60-minute sessions.

## Solo save verification

1. Continue or create a trainer and reach a point where Quetzal permits saving.
2. Save using the game's own menu. Wait for Saved locally, then export.
3. Refresh, select the same slot and press Play / Continue. Choose Continue in-game.
4. Confirm trainer name, location and party match the last completed in-game save.

The save-completion detector still uses a memory-stability heuristic. Closing a
tab does not preserve the exact instant of play. The user already confirmed an
initial save/refresh pass and local two-player gameplay on 2026-09-08; do not ask
an agent to repeat manual trainer progression unless specifically wanted.

## Controls

Click the game to focus it. WASD moves; E is GBA A, Q is B, Enter is Start,
Right Shift is Select, Left Arrow is L and Right Arrow is R. Keyboard settings changes bindings,
swaps conflicts and supports keybind import/export. Changes persist locally.
Keyboard settings is at the top right. Fullscreen is next to the Volume button;
it shows only the game, preserving its aspect ratio. Escape exits. Dialogs do
not pause the game.

Volume opens a slider with a mute button. The level persists in this browser.
End session appears beside Play while running. Save in Quetzal, wait for Saved
locally, then confirm End session. It closes the emulator and leaves the room;
ending the host's session closes the room for everyone. You can then switch
slots or press Play again. This does not create an in-game save for you.
Reloading or navigating away while running shows the browser's generic warning;
browsers do not allow a custom save reminder in that native prompt. No warning
appears while idle. The Room question mark explains the connection sequence on
hover or focus. Create/Join are disabled until the game is ready.

For the manual save check, also try End session followed by Play / Continue and
confirm the last completed in-game save loads. Automated lifecycle tests use
isolated browser profiles and do not progress personal trainers:
`PLAYWRIGHT_MODULE=<installed playwright index.mjs> node tests/ui/session-controls.mjs`.

## Local development

`npm start` serves the original save origin at http://127.0.0.1:4173.
`npm run prepare:site` followed by `npm run relay:dev` serves the package and
Cloudflare relay locally at http://127.0.0.1:8787. Both bind to loopback.
Port 4173 defaults to the port-8787 relay. Both sites load game content automatically.

For a test without the relay, all windows use the same browser profile/origin,
different save slots, and Connection settings → This browser only. Create/join
rooms in the same way; BroadcastChannel supplies the local four-player transport.
Loopback URLs and This browser only cannot connect separate computers.

## What to report

- Player count, browser/device and last successful step.
- Whether all trainers can see/move independently and save/rejoin correctly.
- Any exact in-game error text or freeze/disconnect behavior.
- Each affected player's Emulator diagnostics, especially frames, sent/received,
  peerRttMs, serialMode and siocnt. Frames advancing with zero game packets is
  different from the emulator itself stopping.

A short report is enough. No screenshots or long playthrough descriptions are required.
