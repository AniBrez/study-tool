# Study Tool

An offline mathematics study app for macOS: arrange definitions, theorems, lemmas and corollaries in flowcharts, then open each card to study its statement and proof. The interface preserves its original Computer Modern typography and LaTeX-style rules and borders.

The complete application is in this repository: the web interface and bundled KaTeX/fonts, Electron desktop shell, icon sources, storage and updater code, tests, and Mac release workflow. No server is required for studying.

## Run locally

Install Node.js 24, then run:

```bash
npm ci
npm start
```

```bash
npm test
npm run make
```

`npm run make` builds for the current Mac. The GitHub release workflow builds both Apple Silicon and Intel editions.

## Release updates

Version 1.3.0 adds GitHub Releases as an update source. See [UPDATES.md](UPDATES.md) for repository setup, version-tag releases and optional Apple signing secrets. Ordinary source pushes run tests. A version update pushed to `main`, a matching version tag, or a manual **Release Mac app** workflow run builds and publishes a release after verifying both downloads.

Unsigned releases appear in the app as manual downloads. Automatic Mac installation needs Developer ID signing and notarization; the workflow supports these when the account owner configures the required Apple credentials in GitHub Secrets.

## Existing saved work

The app keeps the same bundle identity and local workspace path. Replacing the app preserves saved flowcharts, proofs, connections, preferences and backups. Downloading an update waits for pending saves and keeps an independent workspace checkpoint. The updater never uploads study data.

For installation, data locations, backup recovery, features and the unsigned Mac launch steps, see [START-HERE.md](START-HERE.md). Current checks and limitations are recorded in [VALIDATION.md](VALIDATION.md).

## Source layout

| Path | Contents |
| --- | --- |
| `dist/` | Web interface, flowchart and LaTeX code, offline fonts and KaTeX |
| `desktop/` | Electron shell, local JSON persistence and updater |
| `assets/` | SVG icon master, PNG and macOS icon |
| `tests/` | Rendering, interaction, storage, upgrade and release checks |
| `scripts/` | Release planning, signing, Mac builds and publication |
| `.github/workflows/` | Tests and Mac release automation |

Third-party licenses remain with their bundled assets. Project code retains its existing `UNLICENSED` designation.
