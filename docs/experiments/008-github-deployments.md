# GitHub deployment build — 2026-09-08

The user requested native GitHub-triggered Cloudflare deploys and explicitly
excluded putting ROMs in public GitHub. The repository remains source-only.

`quetzal-assets` stores the pinned ROM, emulator binaries, corresponding source
and license. Its initial complete deployment is
`7fbce6c9-2d5d-4c5a-800f-21ed77419333`. The main site's build downloads these
inputs using the committed checksum manifest, verifies compressed bytes and the
decompressed ROM, and fails before deploy if anything is missing or mismatched.
Normalized C/build-script source hashes prevent deploying a stale compiled core
after those sources change. Routine frontend/relay updates need no binary release.

Source-only verification used an isolated directory containing Git source plus
the reviewed new configuration files, normalized to Linux line endings. It had
no local ROM, core binary, gpSP checkout, SDK or generated site. A clean `npm ci`
followed by `npm run build:ci` succeeded: remote inputs downloaded and verified,
site assembled, relay type checking passed and 13 unit tests passed. A unit test
also confirms truncated and same-length altered inputs are rejected.

Keyboard settings now uses flex alignment without conflicting vertical padding.
Browser measurements at 1440px and 390px widths reported zero horizontal and
vertical offset between the text center and button center; screenshot inspected.

Commit `d0529c8` published the source-only pipeline and button fix. Cloudflare's
GitHub integration detected its push. The initial build failed before the user
finished updating the build/deploy commands. A fresh push tests the saved settings.
Cloudflare build logs require dashboard access beyond Wrangler's OAuth scope.

The production settings are documented in `deployment/README.md`. No ROM, save,
WASM binary, OAuth token or deployment secret was added to Git history.
