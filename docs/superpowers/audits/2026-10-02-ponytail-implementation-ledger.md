# Ponytail implementation ledger

Design approved by the human engineer on 2026-10-02; execution continues in
`codex/ponytail-codebase-audit`. Baseline and original findings are in the
[audit](2026-10-02-ponytail-codebase-audit.md). The
[approved design](../specs/2026-10-02-ponytail-cleanup-design.md) defines scope.

## Progress

| Phase                        | Status                                              | Review/validation                               |
| ---------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| 1: backup and sync recovery  | Implemented and independently reviewed              | 181 focused tests; full check 1926 tests passed |
| 2: identity/calendar/capture | Implemented and independently reviewed              | Full check 1984 tests passed                    |
| 3: AI ownership/deadline     | Implemented and independently reviewed              | Full check 1984 tests passed                    |
| 4: proven deletions          | Implemented and independently reviewed              | Full check 1982 tests passed                    |
| 5: modal/dependency repair   | Modal repair implemented; dependency fixes selected | 126 UI tests passed; independent review pending |

## Baseline

`rtk proxy npm run check`: 185 files / 1884 tests passed.
`rtk proxy npm run format`, `rtk proxy npm run build`,
`rtk proxy npm run store:check`, and `rtk proxy npm run zip`: passed.
`rtk proxy npm audit --json --cache /private/tmp/cognipace-ponytail-npm-cache`:
9 advisory entries; see the original audit for affected paths.

No phase is marked complete from this baseline. Record each implementation's
fresh focused and full results below as it finishes.

## Human proof and skipped validation

Human realtime happy-path/edge-case Chrome smoke and screenshot/recording proof
remain pending for every changed behavior. They are required before PR review
or merge; automated agent checks do not replace them. Follow the flow list in
each phase plan and `docs/testing.md`.

`rtk npm run db:generate` is skipped because no schema migration is approved.
Live Gist/provider calls are skipped during deterministic automated validation;
use existing authorized opt-in flows for human integration proof. No PR, push,
merge or publication has been performed.

## Phase 1 implementation evidence

Backup generation regression: `rtk npm test -- src/features/backup/components/data-management-screen.test.tsx --run` failed 4 added cases before repair, then passed all 12.
Manual overwrite regression: `rtk npm test -- src/extension/background/register-handlers.test.ts src/features/sync/server/sync-service.test.ts src/extension/background/runtime-policy.test.ts --run` failed the confirmed dirty restore before repair, then passed all 134. Independent review found a weak queue assertion; it now records actual restore/local-write order.
Restart regression confirmed automatic overwrite after metadata failure and worker reload, then failed the desired protection assertions before repair. The marker repair adds 29 production lines and removes 3, without schema/protocol changes.

Root combined command `rtk npm test -- src/platform/db/instance.test.ts src/features/sync/data/sync-metadata-store.test.ts src/extension/background/sync-restart.test.ts src/features/backup/components/data-management-screen.test.tsx src/extension/background/register-handlers.test.ts src/features/sync/server/sync-service.test.ts src/extension/background/runtime-policy.test.ts --run` passed 7 files / 181 tests. Agent storage command also included architecture-boundary coverage: 7 files / 184 tests passed.

Initial `rtk proxy npm run lint > /private/tmp/cognipace-ponytail-phase1-lint.log 2>&1` failed 3 phase1 test-only require-await errors (corrected) and an in-progress Track test typo (identity owner corrected). Fresh full checkpoint is required before marking this phase validated.

## Phase 2 implementation evidence

Calendar red: `rtk npm test -- src/features/analytics/domain/chart-data.test.ts --run` failed 2 new same-calendar-day cases. Calendar green: `rtk npm test -- src/features/analytics/domain/chart-data.test.ts src/features/analytics/domain/workload-presentation.test.ts src/features/analytics/server/analytics-service.test.ts --run` passed 3 files / 65 tests. Coverage uses actual FSRS logs/cards and selected-timezone observations, checks agreement with Upcoming Load, and corrects old due-day expectations.

Independent Phase2 owners start after Phase1 backup/manual-pull focused review, while the storage repair finishes. Full shared checks run at stable checkpoints; no failing run is hidden.

Phase 1 stable checkpoint passed: `rtk proxy npm run lint > /private/tmp/cognipace-ponytail-phase1-lint.log 2>&1`; `rtk proxy npm run check > /private/tmp/cognipace-ponytail-phase1-check.log 2>&1` (186 files / 1926 tests; DB check, typecheck, ESLint included); `rtk proxy npm run build > /private/tmp/cognipace-ponytail-phase1-build.log 2>&1` (3.88 MB). The checkpoint also contains the independent URL/company/calendar fixes already at green. An earlier full check failed an exactOptionalPropertyTypes test assignment; corrected by deleting the optional test hook rather than assigning undefined. The final lint/check reruns pass. Independent spec/caller/safety review passes for backup, authorized pull, durable marker and calendar.

