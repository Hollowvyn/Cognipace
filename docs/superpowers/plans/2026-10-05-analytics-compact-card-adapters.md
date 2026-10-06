# Analytics Compact Card Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate all ten approved Analytics cards into fixed, inspectable production components while preserving their exact evidence and actions.

**Architecture:** Feature-owned adapters under `components/cards` use the reviewed compact panel, exact field groups, geometry, and domain presentation models. Extract existing plot renderers instead of nesting expanding legacy views. Each adapter owns only its local controls and bounded presentation; Settings retains mutations and the background retains calculations.

**Tech Stack:** Existing React/Recharts, Terra Compact, Vitest/Testing Library. No new dependency, database shape, permission or sync behavior.

---

Status: written after the approved prototype and read-only production component audit. Execute after the history/runtime, weighted-presentation and compact-foundation plans. Root owns commits; run each task through specification review before quality review. Do not ask the user to reapprove the already accepted card design.

## Shared Adapter Contract

Adapters accept typed supplied views, their correct frame, and a target save callback where relevant. They render one compact `AnalyticsChartPanel`, never another panel inside its body. Header toggles Details/Overview; Overview has hero plus fitted chart, Details replaces hero/plot space with section controls and bounded exact fields. Every original field, target and action remains reachable. Keep local controls and failed target drafts alive across mode changes. Tooltips retain existing inspector behavior and truthful new metrics; broader tooltip redesign is deferred.

```tsx
<AnalyticsChartPanel
  id="performance"
  title="Performance"
  description="First attempts · weighted by difficulty"
  mode={mode}
  action={
    <button onClick={toggleMode}>
      {mode === 'overview' ? 'Details' : 'Overview'}
    </button>
  }
  hero={mode === 'overview' ? hero : undefined}
  footer={footer}
>
  {(geometry) => renderCurrentSection(geometry)}
</AnalyticsChartPanel>
```

The shell API may use an explicit `compact` option from the preceding plan; use its actual reviewed names. Typography, dimensions, short descriptions, restrained colors and subtle Performance area match the final approved asset. Preserve original calendar coordinates, all available rows and zeros. Lower page size when controls/long text require it; never clip content or shrink fonts to hide overflow.

## Task 1: Performance And Time

**Files:**

- Create: `src/features/analytics/components/cards/performance-card.tsx`
- Create: `src/features/analytics/components/cards/performance-card.test.tsx`
- Create: `src/features/analytics/components/cards/time-target-card.tsx`
- Create: `src/features/analytics/components/cards/time-target-card.test.tsx`
- Modify: `src/features/analytics/components/combined-problem-outcomes-view.tsx` for controlled cohort/compact plot extraction.
- Modify: `src/features/analytics/components/new-problem-success-view.tsx`
- Modify: `src/features/analytics/components/problem-solving-charts.tsx`
- Modify: `src/features/analytics/components/problem-solving-model.ts` only for presentation control extraction.
- Test: existing combined/new/problem-solving focused suites.

- [ ] **Step 1: Add failing adapter capability tests.**

Performance fixture uses the reviewed 13,210 / 195 acceptance case: hero rounds only for display to 68/100, exact Details remains 67.743589…. Test new/follow-up reachability, Unknown influence and invalid exclusions, inactive holds, no arbitrary score grade/target, stable shell, and all rating/difficulty/Mix/interval pages. Verify the original pooled two-rate chart includes Unknown, raw difficulty Trend/Compare and rate switches remain reachable, all four saved goals map to their original metrics, and changing Performance's cohort never changes Time's local cohort.

Time defaults to all timed assessments/New problems. Test three normalized horizontal median bars with under/over/exact target labels, 150% uncapped ratio, amber only on the excess after 100%, no Unknown target, coverage rather than pooled median hero, missing durations unavailable, successful subset, independent cohort, minutes/% units, difficulty visibility, Trend/Compare, quartiles and exact field groups.

- [ ] **Step 2: Run RED and implement Performance's compact sections.**

Run the two new suites. Expected: missing adapters fail. Use `buildPerformancePresentation` and cumulative renderer for Overview. Show a compact cohort selector and no simultaneous Hard+Good+Easy/Good+Easy labels there.

Details starts with **Ratings / Difficulty / Mix / Intervals**, preserving:

- Ratings: original rating, friendly explanation, count, fixed points, weighted influence.
- Difficulty: all four classifications, raw/valid/invalid counts, influence, score, actual prior counts/delta when supported.
- Mix: assessment share and positive recorded-time share, including Unclassified.
- Intervals: raw score/new count and cumulative score/count/weighted points/units, last update and in-progress context.

