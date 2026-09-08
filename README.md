# Quetzal browser feasibility lab

Pinned gpSP WebAssembly harness with local ROM loading, keyboard input, audio,
IndexedDB cartridge saves and an experimental two-instance RFU packet bridge.

See [manual testing](docs/TESTING.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md)
and [input manifest](docs/experiments/rom-inputs.json).

`npm start` serves the local harness at http://127.0.0.1:4173. Build the core first
with `npm run build` after installing the pinned project-local Emscripten SDK
and gpSP source. Generated binaries and game files are not committed.

Browser boot has been visually verified; the user reported that save -> refresh
works. Multiplayer acceptance testing is pending. A connected transport is not
a multiplayer proof. Keyboard settings supports saved per-button bindings,
automatic conflict swaps, and restoring defaults.
