# Volume and session controls — 2026-09-08

Implemented a small volume popover using a real Web Audio GainNode. Slider level
persists locally, mute restores the last audible level, and each ended session
closes its AudioContext. Audio starts after interacting with Volume.

End session opens a modal with Keep playing as the initial focus. Confirmation
reminds the user to save in Quetzal and wait for Saved locally. Shutdown stops
the worker's frame loop and room, waits for its ordered acknowledgement (bounded
to two seconds for a stuck worker), drains already-posted save writes, terminates
the worker, closes audio and releases the save-slot lock. A later Play creates
a fresh worker. No exact emulator snapshot or synthetic in-game save is made.

The native reload/navigation guard is installed only for a running session.
Browsers require a prior user gesture and use generic warning text, ignoring
custom messages. Mobile process termination cannot be reliably intercepted.
See [MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).

Room help is available on hover/focus and dismissed with Escape. Create/Join
start disabled in HTML and are synchronized from actual session readiness,
including pageshow after form restoration, startup failure and session shutdown.

## Verification

- Eight keyboard/save-storage unit tests passed.
- Existing isolated browser test passed slot persistence, save import/export,
  deletion confirmation, cross-tab locks, fullscreen, four-player room counts,
  invalid joins, guest rejoin, host closure and mobile layout.
- New `tests/ui/session-controls.mjs` passed real audio gain/mute/persistence,
  tooltip, confirmation/cancel/restart, guest and host session shutdown,
  cross-tab save-lock release, active-only reload warnings (cancel and accept),
  disabled-state restoration, and mobile bounds. No page errors.
- Inspected desktop volume and confirmation screenshots and mobile room help.

Tests boot the real WASM core and use the real relay but do not advance trainers.
User-led completed-game-save → End session → Continue remains the gameplay check.

Deployed at https://quetzal.rikcroy.workers.dev as version
`fb59fb82-888c-4744-8011-69157be128c0`. The complete session-controls browser
scenario also passed against the public site and its hosted WebSocket relay.
