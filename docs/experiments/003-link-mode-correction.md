# Link mode correction and controls, 2026-09-08

## Failure report

The user could persist a save across refresh, but A became unresponsive when
opening the in-game multiplayer menu. B could still abort its search. A's later
diagnostic sample showed 29,878 frames, 6.887 ms average frame time, zero packets
sent/received, and connected=false. The frame metrics continued changing. This
indicates a game waiting/stuck while the emulator runs, not a blocked WASM call;
the disconnected sample alone does not establish the earlier transport state.

## Configuration error

The initial frontend forced `gpsp_serial=rfu`, assuming Quetzal co-op used the
Emerald wireless adapter. That premise was insufficiently checked.

The pinned gpSP source distinguishes RFU from Pokémon Gen3 link-cable mode:

- `libretro/libretro.c:1011` maps `mul_poke` to `SERIAL_MODE_SERIAL_POKE`.
- `serial.c` calls `serialpoke_master_send()` for cable transfers only in that mode.
- `serial_proto.c` implements the Pokémon handshake (0xB9A0 / 0x8FFF), MPK1
  packets, parent/child data queues, and client interrupts.
- `netpacket_receive()` selects either RFU or Pokémon serial parsing by mode.

Thus an RFU-configured core cannot transport the Pokémon cable transactions.
Quetzal cable usage is also described by a browser emulator provider in its own
[Quetzal integration guide](https://rebit.cc/blog/play-pokemon-quetzal-online-co-op).
The [Quetzal official multiplayer page](https://www.pokemonquetzal.app/en/info/multiplayer/)
is still under construction and supplies no protocol confirmation.
The user's in-game retest remains the acceptance criterion for this ROM version.

Changed the browser and native baseline configuration to `mul_poke`, kept the
same core/toolchain/ROM/BIOS pins, and rebuilt. Changed the local channel namespace
so an old RFU window cannot silently join a corrected cable window. Refresh both.
No scheduler or upstream RFU changes were made: no evidence warrants them here.

## Other fixes

- Replaced the startup Disconnected event with explicit hosting/searching/connected
  states. Waiting can be canceled. Failed core starts, timeouts and peer departures
  report their causes; duplicate starts are disabled.
- Moved local transport into a testable module, retaining frame-boundary receive,
  peer addressing, epoch filtering and bounded queues.
- Wrapped scheduled emulator ticks so exceptions show an error instead of silently
  stopping the frame loop. Added frame-stall notice and serial-mode/register metrics.
- Room actions return keyboard focus to the game.
- Added validated versioned keybind JSON import/export, preserving existing binding
  storage and save formats. Added responsive game-panel fullscreen and exit controls.

## Verification and limits

Nine automated tests pass, including keybind round trip and malformed-file rejection,
connection cancellation/rejoin/timeout and old-epoch rejection. The rebuilt WASM
test boots the pinned ROM in two isolated cores, drives the real serial controller
through parent/child handshake, verifies MPK1 packets and the child's handshake in
the parent's SIOMULTI1 register, then verifies continued frames. Existing video,
audio, save size and isolation checks still pass.

Before correcting the mode, a direct RFU device test also passed; that only proved
RFU worked, not that it was the protocol Quetzal used. The regression now checks
the configured Pokémon serial path instead.

Browser UI verified: settings import/export controls, export action, fullscreen
entry/exit and canvas sizing. Two browser workers also verified the persistent
Hosting message, connected state on both sides, and corrected serial-mode label;
both were left at the title screen and then disconnected (no game packets expected).
Manual trainer progression and full co-op gameplay
remain delegated to the user, as requested. No claim of full multiplayer success.

## User retest result

On 2026-09-08, after the rebuilt link-cable configuration was supplied, the user
reported: “OMG the multiplayer works!” This confirms the first successful local
in-game multiplayer test. Duration, exact interactions, multiplayer save/rejoin,
and internet latency tolerance were not supplied; do not infer those passed.
The next engineering milestone is a WebSocket relay using the proven emulator
packet interface, followed by a two-device internet test. Longer local gameplay
and save/rejoin checks remain user-led.
