# Analytics Cleanup Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` to execute and review these tasks.

**Goal:** Apply the deletion review approved by the user without changing the live Analytics graphs or retiring runtime compatibility fields.

**Architecture:** Keep the current feature-owned historical views, shared chart frame, domain models, and runtime contracts. Remove superseded renderers and their exclusive tests/helpers; consolidate duplicate Settings/cache tests. Preserve all frozen source, screenshots, and manifests.

**Tech Stack:** TypeScript, React, Recharts, Vitest, React Testing Library.

## Approved Scope

The user approved the eight deletion/consolidation findings with “apply.” The
separate legacy runtime-payload retirement was outside those findings and stays
deferred. Ownership and graph behavior remain unchanged. This is a maintenance
pass over the existing Analytics feature branch.

## Task 1: Superseded Standalone Views

Files: `src/features/analytics/components/memory-practice-views.tsx`,
`recall-ratings-views.tsx`, `historical-views.tsx`, and their three test files.

- [x] Remove `PracticeRhythmView`, `PracticeVolumeColumns`, `PracticeLegend`,
      `PracticeTooltip`, and only their exclusive imports/types.
- [x] Remove `RatingsMixView`, `RatingsStacks`, `RatingLabel`, `RatingsLegend`,
      `RatingsTooltip`, category metadata, and only their exclusive helpers.
- [x] Remove both exports from `historical-views.tsx`.
- [x] Remove standalone Practice/Ratings cases and exclusive fixtures from
      `memory-practice-views.test.tsx`, `recall-ratings-views.test.tsx`, and
      `historical-views.test.tsx`. Keep every Memory/Recall/Topic case.
- [x] Verify no live callers or dangling imports remain. Keep the merged view,
      live source-view fields, scales, readiness, and compatibility payloads.

## Task 2: Unused Older Chart Family

Files: `src/features/analytics/components/charts/consistency-chart.tsx`,
`memory-strength-chart.tsx`, `ratings-mix-chart.tsx`,
`recall-quality-chart.tsx`, `weakest-topics-chart.tsx`, `index.ts`,
`chart-definitions.ts`, `types.ts`, `chart-shared.tsx`, and exclusive tests.

- [x] Remove the five unused renderers and deprecated Consistency alias.
- [x] Remove their unused catalogue, types, barrel, and exclusively dead
      helpers. Keep `LineSegments`, shared live formatters, trend/evidence
      helpers, and every historical frame/model/target/table component.
- [x] Remove tests that exercise only deleted modules. If a surviving shared
      helper test imports the old catalogue, use explicit minimal series data
      in that test rather than recreating the catalogue.
- [x] Verify all retained generic rendering tests still exercise live helpers.

## Task 3: Duplicate Settings And Cache Tests

Files: `src/features/settings/hooks/use-settings-draft.test.tsx` and
`src/features/analytics/api/analytics-api.test.tsx`.

- [x] Extend the existing external-refresh Save/Reset matrix with both
      first-attempt values; remove its separate first-attempt Save duplicate.
      Keep pending-refetch Reset and unrelated-field preservation.
- [x] Use one four-target `it.each` cache-save matrix. Put measured first-outcome
      rows/totals into `summaryWithMeasuredRows`; retain all scale/reference,
      rows/totals/timeframe/readiness, invalidation, and unrelated-cache checks.
- [x] Keep the failed-save and late-response race tests unchanged in meaning.

## Task 4: Summary Input And Authority Docs

Files: `src/features/analytics/domain/summary.ts`, `summary.test.ts`,
`docs/architecture.md`, and `docs/superpowers/README.md`.

- [x] Require `views: HistoricalAnalyticsViews`; return `views: input.views`.
      Remove `emptyHistoricalViews` and exclusive imports. Supply explicit
      real-domain empty views in summary tests; do not add another fallback.
- [x] Replace the architecture catalogue claim with the live view/shared-frame
      ownership. Keep the documented compatibility payload boundary.
- [x] Index this compact plan and retain the exact historical artifacts.

## Validation And Completion

- [x] Run focused checks:
      `npm run test -- src/features/analytics/components src/features/analytics/domain/summary.test.ts src/features/analytics/api/analytics-api.test.tsx src/features/settings/hooks/use-settings-draft.test.tsx`.
