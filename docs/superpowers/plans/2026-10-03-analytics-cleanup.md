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