Compact secondary sections expose original **Pooled outcomes / Difficulty outcomes / Goals / Method** rather than adding overview cards. Extract the existing plot pieces and make their controls controlled; keep unchanged pure calculations/inspection and expose selected cohort instead of the combined renderer's hardcoded New problems. Raw percentage goal references belong only on those raw plots. Method explains fixed rubric, current difficulty, first-retained-record limits and selected-period pooling in bounded pages.

- [ ] **Step 3: Implement Time's independent compact sections.**

Overview uses full-period medians from `buildTimeTargetPresentation`; the horizontal width domain includes at least 100 and the largest ratio. Labels give raw time/target and signed difference without relying on color. Split a bar at 100 only when it exceeds target. Keep known zero versus missing timing truthful.

Details **Trend / Compare / Intervals / Method** keeps its local timing subset, units, cohort, difficulty visibility and original distributions. Exact groups expose median/Q1/Q3, raw/valid/invalid counts, eligible/timed counts, recorded seconds and current targets. Explain saved assessment duration/current allowances and Strict Timing without changing assessment policy.

- [ ] **Step 4: Run GREEN, review, and commit.**

Run new adapter and existing outcome/time suites plus typecheck. Expected: all pass. Fresh specification then quality review. Root commits `feat: add compact performance and target time cards`.

## Task 2: Recall, Practice, And Memory

**Files:**

- Create: `src/features/analytics/components/cards/recall-card.tsx` and `.test.tsx`
- Create: `src/features/analytics/components/cards/practice-card.tsx` and `.test.tsx`
- Create: `src/features/analytics/components/cards/memory-strength-card.tsx` and `.test.tsx`
- Modify: `src/features/analytics/components/recall-ratings-views.tsx`
- Modify: `src/features/analytics/components/practice-ratings-view.tsx`
- Modify: `src/features/analytics/components/memory-practice-views.tsx`
- Test: existing focused Recall/Practice/Memory suites.

- [ ] **Step 1: Add failing compact population and exact-parity tests.**

Recall fixture: global All time raw history spans 612 days but eligible pairs span Sep9–Oct5; card uses its supplied paired frame, 52 pairs/48 recalled, estimate sum46.16 and 9 three-day intervals. Observed/predicted share the same pair count and visible dates; switches hide matching curve/marks/inspection values together, retain domain and target, both-hidden is truthful, and inactive held rows show no new pairs. Test a long sparse paired history separately so it is not reduced to recent dates.

Practice preserves original interval union, known zero volume, unavailable rating counterpart, independent count/percentage scales and Reviews switch. Keep distinct Practice readiness and rating-composition readiness. Memory preserves measured singleton/zero, eligible count, median/Q1/Q3 and median change; quartiles stay absent below four samples.

- [ ] **Step 2: Run RED and implement fitted adapters.**

Run the three new suites. Expected: new adapters fail. Recall Overview uses cumulative paired model, existing goal mutation and two series. Details **Summary / Intervals / Method**, with interval/cumulative field groups, pair counts, reconstructed provenance, difference, evidence, last update and report dates. Goals is a fitting dedicated surface.

Practice reuses original rating stacks/completed-review line in the measured chart body. Tighten bars to use their available interval width without changing the date spacing. Details **Ratings / Intervals / Comparison / Method**; the old table's fourteen headers (Bucket plus thirteen evidence fields) become exact Ratings/Counts/Outcomes/Evidence groups. Preserve Completed reviews, all four rating counts, Good + Easy, Review Success, its target, Valid ratings, Challenging reviews, both Practice/Ratings evidence and Period context. Retain Good/Easy aspiration, comparison readiness and association-only explanation.

Memory uses original median/whisker rendering at remaining height. Details **Intervals / Evidence / Method**, preserving all original fields and full context. Do not smooth memory medians into cumulative values.

- [ ] **Step 3: Run GREEN, review, and commit.**

Run new and existing Recall/Practice/Memory focused suites plus chart/target regressions and typecheck. Fresh specification then quality review. Root commits `feat: fit recall practice and memory analytics cards`.

## Task 3: Complete Interactive Retention

**Files:**

- Create: `src/features/analytics/components/cards/retention-card.tsx` and `.test.tsx`
- Modify: `src/features/analytics/components/retention-map-chart.tsx`
- Modify: `src/features/analytics/components/current-state-views.tsx`
- Test: `src/features/analytics/components/current-state-views.test.tsx`
- Test: existing retention chart/model suites.
- Modify: `src/styles/analytics.css` only scoped retention presentation.

- [ ] **Step 1: Add failing full-cohort compact interaction tests.**

