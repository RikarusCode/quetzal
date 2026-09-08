# Quetzal

A browser player for **Pokémon Quetzal**, the Pokémon Emerald ROM hack with
multiplayer and expanded gameplay features. Play solo or connect with friends
through shared rooms, with local saves and an interface built around the game.

The site loads the supported game version automatically.

## Features

- **Browser gameplay** powered by gpSP compiled to WebAssembly, with the game
  running directly on each player's device.
- **Rooms for up to four players**, with shareable codes, invite links, and
  a live player roster.
- **Independent save slots** with custom names, local persistence, save
  import/export, and protection against simultaneous use in another tab.
- **Configurable keyboard controls**, portable keybind layouts, volume controls,
  and fullscreen play.

## Getting started

Open the site, choose a save slot, and press **Play / Continue**. For a solo game,
that's all you need to do.

To play together:

1. Each player starts a game session and progresses past the first few interactions until they can access the in-game menu.
2. One player selects **Create room** and shares the code or invite link.
3. The other players join the room and check that everyone appears in the roster.
4. The host enables **Multiplayer** inside Quetzal, followed by the other players.

Each player controls their own trainer and keeps their own progress. Rooms connect
running games; they do not share or combine save files. The host leaving closes
the room. After a guest leaves, remaining players need to rejoin multiplayer
inside Quetzal.

### Saves and sessions

Save through Quetzal's own menu and wait for **Saved locally** before ending a
session. Returning to a slot loads its last in-game save. Use **Edit save slots**
to organize separate playthroughs, and export saves to keep backups or transfer
progress to another device.

Saves stay in the browser profile and site address where you played. They are not
synced to an account, and clearing site data removes them. Import/export supports
cartridge saves (`.srm` / `.sav`), rather than emulator snapshots.

## Local development

You need Git and Node.js **24.13.0**, pinned in [.nvmrc](.nvmrc).

```sh
git clone https://github.com/RikarusCode/quetzal.git
cd quetzal
npm ci
npm run build:ci
npm run relay:dev
```

Open **http://127.0.0.1:8787**. Wrangler serves the packaged site and runs the relay
locally; Cloudflare sign-in is not required for this development setup.

The build downloads pinned game and emulator artifacts, verifies their checksums,
packages the site, type-checks the relay, and runs unit tests. A fresh checkout
needs internet access, but no local ROM or emulator toolchain. Rerun
`npm run build:ci` after frontend changes to refresh the packaged site.

| Command | Purpose |
| --- | --- |
| `npm run build:ci` | Package the site from hosted artifacts and run build checks |
| `npm run relay:dev` | Start the local site and multiplayer relay |
| `npm run relay:check` | Type-check the relay |
| `npm test` | Run repository tests; core smoke coverage requires local fixtures |
| `npm run test:relay` | Run integration tests against a running relay |

To work on the emulator itself, `npm run build` compiles gpSP using the pinned
source checkout and project-local Emscripten SDK. See the
[build script](scripts/build-emulator.mjs) and
[artifact release procedure](deployment/README.md#updating-the-pinned-core-or-game).

## How it works

Each browser runs an independent gpSP instance in a Web Worker. A small C frontend
connects the emulator to JavaScript for video, audio, input, save memory, and link
packets. IndexedDB stores trainer saves and slot metadata on the device.

A separate worker downloads, decompresses, and verifies game content while the
emulator initializes. Versioned downloads use the browser cache, and restarting
a session reuses the verified ROM already in memory. Video follows the display's
refresh cycle; stereo audio streams directly from the emulator to an AudioWorklet
with a bounded buffer, independently of interface rendering.

Multiplayer uses gpSP's **Pokémon Gen3 link-cable mode (`mul_poke`)**. WebSockets
carry emulator packets through a Cloudflare Worker, with a Durable Object
coordinating each room. The server handles connections and packet delivery;
emulation stays on players' devices. A BroadcastChannel transport supports
testing within one browser profile.

The game and core versions are pinned, and rooms reject incompatible builds.
Protocol details and integration tests are covered in the
[relay documentation](services/relay/README.md).

### Project structure

```text
apps/harness/           Browser interface, emulator worker, saves, and transports
packages/emulator/     C frontend for the gpSP core
services/relay/        Cloudflare Worker and Durable Object room service
services/deploy-assets/  Versioned build artifact hosting
scripts/               Build, packaging, and development tools
deployment/            Artifact checksums and deployment configuration
tests/                 Unit, integration, and browser UI checks
docs/                  Architecture, testing guides, and technical records
```

## Deployment

Pushes to **`main`** trigger Cloudflare Workers Builds. Cloudflare installs the
locked dependencies, builds and checks the project, then deploys successful
builds. Failed builds leave the previous deployment active.

**ROMs and emulator binaries are kept outside GitHub.** A separate Cloudflare
asset deployment holds the versioned build inputs. The repository stores their
checksum manifest, and builds verify those inputs before packaging them with the
site. Routine interface and relay changes deploy from Git; game and core updates
use an explicit artifact release.

See the [deployment guide](deployment/README.md) for build settings and release
instructions.

## Documentation

- [Testing guide](docs/TESTING.md): gameplay checks, browser controls, and save verification.
- [Relay reference](services/relay/README.md): networking, local setup, and integration tests.
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md): architecture decisions and development milestones.
- [Experiment records](docs/experiments/): technical findings and validation results.

Desktop Chrome and Edge are the current testing targets. Extended multiplayer
sessions and broader device compatibility remain areas of active validation.

## Credits and licensing

Pokémon Quetzal provides the game and its multiplayer features. This project
provides the browser frontend, save management, and networking infrastructure.

The emulator is **gpSP**, distributed under GPL-2.0-or-later. The deployed site's
**Source** and **License** links provide the pinned upstream source, frontend build
materials, and emulator license. Game content is separate from the repository
and is not covered by the emulator's license.
