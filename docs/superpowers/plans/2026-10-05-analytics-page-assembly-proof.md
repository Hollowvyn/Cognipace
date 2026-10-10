# Analytics Page Assembly And Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Put the complete approved Analytics page into the real dashboard, verify all states and responsive modes, and document honest production and human validation.

**Architecture:** The screen composes ten reviewed feature cards and four selected-activity headlines from one validated query response. Date, score and workload models stay in their owning feature modules. Use key-compatible query data for retained refresh states, fixed shells for pending/empty/unavailable/error states, and the existing Settings mutation path.

**Tech Stack:** Existing React dashboard/query hooks, CSS container queries, Vitest/Testing Library, WXT build and production-component browser fixture. No new dependency or persisted shape.

---

Status: written for execution after the card adapter plan. Root owns final integration review, commits and browser proof. The final approved asset is `docs/superpowers/specs/assets/2026-10-05-analytics-range-summary-approved.html`.

## Task 1: Four Truthful Headlines And Ten Ordered Cards

**Files:**

- Modify: `src/features/analytics/components/analytics-metric-row.tsx`
- Modify: `src/features/analytics/components/analytics-metric-row.test.tsx` or existing screen-owned metric assertions.
- Modify: `src/features/analytics/components/analytics-screen.tsx`
- Modify: `src/features/analytics/components/analytics-screen.test.tsx`
- Modify: `src/features/analytics/components/analytics-readiness-state.tsx` for neutral fixed metadata/Details.
- Modify: `src/app/dashboard/screens/analytics-page.tsx`
- Modify: `src/styles/analytics.css`
- Create: `src/assets/fonts/analytics/nunito-sans-latin.woff2`, `literata-latin.woff2`, and their original OFL license files.
- Modify: `src/testing/analytics-fixtures.ts` for honest established/young/empty complete summary fixtures.

- [x] **Step 1: Add failing selected-summary and composition tests.**

Assert four summary values from validated `activity` only: Review days, Questions solved, Observed correctness, Recorded solve time. Persisted true with rating Again still counts correct; false with rating Easy does not; null is excluded. Repeated successes affect time/count coverage but unique question only once. Wholly unknown correctness shows unavailable solved/time, empty/known zero success shows zero, partial/missing timing preserves its exact coverage. Format seconds as compact hours/minutes without changing stored seconds; finite ranges never show all-time totals.

Assert exact DOM card order:

```ts
expect(cardTitles).toEqual([
  'Performance',
  'Time vs target',
  'Practice',
  'Topic performance',
  'Recall',
  'Memory strength',
  'Retention map',
  'Memory signals',
  'Overdue backlog',
  'Upcoming reviews',
])
```

For every card test Details/Overview reachability and no extra full-width Problem Solving card. Keep target callbacks on the existing Settings patch path. Scope labels distinguish historical period, current snapshots, Last30days backlog and Next14days upcoming. Verify explicit available young history and All time literal label.

- [x] **Step 2: Run RED and compose the approved page.**

Run `rtk npm run test -- src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/components/analytics-metric-row.test.tsx src/app/dashboard/routes.test.tsx`; omit a nonexistent separate metric file only if these assertions live in screen tests and record the actual command. Expected: old three-metric/nine-panel layout fails new expectations.

Headline cards have equal 148px outer height in all data states, four columns on wide desktop, two then one on narrower containers. Use supplied counts, not legacy `reviewDays`, all-time `totalReviews`, or rating-derived quality. Captions are short: days practiced, unique correct questions, correct/assessed, timed/total successful attempts. Replace all legacy range interpolation in the metric row: All time must never render as "all-day period." Positive recorded durations below one minute must remain distinguishable from measured zero, with exact seconds retained in evidence.

Use one page-width ten-card grid with two columns whenever usable container width supports two360px cards plus its gap. All card modes stay464px there and512px stacked, including error/skeleton/unavailable. The chart consumes measured remaining height. Retain Terra Compact tokens, Nunito Sans text/Literata page title, short approved descriptions and light/dark support.

The repository currently has system-font tokens and no bundled Nunito Sans or Literata files. Bundle the official Google Fonts Latin variable WOFF2 assets and original licenses for the already approved typography, scoped to Analytics rather than changing unrelated surfaces. The two font files total 70,208 bytes; load them locally without runtime font-service requests or a new dependency. Keep documented system fallbacks for glyphs outside the bundled subset, and verify final geometry after fonts load.

- [x] **Step 3: Run GREEN, review, and commit.**