- [x] Inspect the diff and obtain independent specification and code-quality
      review; fix actionable findings.
- [x] Format touched maintained files, then run `npm run lint`,
      `npm run check`, `npm run build`, and `npm run format`.
- [x] Confirm frozen artifacts match the starting commit and the live graph
      components/models are unchanged. Record actual deletion totals.
- [x] Commit as `refactor(analytics): remove superseded chart implementations`
      and push to the existing draft PR. Update its validation/deletion summary.

Required human installed-extension happy-path and edge-case smoke for the
parent Analytics feature remains pending, as recorded in `docs/testing.md` and
the existing PR. This cleanup adds no new visual behavior and does not replace
that requirement with automated tests.

## Validation Record

- `rtk proxy npm run test -- src/features/analytics/components src/features/analytics/domain/summary.test.ts src/features/analytics/api/analytics-api.test.tsx src/features/settings/hooks/use-settings-draft.test.tsx`: 19 files, 196 tests passed.
- `rtk proxy npm run lint`: passed.
- `rtk proxy npm run check`: database check, WXT/TypeScript, lint, and 195 files / 2,158 tests passed.
- `rtk proxy npm run build`: passed; existing chunk-size warnings remain nonfatal.
- `rtk proxy npm run format`: passed.
- `rtk proxy npx prettier --check --ignore-path /dev/null docs/superpowers/plans/2026-10-03-analytics-cleanup.md`: passed.
- `rtk proxy git diff --check`: passed.
- The first focused summary run failed two tests because the replacement fixture supplied no calendar buckets. The fixture now uses `buildAnalyticsBucketsFromTimeFrame`; the corrected summary run passed all 13 tests, then passed the integrated focused and full checks.
- Caller searches found no remaining references to deleted renderers/catalogue under `src`. AST comparison confirmed all retained Memory/Recall renderer function bodies are identical to the starting commit. Protected-path Git comparison confirmed current new/merged views, live frame/models, runtime contracts/service, domain presentation, and frozen assets are unchanged.

Skipped: `rtk proxy npm run db:generate` (no SQL/schema changes), standalone
`rtk proxy npm run db:check` (included in `check`), and
`rtk proxy npm run zip` (packaging/release outside this maintenance scope).
Human installed-extension happy-path/edge-case and configured disposable Gist
smoke remain pending for the parent feature; the PR remains draft.

Independent specification and code-quality reviews are clear. The code/test
cleanup removes 2,924 net lines: 1,969 production lines and 955 test lines.
The compact plan records the approved scope and validation separately.

## Phase 2: User-Approved Test Budget

The user requested aggressive ponytail pruning with a maximum 1:1 ratio of
added test/fixture lines to added production source lines across the whole PR.
Starting at `04e9d20`, the original PR base has 5,898 source test/fixture
additions, another 512 archived browser proof fixture lines, and 3,948
production additions. Do not pad production, move test code out of the
count, change formatter rules, or delete essential contracts to satisfy it.

- [x] Reduce component suites to graph-specific rendering/inspection smoke
      and genuinely different edge behavior. Test shared pointer, keyboard,
      calendar, scale, trimming, and pagination mechanics at their owner.
- [x] Consolidate goal-editor interactions into one four-metric matrix;
      preserve dependent-pair rules, independent goals, refreshed drafts,
      failure/pending state, and focus restoration.
- [x] Collapse repeated Settings/domain/repository/backup setup and validation
      matrices. Keep strict trust-boundary rejection, atomic persistence,
      missing-field compatibility, Reset/refresh races, and backup round trip.
- [x] Reduce screen/API/chart-frame setup duplication. Keep selected-range
      readiness, real cached-save assertions, empty/error states, and accessible
      inspection. Keep cohort chronology, replay, zero/null, and exact interval
      join checks in their existing domain owners.
- [x] Measure the whole PR against its original base, counting every added
      test and fixture line, and require tests/fixtures <= production additions.
- [x] Obtain independent coverage/code-quality review; run focused tests,
      `npm run lint`, `npm run check`, `npm run build`, and `npm run format`.
- [x] Push to the same PR with the actual ratio and validation; preserve
      exact visual archives and the pending human installed-extension smoke.

