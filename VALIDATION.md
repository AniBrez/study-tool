# Study Tool 1.3.0 validation

- All 66 automated checks passed on Linux with Node.js 24.22.1.
- The suite retains the 1.2.0 rendering, lattice snapping, every connection style, lasso/group moves, corollary proofs, shared LaTeX definitions, save/import/undo, migration, recovery and close/restart checks.
- Ten added GitHub/release checks exercise repository URL parsing; stable releases and exact architecture selection; foreign, incomplete or unhashed downloads; unsigned/manual-release detection; retained manual-download backups; failed-checkpoint refusal; signed native-feed handoff; unavailable/oversized feeds; version/branch/visibility gates; and both-architecture uploaded-checksum verification.
- Release checks send no workspace body or GitHub credentials. Tests confirm successful and failed checks preserve local workspace bytes and that pending changes appear in the retained download checkpoint.
- The source contains test and Mac release workflows, with optional all-or-none Apple signing secrets and draft-before-publication verification. The destination is the user-created public AniBrez/study-tool repository. All 137 prepared file contents matched the uploaded Git tree. Publication of a source commit was blocked by automatic approval review, so main and published releases remain unchanged; the Mac workflow has not yet run.
- The app identity (`local.studytool.desktop`), `Study Tool` Application Support directory and workspace schema 2 are unchanged. Existing version 1 workspaces retain the existing exact migration-backup behavior.
- No user's live workspace was available to, or altered by, this work. Native Mac launch, notarization and an actual signed-to-signed automatic upgrade remain untested on this Linux host.
- The repository URL is bundled, but no working release channel is claimed until the source commit and first published release are verified.