Run screen/metric/route and all new card component suites plus typecheck. Fresh specification then quality review. Root commits `feat: assemble the refined analytics dashboard`.

### Task 1 execution record

Implemented four activity-only 148px headlines, ten ordered 464px desktop cards, per-metric scope ownership, local Analytics typography, and retained complete evidence/actions. Fresh SPEC and QUALITY accepted the source. Focused validation passed 21 files / 465 tests, TypeScript, touched ESLint/Prettier and diff checks. Actual production-component desktop proof confirmed all ten card regions fit with fonts loaded; established 30/90/All, young/old paired history, and zero/unknown/timing cases retain truthful values. Existing narrow-screen proof is retained; further exhaustive layout/accessibility validation was stopped at the user's request. A minor Practice footer copy wrap at the two-column boundary is nonblocking for the requested full-size desktop focus.

Exact focused test/type/diff commands:

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/components/analytics-metric-row.test.tsx src/app/dashboard/routes.test.tsx src/features/analytics/components/cards src/features/analytics/components/analytics-readiness-state.test.tsx src/features/analytics/components/analytics-exact-table.test.tsx src/features/analytics/components/analytics-chart-panel.test.tsx src/features/analytics/components/analytics-card-controls.test.tsx src/features/analytics/domain/summary.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/api/analytics-api.test.tsx src/testing/architecture-boundaries.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
rtk git diff --check
```

Full `npm run lint`, `npm run check`, `npm run build`, and `npm run format` are deferred to Task 3; focused checks do not replace them. `npm run zip` and `npm run db:generate` are not selected because no packaging/schema change was requested. Human installed-extension smoke and screenshot/recording proof remain pending before PR review/merge. Task 2 query states and hidden detail-page resets remain unfinished.

## Task 2: Stable Query And Action States

**Files:**

- Modify: `src/features/analytics/components/analytics-screen.tsx` and `.test.tsx`
- Modify: `src/features/analytics/api/analytics-api.ts` and `.test.tsx` only if query compatibility needs adjustment.
- Modify: compact shell/readiness/target editor and adjacent tests only for state regressions.

- [x] **Step 1: Add failing initial/range/refresh state tests.**

Initial loading renders all four summary and ten chart shells with the same geometry. Initial error shows clear failed state and Retry inside reserved space. Empty activity is distinct from unavailable model evidence and known zero. Range changes clear incompatible results; same-key refresh may retain its compatible snapshot with Updating. Same-key failed refresh retains original as-of and values, shows refresh failure and Retry, and never presents stale values under new period dates. Keep routine readiness/coverage neutral in reserved metadata and full reasons in Details; no orange page-moving banners. Distinct Practice/rating evidence remains reachable/visible as appropriate.

```ts
const usableData = query.data?.range === range ? query.data : undefined
// Show usable data before the initial-error branch; failed refresh may retain it.
const state = usableData
  ? query.isError
    ? 'refresh-failed'
    : query.isFetching
      ? 'updating'
      : 'ready'
  : query.isError
    ? 'error'
    : 'loading'
```

Timezone compatibility comes from the existing query key/validated report metadata; do not carry an old range/timezone response through placeholder data. Existing target save cancellation/cache tests remain required. Test a failed draft surviving Overview/Details, field validation and Retry, pending duplicate-save guard, and counterpart changes.

- [x] **Step 2: Run RED and implement reserved state slots.**

Run screen/API/target suites. Expected: old early-return/full-page warning behavior fails the new tests. Keep scope/status geometry reserved and neutral, with one polite live announcement per load/range/refresh transition. Do not duplicate every card's loading text in competing live regions. Persistent field errors retain their draft and error association. If adding a floating save confirmation, it is supplementary and never the sole failure feedback.

- [x] **Step 3: Run GREEN, review, and commit.**

Run focused screen/API/target tests and typecheck. Fresh specification then quality review. Root commits `fix: keep analytics geometry stable across data states`.

### Task 2 execution record

Implemented neutral reserved report metadata/status, four summary and ten chart shells in initial loading/error/range transitions, compatible mounted cards during Updating/failed refresh, retained exact snapshot/as-of, Retry and one global polite report status. Existing query-key timezone/range and Settings/editor race behavior are preserved. Six card owners reset hidden Method/Retention Summary pages on semantic report changes without remounting equivalent reports. Shortened the Practice footer copy. Fresh SPEC and final end-to-end QUALITY reviews passed.

Focused final affected tests passed48/48 (Screen31/API10/semantic resets7), with unchanged target/metric/shared-shell31 already passing; route readiness wait repair passed62/62. No exhaustive layout/accessibility matrix was added after the user's scope update. Direct TypeScript, touched ESLint/Prettier and diff checks passed. Exact affected commands:

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/api/analytics-api.test.tsx src/features/analytics/components/cards/analytics-card-report-state.test.tsx
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/app/dashboard/routes.test.tsx
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx tsc --noEmit -p tsconfig.json
rtk git diff --check
```