Identity red/green: `rtk npm test -- src/lib/leetcode/domain/problem-url.test.ts src/features/problems/components/form/problem-form.test.tsx src/features/tracks/data/tracks-repository.test.ts --run` failed 6 new cases; `rtk npm test -- src/features/problems/data/problems-repository.test.ts --run` failed 4 new cases. Final `rtk npm test -- src/lib/leetcode/domain/problem-url.test.ts src/features/problems/components/form/problem-form.test.tsx src/features/problems/data/problems-repository.test.ts src/features/tracks/data/tracks-repository.test.ts --run` passed all 81 tests. Per-file ESLint and Prettier pass. Actual company changes simplify the dead generic writer branch and preserve transaction rollback.

Imports red/green: `rtk npm test -- src/features/imports/domain src/features/imports/server/import-service.test.ts --run` failed 4 added cases before the normalized-key fix; passed 5 files / 104 tests afterward. Exact stored topic/company IDs and alias references remain unchanged, and changed normalized-ID matches invalidate preview without writes.

Capture red/green: `rtk npm test -- src/features/leetcode-capture/server/leetcode-capture-service.test.ts src/lib/leetcode/watcher/leetcode-page-watcher.test.ts --run` initially failed 10 new cases, then passed 29 after useful-success caching, bounded hydration retry and stale-rejection protection. Independent review found source-only success still accepted an empty GraphQL object; the reader now requires actual title and known difficulty, retaining nullable/empty optional fields. Follow-up empty/partial reader/cache/watcher coverage failed 9 before repair and passed 43 afterward. No new scheduler or cache layer.

Company independent review found arbitrary last-wins selection of valid legacy case-distinct labels. Exact-label-first and ambiguity rejection repair: `rtk npm test -- src/features/problems/data/problems-repository.test.ts --run` failed 2 new cases before repair and passed 26 afterward. Regression proves exact ID preservation and transactional rollback on ambiguity. Re-review passes.

## Phase 3 implementation evidence

Overlay composed regression first failed duplicate request, pending user rating and stale navigation/restart persistence (4 cases); display `shouldUpdateRating:false` regression failed separately. One existing recommendation hook now shares captured watcher request/promise/result with saving and display. Latest distinct result cancellation was also reproduced red and repaired using the existing automation owner. `rtk npm test -- src/features/overlay-session/hooks --run` passes 64 tests. Root replaced temporary failure-tone supersession with a narrow silent `save-cancelled` reducer action; `rtk npm test -- src/features/overlay-session/hooks src/features/overlay-session/domain/overlay-session-state.test.ts --run` passes 5 files / 78 tests.

Provider red: `rtk npm test -- src/features/genai/server/providers --run` failed all 6 added stalled HTTP 200/429 body cases before repair. Green after caller-reason preservation and test type narrowing: 4 files / 74 tests passed, covering timeout, caller cancellation, already-aborted signal, cleanup and redaction. `rtk proxy npx eslint src/features/genai/server/providers` passed. `rtk proxy npm run typecheck > /private/tmp/cognipace-ponytail-phase3-typecheck.log 2>&1` passed after correcting 3 new test-only result narrowing errors. An intermediate provider run exposed cross-realm cancellation classification; matching the actual external signal reason preserves cancellation without trusting DOMException identity. Independent provider review passes.

