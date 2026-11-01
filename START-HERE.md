# Study Tool for Mac

An offline desktop edition of your mathematics flowchart and flashcard tool, preserving the original LaTeX-style design, with plain lines and optional mathematical arrows.

## Version 1.3.1

All ordinary and double-line arrowheads now appear in the middle of connecting lines. Both heads of a two-way connection sit together at the centre. This applies in Edit and Display, including curved connections and while cards move. Short connections keep the intended arrow direction.

Install the new app from GitHub Releases or use **Updates → Check for updates** to find the download for your Mac. The saved workspace format and location remain the same.

### Features from version 1.3.0

GitHub Releases can now supply online updates. The project includes workflows to test source changes and build/publish both Mac editions from version tags. The repository URL is bundled by the release workflow. See **UPDATES.md** for setup and Apple signing. Unsigned editions discover releases and offer manual downloads; automatic installation requires a Developer ID signed app. Existing installations through 1.2.0 must install this GitHub-aware edition manually once.

Both manual and native update downloads now wait for pending saves and retain an independent workspace checkpoint. The workspace format, app identity, saved-data folder and original design are unchanged from 1.2.0.

### Features from version 1.2.0

- A dotted lattice stays aligned with the flowchart as you pan and zoom. Cards snap to lattice points during movement, including when you move a lasso selection. A group keeps its internal spacing; the card you drag is the one aligned to the grid. **Snap to grid** in the editing toolbar toggles snapping. **Settings → Flowchart lattice** controls point visibility and spacing (8–80 canvas units). Existing card positions stay unchanged until you move them.
- Choose **Connect** to see the connection-style selector before joining two cards. Click an existing connection in Edit to change it. Available styles are a plain line, an ordinary arrow pointing forward/backward/both ways, and double-line implication arrows pointing forward/backward/both ways (equivalence). Forward means first card → second card. Existing connections stay plain lines.
- The light green **Corollary** card has separate statement and proof sides, just like a lemma or theorem.
- **Settings → Shared LaTeX definitions** is an editable script for all topics, titles, statements and proofs. It starts with the existing shortcuts (including `\R`, `\P`, `\norm`, `\abs`) and supports `\newcommand`, `\renewcommand`, `\providecommand`, `\def`, `\gdef`, and `\DeclareMathOperator` / `\DeclareMathOperator*`. Required arguments use `[1]`, `[2]`, etc. or `#1`, `#2` for def syntax. Compile a test before saving. Definitions are carried in workspace exports and backups.

The native Mac **Study Tool → Settings…** menu uses ⌘, to open Settings. ⌘S saves an open card or Settings form.

### Workspace upgrade

Existing version 1 workspaces load automatically from the same local path. The app preserves an exact original-format file in `workspace/migration-backups/` before any upgraded save. These copies are separate from the rolling backups. Saving in this edition uses workspace format 2 to retain corollaries, connection styles and shared settings. New exports require Study Tool 1.2.0 or newer; the app still imports version 1 exports. Keep the original-format copy if you need to return to an older app.

### Features from version 1.1.0

In **Edit**, choose **Lasso**, draw a loop around several card centres, then drag any selected card to move them together. Hold Shift while drawing to add another group, or Shift-click to add/remove individual cards. **Select connected** expands the selection along every connecting line. **Clear** or Esc deselects. Group moves keep the spacing and connecting lines intact, save automatically, and undo in one step. Alt-drag pans while the lasso is active. Lock positions also locks group moves.

The new **Updates** button and **Study Tool → Check for Updates…** menu open the update panel. It supports HTTPS release checks, manual downloads, and native installation of signed Mac releases. **Online delivery is not activated in this build:** a release host and Apple Developer ID signing/notarization still need to be configured. The panel says this explicitly and never reports a successful check without a feed. See `UPDATES.md` for the prepared release workflow.

The supplied app is unsigned. Install this update manually, just as before. Your magenta icon, LaTeX styling, existing plain connections and save location are preserved. The workspace upgrade is described above.

## Install the ready-made Mac app

1. Download the ZIP for your Mac: **Apple Silicon** for M1/M2/M3/M4/M5 and other Apple chips, or **Intel** for Intel-based Macs. Check Apple menu → About This Mac if you are unsure.
2. Double-click the ZIP to extract it.
3. Drag **Study Tool.app** into **Applications**, then open it.

The ready-made bundles require macOS 13 or later. They contain the app runtime, fonts, and LaTeX renderer; Node.js and an internet connection are not required to study.

This download is unsigned and has not been notarized by Apple or tested on a physical Mac. macOS may block its first launch. If you trust this download, try opening it once, then use **System Settings → Privacy & Security → Open Anyway**, if that option is offered. Do not disable system security. If macOS reports that the bundle is damaged, the local signing and download-quarantine steps below worked for this app in our setup. Apply them only to the Study Tool build from this project, after moving it into Applications:

```bash
codesign --force --deep --sign - --preserve-metadata=entitlements,flags "/Applications/Study Tool.app"
codesign --verify --deep --strict --verbose=2 "/Applications/Study Tool.app"
```

If verification succeeds, remove the download-quarantine flag from this app and open it:

