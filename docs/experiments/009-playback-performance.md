# Browser playback and caching — 2026-09-08

## Changes

- Removed the wildcard `Cache-Control: no-cache` rule. Cloudflare combined it
  with the game's immutable rule, making repeat visits revalidate the download.
  Only the hash-named game asset has a one-year immutable policy. Other assets
  retain Cloudflare's normal revalidation behavior; the manifest is fetched with
  `no-store` at each session start.
- Moved download, bounded decompression, and SHA-256 verification into a separate
  worker. Its page-lifetime cache holds one verified 32 MiB ROM and transfers a
  copy to each session. Refreshing verifies again using the HTTP-cached download.
  Release mismatch still fails, and a failed download can be retried. This trades
  32 MiB of retained memory for avoiding repeat decompression and hashing.
- Start WASM preparation concurrently with content preparation. No C/core binary
  or artifact release change is involved.
- Replace per-pixel divisions with a precomputed RGB565 lookup table and recycle
  three transferable RGBA buffers. Present the latest frame on the next display
  refresh. If the page is blocked or hidden, the pool bounds queued video while
  emulation and network processing continue. No emulator frames are skipped by
  this presentation policy; obsolete images can be dropped.
- Stream stereo PCM directly from the emulator worker to an AudioWorklet over a
  MessagePort. A fixed ring linearly resamples to the device rate, starts with
  40 ms of audio, and discards stale audio beyond 100 ms instead of accumulating
  delay. Brief starvation fades toward silence and refills. Volume still uses
  the existing gain slider and persists locally.
- Gate PCM delivery on the worklet's first processing callback. Initial testing
  caught 4–9 buffer overflows before the audio device started pulling samples,
  despite AudioContext reporting `running`. The readiness handshake eliminated
  those startup overflows. Audio suspension stops delivery; resume clears stale
  buffered audio, and End session closes both audio and emulator resources.
- Ignore redundant keyboard-repeat messages for already-held gameplay keys.

## Measurements

Baseline: isolated persistent Edge profile, public site, this development PC.
The compressed game is 14,518,147 bytes. Cold first frame took 4.92 s; End/Play
took 1.29 s; refresh/Play took 1.48 s. Normal cached starts revalidated with about
300 transfer bytes. An earlier incognito run downloaded the full asset again.
The worker's average frame-work timer reported 3.3–3.6 ms, including pixel/audio
preparation, not just native emulation. Presentation interval p95 was 23–24 ms.

Optimized local packaged site: session restart took 178 ms with no new ROM fetch;
refresh/Play took 410 ms, and worker Resource Timing confirmed zero ROM transfer
bytes. Cold startup varied with asset transfer/server load (1.44–4.20 s).
Steady cold/restart frame work measured 0.80–0.85 ms, presentation interval p95
17–18 ms, and roughly 59 displayed frames/s. A later reload sample under heavier
machine load measured 1.99 ms frame work and 56 displayed frames/s. These are
short boot/title-screen measurements, not hardware-independent guarantees.

The audio test reported zero underruns/overruns after the startup fix. A deliberate
250 ms main-thread stall skipped obsolete video images but did not interrupt
PCM playback or emulator advancement. Reported audio buffering was about
34–53 ms plus the device's 10 ms base latency on this machine. No per-frame
AudioBufferSourceNodes were created. These measurements do not constitute a
human listening test or a full multiplayer gameplay benchmark.

## Verification

- Nine new unit cases cover release checks/cache/retry, invalid/oversized content,
  resampling at 22.05/44.1/48/96 kHz, starvation/overflow, and video recycling.
- Full repository suite: 23 tests, including the real pinned core smoke test.
  The source-only deployment build passes its 22 tests and relay type check.
- Ten relay tests pass, including four real WASM controllers discovering every
  peer at injected RTTs through 250 ms. Protocol/timing behavior is unchanged.
- Isolated browser lifecycle checks pass for actual gain/mute/persistence,
  session restart, room departure, lock release, unload guards and mobile layout.
- `tests/ui/performance.mjs` checks worker content loading, same-page cache reuse,
  zero-byte refresh downloads, PCM output, UI-stall isolation, bounded video,
  suspend/resume, and teardown. Reports live under ignored `.local/` paths.

The first save/room browser regression attempt timed out on a reload while the
packaged assets were rebuilding; timing tests and builds should run separately.
The rerun passed save import/export, persistence, cross-tab locks, four-player
room controls, guest rejoin, host closure, fullscreen and mobile layout.
Manual validation remains user-led: listen for clicks/drift during a real run,
check controls while moving, and play with friends on separate devices. Browser
sleep/throttling and network latency remain outside the renderer's guarantees.