Current Fetch/AbortSignal semantics verified through Context7 `/mdn/content`: [AbortSignal documentation](https://github.com/mdn/content/blob/main/files/en-us/web/api/abortsignal/index.md). The deadline stays active through response consumption; timers and named listeners are removed in finally. No browser API/permission expansion or live provider requests.

Phase 2/3 stable checkpoint: `rtk proxy npm run db:check > /private/tmp/cognipace-ponytail-phase23-db.log 2>&1`; `rtk proxy npm run lint > /private/tmp/cognipace-ponytail-phase23-lint.log 2>&1`; `rtk proxy npm run check > /private/tmp/cognipace-ponytail-phase23-check.log 2>&1` (186 files / 1984 tests); `rtk proxy npm run build > /private/tmp/cognipace-ponytail-phase23-build.log 2>&1` (3.88 MB) all passed. The final empty/partial GraphQL guard passed re-review. Human proof remains pending; automatic checkboxes do not claim Chrome smoke.

Final Phase 3 independent review found no actionable issue. Independent command `rtk npm test -- src/features/overlay-session/hooks src/features/overlay-session/domain/overlay-session-state.test.ts src/features/leetcode-capture/server/leetcode-capture-service.test.ts src/lib/leetcode/metadata/metadata-reader.test.ts src/lib/leetcode/watcher/leetcode-page-watcher.test.ts --run` passed 8 files / 121 tests, including the final metadata boundary and silent cancellation. Provider review separately passed. Phase 2 is committed as `dd05169`; Phase 3 is validated by the same stable full checkpoint above.

## Phase 4 implementation evidence

Caller recheck confirmed all audited dead paths, with live Analytics evidence/readiness, calendar backlog, current views and line-segments retained. The Analytics deletion owner established a current baseline: `rtk proxy npm test -- src/features/analytics src/components/ui/chart.test.tsx src/app/dashboard/routes.test.tsx src/features/dev-smoke src/extension/background/dev-smoke-service.test.ts --run` passed 28 files / 312 tests.

Root deleted four uncalled placeholder/ping files and `clearSnapshot`/export after `rtk proxy rg -n 'DashboardPlaceholderPage|PlaceholderPanel|ModalPlaceholders|useExtensionPing|clearSnapshot|dashboard-placeholder-page|placeholder-panel|modal-placeholders|use-extension-ping' src` found only declarations and internal dead references. Live runtime ping and route metadata remain. Actual root production cut: 117 lines.

`rtk proxy npm uninstall date-fns eslint-plugin-import-x eslint-plugin-react-refresh --ignore-scripts --no-audit --cache /private/tmp/cognipace-ponytail-npm-cache` removed the 3 unused direct dependencies and 11 installed packages. `rtk proxy npm ls date-fns eslint-plugin-import-x eslint-plugin-react-refresh` reports an empty tree (exit 1 is npm's absent-package result). No package upgrades in this deletion task; scoped advisory updates follow its checkpoint.

Analytics final focused command: `rtk proxy npm test -- src/features/analytics src/components/ui/chart.test.tsx src/app/dashboard/routes.test.tsx src/features/dev-smoke src/extension/background/dev-smoke-service.test.ts src/extension/background/register-handlers.test.ts --run` passed 28 files / 370 tests. The compact live-contract test failed before deletion as expected. Meaningful assertions moved to live views/contracts: pre-range replay, multiple cards/configured FSRS, invalid/future exclusion, raw-count adaptive aggregation, exact boundaries, evidence gaps, malformed rows, and null unknown values. The committed calendar implementation and remaining backlog regressions were byte-compared and retained. `rtk proxy npm run typecheck`, owned-file ESLint/Prettier and diff checks pass after migrating an obsolete runtime assertion and its two fixtures. Actual production reduction: 32 additions / 2346 deletions, net 2314 lines.

Tracks/FSRS command: `rtk npm test -- src/features/tracks src/lib/fsrs src/platform/db src/testing/db-foundation.test.ts src/testing/architecture-boundaries.test.ts --run` passed 23 files / 270 tests. Guidance, ledger and foundation assertions now exercise the live service; tests preserve suspended skipping, selected-group independence, empty guidance and nullable dates. Actual production reduction: 1 addition / 197 deletions, net 196 lines. Owned-file Prettier/ESLint and scoped diff checks pass after removing one stale test import. Independent caller/test review passes for these deletions and root placeholder/dependency cuts; no schema/migration change.

Independent Analytics review passes: all removed consumers belong to the obsolete graph, live runtime validators/refinements and evidence/readiness remain, and migrated tests cover the actual rating-derived live semantics. Phase 4 net production reduction is 2627 lines plus 3 direct dependencies. This excludes tests, package/lockfile changes and parallel modal repair.

Root Phase 4 checkpoint passed: `rtk proxy npm run db:check > /private/tmp/cognipace-ponytail-phase4-db.log 2>&1`; `rtk proxy npm run lint > /private/tmp/cognipace-ponytail-phase4-lint.log 2>&1`; `rtk proxy npm run check > /private/tmp/cognipace-ponytail-phase4-check.log 2>&1` (185 files / 1982 tests); `rtk proxy npm run build > /private/tmp/cognipace-ponytail-phase4-build.log 2>&1` (3.86 MB); `rtk proxy npm run format > /private/tmp/cognipace-ponytail-phase4-format.log 2>&1`; `rtk proxy npm run zip > /private/tmp/cognipace-ponytail-phase4-zip.log 2>&1` (1.25 MB archive). The check includes the first modal implementation and chip focus repair, but precedes the final empty-selection lifecycle regression; final dependency validation will include that repair too. jsdom's existing `scrollTo` notices do not fail tests.

## Phase 5 implementation evidence

Modal regression command: `rtk proxy npm test -- src/features/problems/components src/features/tracks/components --run` first failed 11 new cases while 60 existing tests passed. After repair, 8 files / 126 tests pass with 12 new cases covering initial focus, Tab/Shift+Tab wrapping, opener restoration, Escape/pending locks, visible errors, metadata draft/retry/cancel and selection changes. The three affected confirmations share existing local focus behavior through one small hook. Owned-file Prettier/ESLint pass. Independent review is checking dynamic control removal before the root checkpoint.
