# Building the emulator

The normal site build uses verified, precompiled artifacts:

```sh
npm ci
npm run build:ci
```

Rebuilding gpSP is only necessary when changing the emulator or its C frontend.
The repository contains the frontend and build script; upstream source, the SDK,
and compiled binaries live in local build directories.

## Pinned components

| Component | Version or setting |
| --- | --- |
| gpSP | `8d268a6bb2cd799f8f2791ebb544a7ef550cfc6f` from libretro/gpsp |
| Emscripten | `6.0.9` |
| emsdk checkout | `5eb0bde7585670252e8ba05e9d361627bffd08b5` |
| Execution | Interpreter; native dynamic recompilation disabled |
| BIOS | gpSP's bundled open BIOS |
| Serial mode | Pokémon Gen3 link cable (`mul_poke`) |
| Audio | 32,768 Hz stereo PCM |
| Video | RGB565, 240 × 160 |

## Toolchain setup

The current build script uses the Windows emsdk Python layout. Run these commands
from the repository root in PowerShell:

```powershell
git clone https://github.com/libretro/gpsp.git .local/src/gpsp
git -C .local/src/gpsp checkout --detach 8d268a6bb2cd799f8f2791ebb544a7ef550cfc6f
git clone https://github.com/emscripten-core/emsdk.git .local/tools/emsdk
git -C .local/tools/emsdk checkout --detach 5eb0bde7585670252e8ba05e9d361627bffd08b5
& .\.local\tools\emsdk\emsdk.bat install 6.0.9
& .\.local\tools\emsdk\emsdk.bat activate 6.0.9
npm run build
```

For existing checkouts, verify their revisions before building. The script expects
`python/3.13.3_64bit/python.exe`, `upstream/emscripten/emcc.py`, and `.emscripten`
inside the SDK directory. It supplies `EM_CONFIG` explicitly. Building on another
platform requires adapting those tool paths while preserving the compiler flags.

## Outputs and verification

`scripts/build-emulator.mjs` compiles gpSP with `packages/emulator/host.c`. It
embeds the upstream open BIOS as C data because the native assembly wrapper
cannot be used by the WebAssembly assembler. Outputs go to `apps/harness/core/`:

- `gpsp.mjs` and `gpsp.wasm`: the browser/worker module and compiled core.
- `COPYING`: upstream emulator license.
- `build.json`: pinned core identity and settings.

With the pinned local Quetzal fixture available, `npm test` exercises two isolated
cores, rendering, audio, save memory, and the native serial handshake. Browser
and multiplayer checks are described in the repository's `docs/TESTING.md`.
Automated hardware handshakes do not establish full-game compatibility.

`npm run prepare:site` packages the local core and game fixture. Routine
`npm run build:ci` instead uses the released artifacts and does not publish a
locally rebuilt core. Publishing changed binaries requires the release procedure
in `deployment/README.md`; checksums must match the corresponding source.

## Source distribution

The deployed site's `/source/` directory supplies the pinned upstream source
archive, `host.c`, `build-emulator.mjs`, and this guide. Browser JavaScript modules
are served as source. gpSP is GPL-2.0-or-later; its license is served at
`/core/COPYING`. Game content is separate from the emulator's license.
