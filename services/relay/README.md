# Quetzal WebSocket playtest

The same Cloudflare Worker + Durable Object implementation runs locally under
Wrangler and on Cloudflare. One Durable Object coordinates each private four-player
room. The frontend's tested LocalLink lifecycle wraps either BroadcastChannel
or WebSocketChannel; native callbacks still execute on the emulator worker.

## Local run

From the repository root, after installing dependencies and building gpSP:

```powershell
npm run prepare:site
npm run relay:dev
```

Open http://127.0.0.1:8787. The site supplies the game automatically when Play is
pressed. The 32 MiB verified ROM is packaged as a 14.5 MB gzip asset in ignored
`dist/site`; the browser decompresses it and verifies its SHA-256 before booting.
No player ROM upload, ROM picker, patching, account or save-upload endpoint exists.
The package includes the pinned emulator's source, frontend source and GPL notice.

Use a separate save slot for each window in one browser. After Play, one player
chooses Create room and shares the code or invite link. Up to three others choose
Join room. The relay assigns player numbers and publishes the current roster.
Then enter the game's multiplayer menu. A room code grants room access, not save access.
The local endpoint is `ws://127.0.0.1:8787/relay`; a hosted endpoint uses `wss://`.
The old port-4173 harness can use this relay while retaining its existing saves.

## Validation

With `relay:dev` running:

```powershell
npm test
npm run test:relay
npm run relay:check
npm run relay:dry-run
```

`test:relay` defaults to port 8787; set RELAY_TEST_URL to another HTTP(S) base URL
for a controlled test. It uses synthetic packets plus a local-ROM device-level
test, and never uploads ROM bytes to the relay. The packaged-content test verifies
the served game; it downloads content only.

On this Windows machine, Node may need its system trust store for npm/Cloudflare
HTTPS. Set `$env:NODE_USE_SYSTEM_CA='1'` in the terminal if the default certificate
chain fails. TLS verification stays enabled.

The local-runtime integration tests cover identity, ordering, version rejection,
duplicate roles, origin checks, malformed packets, slow receivers, room isolation,
departure, replacement and missing-room errors. The real four-core WASM test performs the Pokémon cable
handshake over WebSockets with added RTT of 0/50/100/150/250 ms. This does not prove
Quetzal gameplay remains stable at any tested latency.

## Protocol and lifecycle

- Room codes are 128 random bits, encoded as 32 lowercase hex characters. The code
  is the room capability. There is no public room listing or account authentication.
- The upgrade URL is `/relay/{code}`. The first text message specifies intent
  create/join, connection epoch and exact compatibility ID. It must arrive within
  10 seconds (enforced on the next alarm). Four connections, including pending
  ones, fit. Create assigns host ID 0; join requires a host and assigns the first
  available ID 1–3. Unknown rooms do not silently become waiting lobbies.
- JSON control messages are limited to 1024 characters and a fixed type whitelist.
  Core packets are binary: 8-byte envelope, then exactly 24 bytes of validated MPK1
  data. Protocol v2 adds recipient ID in byte 3 (255 means broadcast). Version,
  native header and protocol state are checked before forwarding.
- The relay stamps sender ID from the accepted connection and increments a sequence
  for each destination. Peers acknowledge delivery. At 256 outstanding packets the
  room closes instead of growing an unbounded outgoing queue. Broadcasts reach
  all other members; targeted packets reach only their recipient. Browser outgoing
  buffers and incoming/delay queues are bounded too.
- Connection roles, epochs, sequence/ack counters and rate counters live in WebSocket
  attachments, which survive hibernation. No game packets or saves enter DO storage.
  Alarms clean up abandoned connections. No reconnect silently resumes a live game.
- A guest leaving publishes a smaller roster. Remaining emulators reset their
  serial session and clear queued data; rejoin through Quetzal's multiplayer menu.
  A replacement gets the free ID and a new epoch. The host leaving closes the
  whole room. There is no host migration or seamless live-game resume.
- Own-origin requests are allowed, plus configured port-4173 development origins.
  Invocation logging is disabled so private room URLs are not written by application
  request logs. No game payloads, room codes or save data are logged by relay code.

## Latency diagnostics

`peerRttMs` measures the round trip through the relay to the other emulator worker
and back. `relayRttMs` measures only the connection to the relay. Connection settings
can add 0–250 ms of receive delay and up to 100 ms of random additional delay on each
player. Reliable order is preserved. Set 50 ms on both sides for approximately
100 ms added RTT. Leave delay/jitter at zero for ordinary internet play.

## Deployment

Current address: https://quetzal.deployhost.workers.dev

Pushes to `main` trigger Cloudflare Workers Builds, which packages and checks the
site before deploying `quetzal`. See the [deployment guide](../../deployment/README.md)
for configuration and artifact releases. `npm run relay:dry-run` checks the local
deployment package without publishing it.

All players should use the same site address. Changing the account subdomain
keeps the Worker and Durable Object binding, while deploying a separate Worker
creates a separate room namespace. Existing room sessions should be closed before
switching addresses. Game compatibility checks remain tied to the pinned build.

The hosted integration suite covers real WASM cable handshakes and four-player
packet routing. Sustained gameplay, battles, trades, and save/rejoin flows require
the scenarios in [the testing guide](../../docs/TESTING.md).

Browser saves are specific to origin: 4173, 8787 and workers.dev have separate
storage. Export from the old origin and import before Play on the new one. Existing
hash/slot save keys are preserved. This is not cloud-save synchronization.

## References checked 2026-09-08

- [Cloudflare WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Worker best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Static asset bindings](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- Installed Wrangler 4.130.0 config schema and Workers types 5.20260908.1.