```bash
xattr -dr com.apple.quarantine "/Applications/Study Tool.app"
open "/Applications/Study Tool.app"
```

If a command fails, retain its exact output for investigation. These are local, ad-hoc signing steps; they do not provide Apple Developer ID signing or notarization.

## Update an existing desktop installation

1. In the running app, finish editing any card and choose **Save card**. For an extra copy, click **Export** and keep that JSON file.
2. Quit Study Tool completely (⌘Q).
3. Extract this release and replace **Study Tool.app** in Applications. Replace only the application; keep its Application Support folder.
4. Open it. Your topics, cards, proofs, layout and links load from the same local workspace. There is no import or reset step for an existing desktop installation.

The first-launch signing/quarantine steps above may need repeating for this unsigned replacement. If you unexpectedly see the example topics, quit before editing and use Files to verify the workspace location; do not import an empty workspace over your data.

## Bring your existing flowcharts across

1. On the existing website, click **Export** and keep the downloaded `.json` file.
2. In the desktop app, choose **Import** in the footer or **File → Import Workspace…**.
3. Select the exported JSON file and confirm the import.

The website and desktop app keep independent workspaces. They do not synchronize automatically.

## Saving and backups

Choose **Save card** after editing a card. Card saves, position changes, connections, topic changes, and imports write automatically to:

```text
~/Library/Application Support/Study Tool/workspace/workspace.json
```

The last 40 previous versions are retained in:

```text
~/Library/Application Support/Study Tool/workspace/backups/
```

Automatic updates also keep independent checkpoints in `workspace/update-backups/`. These are not pruned with the rolling 40 backups. The updater waits for pending saves and creates a fresh checkpoint before restart. A save/checkpoint failure pauses installation.

Use **Files** in the footer or **File → Show Saved Files** to locate them. Replacing the app during an update does not replace this data folder. The app waits for pending file saves before closing, reports write errors, and can recover an unreadable workspace from an automatic backup. If all saved copies are unreadable, it stops without resetting your files.

To restore an earlier version, use **Import** and select one of the JSON files in the backups folder. Import asks before replacing the current workspace. For extra protection, use **Export** occasionally and store a copy in another folder or on an external drive. Automatic backups on the same disk do not protect against losing that disk.

## Build or modify from source

Use the separate **Study-Tool-Desktop-Source.zip** download. Unzip it, install Node.js 22.13 or later (Node.js 24 LTS is suitable), and open Terminal in the extracted `study-tool-desktop` folder:

```bash
npm ci
npm start
```

Create a Mac app and installer on your Mac:

```bash
npm run make
```

Find the outputs under `out/`. The default build uses the architecture of the Mac running the command. To package a particular architecture:

```bash
npm run package -- --platform=darwin --arch=arm64
npm run package -- --platform=darwin --arch=x64
```

To create a distributable with a particular architecture on macOS:

```bash
npm run make -- --platform=darwin --arch=arm64
```

The DMG maker requires macOS. The ZIP app bundles can be packaged from Linux, but signing and notarization require a Mac and your Apple developer credentials. No signing credentials are included or required for the local development command.

## What this version supports

Topics, six card types, draggable placement, lasso selection and group moves, plain lines, ordinary arrows and implication arrows, proof flipping for theorems, lemmas and corollaries, LaTeX previews, zoom and pan, layout locking, undo/redo, native import/export, automatic file saves and backups. Definitions and remarks have one side. All assets are included locally. Studying works offline. Online requests occur only when checking/downloading app updates; workspace contents are never uploaded by the updater.

LaTeX math, common text formatting, lists, and equation/align environments render locally. The shared script accepts math definitions and operator declarations, not full `.tex` document preambles, external packages or bibliography compilation. Optional default macro arguments and delimited TeX parameters are not supported. Use the test field to check definitions with actual example arguments. Commands are used inside math delimiters in cards.

## Checks and project structure

```bash
npm test
```

- `dist/`: the original interface and locally bundled math/font assets, plus desktop saving support.
- `desktop/main.cjs`: local app window, secure bridge handlers, native file dialogs, menu, and close/save coordination.
- `desktop/updater.mjs` and `update-feed.mjs`: checked HTTPS release feeds, update state, Developer ID detection and backup safeguards.
- `dist/preferences.mjs` and `preamble.mjs`: persisted lattice preferences, editable starter definitions, script validation and operator compilation.
- `dist/selection.mjs`: lasso geometry, connected selection and shared group movement.
- `scripts/`: release configuration, Mac signing and release-feed generation.
- `desktop/preload.cjs`: narrow API exposed to the interface.
- `desktop/storage.mjs`: versioned JSON validation, serial writes, atomic replacement, recovery, and retained backups.
- `forge.config.cjs`: app packaging and Mac ZIP/DMG configuration.
- `tests/`: math rendering, flowchart interactions, file persistence, recovery, and desktop UI integration checks.

The source package includes its dependency lockfile. Its runtime is Electron 44.8.0 and the LaTeX renderer is KaTeX 0.19.0. Electron's and Chromium's bundled notices are included in the app bundle; KaTeX's license is in `dist/vendor/KATEX-LICENSE`.

Official references:
https://support.apple.com/102445
https://www.electronforge.io/config/makers/dmg
https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging
