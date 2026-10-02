# Ponytail Phase 4 Deletion Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Trace callers immediately before deletion; retain meaningful live-path coverage.

**Goal:** Remove audited unused production paths and direct dependencies without changing supported behavior.

**Architecture:** Live Analytics views, track guidance and persisted scheduling remain the owners. Delete obsolete consumers before their exports/helpers. No replacement abstraction.

Approved design: [cleanup](../specs/2026-10-02-ponytail-cleanup-design.md).

## Task 1: Obsolete Analytics UI and response pipeline

**Files:** `src/features/analytics/components/charts/{recall-quality-chart,memory-strength-chart,consistency-chart,ratings-mix-chart,weakest-topics-chart,index}.tsx` (actual barrel is `.ts`); associated unused chart definitions/types; `src/components/ui/chart.tsx`; `src/features/analytics/{api/analytics-contracts.ts,server/analytics-service.ts,data/analytics-repository.ts,domain/chart-data.ts}`; corresponding tests and fixtures.

- [ ] Re-run `rg` callers for each audited chart, export, response field and private helper. Distinguish legacy top-level fields from live nested `views`, readiness and evidence fields with the same names.
- [ ] Delete the five unused charts and barrel. Remove unused generic `ChartTooltipContent`/`ChartLegendContent` plus their private helpers only after no live caller remains. Retain `ChartContainer`, `ChartStyle`, reduced motion, `ChartTooltip`, `line-segments.tsx` and live shared formatters.
- [ ] Remove legacy top-level recall quality, predicted recall, practice rhythm, ratings mix, hard/again and topic payloads, schemas/types and calculations after tracing consumers. Preserve nested live views, source evidence, historical readiness, calendar backlog fix, workload and current-card model.
- [ ] Remove test-only `getRecentRatings`/`RecentRating`; retain the complete history read. Migrate meaningful service/contract/component assertions to equivalent live views, rejecting malformed live payloads rather than simply deleting safety coverage.
- [ ] Run `rtk npm test -- src/features/analytics src/components/ui/chart.test.tsx src/app/dashboard/routes.test.tsx src/features/dev-smoke --run` with actual existing paths (omit nonexistent chart test), then typecheck/lint owned files. Report exact command and retained coverage.
- [ ] Update architecture's obsolete catalogue description through root. Count actual production additions/deletions from diff, not the estimate.

## Task 2: Superseded track/FSRS APIs

**Files:** `src/features/tracks/data/tracks-repository.ts`, its tests, `src/features/tracks/server/tracks-service.test.ts`, DB foundation tests that call it; `src/lib/fsrs/scheduler/review-scheduler.ts`, exports and tests.

- [ ] Trace repository `getActiveTrack` (distinct from live service function), `projectReviewSchedule` and private helpers. Keep repository `readFirstGroup`, which has a production caller.
- [ ] Remove obsolete repository active guidance and private next-selection helpers. Move meaningful foundation/repository guidance assertions to the live service/readActiveTrackGuidance path.
- [ ] Remove unused FSRS projection options/helpers/tests/barrel exports; keep actual review scheduling, replay and retrievability. Preserve live persisted-due forecast.
- [ ] Run `rtk npm test -- src/features/tracks src/lib/fsrs src/platform/db --run`, then formatting/lint for owned files. Report caller proof and actual cuts.

## Task 3: Disconnected files and dependencies

**Files:** `src/app/dashboard/layout/dashboard-placeholder-page.tsx`, `placeholder-panel.tsx`, `src/app/dashboard/screens/modal-placeholders.tsx`, `src/hooks/use-extension-ping.ts`, `src/platform/db/snapshot.ts`, `index.ts`; `package.json`, lockfile.

- [ ] Trace then delete disconnected placeholders, ping hook, uncalled `clearSnapshot` and its export. Keep runtime ping diagnostic method. Coordinate snapshot file with completed Phase 1 storage owner.
- [ ] Trace source/config/package scripts then remove direct `date-fns`, `eslint-plugin-import-x`, `eslint-plugin-react-refresh`. Update lockfile with npm using the task cache; no other upgrades in this task. Preserve configured lint rules and architecture checks.
- [ ] Run affected dashboard/runtime/DB tests and package checks. Root owns package/lockfile changes to avoid concurrent dependency edits.

## Task 4: Review/checkpoint

- [ ] Independently review all deleted exports/callers, live analytics schema/UI coverage and meaningful migrated tests.
- [ ] Run focused suites first, then `rtk npm run db:check`, `rtk npm run lint`, `rtk npm run check`, `rtk npm run build` and `rtk npm run zip`.
- [ ] Format touched docs/code, update current docs and ledger, record actual source/dependency reduction and exact commands/skips.
- [ ] Root commits reviewed phase files with Conventional Commit titles.

Human smoke pending: all live Analytics views, active track next guidance, review scheduling, dashboard routes and packaged extension load. Attach screenshots/recording before review/merge. Skip `rtk npm run db:generate`: no schema changes. Removed APIs are internal and have no supported production consumers.