Reuse the existing 31-eligible-row fixture and exact overlap/gesture tests. Assert every filtered row remains plotted without sample cap/jitter, status totals/domain stay full-cohort, keyboard End reaches final row after zoom through `revealRow`, all overlap candidates reachable through bounded pages, pin/close/return-to-map focus, filter removal of pin, double-click previous-pin restoration, Escape gesture cancellation before dismissal and trailing drag-click suppression. All modes share the same outer geometry.

- [ ] **Step 2: Run RED and extract controlled interaction state.**

Run new retention and current-state suites. Expected: compact adapter assertions fail. Keep existing viewport/model math and gestures. Lift only viewport, active/hover slug, selection, candidate page and problem-section control so the compact card can reclaim the hero/plot space when selection is pinned. Scatter still receives the complete filtered row array.

Overview keeps **All / Below target**, full status counts, references, zoom/reset, reserved hover preview and native inspector. Details **Summary / Problems / Method** exposes all 11 exact original problem fields in fitting groups. Selection paginates three wide/two narrow candidates and splits pinned fields into **Recall** (status, estimate, target, gap), **Schedule** (durability, last review, due), **State** (FSRS difficulty, lapses), with rank and canonical problem link. Return to map keeps viewport/selection; Close clears selection and restores inspector focus. Remove internal candidate scrolling and variable below-plot detail appendices.

- [ ] **Step 3: Run GREEN, review, and commit.**

Run full retention/current-state focused suites and typecheck. Fresh specification then quality review. Root commits `feat: fit complete retention inspection into analytics cards`.

## Task 4: Topics, Signals, And Workload

**Files:**

- Create: `src/features/analytics/components/cards/topics-card.tsx` and `.test.tsx`
- Create: `src/features/analytics/components/cards/memory-signals-card.tsx` and `.test.tsx`
- Create: `src/features/analytics/components/cards/backlog-card.tsx` and `.test.tsx`
- Create: `src/features/analytics/components/cards/upcoming-card.tsx` and `.test.tsx`
- Modify: `src/features/analytics/components/historical-views.tsx` only if extracting the existing Topic plot/inspection pieces; this is the current Topic owner.
- Modify: `src/features/analytics/components/memory-practice-views.tsx`
- Modify: `src/features/analytics/components/workload-views.tsx`
- Modify: `src/features/analytics/domain/workload-presentation.ts` and `.test.ts` for strict watch counts.
- Modify: existing workload threshold segment model and focused tests.
- Test: existing Topic/current-state/workload suites.

- [ ] **Step 1: Add failing exact-count and threshold tests.**

Topics must show every qualifying topic through paged horizontal bars, full names, reviewed weighted ordering and sixteen-cell breakdown; low-evidence topics retain their independent list/additional count. Signals retains all returned flags/canonical links/rank and total qualifying versus top25 returned count, three rows wide/two narrow with page clamp. Backlog fixtures cross 5 in both directions, include a point at exactly5, known zero and unknown days. Green is strictly below5; amber at5 and above; crossings split exactly and create no measured marker. Unknown days break segments. Upcoming keeps exact fixed14 local dates and Due/Overdue/Total/Today semantics.

- [ ] **Step 2: Run RED and implement the four adapters.**

Run new and existing Topic/workload/current-state suites. Expected: new compact assertions fail. Topics Overview uses shared weighted helper, no score target. Details **Scores / Ratings / Evidence / Method** preserves original Good/Easy success rate/goal status/editor and direct overlapping memberships. Prefer bounded topic pages to horizontal chart scrolling so full names and card geometry remain clear.

Signals is a paginated linked problem list without meaningless Chart/Table control. Details **Problems / Scope / Method** preserves exact flags. Backlog Overview shows current overdue count and fitted daily plot; Details **Days / Summary / Method** includes peak, known/unknown days and strict threshold accounting. Change `withinWatchDays` to count `<5` and `aboveWatchDays` to count `>=5`, and label that meaning explicitly. Upcoming Overview uses width-filling fixed-date bars; Details **Days / Summary / Method** retains all exact values. Both use their supplied independent frames, not selected historical labels.

- [ ] **Step 3: Run GREEN, review, and commit.**

Run all new/focused Topic/Signals/workload/threshold suites and typecheck. Fresh specification then quality review. Root commits `feat: compact topic signals and workload analytics`.

## Completion Boundary

All ten adapters are complete when all underlying measurements/actions are reachable, their focused tests pass, and independent reviews approve. Continue to page assembly/browser proof. The obsolete full-width wrappers are not used by the final page; delete only confirmed unused presentation after preserving meaningful regressions. Required full gates and human extension proof are recorded in the assembly plan.
