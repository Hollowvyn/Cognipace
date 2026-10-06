# FSRS Phase C: Evidence Storage and Restore

Status: implementation, independent specification/quality reviews, complete
repository check, Chrome build and formatting passed. Human smoke/visual proof
remains pending. On October 5 the owner explicitly chose to merge then smoke-test
after confirming a backup, accepting reverting if needed; this overrides the
normal pre-merge smoke gate for this PR without claiming that testing was done.

Branch: `codex/fsrs-phase-c-storage-restore`, based on latest main `d829a705`
after Phase B merged in PR #196. The [approved design](../specs/2026-10-03-fsrs-remediation-design.md)
and [reviewed phase plan](../plans/2026-10-04-fsrs-phase-c-storage-restore.md) own scope.

## Plan review

Three independent reviews passed after these repairs:

- Protect every captured/legacy-derived event consumed by C's existing Update
  replay, including known history followed by a new unknown review.
- Delete a targeted reset's receipts atomically before deleting their targets.
- Validate historical receipt acknowledgements against their own accepted
  context, allowing later corrections with a different rating and card.
- Accept empty generations for imported/preflight v6 as explicit unknown;
  require initialized scopes for current database/export validation.
- Add readonly matching-current Practice validation through a generic Platform
  callback; reject missing/partial evidence or scopes without startup repair.
- Initialize the problem scope when suspension creates an untouched Practice
  row, and reject safe-integer sequence/revision overflow transactionally.
- Check trusted pre-card/log association inside the FSRS facade. The native
  probe passed 48 transitions; long-term New normalizes log scheduled days to
  zero, while other checked pre-state fields remain exact.
- Keep replacement dirty marking strict so metadata failure retains pending
  state. Automatic push scheduling remains best-effort after that step.
- Remove unused payload hashing and future per-command/profile APIs. Explicit
  pending-status/retry plus admission gating needs no permanent restore hash.

Execution preflight also identified the direct export bypass, automatic sync
bookkeeping outside the DB queue, error-result reads failing after commit, and
a confirmation modal that could hide Retry saving. Task 3 now specifies narrow
queue wiring, a frozen complete pull metadata patch, a redacted last-known status
fallback and distinct in-flight/pending UI state. These refinements require no
new sync algorithm or metadata-store layer.

Further independent runtime preflight identified two cross-operation hazards.
Accepted full replacement clears an obsolete pending content-import
acknowledgement only after its transaction commits; a later old import retry
returns `repreview`, while rollback retains the genuine retry. Local restore
and reset also strictly persist the existing sync dirty marker after preflight
and before commit. Otherwise automatic DB publication followed by failed
metadata completion and worker restart could leave an unsynced replacement
falsely clean and eligible for automatic remote overwrite. Marker failure
prevents replacement; rollback may conservatively retain dirty status. These
repairs use existing import and sync state, with no persistent operation journal.

Storage implementation review found two transitional Update hazards. For
reordered unknown histories, the existing correction target can differ from
the final chronological replay event; the target now receives its own replay
log while retaining the existing target selection and final card. Updating an
unknown event also clears optional imported assessment evidence rather than
retaining a former final rating. Reordered/tied-history and assessment
regressions validate the resulting stored metadata.

Independent storage quality review also reproduced an opaque-ID collision:
another problem's imported card could occupy a new problem's canonical ID.
New Save now chooses a UUID when that ID is occupied, and card upsert conflicts
enforce problem/kind ownership. The forced-collision rollback, unchanged sibling
rows/tokens, subsequent Update and serialized reopen regression passed both
independent re-reviews. Task 1 is committed as `e2a2a61`.

## Validation record

Before implementation, five Backup/Sync/DB preparation suites passed 112 tests.
The initial selector included an incorrect Practice path; the corrected
Practice suite was run separately and passed 23 tests. Baseline lint and
migration checks passed. The unrelated latest Analytics merge changed none of
the Phase C production owners.

