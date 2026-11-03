# Study Tool

An offline mathematics study app for macOS: arrange definitions, theorems, lemmas and corollaries in flowcharts, then open each card to study its statement and proof. The interface preserves its original Computer Modern typography and LaTeX-style rules and borders.

The complete application is in this repository: the web interface and bundled KaTeX/fonts, Electron desktop shell, icon sources, storage and updater code, tests, and Mac release workflow. No server is required for studying.

## Download for Mac

[Study Tool 1.4.0](https://github.com/AniBrez/study-tool/releases/tag/v1.4.0) is available for macOS 13 or later:

- [Apple Silicon (M-series)](https://github.com/AniBrez/study-tool/releases/download/v1.4.0/Study-Tool-1.4.0-manual-arm64.zip)
- [Intel](https://github.com/AniBrez/study-tool/releases/download/v1.4.0/Study-Tool-1.4.0-manual-x64.zip)

Version 1.4.0 adds optional LaTeX assumptions to section titles. Edit a Title to enter shared hypotheses for the blocks under it; open the title in Display to read or edit them. Centred connection arrows from version 1.3.1 are retained.

Quit Study Tool, unzip the appropriate download, and replace `Study Tool.app` in Applications. Keep its Application Support folder; saved flowcharts load automatically. Install this GitHub-aware edition manually once, then use `https://github.com/AniBrez/study-tool` under **Updates → Update source** if needed. Online checks work now; this unsigned edition offers manual installation. See [START-HERE.md](START-HERE.md) for the Mac launch steps.

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

## Title assumptions

Titles can hold optional assumptions shared by the definitions, theorems, lemmas and other blocks under that title. In Edit, click a title or add a new Title, enter the assumptions beneath the title, compile the LaTeX preview, then save. In Display, click the title to read its assumptions; “Edit assumptions” changes them. The canvas keeps the existing title design. Assumptions use the title’s existing statement field, so they are retained by saving, undo/redo and JSON export/import without a workspace format change.
