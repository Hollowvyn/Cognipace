# Ponytail implementation ledger

Design approved by the human engineer on 2026-10-02; execution continues in
`codex/ponytail-codebase-audit`. Baseline and original findings are in the
[audit](2026-10-02-ponytail-codebase-audit.md). The
[approved design](../specs/2026-10-02-ponytail-cleanup-design.md) defines scope.

## Progress

| Phase                        | Status                                             | Review/validation                               |
| ---------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| 1: backup and sync recovery  | Implemented and independently reviewed             | 181 focused tests; full check 1926 tests passed |
| 2: identity/calendar/capture | Implemented and independently reviewed             | Pending                                         |
| 3: AI ownership/deadline     | Implemented; independent review/checkpoint running | Pending                                         |
| 4: proven deletions          | Plan written; caller recheck complete              | Pending                                         |
| 5: modal/dependency repair   | Plan written; dependency investigation complete    | Pending                                         |

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