```sh
rtk npm run test -- src/features/practice/__tests__/practice-core.integration.test.ts src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/backup/server/backup-service.test.ts src/extension/background/app-db.test.ts src/features/sync/server/sync-service.test.ts
rtk npm run test -- src/features/practice/practice-core.integration.test.ts
rtk npm run db:check
rtk npm run lint
rtk proxy node /private/tmp/fsrs-c-precard-log-oracle.mjs
rtk proxy node node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --write docs/superpowers/plans/2026-10-04-fsrs-phase-c-storage-restore.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/README.md
rtk proxy node node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check docs/superpowers/plans/2026-10-04-fsrs-phase-c-storage-restore.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/README.md
rtk git diff --check
rtk git diff --cached --check
```

The first integrated storage check passed eight suites and 170 tests:

```sh
rtk npm run test -- src/features/practice/domain/practice-storage.test.ts src/features/practice/data/practice-storage-repository.test.ts src/features/practice/practice-core.integration.test.ts src/features/problems/data/problems-repository.test.ts src/features/queue/queue-track-independence.integration.test.ts src/extension/background/app-db.test.ts src/platform/db/instance.test.ts src/lib/fsrs/domain/review-log-snapshot.test.ts
```

Storage generation/check and focused storage/backup validation passed before
runtime/UI integration; the final whole-phase results are recorded below.
Human installed-extension happy-path and edge-case smoke with
screenshots/recording remains required before PR review or merge; the phase
plan lists the exact flows. Archive generation was skipped because
extension packaging/manifest behavior is unchanged.

The real migration proof now replaces the synthetic probe. It compares all 16
protected tables, six inferred evidence rows, five active scopes and unchanged
metadata on matching reopen. Real staged preparation failure retains the
original and first recovery record through retry and reopen. Specification
review passed for this test slice; subsequent whole-phase review also passed.

```sh
rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts
rtk npm run test -- src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/open-snapshot.test.ts src/platform/db/instance.test.ts src/extension/background/app-db.test.ts
rtk proxy npx prettier --write src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts
rtk proxy npx prettier --check src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts
rtk npx eslint src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts
rtk git diff --check -- src/platform/db/fsrs-preservation.integration.test.ts src/platform/db/snapshot-upgrade.test.ts
```

The first command failed as expected on the remaining synthetic migration mock
(one failed, seven passed); after removing it, the five-suite command passed
62 tests. The explicit formatting and lint checks passed.

The final storage slice passed 188 tests in ten suites, before the subsequent
opaque-ID collision regression. That regression and storage repository tests
then passed 36 tests. Broader Practice/Queue/Problems checks passed 281 tests
before the last two edge regressions; the FSRS facade passed 146 tests. Both
independent storage reviews passed after the collision fix. The real migration
test slice also passed separate specification and quality review and is
committed as `a9f9f2e`.

```sh
rtk npm run db:generate -- --name=fsrs_evidence
rtk npm run db:check
rtk npm run test -- src/features/practice/domain/practice-storage.test.ts src/features/practice/data/practice-storage-repository.test.ts src/features/practice/practice-core.integration.test.ts src/features/queue/queue-track-independence.integration.test.ts src/features/problems/data/problems-repository.test.ts src/platform/db/instance.test.ts src/extension/background/app-db.test.ts src/lib/fsrs/domain/review-log-snapshot.test.ts src/lib/fsrs/index.test.ts src/testing/architecture-boundaries.test.ts
rtk npm run test -- src/features/practice src/features/queue src/features/problems
rtk npm run test -- src/lib/fsrs
rtk npm run test -- src/features/practice/practice-core.integration.test.ts src/features/practice/data/practice-storage-repository.test.ts
rtk npm run typecheck
rtk npm run lint
rtk npx eslint src/features/practice/data/practice-repository.ts src/features/practice/practice-core.integration.test.ts
rtk proxy npx prettier --check src/features/practice/data/practice-repository.ts src/features/practice/practice-core.integration.test.ts
rtk git diff --check -- src/features/practice/data/practice-repository.ts src/features/practice/practice-core.integration.test.ts
```

