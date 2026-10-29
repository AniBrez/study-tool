# Publishing Study Tool updates

Version 1.3.0 accepts a **public GitHub repository URL** as its update address, in addition to the existing static HTTPS feed. It checks published stable releases, selects the correct Mac architecture, and retains a local checkpoint before either native or manual update downloads. The release repository is `https://github.com/AniBrez/study-tool`. Its Mac build embeds that address; local workspace files stay on the computer.

## GitHub setup

1. Create a dedicated public repository for this project. Public releases are needed for update checks without signing into GitHub. Upload the project source, including `.github/workflows/`, `dist/`, `desktop/`, `assets/`, `scripts/`, tests and the dependency lockfile. Do not upload `node_modules/`, `out/`, workspace JSON, backups or signing credentials; `.gitignore` excludes them.
2. The **Tests** workflow runs on source pushes and pull requests. Wait for it to pass. It uses Node.js 24 and the locked dependencies.
3. Pushing a changed `package.json` to `main` starts the release workflow, including the initial project migration. Alternatively run **Actions → Release Mac app → Run workflow** on the default branch, or push a tag matching `package.json` exactly, for example `v1.3.0`. Tag-triggered releases use that exact source commit. A version mismatch or private repository stops the workflow before publishing.
4. The Mac runner packages both architectures, then creates a draft release. Both ZIP sizes and SHA-256 digests must match GitHub's uploaded assets before it publishes the release and marks it latest. An incomplete release stays a draft and does not appear as an app update.
5. Install the resulting 1.3.0 app manually once. Editions through 1.2.0 expect static feeds and cannot interpret a GitHub repository URL. Quit the app and replace only `Study Tool.app`, leaving Application Support untouched. The new build reads the same local workspace.
6. New workflow-built apps have the actual repository URL bundled automatically. Under **Updates → Update source**, check the address and enable **Check automatically when online** if desired. If older saved updater settings override the bundled default, enter the repository's HTTPS URL, such as `https://github.com/OWNER/study-tool`, then save and check. Use the actual repository URL, not the GitHub API URL, a download URL or an expiring file link.

The repository homepage and its `/releases` and `/releases/latest` URLs are accepted. Release checks send no workspace content and use no GitHub token on the user's Mac. Private releases are not supported by this channel.

## Without Apple signing

No Apple credentials are necessary to publish clearly labelled manual-install downloads. Their names are:

```text
Study-Tool-1.3.0-manual-arm64.zip
Study-Tool-1.3.0-manual-x64.zip
```

The app discovers these releases online and offers **Download for manual installation**. They are deliberately named so Electron's native release service does not select them as automatically installable Mac apps. The earlier unsigned launch steps may be necessary after replacing the app; see START-HERE.md. Do not call an unsigned release a completed automatic-installation channel.

## Enable signed automatic installation

Use the account owner's Apple Developer ID Application certificate and App Store Connect team API key. Keep private keys out of the repository and chat. Configure these repository **Actions secrets** through GitHub Settings:

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE_P12` | Base64 of the exported Developer ID Application certificate and private key (`.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | Password protecting that `.p12` export |
| `APPLE_SIGNING_IDENTITY` | Exact `Developer ID Application: ... (TEAMID)` identity |
| `APPLE_API_KEY_P8` | Base64 of the App Store Connect team API key (`.p8`) |
| `APPLE_API_KEY_ID` | Apple API key ID |
| `APPLE_API_ISSUER` | Apple API issuer UUID |

Supply all six or none. Partial configuration fails rather than silently releasing an unsigned app. Once configured, set repository Actions variable `REQUIRE_SIGNED_RELEASES` to `true` to prevent future unsigned releases. Do not use a personal Apple login password as an API credential.

The workflow creates a temporary private signing keychain, signs with hardened runtime, notarizes both bundles and verifies the code signatures and Gatekeeper acceptance. It removes the temporary signing material even when a build fails. Signed ZIPs use `Study-Tool-VERSION-darwin-arm64.zip` and `Study-Tool-VERSION-darwin-x64.zip` so Electron's public update service can identify them.

Install the first Developer ID signed edition **manually once**. An unsigned/ad-hoc app cannot bootstrap the trusted signing identity. Later editions signed with the same Developer ID can use **Download update → Restart and install**, via Electron's official GitHub release service.

## Each later release

1. Edit the source and update `RELEASE-NOTES.txt`.
2. Increment the version in both `package.json` and the root package entries of `package-lock.json`; for example, `npm version minor --no-git-tag-version`.
3. Run `npm test`, then commit and push the source.
4. Pushing the new version in `package.json` to `main` starts the release automatically. Matching version tags and manual runs on the default branch are also supported; use one release trigger per version.
5. Check the workflow result and published assets. Existing app installations discover the stable release at their next online check. Automatic checks occur shortly after startup and every six hours when enabled. Source pushes that do not change `package.json` do not create an app update. If you change dependencies or scripts in `package.json`, increment the app version before releasing.

Release versions are immutable after publication; increment the version instead of replacing a published version. A failed draft for the same exact commit can be retried.

## Workspace protection

The `local.studytool.desktop` bundle ID and `~/Library/Application Support/Study Tool/workspace/` path are unchanged. This release still uses workspace format 2. Format 1 workspaces retain an exact original in migration-backups before upgraded saves; rolling backups and retained update checkpoints remain separate.

Pending saves must finish before a download opens or a native update starts. A retained checkpoint is created before downloading and again before native installation. A failed save or checkpoint blocks the action. Unsaved card/settings drafts prompt before restart. Updating only replaces the app bundle; the updater never replaces or uploads the workspace folder.

Before using a signed production channel, test two consecutively signed releases on a real Mac for each supported architecture. Verify restart cancellation and saved data. The native macOS signing/install path cannot be exercised on the Linux development host.

## Alternative static HTTPS feeds

The original static host route remains supported. Set the actual base address with `npm run configure:updates -- https://YOUR-HOST/PATH`. On a Mac with the signing identity in its keychain, set `STUDY_TOOL_SIGN_IDENTITY`, `APPLE_API_KEY` (absolute `.p8` path), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`, then run `npm run release:mac`. It creates `out/update-host/` containing architecture-specific ZIPs and `RELEASES.json` feeds.

Upload ZIPs before publishing manifests. Static manifests must be served directly without redirects, and download URLs must have the same origin as the configured host. Keep ZIP URLs immutable. GitHub mode instead validates GitHub API metadata and delegates signed downloads to Electron's official service, which supports GitHub's release redirects.

References:

- https://www.electronjs.org/docs/latest/api/auto-updater
- https://www.electronjs.org/docs/latest/tutorial/updates
- https://github.com/electron/update.electronjs.org
- https://www.electronforge.io/guides/code-signing/code-signing-macos
