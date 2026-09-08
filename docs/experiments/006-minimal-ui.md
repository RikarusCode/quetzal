# Minimal player UI — 2026-09-08

Removed the brand banner, promotional heading, device badge, decorative pill
labels and repeated helper text. Keyboard settings moved to the top right.
Save/Room controls use a compact charcoal/gray interface with blue actions,
simple borders, system fonts, no gradient and no backdrop blur. The footer
contains only Source and License. Dynamic statuses were shortened; actionable
errors, slot-lock guidance and deletion/import warnings remain.

Fullscreen hides every app element except the game canvas, removes padding and
fits the 3:2 image to the screen without stretching/cropping. Escape exits, with
an explicit handler for browsers that deliver the key to the page.

Verification: isolated Edge UI scenario passed save management/import/export,
keyboard settings, cross-tab protection, four-player room controls, fullscreen
layout and 390px mobile layout. Five keyboard unit tests passed. Screenshots of
desktop, mobile, save dialog and fullscreen were visually inspected. A separate
fullscreen check confirmed a rendered game image at 1350×900 in a 1440×900 viewport,
keyboard focus on the canvas, and Escape returning to the normal page. Native
gameplay was not manually progressed. No emulator/relay protocol changes.

Published to https://quetzal.rikcroy.workers.dev as version
`11d0b886-abcb-473d-94f8-d1382f7ca00b`. All six changed public UI assets were
downloaded and hash-matched against the tested deployment package.