Exactly one migration was generated. Failures repaired during implementation
covered missing modules, writer evidence, opaque details, suspension scopes,
startup validation, root-barrel server exports, test-only typing/lint/formatting,
and reordered-history log ownership. An existing v7 test log fixture containing
only a rating was made structurally valid; the protected preservation fixture
and original table comparison remain unchanged.

Backup v6 and frozen v1–v5 normalization passed independent specification and
quality reviews and are committed as `98b0368`. Specification review reproduced
a direct-repository taxonomy-preflight bypass. The repository now repeats the
same complete detached validation and curated reconciliation before opening a
transaction. Its regression passed, and the three Backup suites passed 122
tests after that repair. The preceding five-suite Backup/Practice/Sync-envelope
integration passed 156 tests; four API/UI/Sync-service suites passed 103 tests
after old v3/v4 fixtures were corrected to contain only their historical arrays.

```sh
rtk npm run test -- src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/backup/server/backup-service.test.ts src/features/sync/domain/sync-envelope.test.ts src/features/practice/practice-core.integration.test.ts
rtk npm run test -- src/features/backup/api/backup-api.test.tsx src/features/backup/components/data-management-screen.test.tsx src/features/sync/server/sync-service.test.ts src/features/backup/server/backup-service.test.ts
rtk npm run test -- src/features/backup/data/backup-repository.test.ts -t 'reconciles curated taxonomy again'
rtk npm run test -- src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/backup/server/backup-service.test.ts
rtk npm run typecheck
rtk npm run lint
rtk proxy ./node_modules/.bin/eslint src/features/backup/domain/backup-preflight.ts src/features/backup/data/backup-repository.ts src/features/backup/data/backup-repository.test.ts
rtk proxy ./node_modules/.bin/prettier --check src/features/backup/api/backup-api.test.tsx src/features/backup/api/backup-contracts.ts src/features/backup/api/backup-legacy-contracts.ts src/features/backup/api/backup-contracts.test.ts src/features/backup/domain/backup-normalization.ts src/features/backup/domain/backup-preflight.ts src/features/backup/data/backup-repository.ts src/features/backup/data/backup-repository.test.ts src/features/backup/index.ts src/features/backup/server/backup-service.ts src/features/backup/server/backup-service.test.ts src/features/backup/components/data-management-screen.test.tsx src/features/sync/domain/sync-envelope.test.ts src/features/sync/server/sync-service.test.ts
rtk git diff --check
```

Backup test-first failures demonstrated missing v6 evidence and accepted invalid
scheduling/log associations. Repaired intermediate failures involved fixture
ordering, an invalid corruption test, fresh-generation expectations, unsafe
test JSON typing, legacy fixtures leaking current metadata, and the direct
repository bypass. Invalid-input tests observe the transaction boundary rather
than a database handle method that cannot observe transaction-owned deletes.

The historical migration and fixture comparison produced no changed paths:

```sh
rtk git diff --name-only d829a70592bfc17c0f52c14bdfd9784980dc5adb -- 'src/platform/db/migrations/000*.sql' 'src/platform/db/migrations/meta/000*_snapshot.json' src/testing/fixtures/fsrs-preservation.ts
```

Authority-document review caught one leftover Phase A paragraph claiming the
upgrade was synthetic and added no schema. It was removed in favor of the real
0010 migration and current preservation checklist, including the active session.

Task 3 passed independent specification and quality reviews and is committed
as `9cded2a`. Its combined coordinator/runtime/import/policy, Sync service/envelope,
Backup API/UI/Sync API and Backup service run passed 319 tests in ten suites.
Typecheck, repository lint, all 24 owned-file formatting and whitespace checks
passed. Tests cover queue admission before and after pending state, retry-only
publication/metadata, detached preflight, strict dirty markers across worker
restart, confirmed manual overwrite and stale content-import acknowledgement.

