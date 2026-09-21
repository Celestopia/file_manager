# Development and verification

[Architecture overview](../PROJECT.md) · [User guide](../README.md)

This document owns developer setup, quality checks, fixture generation, packaging, and documentation maintenance. See the [user guide](../README.md) for application use.

## Setup and tracked files

Use Node.js >=22.12, Rust stable (edition 2024) with MSVC, Windows SDK/C++ build tools, npm, and WebView2. `npm ci` and `cargo --locked` preserve lockfile resolution. `.gitattributes` specifies text line endings and binary assets. Keep source, configuration, SVG/native icon, scripts, both lockfiles, README, PROJECT, and the maintained docs directory. Ignore dependencies, target/web-dist/dist, copied PDF assets, local `others/` audits/fixtures, and scratch documentation.

```powershell
npm ci
npm run desktop:dev
```

## Checks and contract verification

```powershell
npm run check
npm run format
```

`npm run check` combines TypeScript, focused Hooks/unused-code ESLint, Prettier verification, frontend tests with freshly exported Rust contract, Rust tests, rustfmt, and Clippy with warnings denied. `npm run format` is mechanical formatting of maintained files. Temporary diagnostic probes under `others/` are excluded from the maintained test glob.

`npm test` first runs the ignored-by-default Rust `export_frontend_contract` test to serialize a populated actual `Snapshot`, `RefreshSummary`, and availability values into `target/frontend-contract.json`. The frontend checks every required field and its type against mapped TypeScript model shapes, including enum values; a hand-written JSON cast is not the contract test. This fixture is generated, not tracked.

## Assets and example vaults

`prepare-pdf.mjs` copies generated PDF fonts/maps. `create-icon.mjs` rasterizes the deliberately simple straight-line file SVG into native ICO sizes; it is not a general SVG renderer. `fixture-pdf.mjs` is an ASCII-only PDF generator shared by both fixture scripts. Example generators refuse to overwrite existing sources or metadata.

Create a disposable example vault with:

```powershell
node scripts/create-test-vault.mjs others/my-test-vault
node scripts/add-example-files.mjs others/my-test-vault
```

The local `others/test-vault` is optional and is not distributed through Git. Generators refuse to overwrite existing sources or metadata. `scripts/clean-test-artifacts.ps1` removes known generated native/smoke fixtures while retaining example vaults and review documents.

## Portable packaging

```powershell
./scripts/build-portable.ps1
```

`build-portable.ps1` builds the frontend and locked release binary, stages executable/README/PDF.js license/checksum, checks the old executable is not locked, then publishes to `dist/File Manager`. Failure before publication preserves the previous package; publication failure restores it. The script never kills a user process and validates cleanup/move targets inside dist. The executable embeds local assets and is portable, unsigned, and WebView2-dependent.

## Native verification

```powershell
./scripts/smoke-portable.ps1
node scripts/inspect-native.mjs "dist/File Manager/File Manager.exe" clean
```

The native inspection script also accepts `save` and `discard` close modes.

`smoke-portable.ps1` launches a fresh hidden test vault, requires actual PDF rendering, closes/reopens, and checks original bytes and modification time. `inspect-native.mjs` uses an isolated debug port, verifies fixture identity, bounds CDP requests, rejects requests on disconnection, and removes stale smoke output before reopening. It checks an eight-page mixed-size PDF, mouse and cross-page text selection, off-screen canvas release without losing selected text, and zoom reading-position preservation. It covers normal/compact layouts, panel resizing/collapse, drafts, source previews, tags, note save/delete, failed vault handoff, modal focus, actual clean/Save/Discard process exit, and reopened PDF rendering. Screenshots and results go under `others/ui-review`. Only inspection enables WebView debugging.

`--vault`, `--smoke`, and `--inspect-smoke` are internal startup/testing flags. Smoke support is runtime-gated in the exact delivered executable, not compiled out or moved to a different test binary. Smoke markers are written only under the test vault's `.file_manager`. Initial discovery remains ordinary production functionality. Historical audits and verification evidence under `others/` are optional local material, not required project documentation.

## Documentation maintenance

Keep `README.md` user-facing and `PROJECT.md` as the architecture entrypoint. Track the five focused documents under `docs/` alongside them. Each detailed contract has one authoritative document; link to it from other documents instead of repeating it. Update affected documents when behavior, module ownership, paths, or commands change. Keep historical plans, audit reports, screenshots, and one-off diagnostics under ignored `others/`.

The format scripts include `docs/**/*.md`. After changing documentation, run `npm run format:check` and check that relative file links and heading anchors still resolve. Source reorganization requires updating the module references in the corresponding technical documents.
