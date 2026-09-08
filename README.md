# Quetzal browser feasibility lab

Pinned gpSP WebAssembly harness with keyboard input, audio, IndexedDB cartridge
saves and a four-player Pokémon Gen3 link-cable packet bridge.

Planned product: open the website and play, with a prepatched Quetzal ROM served
automatically by the site. No user ROM upload, file selection or Emerald patching.
The player now loads the website-provided game automatically. The deployment
package and WebSocket relay run locally and on Cloudflare:
[Open Quetzal](https://quetzal.rikcroy.workers.dev).

The previous `quetzal-playtest.rikcroy.workers.dev` site remains available for
exporting existing saves. Import them on the new address before Play; browser
storage is specific to each address. Everyone in a room should use the new site.

See [manual testing](docs/TESTING.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md)
and [input manifest](docs/experiments/rom-inputs.json).

`npm start` serves the local harness with game content at http://127.0.0.1:4173. Build the core first
with `npm run build` after installing the pinned project-local Emscripten SDK
and gpSP source. Generated binaries and game files are not committed.

Browser boot has been visually verified; the user reported that save -> refresh
works and confirmed initial local in-game multiplayer. Longer gameplay, multiplayer
save/rejoin and internet gameplay testing remain open. Hosted WebSocket integration
and real WASM cable handshakes have passed. Keyboard settings supports saved
bindings, conflict swaps, import/export and restoring defaults. Fullscreen is available.
Volume opens a slider with mute; the level persists in this browser. End session
requires confirmation, leaves/closes the room, stops the emulator, and releases
the save slot so another session can start without refreshing. Save in Quetzal
and wait for Saved locally first. Active sessions also guard reload/navigation
with the browser's standard unsaved-changes warning.

One default save slot appears in a fresh browser. **Edit save slots** adds,
renames or removes slots; existing A/B saves are preserved. Slot names, selection
and saves persist locally. Import/export applies to the selected slot. An active
slot is protected against concurrent play, import and deletion in another tab.

Play solo without creating a room, or choose **Create room** and share the code
or invite link. **Join room** assigns an available player number automatically.
Rooms display up to four players. Guests can leave/rejoin; remaining players must
rejoin in Quetzal after a departure. The host leaving closes the room.

For the WebSocket playtest, run `npm run prepare:site`, then `npm run relay:dev`
and open http://127.0.0.1:8787. See [relay setup and tests](services/relay/README.md).
Export saves before moving between ports or domains; browser storage is origin-specific.