```sh
rtk npm run test -- src/extension/background/backup-replacement.test.ts
rtk npm run test -- src/features/sync/server/sync-service.test.ts
rtk npm run test -- src/extension/background/register-handlers.test.ts
rtk npm run test -- src/extension/background/register-handlers.test.ts src/extension/background/import-handlers.test.ts src/extension/background/runtime-policy.test.ts
rtk npm run test -- src/features/backup/api/backup-api.test.tsx src/features/backup/components/data-management-screen.test.tsx src/features/sync/api/sync-api.test.tsx
rtk npm run test -- src/extension/background/backup-replacement.test.ts src/extension/background/register-handlers.test.ts src/extension/background/import-handlers.test.ts src/extension/background/runtime-policy.test.ts src/features/sync/server/sync-service.test.ts src/features/sync/domain/sync-envelope.test.ts src/features/backup/api/backup-api.test.tsx src/features/backup/components/data-management-screen.test.tsx src/features/sync/api/sync-api.test.tsx src/features/backup/server/backup-service.test.ts
rtk npm run typecheck
rtk npm run lint
rtk proxy npx eslint src/extension/background/register-handlers.test.ts
rtk proxy npx prettier --check src/extension/background/backup-replacement.ts src/extension/background/backup-replacement.test.ts src/extension/background/register-handlers.ts src/extension/background/register-handlers.test.ts src/extension/background/import-handlers.ts src/extension/background/import-handlers.test.ts src/extension/background/runtime-policy.ts src/extension/background/runtime-policy.test.ts src/extension/messaging.ts src/features/backup/api/backup-contracts.ts src/features/backup/server/backup-replacement-work.ts src/features/backup/server/backup-service.ts src/features/sync/server/sync-service.ts src/features/sync/server/sync-service.test.ts src/features/backup/api/backup-api.ts src/features/backup/api/backup-api.test.tsx src/features/backup/components/data-management-screen.tsx src/features/backup/components/data-management-screen.test.tsx src/features/backup/components/backup-restore-panel.tsx src/features/backup/components/reset-local-data-panel.tsx src/features/backup/index.ts src/platform/query/query-keys.ts src/features/sync/api/sync-api.ts src/features/sync/api/sync-api.test.tsx
rtk git diff --check
```

The initial coordinator test failed on the missing module. UI recovery tests
had ten expected failures; hooks/API tests had seventeen, and the isolated
pending-invalidation regression had two. Existing Sync tests initially lacked
the required replacement runner and the background fixture lacked v6 arrays.
These harnesses were updated. Intermediate type/lint failures were repaired in
the test fixtures, generic callback type and validated optional metadata patch;
no failing check is left hidden.

Documentation specification and separate quality review now pass. Quality
review required a runnable installed-extension fault procedure rather than a
reference to Vitest mocks. `docs/testing.md` now includes worker-console setup,
selective failures, retry/restart observations and cleanup. Context7's current
Chrome documentation confirmed service-worker inspection keeps it active and
storage calls support Promises. The temporary VM check passed the snippet's
syntax, selective faults, counters, recovery and original-method cleanup:

```sh
rtk proxy node /private/tmp/fsrs-c-smoke-harness-check.mjs
```

This is script validation only. The agent has not executed the harness in
installed Chrome or produced human smoke/visual proof.

Whole-phase cross-boundary review identified two P2 cache gaps: metadata-only
recovery could leave mounted Sync status stale, and an automatic Gist failure
could leave the mounted pending query idle because it bypasses `useSyncAction`.
Replacement settlement now refreshes narrow pending and Sync queries; the
existing sync-tag mapping also targets pending replacement. Two active-query
regressions failed against the old implementation (two failed, 28 passed), then
passed with UI/API integration (61 tests in four suites). No second publication,
flush or broad runtime data callback was added. Whole-phase specification
re-review and Task 3 quality re-review passed; the Ponytail complexity review
reported no substantive deletion to make.

