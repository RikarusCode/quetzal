# Manual gameplay tests

Use these tests while implementation continues. Do not use an important existing
save for the initial tests. The save-completion detector is still a stability
heuristic. Export a backup after each successful test.

## Start the local harness

Normal file-picker mode: `npm start`, then open http://127.0.0.1:4173.

The current development session uses `node scripts/serve.mjs --local-fixture`.
This explicitly enables reading the supplied test ROM over loopback, so these
links boot it automatically without the slow automation file picker:

- Trainer A: http://127.0.0.1:4173/?fixture=local&slot=A
- Trainer B: http://127.0.0.1:4173/?fixture=local&slot=B

The server binds only to 127.0.0.1. Fixture loading is disabled in normal mode.
There is no internet relay, account system, or public deployment yet.

## Controls and initial configuration

Click the game canvas to focus it. Arrows move; X is the GBA A button, Z is B,
Enter is Start, Right Shift is Select, A is L, S is R. Use Keyboard settings
to change any binding. Select a binding and press a key; Escape cancels capture.
Occupied keys swap assignments. Changes persist in this browser; Restore
defaults resets them. Keyboard input only controls the game while its canvas
has focus. Opening settings releases held keys but does not pause the game.

User result (2026-09-08): the in-game save -> refresh test appeared to work.
Multiplayer remains pending.

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
5. Refresh. In fixture mode the ROM reloads automatically; otherwise select the
   same ROM again. Select Continue in the game and check name, location and party.
6. Later, close and reopen the browser and repeat the check.

Expected: return to the last completed in-game save, not the exact instant the
tab was closed. Storage is specific to the browser profile and origin. Chrome
and the Codex in-app browser do not share saves. Export/import to move between them.

## Test 2: two local browser instances

1. Open the A and B links in two windows in the same browser profile, using the
   exact same hostname (127.0.0.1). Keep both windows visible. Do not use incognito.
2. Create two trainers or import a separate cartridge save for each slot before
   loading the ROM. Never run the same trainer slot in two windows.
3. Enter the same Local room value in both windows.
4. Click Host (player A) in A and Join (player B) in B.
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

## What to report

- Browser and which test you ran.
- Last successful step and any exact error text.
- Whether refresh restored the correct trainer progress.
- For multiplayer: transport status, each game's screen, and packet counts.
- Audio glitches, slowdown, freeze, or unexpected control behavior.

A short report is enough, for example: “Solo save/refresh works; transport
connects, but B cannot find A in the game's menu; packets A 120/0, B 0/120.”
