# Manual gameplay tests

Use these tests while implementation continues. Do not use an important existing
save for the initial tests. The save-completion detector is still a stability
heuristic. Export a backup after each successful test.

## Start the local harness

Both local players now load Quetzal automatically, with no ROM picker or patching.
The relay and packaged site run at http://127.0.0.1:8787 after `npm run prepare:site`
and `npm run relay:dev`. This is the preferred environment for relay testing.

The original save origin remains http://127.0.0.1:4173 (`npm start`). It can also
connect to the local relay at `ws://127.0.0.1:8787/relay` without moving saves.

The current development session uses `node scripts/serve.mjs --local-fixture`.
This explicitly enables reading the supplied test ROM over loopback; these links
press Play automatically:

- Trainer A: http://127.0.0.1:4173/?fixture=local&slot=A
- Trainer B: http://127.0.0.1:4173/?fixture=local&slot=B

Both development servers bind to 127.0.0.1. The WebSocket relay is also deployed
at https://quetzal-playtest.rikcroy.workers.dev. No account system exists.

## Test the hosted relay on two devices

1. Export each trainer's save from the old browser/origin before switching.
2. Both players open https://quetzal-playtest.rikcroy.workers.dev. Prefer separate
   networks (for example, home Wi-Fi and another home's connection).
3. Choose a save slot and import your own exported save before pressing
   Play / Continue. Different devices have independent saves even with slot A
   selected on both; if testing two windows on one browser, use A and B slots.
4. Leave Connection on WebSocket relay and test delay/jitter at zero. The relay
   address defaults to the hosted endpoint; no local server is needed.
5. One player clicks Host · A and shares the room code. The other pastes it and
   clicks Join · B. Wait for Transport connected on both pages.
6. Enter Quetzal's multiplayer menu and follow the previously successful game
   host/join flow. Confirm both trainers see and can move around each other.
7. Play for 15–30 minutes, change maps and try an available shared interaction.
   Save both trainers in-game, wait for local backup confirmation and export.
8. Disconnect, refresh, continue each trainer, reconnect and join in-game again.

Report whether joining, movement and save/rejoin worked. If either game freezes
or disconnects, copy both Emulator diagnostics outputs and the game's screen
text. Hosted device-level handshakes have passed; this is the remaining gameplay
test. Longer milestone acceptance calls for repeated 60-minute sessions.

## Controls and initial configuration

Click the game canvas to focus it. Arrows move; X is the GBA A button, Z is B,
Enter is Start, Right Shift is Select, A is L, S is R. Use Keyboard settings
to change any binding. Select a binding and press a key; Escape cancels capture.
Occupied keys swap assignments. Changes persist in this browser; Restore
defaults resets them. Keyboard input only controls the game while its canvas
has focus. Opening settings releases held keys but does not pause the game.

Keyboard settings also has Export keybinds and Import keybinds for versioned
JSON files. Imports validate all ten unique assignments before changing anything.
Fullscreen is next to the sound button; exit with Escape or Exit fullscreen.

User result (2026-09-08): the in-game save -> refresh test appeared to work.
The user subsequently confirmed local in-game multiplayer works after switching
to Pokémon Gen3 link-cable mode. Longer sessions, shared interactions and
multiplayer save/reload/rejoin remain to be tested.

Next manual check: play together for 15–30 minutes, change maps, try an available
shared interaction, save both trainers and export each save. Refresh both windows,
continue each trainer, reconnect and confirm multiplayer works again. Report any
disconnect, missing progress or game freeze. This can run alongside relay work.

After the 2026-09-08 link-mode fix, refresh BOTH windows before testing. The old
build used the wrong serial mode and cannot connect to the new build's channel.
Diagnostics should now show `serialMode: "Pokémon Gen3 link cable"`.

For comparable test trainers, leave randomization and Nuzlocke disabled and use
normal difficulty. In new-game configuration, S advances to the next settings
page. On the final Miscellaneous page, Up from the first row wraps to Save;
press X to continue. Give the trainers distinct names and appearances.

## Test 1: solo gameplay and durable progress

1. Finish trainer creation and reach a point where Quetzal allows saving.
2. Confirm walking, menus and, when available, a battle work.
3. Use the game's own Save menu. Wait for the page's Local backup updated message
   (normally a few seconds after the save memory stops changing).
4. Click Export game save to retain a separate .srm backup.
5. Refresh. In fixture mode the game reloads automatically; otherwise press
   Play / Continue. Select Continue in the game and check name, location and party.
6. Later, close and reopen the browser and repeat the check.

Expected: return to the last completed in-game save, not the exact instant the
tab was closed. Storage is specific to the browser profile and origin. Chrome
and the Codex in-app browser do not share saves. Export/import to move between them.

## Test 2: two local browser instances

1. Open the A and B links in two windows in the same browser profile, using the
   exact same hostname (127.0.0.1). Keep both windows visible. Do not use incognito.
2. Create two trainers or import a separate cartridge save for each slot before
   loading the ROM. Never run the same trainer slot in two windows.
3. Choose This browser only in Connection and enter the same room code in both windows.
4. Click Host (player A) in A and Join (player B) in B.
   A first shows Hosting / waiting for Player B; B first shows Searching for host.
   Cancel connection works while waiting. Room controls return when disconnected.
5. Both pages should say Transport connected. This alone is NOT a multiplayer pass.
6. Open Quetzal's own multiplayer menu in each game and follow its host/join flow.
   Record the menu steps; the exact game prerequisites are still under test.
7. Check whether the trainers find and see each other. Move each independently.
   Try supported shared interactions. Inspect the sent/received counters below
   the connection controls: they should show actual game packet traffic.
8. Save each trainer in-game, export backups, disconnect, refresh and rejoin.

If discovery fails, keep both windows open and report the in-game screen text,
whether the transport is connected, and the sent/received counters. A 5-second
peer timeout is currently used; background suspension may disconnect a session.
Include `serialMode`, `siocnt`, and whether frames keep advancing if the game
gets stuck. User's original failure: host frames/averageMs kept updating while
sent/received were zero. A successful browser transport alone proves no gameplay.

## What to report

For the WebSocket test, use the steps in `services/relay/README.md`: run the relay,
select WebSocket relay, share A's generated room code, and connect through the
game's multiplayer menu. Start with delay/jitter zero, then try receive delay 25
and 50 ms on BOTH players. Report gameplay and save/rejoin results, plus peerRttMs
and packet counts if anything fails. Leave test delays at zero for normal play.

Port 4173, port 8787 and the hosted domain have separate browser storage.
Export each existing trainer before changing origin; import before pressing Play.
Localhost URLs cannot reach another computer. Use the hosted URL for internet tests.

- Browser and which test you ran.
- Last successful step and any exact error text.
- Whether refresh restored the correct trainer progress.
- For multiplayer: transport status, each game's screen, and packet counts.
- Audio glitches, slowdown, freeze, or unexpected control behavior.

A short report is enough, for example: “Solo save/refresh works; transport
connects, but B cannot find A in the game's menu; packets A 120/0, B 0/120.”
