# Experiment 001: reproducible ROM inputs

Date: 2026-09-08. Result: input preparation passed; native and browser runtime
tests have not started.

## What was done

- Found the user-supplied 16 MiB Emerald and 32 MiB Quetzal ROMs in the local
  `pokemon emerald` directory. Both pass the GBA header checksum check.
- Recorded file hashes, header fields and exact sizes in `rom-inputs.json`.
  Header validity alone does not authenticate a release. The Quetzal version
  label comes from the filename; official release equivalence is not verified.
- Downloaded portable Floating IPS v198 from its upstream GitHub release into
  `.local/tools/flips-v198`. No global installation was performed.
- Generated `.local/patches/quetzal-english-alpha-8v4.bps` (13,012,569 bytes).
- Applied it to the source and compared the reconstructed 32 MiB ROM with the
  supplied target byte-for-byte: identical.
- Attempted application with the target ROM as an incompatible source: rejected.
- Added Git exclusions for local inputs, generated patches, saves and tools.
  No ROM or patch was uploaded, published or committed.

## Reproduce

Run from the repository root with Node:

```powershell
node scripts/prepare-roms.mjs
```

The script requires the two original filenames and the local Flips executable.
It checks their SHA-256 hashes before running. It regenerates only its named
outputs under `.local/patches` and the metadata manifest; original ROMs are not
modified. The reconstructed ROM remains in the ignored folder for inspection.

Tool release: https://github.com/Sir-Walrus/Flips/releases/tag/v198

Windows archive URL:
https://github.com/Sir-Walrus/Flips/releases/download/v198/flips-windows.zip

Observed archive SHA-256:
`802bfb315dca08a2f765dd6864472ecbb2b482681045c573d5e4b657b8e5295d`

Observed executable SHA-256:
`ca6b364ccb23ab83ff0f4458f589eac001e7baf74315decde73c878a8eb519fd`

These are locally measured hashes for reproducibility, not separately published
upstream signatures. License files are retained with the portable tool.

## Tool availability

Node v24.13.0 and Git are available. Emscripten, CMake, Ninja, Make, Clang, GCC,
RetroArch and Docker were not found on PATH. RetroArch and emsdk were also not
found in the handful of common installation paths checked. This is not a
whole-drive inventory. Windows reports that WSL is not installed.

## Next experiment: native baseline

1. Acquire a portable RetroArch build and compatible gpSP core locally, recording
   exact versions and hashes. Obtain/pin the corresponding gpSP source revision
   for the later browser build. Do not assume the newest binary matches master.
2. Give two native instances separate config, save and state directories, plus
   distinct trainer saves. Use the identical target ROM and settings. Start with
   bundled BIOS and explicit RFU mode; record any necessary setting changes.
3. Connect through RetroArch netplay, then use Quetzal's in-game multiplayer
   flow. Record the exact menu sequence, restrictions and settings encountered.
4. Demonstrate two independent trainers, exploration and supported interactions;
   save, restart and rejoin. Do not count two mirrored screens as success.
5. Record the result, logs, core identity, BIOS mode, serial mode and failures in
   a second experiment report. Use that baseline to distinguish game/core issues
   from browser-specific problems.

After the baseline, set up a project-local Emscripten toolchain and compile the
pinned gpSP interpreter with a minimal libretro host. The first browser page
needs only a local ROM picker, canvas, input and audio, plus diagnostics and
save import/export. Use the supplied patched ROM directly during initial core
debugging; integrate local BPS application once booting works. The patch is an
onboarding asset, not a prerequisite for RFU testing.

Native multiplayer baseline is still pending. No lobby, cloud backend or account
work is needed yet.
