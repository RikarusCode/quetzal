# Experiment 002: native and browser core execution

Date: 2026-09-08. User has taken over manual gameplay testing.

## Pinned components

- gpSP source: `8d268a6bb2cd799f8f2791ebb544a7ef550cfc6f` from libretro/gpsp.
- Emscripten 6.0.9; emsdk checkout `5eb0bde7585670252e8ba05e9d361627bffd08b5`.
- Portable RetroArch 1.22.2, git `69a4f0e`.
- Native gpSP DLL reports `v1.1.0-8d268a6`; SHA-256
  `23722e00dc5e008125cc2a3a07ad5c9508d1d434bec463c63a98bca198b87bc6`.
- Builtin BIOS, forced RFU, interpreter (native dynarec disabled for comparison).
- ROM and patch hashes remain in `rom-inputs.json`.

## Implemented

- `packages/emulator/host.c`: minimal libretro frontend and packet callback bridge.
- `scripts/build-emulator.mjs`: builds the pinned core; embeds the identical
  upstream open BIOS as C data because the native assembly `.incbin` wrapper is
  inappropriate for the WASM assembler. No gpSP/RFU source changes made.
- Browser Worker: frame scheduler, latched input, video/audio delivery, save memory
  access and experimental BroadcastChannel transport with two fixed peer IDs.
- Frontend: local ROM hash validation, separate A/B save slots, IndexedDB current
  and previous save revision, save checksums, pre-boot import and export.
- Local-only development server, with an explicit optional loopback ROM fixture
  to avoid slow automation file-chooser transfers. Normal mode serves no ROM.
- `scripts/native-baseline.ps1`: isolated portable RetroArch configurations.
- `scripts/native-core-lab.py`: two independent DLL instances through libretro,
  JSON frame/input control, local screenshots and direct netpacket relay.

## Observed evidence

- Portable RetroArch launched the ROM and registered SET_NETPACKET_INTERFACE.
  Windows inspection twice failed with an inconsistent window-owner error; no
  native multiplayer conclusion was drawn from that launch.
- Direct native core lab verified separate save-memory addresses for two cores.
  Distinct trainers A/B (boy/girl) were created through ordinary game inputs and
  reached the opening truck/Littleroot scene. They have not been linked in-game.
- Browser title screen and new-game configuration/trainer-selection screens were
  visually inspected. Start, A, directional and R inputs worked after input
  latching was added. An initial missing exported HEAPU16 view was fixed by
  explicitly exporting memory views from Emscripten.
- Early browser average frame work settled around 1-3 ms in menus on this machine.
  This is not an FPS guarantee or a sustained busy-scene benchmark.
- `node --test tests/core-smoke.test.mjs`: passed. Boots two WASM cores for 240
  frames each, checks rendering/audio, save size, memory isolation and netpacket
  start/connected/stop. No fabricated RFU packets or multiplayer claim.

## Remaining acceptance tests and limitations

- Native in-game multiplayer baseline: pending.
- Browser in-game save -> refresh -> Continue: user reported it appeared to work
  on 2026-09-08. Longer-session and browser-restart testing remains separate.
- Actual Quetzal game packets and independent multiplayer movement: pending.
- Audio frames are produced, but audible quality has not been assessed.
- Save capture currently requires two consecutive stable one-second samples;
  this is a heuristic, not a parser for Quetzal's completed-save transactions.
- Same-slot simultaneous writers are not yet prevented. Test with distinct A/B
  slots and export backups; never use a valuable save as the first test.
- BroadcastChannel is same-profile, same-origin local transport only. Peer
  timeout is five seconds. Keep both windows visible for the initial test.
- No internet relay, accounts, public deployment or full-game compatibility claim.

The gameplay checklist is in `docs/TESTING.md`. Continue engineering based on
those results; the user requested that the agent stop manually playing the game
to conserve tokens.

## UI and configurable keyboard controls

Added a responsive game/sidebar layout, collapsed diagnostics, sound toggle,
and a keyboard settings dialog. Bindings are stored separately from game saves
in localStorage. Conflicting assignments swap, Escape cancels capture, and a
reset restores defaults. Game input requires canvas focus; opening settings,
leaving the canvas, or hiding the page clears both held and latched input.

Validation: three controls tests pass (conflict swaps, simultaneous input masks,
invalid stored settings); browser inspection confirmed remapping, persistence
after refresh, restoring defaults, and Escape cancellation. No gameplay was
performed for these UI checks. Save storage keys and formats are unchanged.