```sh
rtk npm run test -- src/features/backup/api/backup-api.test.tsx src/platform/query/cache-invalidation.test.ts
rtk npm run test -- src/features/backup/api/backup-api.test.tsx src/platform/query/cache-invalidation.test.ts src/features/backup/components/data-management-screen.test.tsx src/features/sync/api/sync-api.test.tsx
rtk npm run typecheck
rtk proxy npx eslint src/features/backup/api/backup-api.ts src/features/backup/api/backup-api.test.tsx src/platform/query/cache-invalidation.ts src/platform/query/cache-invalidation.test.ts
rtk proxy npx prettier --write src/features/backup/api/backup-api.ts src/features/backup/api/backup-api.test.tsx src/platform/query/cache-invalidation.ts src/platform/query/cache-invalidation.test.ts
rtk proxy npx prettier --check src/features/backup/api/backup-api.ts src/features/backup/api/backup-api.test.tsx src/platform/query/cache-invalidation.ts src/platform/query/cache-invalidation.test.ts
rtk git diff --check
```

The first whole-repository `rtk npm run check` passed migration/type/lint checks
and 2,899 tests but failed one existing architecture assertion. Sync imported
the new callback type through a nonpublic Backup file. The type now re-exports
from Backup's public server service and Sync uses that surface; no runtime code
or architecture test was weakened. The repair passed independent specification
and quality re-review and 69 focused architecture/Sync/coordinator tests. It is
committed as `ebf0ab0`. The repeated full check passed after the repair.

```sh
rtk npm run check
rtk npm run test -- src/testing/architecture-boundaries.test.ts src/features/sync/server/sync-service.test.ts src/extension/background/backup-replacement.test.ts
rtk proxy npx prettier --check src/features/backup/server/backup-service.ts src/features/sync/server/sync-service.ts
```

## Final automated results

- `rtk npm run db:check`: passed; the single additive 0010 migration is valid.
- `rtk npm run lint`: passed repository-wide.
- `rtk npm run check`: passed after the public-type repair. Migration validation,
  WXT preparation, TypeScript and lint passed; 212 suites / 2,900 tests passed.
  One opt-in provider suite / six live provider tests were skipped.
- `rtk npm run build`: passed; loadable artifact is
  `/Users/tobiolutimehin/.codex/worktrees/46c1/cognipace-v2/dist/chrome-mv3`.
  The build reported a chunk-size advisory; it completed successfully without a
  bundling change in this phase.
- Historical SQL/snapshots through 0009 and the populated preservation fixture
  remain unchanged against `d829a705`.

The full run emits JSDOM's existing `scrollTo` notices; they caused no failures.
Repository formatting, explicit ignored-Markdown formatting and final whitespace
checks passed. Final source is committed on `codex/fsrs-phase-c-storage-restore`;
no Phase C PR or merge has been performed in this execution.

```sh
rtk npm run db:check
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk proxy node node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check CONTRIBUTING.md docs/architecture.md docs/product.md docs/testing.md docs/superpowers/README.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-04-fsrs-phase-c-storage-restore.md docs/superpowers/handoffs/2026-10-04-fsrs-phase-c-storage-restore.md
rtk git diff --check
rtk git diff --cached --check
```

Exact skipped validation:

- `rtk npm run zip`: skipped because archive/manifest behavior is unchanged;
  the required loadable extension build passed.
- Opt-in-only `rtk npm run test -- src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts`:
  not separately enabled/run against a live provider. Six tests in this file
  were skipped by the complete test run; C changes no provider behavior.
- Human installed-extension happy-path/edge-case smoke and screenshots/recording:
  pending under the repository's explicit pre-review/pre-merge requirement.
  The disposable-profile checklist and temporary worker-console harness below
  are prepared. Automated/VM checks do not replace this evidence.

## Compatibility, release and remaining human proof

This phase adds four side tables without editing shipped migration SQL or
replaying existing reviews. Existing card schedules, settings and earned
progress remain intact. Exported backup data is now version 6; import supports
versions 1–6, while the Gist envelope stays version 1. All clients sharing new
backups/Gist data need a client that understands backup v6. No extension
permission, account, remote storage capability, release workflow or secret
format changed.

Current Save records unknown context. C preserves imported captured evidence
and temporarily blocks Update when its existing full replay would consume that
evidence. Guarded commands/captured live reviews belong to D; day scheduling and
the approved 180-day cap belong to E. No such policy is activated here.

