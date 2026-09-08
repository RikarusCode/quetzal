# Quetzal browser feasibility lab

Pinned gpSP WebAssembly harness with keyboard input, audio, IndexedDB cartridge
saves and a two-instance Pokémon Gen3 link-cable packet bridge.

Planned product: open the website and play, with a prepatched Quetzal ROM served
automatically by the site. No user ROM upload, file selection or Emerald patching.
The player now loads the website-provided game automatically. The deployment
package and WebSocket relay run locally and on Cloudflare:
[Open the playtest](https://quetzal-playtest.rikcroy.workers.dev).

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

For the WebSocket playtest, run `npm run prepare:site`, then `npm run relay:dev`
and open http://127.0.0.1:8787. See [relay setup and tests](services/relay/README.md).
Export saves before moving between ports or domains; browser storage is origin-specific.
