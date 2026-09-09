# GitHub → Cloudflare deployments

The production Worker is `quetzal`, served at https://quetzal.deployhost.workers.dev.
Cloudflare Workers Builds should watch
`RikarusCode/quetzal`, production branch `main`, with these settings:

| Setting | Value |
| --- | --- |
| Root directory | `/` (repository root) |
| Build command | `npm run build:ci` |
| Deploy command | `npm run relay:deploy` |
| Non-production branch builds | Disabled |
| Node version | `.nvmrc` pins Node 24.13.0 |
| Build token | Cloudflare-generated token for this Worker |

Cloudflare installs dependencies from the lockfile. Builds download pinned binary
inputs from `quetzal-assets.deployhost.workers.dev`, validate their sizes and SHA-256
hashes, assemble the site, type-check the relay and run unit tests. Only a successful
build proceeds to deploy. GitHub contains source and `assets-lock.json`, **no ROM**.
The existing `.gitignore` excludes ROMs, saves, binaries and generated site files.

The asset Worker is a separate, static deployment: routine Git pushes do not
modify it. It contains the already-public game file and emulator build artifacts,
including corresponding source and license. It is not private ROM storage.
Players continue downloading the game from the main site's packaged assets.
No runtime dependency on the asset Worker or external browser request is added.

If the account's workers.dev subdomain changes, update the artifact origin in
`assets-lock.json` and `scripts/deploy-assets.mjs` together. The player and relay
derive their URLs and allowed production origin from the current request, so
they do not need a hard-coded hostname change. Browser saves and settings remain
bound to the old origin. Import exported saves and keybindings on the new site;
reapply other preferences as needed.

## Updating the pinned core or game

This remains an explicit operator operation, separate from ordinary UI/relay work:

1. Rebuild and verify the intended core/game locally; update the build identity.
2. Run `npm run prepare:site`, then `npm run prepare:deploy-assets`.
3. Deploy `services/deploy-assets/wrangler.jsonc` with Wrangler. Preserve older
   version directories in `dist/deploy-assets` for rollback builds.
4. Review and commit the new `deployment/assets-lock.json` alongside source changes.
5. Push to `main`. Cloudflare builds and deploys the site.

The lock also checks normalized frontend C/build-script source hashes. Editing
those sources requires rebuilding the core and publishing matching artifacts;
CI must not silently ship an old WASM binary with new C source.

If the asset store is unavailable or any checksum differs, builds fail and the
previous production deployment stays active. Account connections and build tokens
are managed in Cloudflare, never committed or copied into GitHub secrets.

Reference: [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).
