# Quetzal browser multiplayer project

## Product intent

Build a website where players select their own compatible Emerald ROM locally,
apply a supported Quetzal patch, play the full game in the browser, and connect
independent trainers through shared lobbies. Preserve progress locally and,
later, through private recovery codes and optional accounts.

Read `docs/IMPLEMENTATION_PLAN.md` before implementing. It contains the research,
architecture, milestone acceptance criteria, and unresolved decisions.

## Current status

Input preparation completed, dated 2026-09-08. See
`docs/experiments/001-input-preparation.md` and `rom-inputs.json` alongside it.
A local BPS patch reproduces the supplied Quetzal ROM byte-for-byte; incompatible
source rejection was tested. gpSP revision
`8d268a6bb2cd799f8f2791ebb544a7ef550cfc6f` now builds with Emscripten 6.0.9.
Browser boot and new-game input have been visually verified. The core smoke
test passes for video/audio, two isolated instances and packet lifecycle.
Native RetroArch boot and a direct two-instance native core harness also work.
The user reported a successful browser save -> refresh test on 2026-09-08.
Actual native/browser in-game multiplayer remains UNVERIFIED. The user is
handling manual gameplay testing; do not spend turns
manually progressing trainers unless requested. See `docs/TESTING.md`.

Initial assumptions, pending user preferences: desktop Chrome/Edge, two players,
independent trainer saves usable solo, private friend lobbies. Treat these as
defaults, not confirmed requirements. Full mobile support and four-player play
are later compatibility targets.

## Execution priorities

1. Establish a native Quetzal/gpSP multiplayer baseline and pin inputs.
2. Boot that same game in a minimal browser harness; persist cartridge saves.
3. Demonstrate independent browser instances exchanging actual game packets.
4. Demonstrate internet play under measured latency through a relay.
5. Only after those gates, implement the polished lobby and recovery experience.

Do not substitute a mock lobby, exchanged button inputs, or an ordinary
single-console netplay demo for Quetzal wireless multiplayer. Do not describe a
successful build or packet echo as proof that the game works.

## Engineering constraints

- Prefer a small libretro frontend over rewriting RFU or porting all RetroArch.
- Keep core calls on the emulator's owning thread. Test packet delivery timing.
- Keep local and internet transports behind the same packet interface.
- Pin core revision, toolchain, patch, ROM hashes, BIOS mode, and core settings.
- Never silently upgrade active runs or merge divergent binary save files.
- Use cartridge saves as durable progress. Exact multiplayer save-state resume
  is a separate research problem. Disable time manipulation while linked.
- Keep room identity, trainer/save ownership, and connection identity separate.
- Room codes must not authorize access to a player's private cloud saves.
- Keep ROMs, BIOS dumps, patched ROMs, personal saves, and credentials out of git,
  server uploads, fixtures, and logs. Use synthetic/homebrew fixtures in CI.
- Verify patch redistribution terms before bundling a patch; allow local patch
  selection if needed. Preserve emulator licensing and corresponding source.
- Report milestone evidence and limitations honestly. Record failed experiments
  and actual metrics so later agents do not repeat unsupported assumptions.

## Next implementation deliverable

Finish gates 0-3 using the existing harness and the user's manual gameplay
results. Investigate failed saves or RFU discovery using the packet diagnostics.
Do not call the local BroadcastChannel connection internet multiplayer. Current
save persistence uses a stability heuristic; game-aware completion detection
and same-slot multi-writer protection still need work. Accounts, friends,
avatars, and spectator mode are not prerequisites for this deliverable.
