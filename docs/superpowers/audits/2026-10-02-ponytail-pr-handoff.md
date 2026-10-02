# PR-ready handoff: fix(app): repair data recovery and simplify live feature paths

Branch: `codex/ponytail-codebase-audit`. Baseline: `709957e`.
Scope and approval: [design](../specs/2026-10-02-ponytail-cleanup-design.md).
Detailed commands, red/green evidence and review results:
[implementation ledger](2026-10-02-ponytail-implementation-ledger.md).

## Details

Backup selection now keeps the displayed file and restored data together.
Confirmed manual sync recovery can overwrite dirty data, while automatic pulls
remain blocked, including after a failed dirty-metadata write and worker restart.
Company/topic identities survive collisions and normalized imports; invalid URLs
are rejected and incomplete LeetCode capture can recover after reconnecting.
Overdue Analytics follows the selected calendar date. Watcher AI display and
save share one assessment, respect user choices and cancel stale saves; provider
deadlines cover response bodies. Library/Tracks confirmations contain keyboard
focus and show retryable errors within the dialog.

Proven unused Analytics calculations/charts, superseded Tracks/FSRS APIs,
placeholder files and three direct dependencies are removed. The entire change
removes 2428 net production lines; meaningful tests now exercise the live paths.
Compatible dependency fixes remove the high and production advisory entries.
Four moderate scanner entries remain in one development-only Drizzle/esbuild
chain without a compatible patched loader; versions and exposure assessment are
recorded in the ledger.

Runtime sender authorization and Zod boundaries remain enforced. Secret
redaction, queued database writes and feature invalidation remain in their
existing owners. The confirmed pull authorization is dashboard-only and scoped
to that action. No Chrome permission, integration scope or schema migration is
introduced. SQL migration files and backup schema version are unchanged.

Release impact: a `fix` title signals a patch release through the existing
Release Please workflow. This branch does not bump version 1.4.0 or change CI,
GitHub secrets, check names, release packaging or store publication.

Recovery: the additive local snapshot dirty marker is written with changed
snapshot bytes and cleared by explicit clean-sync metadata updates. Updated
code reads old snapshots/metadata without a marker. A rollback to older code
ignores the marker and loses its additional restart protection; export local
data before intentionally replacing it. Removed APIs had no supported live
callers; no data reset or migration is required.

## Issue

No issue - human-approved local whole-repository audit and cleanup on 2026-10-02.
The approved design and original audit document the scope and findings.

## Testing

- [x] `rtk proxy npm run check` passed: DB check, typecheck, lint and 185 files /
      1985 tests under patched Vitest 4.1.11.
- [x] `rtk proxy npm run lint` passed.
- [x] `rtk proxy npm run db:check` passed.
- [x] `rtk proxy npm run build` passed: 3.87 MB production extension.
- [x] `rtk proxy npm run store:check` passed: version 1.4.0, four icons.
- [x] `rtk proxy npm run zip` passed: 1.25 MB archive.
- [x] `rtk proxy npm run format` passed; explicit planning-artifact Prettier
      check also passed (full command in ledger).
- [x] `rtk proxy npm ci --cache /private/tmp/cognipace-ponytail-npm-cache` passed.
- [x] `rtk proxy npm audit --omit=dev --json --cache /private/tmp/cognipace-ponytail-npm-cache`
      passed: zero production advisories. Full audit remains exit 1 for the four
      documented moderate development entries.
- [x] Added/updated maintained unit, runtime/storage integration and component
      regressions. Exact focused commands and intentional failures are in the
      ledger; independently reviewed implementation precedes full checkpoints.
- [ ] Manual smoke tested: the human engineer must run happy-path and edge-case
      flows in [testing](../../testing.md), including backup replacement,
      confirmed/automatic sync and dirty-write restart, restored identities and
      stale import preview, offline/reconnected capture, AI override/navigation/
      timeout, ready/sparse/timezone Analytics, ordered track guidance and review
      scheduling, dialog keyboard/pending/failure/retry/cancel/chip removal, and
      packaged extension loading with optional integrations unconfigured.
- [x] Skipped validation: `rtk npm run db:generate` because no schema changed;
      `rtk npm run dev` and human Chrome/Gist/live-provider smoke because no
      human realtime proof has been collected in this source/automated session.
      Use existing authorized opt-in flows for that proof. No automated result
      is presented as browser or live-provider validation.

## Screenshots

Pending human redacted screenshots or recording for every changed happy-path
and edge-case behavior above. This is required before PR review or merge by
[agent governance](../../agent-governance.md#manual-smoke-checklist).
No PR, push, merge, publication or user-owned chat was created.