Actual1360CSS desktop production-component proof: all four148px headlines and ten464px cards preserve summaryY214.297/gridY378.293 with no region overflow through initial pending/error/Retry, range transition, Updating, failed refresh/recovery, and empty Light. Failed refresh retains identical totals and full scope/as-of. Root final full gates are separately recorded in the handoff; human installed-extension smoke remains pending.

## Task 3: Production Browser Proof, Authority Docs, And Final Gates

**Execution scope update:** The user subsequently prioritized the full-size desktop experience and requested no further exhaustive layout/accessibility tests. Preserve existing responsive/accessibility behavior and completed evidence; remaining proof focuses on desktop query/action states, data correctness, and required automated gates. Do not expand the narrow-screen matrix below.

**Files:**

- Modify: `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `design.md`
- Modify: `docs/superpowers/README.md` and executed plan status records.
- Create: `docs/superpowers/handoffs/2026-10-05-analytics-performance-layout.md`
- Create: screenshot proof under a feature-specific `docs/superpowers/specs/assets` subdirectory.
- Temporary outside repo: disposable Vite harness using actual production `AnalyticsScreen`/cards and honest established/young/unavailable fixtures.

- [ ] **Step 1: Run all required automated gates on the final source.**

Use pinned Node24.20.0/npm11.19.0. Run focused suites, touched-file Prettier, `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, `rtk git diff --check`. Record exact actual commands and outputs. No `db:generate`: no persisted schema change. Do not broaden testing after clean final gates unless a new change/failure/concern warrants it.

- [ ] **Step 2: Render actual production components in the browser.**

Use a disposable local Vite harness outside the tracked repo; production components and pure models are imported directly, query data comes from validated complete fixtures, and controlled failures represent real hook states. Use CUA browser tooling, not shell Puppeteer/Playwright. Inspect rendered DOM geometry as read-only verification and capture screenshots. A toy HTML replica is not production proof.

Verify at wide desktop, two-column boundary, stacked tablet and320px: four headlines and all ten cards fit their expected heights, no overflow or internal scrolling/clipped fields, short descriptions, readable fonts. Check both themes. For every card visit every Details section, field group and final page; retain exact zero/unknown distinction, target field errors/drafts and inspector parity. Retention requires complete overlaps, last row keyboard/zoom/pan/reset, selection surfaces and focus restoration.

Fixture coverage: established30/90/All, young12-day history, old sparse raw history with recent paired Recall, genuinely old sparse paired Recall, empty, invalid-only, known zeros, no recorded successful durations, partial timing coverage, singleton, internal/trailing inactive holds, initial pending/error, incompatible range transition, same-key refreshing/failed-refresh with original as-of. Backlog crosses exact5 in both directions and retains unknown breaks; Upcoming stays14dates for every selected range.

- [ ] **Step 3: Align authority docs and record human smoke requirement.**

Replace obsolete14/30/90 and full-width panel guidance with the implemented contract/layout; preserve original advanced measurement/target meanings. Update Analytics/Chart Targets manual flows to include the new selection, four truth-tested headlines, cumulative curves, fixed geometry, all Details/actions, retention completeness, strict backlog boundary and quiet states.

Human installed-extension happy-path and edge-case realtime smoke/proof is required before PR review or merge. Agent production fixture screenshots do not satisfy that gate. State the exact pending cases and include the checklist; never mark it N/A. User has authorized implementation, not fabricated human proof.

- [ ] **Step 4: Final independent code review and commit.**

Root requests final end-to-end review, resolves concrete issues and reruns only affected/full required checks when changes justify them. Format touched Markdown; root commits `docs: record analytics redesign validation and smoke checklist`. Preserve user work and approved prototype source. No PR/merge/deployment is needed unless separately requested.

## Done-When

The locally implemented redesign is complete when every approved card/summary/range/state is integrated, exact old data/actions remain reachable, automated gates pass, production browser proof confirms responsive geometry/interaction, authority docs match actual behavior, and the handoff names remaining human installed-extension proof honestly. Do not end implementation at an unwired foundation or claim merge readiness without the human proof.