Replacement recovery is worker-local. Retry finishes the current committed
replacement; a worker restart loses callbacks and reopens the last durable
snapshot. Published data survives and local replacement's persisted dirty
marker prevents automatic remote overwrite. Keep a pre-upgrade backup and
private recovery copies; do not reinstall an older client onto an upgraded
snapshot or discard the original during recovery.

Human happy-path and edge-case testing normally precedes PR review or
merge under `docs/agent-governance.md`; the October 5 owner instruction above
chooses post-merge testing for this PR. Use [FSRS Evidence And Recoverable
Replacement](../../testing.md#fsrs-evidence-and-recoverable-replacement) and its
disposable-profile failure harness. Record:

- Populated upgrade/reload with 75% retention, opaque IDs, suspension, active
  track/session, history/dates/progress comparisons and ordinary Save/Update.
- Supported old-backup → v6 round trip, fresh scopes, recorded imported evidence,
  historical corrected acknowledgements and protected Update behavior.
- Malformed input rejection before replacement, leaving original data intact.
- Publication pending, read-only Settings reload, disabled fresh actions and
  Retry saving; durable metadata pending and metadata-only retry.
- Dirty automatic/unconfirmed pull rejection, confirmed manual overwrite and
  worker restart before/after publication with the persisted dirty marker.
- Superseded content-import acknowledgement requesting a fresh preview.
- Redacted screenshots/recording of happy-path and failure/recovery states.

Automated regressions separately prove exact transaction rollback, one
generation rotation and callback counts. The installed-extension observations
above have not been executed or marked N/A by the agent.

## October 5 PR review and merge-conflict resolution

PR [#198](https://github.com/Hollowvyn/Cognipace/pull/198) was updated against
`origin/main` at `9cafaf7b`. The two conflicts were resolved by retaining all
FSRS and overlay handoff entries in the planning index and retaining both the
replacement coordinator and the new hint sender authorization imports in the
background handler. Automatically merged runtime, messaging and cache changes
were inspected together. Shipped migrations through 0009 and the preservation
fixture remain unchanged.

The requested Ponytail complexity review found no further justified cuts:
**Lean already. Ship.** The owner explicitly chose to merge and then run human
smoke tests after backing up. Human testing and screenshots remain pending.
No merge of the PR into main was performed by the agent.

Exact validation commands:

```sh
rtk npm ci
rtk proxy npm run test -- src/extension/background/register-handlers.test.ts src/extension/background/backup-replacement.test.ts src/extension/background/runtime-policy.test.ts src/platform/query/cache-invalidation.test.ts src/platform/db/fsrs-preservation.integration.test.ts
rtk npm run check
rtk npm run build
rtk npm run format
rtk proxy node node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check docs/superpowers/README.md docs/superpowers/handoffs/2026-10-04-fsrs-phase-c-storage-restore.md
rtk proxy node /private/tmp/fsrs-c-pr-hygiene.cjs
rtk git diff --check
rtk git diff --cached --check
```

The initial focused run passed 27 tests but two suites could not import the
newly merged OpenRouter dependency. Installing main's locked dependencies
fixed the environment without source changes. The repeated focused run passed
203 tests across five suites. The full check passed database validation,
WXT/TypeScript, lint and 3,231 tests across 219 suites, with nine tests in two
opt-in live-provider suites skipped. The production Chrome build passed
(4.86 MB); its chunk-size advisory and JSDOM scrollTo notices are non-failing.
Formatting passed, and the PR body was checked against the unchanged hygiene
workflow with local changed-file fixtures.

Skipped validation: `rtk npm run zip` (archive behavior unchanged),
`rtk npm run db:generate` (the existing 0010 schema/migration was unchanged),
live-provider evaluation in `code-analysis-provider-evaluation.test.ts` and
`code-hint-provider-evaluation.test.ts` (opt-in credentials not enabled), and
installed-extension happy-path/edge-case smoke and visual proof (explicit owner
decision to test after merging). A source revert alone does not downgrade an
upgraded snapshot; recovery to an older client requires the pre-upgrade backup.