Execution owns tests/fixtures and their records. Retire the 512 lines of
duplicate one-off browser illustration harnesses. The historical/Practice
imports or target shape no longer match production; the latest harness
contains no executable regression assertions. Historical handoffs link their
exact source at `04e9d20`; do not move these copies elsewhere on the branch.
Production, every screenshot, and canonical approved design assets must match
`04e9d20` byte for byte. A passing suite is supplemented by review of
which assertions survive each removed test, rather than treating a lower test
count as evidence by itself.

## Phase 2 Validation Record

The whole PR against `a20e8c6782f43c78eebdc5e99a46b806e0e21618` now has
**3,948 added test/fixture lines and 3,948 added production lines: exactly 1:1**.
Count all source tests, `src/testing`, and archived browser fixture code;
canonical approved designs, screenshots/manifests, and validation ledgers are
historical records. No test code was relocated or production padded.

This pass removes **2,803 net test/fixture lines** (2,291 executable test lines
and 512 one-off illustration harness lines). Added test/fixture lines drop
from 6,410 to 3,948, a reduction of 2,462. Production is byte-identical to
`04e9d20`; independent Git-blob review also verified all 76 protected assets.
The historical harness sources remain recoverable through pinned handoff links.

Independent coverage and quality reviews are clear. They caught two removed
contracts, both restored at their retained owner: touch leave keeps inspection
open, and Recall's first circle stays 12px from the plot's left edge. Domain
owners retain cohort chronology, weighted numerators/denominators, invalid-first
exclusions, FSRS pairing, null versus zero, and goal-independent evidence.
Settings/backup owners retain strict rejection, compatibility, atomic writes,
no-data-loss restore, and refresh/save/reset races. The API matrix asserts the
whole cached summary except the explicitly updated goals/scales; screen target
saves are verified while refetch remains pending.

Passed final integration commands:

- `rtk proxy npm run test -- src/features/analytics/components src/features/analytics/api/analytics-api.test.tsx src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/domain/review-cohorts.test.ts src/features/analytics/server/analytics-service.test.ts src/features/settings/domain/settings.test.ts src/features/settings/data/settings-repository.test.ts src/features/settings/hooks/use-settings-draft.test.tsx src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts`: 26 files / 340 tests.
- `rtk proxy npm run test -- src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/practice-ratings-model.test.ts src/features/analytics/components/new-problem-success-view.test.tsx`: 3 files / 10 tests after the final Recall assertion and redundant zero-default removal.
- `rtk proxy npm run test -- src/features/analytics/server/analytics-service.test.ts`: 30 tests after the final persisted-goal/evidence comparison.
- `rtk proxy npm run lint`: passed; also included in the final `check`.
- `rtk proxy npm run check`: database check, WXT/TypeScript, lint, and 195 files / 2,083 tests passed after all review fixes.
- `rtk proxy npm run build`: passed, existing nonfatal chunk-size warning only. The final edits affect tests only; production remained byte-identical.
- `rtk proxy npm run format`: passed.
- `rtk proxy npx prettier --check --ignore-path /dev/null docs/superpowers/plans/2026-10-03-analytics-cleanup.md docs/superpowers/handoffs/2026-10-02-analytics-historical-charts.md docs/superpowers/handoffs/2026-10-03-analytics-practice-ratings-merge.md docs/superpowers/handoffs/2026-10-03-analytics-first-attempts-and-repeat-recall.md`: passed.
- `rtk proxy git diff --check`: passed.

Corrected initial consolidation failures: editor trigger matching and an async
callback without an await; the whole-percentage check initially used the view
schema rather than the stricter summary boundary; tap inspection intentionally
moves focus, so hover/Escape preservation is checked before tapping; the merged
initial-only service fixture fits Recall to 0–25%, so it now asserts the target
boundary rather than incorrectly requiring 0–100%. Scoped lint also caught
unused/destructuring and unnecessary-cast issues. Final focused and full runs
passed; existing jsdom `scrollTo` notices are nonfatal.

Skipped commands remain `rtk proxy npm run db:generate` (no SQL/schema change),
standalone `rtk proxy npm run db:check` (included in `check`), and
`rtk proxy npm run zip` (packaging outside scope). Human installed-extension
happy-path/edge-case and configured disposable Gist smoke remain pending for
the parent feature. This behavior-neutral pruning does not replace that proof;
PR readiness was not changed by this maintenance pass.
