# Ponytail implementation ledger

Design approved by the human engineer on 2026-10-02; execution continues in
`codex/ponytail-codebase-audit`. Baseline and original findings are in the
[audit](2026-10-02-ponytail-codebase-audit.md). The
[approved design](../specs/2026-10-02-ponytail-cleanup-design.md) defines scope.

## Progress

| Phase                        | Status                                            | Review/validation                               |
| ---------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| 1: backup and sync recovery  | Implemented and independently reviewed            | 181 focused tests; full check 1926 tests passed |
| 2: identity/calendar/capture | URL/company implementation active; calendar fixed | Pending                                         |
| 3: AI ownership/deadline     | Plan written                                      | Pending                                         |
| 4: proven deletions          | Plan written; caller recheck complete             | Pending                                         |
| 5: modal/dependency repair   | Plan written; dependency investigation complete   | Pending                                         |

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
