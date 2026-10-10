# Analytics Compact Card Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate all ten approved Analytics cards into fixed, inspectable production components while preserving their exact evidence and actions.

**Architecture:** Feature-owned adapters under `components/cards` use the reviewed compact panel, exact field groups, geometry, and domain presentation models. Extract existing plot renderers instead of nesting expanding legacy views. Each adapter owns only its local controls and bounded presentation; Settings retains mutations and the background retains calculations.

**Tech Stack:** Existing React/Recharts, Terra Compact, Vitest/Testing Library. No new dependency, database shape, permission or sync behavior.

---

Status: Tasks 1–4 are implemented and independently specification/quality reviewed. Continue page assembly and final production proof after these reviewed adapters. Root owns commits; run each task through specification review before quality review. Do not ask the user to reapprove the already accepted card design.

## Shared Adapter Contract

Adapters accept typed supplied views, their correct frame, and a target save callback where relevant. They render one compact `AnalyticsChartPanel`, never another panel inside its body. Header toggles Details/Overview; Overview has hero plus fitted chart, Details replaces hero/plot space with section controls and bounded exact fields. Every original field, target and action remains reachable. Keep local controls and failed target drafts alive across mode changes. Tooltips retain existing inspector behavior and truthful new metrics; broader tooltip redesign is deferred.

```tsx
<AnalyticsChartPanel
  id="performance"
  title="Performance"
  description="First attempts · weighted by difficulty"
  mode={mode}
  headerAction={
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

Adapters own report-context page resets even when Details tables are unmounted. Test paging, hiding Details, receiving a fresh as-of/frame, and reopening at the first page. Keep equivalent rerenders on the current page. Persistent goal controllers must also guard ownership: a pending save completing after another goal is selected may reset its own successful draft, but must not close the active goal or steal focus.

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
- Modify: `src/styles/analytics.css` only for compact Performance/Time presentation.
- Modify: `src/features/analytics/components/analytics-target-editor.tsx` and `.test.tsx` only for the independently reviewed stale-save visibility/focus race.
- Test: existing combined/new/problem-solving focused suites.

- [x] **Step 1: Add failing adapter capability tests.**

Performance fixture uses the reviewed 13,210 / 195 acceptance case: hero rounds only for display to 68/100, exact Details remains 67.743589…. Test new/follow-up reachability, Unknown influence and invalid exclusions, inactive holds, no arbitrary score grade/target, stable shell, and all rating/difficulty/Mix/interval pages. Verify the original pooled two-rate chart includes Unknown, raw difficulty Trend/Compare and rate switches remain reachable, all four saved goals map to their original metrics, and changing Performance's cohort never changes Time's local cohort.

Time defaults to all timed assessments/New problems. Test three normalized horizontal median bars with under/over/exact target labels, 150% uncapped ratio, amber only on the excess after 100%, no Unknown target, coverage rather than pooled median hero, missing durations unavailable, successful subset, independent cohort, minutes/% units, difficulty visibility, Trend/Compare, quartiles and exact field groups.

- [x] **Step 2: Run RED and implement Performance's compact sections.**

Run the two new suites. Expected: missing adapters fail. Use `buildPerformancePresentation` and cumulative renderer for Overview. Show a compact cohort selector and no simultaneous Hard+Good+Easy/Good+Easy labels there.

Details starts with **Ratings / Difficulty / Mix / Intervals**, preserving:

- Ratings: original rating, friendly explanation, count, fixed points, weighted influence.
- Difficulty: all four classifications, raw/valid/invalid counts, influence, score, actual prior counts/delta when supported.
- Mix: assessment share and positive recorded-time share, including Unclassified.
- Intervals: raw score/new count and cumulative score/count/weighted points/units, last update and in-progress context.

Compact secondary sections expose original **Pooled outcomes / Difficulty outcomes / Goals / Method** rather than adding overview cards. Extract the existing plot pieces and make their controls controlled; keep unchanged pure calculations/inspection and expose selected cohort instead of the combined renderer's hardcoded New problems. Raw percentage goal references belong only on those raw plots. Method explains fixed rubric, current difficulty, first-retained-record limits and selected-period pooling in bounded pages.

- [x] **Step 3: Implement Time's independent compact sections.**

Overview uses full-period medians from `buildTimeTargetPresentation`; the horizontal width domain includes at least 100 and the largest ratio. Labels give raw time/target and signed difference without relying on color. Split a bar at 100 only when it exceeds target. Keep known zero versus missing timing truthful.

Details **Trend / Compare / Intervals / Method** keeps its local timing subset, units, cohort, difficulty visibility and original distributions. Exact groups expose median/Q1/Q3, raw/valid/invalid counts, eligible/timed counts, recorded seconds and current targets. Explain saved assessment duration/current allowances and Strict Timing without changing assessment policy.

- [x] **Step 4: Run GREEN, review, and commit.**

Run new adapter and existing outcome/time suites plus typecheck. Expected: all pass. Fresh specification then quality review. Root commits `feat: add compact performance and target time cards`.

### Task 1 Execution Record

Implemented against `846e9996` in ten source/test/CSS files. Original New Problem view/model source needed no edit; the existing New Problem regression suite gained the absent-prior summary test. Performance and Time each use one compact panel with independent controls, exact field pages and original advanced plots. Time leads with the timed count and eligible coverage; normalized bars use green bases and amber excess only. Restored the existing theme owner classes so SVG strokes/fills resolve correctly.

Specification review found and fixed four exact-evidence gaps: absent prior counts versus measured zero; raw Compare tooltip/legacy summary absent-prior copy; prior Time raw/valid/invalid counts including Unclassified; and reachable raw Compare context/as-of/timezone. Quality review found and fixed stale successful goal completion closing/focusing another active editor, and hidden-table report refresh failing to reset pagination. Three deferred-save and eight hidden-refresh cases proved RED then GREEN; equivalent report rerenders preserve the current page. Both independent re-reviews passed without remaining findings.

Final implementer validation passed 133 tests in fourteen suites, typecheck, touched ESLint/Prettier and whitespace. Exact commands:

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/performance-card.test.tsx src/features/analytics/components/cards/time-target-card.test.tsx src/features/analytics/components/combined-problem-outcomes-view.test.tsx src/features/analytics/components/new-problem-success-view.test.tsx src/features/analytics/components/charts/historical-chart.test.tsx src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/charts/cumulative-trend.test.tsx src/features/analytics/components/analytics-target-editor.test.tsx src/features/analytics/components/analytics-exact-table.test.tsx src/features/analytics/components/analytics-card-controls.test.tsx src/features/analytics/components/analytics-chart-panel.test.tsx src/features/analytics/domain/performance-presentation.test.ts src/features/analytics/domain/time-target-presentation.test.ts src/features/analytics/domain/cumulative-trend-geometry.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run typecheck
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx eslint src/features/analytics/components/cards/performance-card.tsx src/features/analytics/components/cards/performance-card.test.tsx src/features/analytics/components/cards/time-target-card.tsx src/features/analytics/components/cards/time-target-card.test.tsx src/features/analytics/components/combined-problem-outcomes-view.tsx src/features/analytics/components/problem-solving-charts.tsx src/features/analytics/components/new-problem-success-view.test.tsx src/features/analytics/components/analytics-target-editor.tsx src/features/analytics/components/analytics-target-editor.test.tsx
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx prettier --check src/features/analytics/components/cards/performance-card.tsx src/features/analytics/components/cards/performance-card.test.tsx src/features/analytics/components/cards/time-target-card.tsx src/features/analytics/components/cards/time-target-card.test.tsx src/features/analytics/components/combined-problem-outcomes-view.tsx src/features/analytics/components/problem-solving-charts.tsx src/features/analytics/components/new-problem-success-view.test.tsx src/features/analytics/components/analytics-target-editor.tsx src/features/analytics/components/analytics-target-editor.test.tsx src/styles/analytics.css
rtk git diff --check
```

Final bounded specification re-review ran the two cards, target editor, exact-table and chart-panel suites: 55 tests/five suites passed. Final quality re-review ran the two cards, target editor and combined/new outcome suites: 53 tests/five suites passed. The first quality scan also passed architecture boundaries with 124 tests/twelve suites before the eleven new race/reset cases. All reviewers independently checked the source; both quality bugs were reproduced and then repaired in DOM probes.

Root production-component CUA checkpoint verified fixed Overview/Details geometry at desktop, the two-column boundary and phone width; all exact fields/last pages remain reachable. Post-SPEC Time Compare traversal checked all27 groups and four classification pages at measured320px CSS width without overflow. Post-QUALITY browser pending save First-attempt95 → edit Recall80 → resolve earlier save preserved the Recall draft/Goals surface and did not steal header focus. Current IAB override numbers are physical pixels; the final proof must verify actual CSS dimensions after each override. Draft proof journal/screenshots remain outside the repository; full integrated proof follows assembly.

Skipped at this phase: `npm run lint`, `npm run format`, `npm run check`, `npm run build` are deferred to root's final assembled-source gates; `npm run db:generate` is not applicable because no persisted shape changed; `npm run zip` is not needed because no packaging/release action was requested. Final integrated browser proof and human installed-extension happy/edge smoke remain pending. The agent thread cap requires reusing the three registered implementer/spec/quality actors with bounded new briefs; review authors remain independent.

## Task 2: Recall, Practice, And Memory

**Files:**

- Create: `src/features/analytics/components/cards/recall-card.tsx` and `.test.tsx`
- Create: `src/features/analytics/components/cards/practice-card.tsx` and `.test.tsx`
- Create: `src/features/analytics/components/cards/memory-strength-card.tsx` and `.test.tsx`
- Modify: `src/features/analytics/components/recall-ratings-views.tsx`
- Modify: `src/features/analytics/components/practice-ratings-view.tsx`
- Modify: `src/features/analytics/components/memory-practice-views.tsx`
- Modify: `src/styles/analytics.css` only for compact Recall/Practice/Memory presentation.
- Test: existing focused Recall/Practice/Memory suites.

- [x] **Step 1: Add failing compact population and exact-parity tests.**

Recall fixture: global All time raw history spans 612 days but eligible pairs span Sep9–Oct5; card uses its supplied paired frame, 52 pairs/48 recalled, estimate sum46.16 and 9 three-day intervals. Observed/predicted share the same pair count and visible dates; switches hide matching curve/marks/inspection values together, retain domain and target, both-hidden is truthful, and inactive held rows show no new pairs. Test a long sparse paired history separately so it is not reduced to recent dates.

Practice preserves original interval union, known zero volume, unavailable rating counterpart, independent count/percentage scales and Reviews switch. Keep distinct Practice readiness and rating-composition readiness. Memory preserves measured singleton/zero, eligible count, median/Q1/Q3 and median change; quartiles stay absent below four samples.

- [x] **Step 2: Run RED and implement fitted adapters.**

Run the three new suites. Expected: new adapters fail. Recall Overview uses cumulative paired model, existing goal mutation and two series. Details **Summary / Intervals / Method**, with interval/cumulative field groups, pair counts, reconstructed provenance, difference, evidence, last update and report dates. Goals is a fitting dedicated surface.

Practice reuses original rating stacks/completed-review line in the measured chart body. Tighten bars to use their available interval width without changing the date spacing. Details **Ratings / Intervals / Comparison / Method**; the old table's fourteen headers (Bucket plus thirteen evidence fields) become exact Ratings/Counts/Outcomes/Evidence groups. Preserve Completed reviews, all four rating counts, Good + Easy, Review Success, its target, Valid ratings, Challenging reviews, both Practice/Ratings evidence and Period context. Retain Good/Easy aspiration, comparison readiness and association-only explanation.

Memory uses original median/whisker rendering at remaining height. Details **Intervals / Evidence / Method**, preserving all original fields and full context. Do not smooth memory medians into cumulative values.

- [x] **Step 3: Run GREEN, review, and commit.**

Run new and existing Recall/Practice/Memory focused suites plus chart/target regressions and typecheck. Fresh specification then quality review. Root commits `feat: fit recall practice and memory analytics cards`.

### Task 2 Execution Record

Implemented the three fitting adapters and bounded legacy plot extractions against `d2381fa8`. Recall uses its paired calendar and identical observed/FSRS population; Practice keeps original interval union, ratings/count scales and Reviews control; Memory shares the original supported-edge window across chart, inspection and Details. Exact original evidence, readiness, goals and report context remain reachable through bounded sections and field groups.

Independent specification review found three gaps and the same implementer repaired them with targeted RED→GREEN tests: visible paired dates/grouping, the inactive-span key/actual last eligible interval, and Memory Details sharing supported-edge trimming. Quality review then reproduced a valid 100%/100% Recall hero overflow at 320px and wrapped coarse-control Practice legend overflow. Repairs use the approved primary Recall headline/secondary FSRS context and measured legend height plus its 8px gap. Effective optional frame metadata is consistent; compact friendly Practice labels retain original ratings in native inspection/Details and legacy defaults. Both final independent re-reviews passed: SPEC 36 tests/four suites, QUALITY 42 tests/five suites. The earlier full quality scan passed 107 tests/thirteen suites including architecture boundaries.

Final implementer checks passed 95 tests/twelve suites (41 new adapter tests), typecheck, touched ESLint, Prettier and whitespace. Exact final commands, all rerun after repairs:

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/recall-card.test.tsx src/features/analytics/components/cards/practice-card.test.tsx src/features/analytics/components/cards/memory-strength-card.test.tsx src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/practice-ratings-view.test.tsx src/features/analytics/components/practice-ratings-model.test.ts src/features/analytics/components/memory-practice-views.test.tsx src/features/analytics/domain/cumulative-recall-presentation.test.ts src/features/analytics/components/charts/historical-chart.test.tsx src/features/analytics/components/charts/cumulative-trend.test.tsx src/features/analytics/components/analytics-target-editor.test.tsx src/features/analytics/components/analytics-exact-table.test.tsx --maxWorkers=1 > /private/tmp/cognipace-task2-tests.log 2>&1
```

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run typecheck
```

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx eslint src/features/analytics/components/cards/recall-card.tsx src/features/analytics/components/cards/recall-card.test.tsx src/features/analytics/components/cards/practice-card.tsx src/features/analytics/components/cards/practice-card.test.tsx src/features/analytics/components/cards/memory-strength-card.tsx src/features/analytics/components/cards/memory-strength-card.test.tsx src/features/analytics/components/recall-ratings-views.tsx src/features/analytics/components/practice-ratings-view.tsx src/features/analytics/components/practice-ratings-view.test.tsx src/features/analytics/components/memory-practice-views.tsx
```

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx prettier --check src/features/analytics/components/cards/recall-card.tsx src/features/analytics/components/cards/recall-card.test.tsx src/features/analytics/components/cards/practice-card.tsx src/features/analytics/components/cards/practice-card.test.tsx src/features/analytics/components/cards/memory-strength-card.tsx src/features/analytics/components/cards/memory-strength-card.test.tsx src/features/analytics/components/recall-ratings-views.tsx src/features/analytics/components/practice-ratings-view.tsx src/features/analytics/components/practice-ratings-view.test.tsx src/features/analytics/components/memory-practice-views.tsx src/styles/analytics.css
```

```sh
rtk git diff --check
```

Root CUA component proof checked desktop 464px and stacked 512px cards, all three Method pages, all 33 Practice and 24 Recall narrow interval field groups, empty/unavailable and genuinely old paired history. Post-repair valid SQLite/FSRS 12/12 pairs with both values 100% at actual 320px gives a 254×64px hero with identical client/scroll dimensions and no horizontal document overflow. Practice's actual body/content are 234px at desktop, 240px at medium and 320px, including a disposable CSS fixture mirroring the existing coarse-pointer Reviews minimum; this is controlled geometry proof, not native-device emulation. Pending Recall save while another goal is edited preserves the active draft and focus. Final integrated page/font proof follows assembly.

Skipped full `npm run lint`, `npm run format`, `npm run check`, `npm run build`: root owns final assembled-source gates. Standalone `npm run db:check` is deferred to the full check; `npm run db:generate` is inapplicable without persisted schema changes; `npm run zip` is outside this implementation request. Human installed-extension happy/edge smoke with screenshot/recording proof remains required before PR review/merge. October 10 execution used fresh independent reviewers, unlike the earlier thread-cap reuse. No application phase ran concurrently with another application implementer. The Task 4 file list now names the actual Signals/threshold owners; this corrects ownership without changing the approved design.

## Task 3: Complete Interactive Retention

**Files:**

- Create: `src/features/analytics/components/cards/retention-card.tsx` and `.test.tsx`
- Modify: `src/features/analytics/components/retention-map-chart.tsx`
- Modify: `src/features/analytics/components/current-state-views.tsx`
- Test: `src/features/analytics/components/current-state-views.test.tsx`
- Test: existing retention chart/model suites.
- Modify: `src/styles/analytics.css` only scoped retention presentation.

- [x] **Step 1: Add failing full-cohort compact interaction tests.**

Reuse the existing 31-eligible-row fixture and exact overlap/gesture tests. Assert every filtered row remains plotted without sample cap/jitter, status totals/domain stay full-cohort, keyboard End reaches final row after zoom through `revealRow`, all overlap candidates reachable through bounded pages, pin/close/return-to-map focus, filter removal of pin, double-click previous-pin restoration, Escape gesture cancellation before dismissal and trailing drag-click suppression. All modes share the same outer geometry.

- [x] **Step 2: Run RED and extract controlled interaction state.**

Run new retention and current-state suites. Expected: compact adapter assertions fail. Keep existing viewport/model math and gestures. Lift only viewport, active/hover slug, selection, candidate page and problem-section control so the compact card can reclaim the hero/plot space when selection is pinned. Scatter still receives the complete filtered row array.

Overview keeps **All / Below target**, full status counts, references, zoom/reset, reserved hover preview and native inspector. Details **Summary / Problems / Method** exposes all 11 exact original problem fields in fitting groups. Selection paginates three wide/two narrow candidates and splits pinned fields into **Recall** (status, estimate, target, gap), **Schedule** (durability, last review, due), **State** (FSRS difficulty, lapses), with rank and canonical problem link. Return to map keeps viewport/selection; Close clears selection and restores inspector focus. Remove internal candidate scrolling and variable below-plot detail appendices.

- [x] **Step 3: Run GREEN, review, and commit.**

Run full retention/current-state focused suites and typecheck. Fresh specification then quality review. Root commits `feat: fit complete retention inspection into analytics cards`.

### Task 3 Execution Record

October 10: Retention adapter and minimal controller/canvas extraction completed. Complete eligible/filter cohorts, full-cohort domains/counts, all 11 fields plus Region/context, full canonical candidate/problem titles and local gestures remain. Selection, candidate paging and exact Details use one fixed shell. Pointer presentation is delayed up to 1,000ms while logical selection updates immediately, preserving real native fast/slower double-click targets; keyboard/touch selections remain immediate. The fitting hover preview uses Rank/status/estimate/total durability and retains full native title announcement plus visibly linked selection/Problems titles.

Root production-component CUA proof: 320px Overview body240/footer64, selected/Details body314, all width254 without overflow; all35 nearby-candidate pages and all150 Problems pages traversed, including long titles. All eleven narrow field groups, three Method pages and all selected groups reachable; Close restores inspector focus. Desktop1360 card464px in both modes with body234/306/footer44. Native double-click reset140zoomed marks to150full and retained previous candidate pin. Below-target34rows preserves150cohort statuses/domain. Light controlled coarse CSS fixture44px footer controls and long selection fit; emptydark320 fits honest zeroeligible state. This fixture is not native device emulation. Wheel attempt did not yield an observable change, so native wheel is not claimed passed; handler regressions passed. Actual multitouch/Shift-pan and installed-extension smoke remain pending.

## Tests and exact final successful commands

All commands used pinned Node24.20.0/npm11.19.0 via PATH and RTK prefix.

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" DEBUG_PRINT_LIMIT=1000 npm run test -- src/features/analytics/components/cards/retention-card.test.tsx src/features/analytics/components/current-state-views.test.tsx src/features/analytics/components/retention-map-model.test.ts src/features/analytics/components/analytics-chart-panel.test.tsx src/features/analytics/components/analytics-exact-table.test.tsx src/features/analytics/components/analytics-card-controls.test.tsx src/features/analytics/domain/current-state-presentation.test.ts
```

PASS: 7 files / 46 tests, final run17:20:27. Compact suite has16 tests:31+150 complete cohorts; full-filter coordinates/counts; zoom→End; all17 candidate traversal/canonical links; all field header union; narrow full long-title fields; semantic hidden reset/equivalent rerender; hidden geometry reset; real mounted650ms click series with no-prior/prior pin; remounted nonpassive wheel; Escape cancellation; blur/resize/pointercancel/lostcapture cancellation; thin trailing click; remounted touch pinch/remaining-touch pan; delayed callback invalidations; known zero versus no eligible; refreshed empty focus.

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run typecheck
```

PASS: WXT prepare and TypeScript, final run17:20:27, exit0.

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx eslint src/features/analytics/components/cards/retention-card.tsx src/features/analytics/components/cards/retention-card.test.tsx src/features/analytics/components/retention-map-chart.tsx src/features/analytics/components/current-state-views.tsx
```

PASS: final run after focus-request counter fix, exit0, no output.

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx prettier --write src/features/analytics/components/cards/retention-card.tsx src/features/analytics/components/cards/retention-card.test.tsx src/features/analytics/components/retention-map-chart.tsx src/features/analytics/components/current-state-views.tsx src/styles/analytics.css
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx prettier --check src/features/analytics/components/cards/retention-card.tsx src/features/analytics/components/cards/retention-card.test.tsx src/features/analytics/components/retention-map-chart.tsx src/features/analytics/components/current-state-views.tsx src/styles/analytics.css
rtk git diff --check
rtk git status --short
```

PASS: final formatting/diff check17:20:27; only five intended files changed/new. Earlier focused6-file GREEN runs progressed30→39→40 passing tests; two-file retention/current-state22 passed after delayed-cancel fix; card-only10 passed after hidden width repair.


Independent SPEC PASS:4 suites32tests; QUALITY PASS:6 suites51tests and whitespace check. No actionable findings. Exact independent commands:

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/retention-card.test.tsx src/features/analytics/components/current-state-views.test.tsx src/features/analytics/components/retention-map-model.test.ts src/features/analytics/domain/current-state-presentation.test.ts --maxWorkers=1 > /private/tmp/retention-spec-review-tests.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" DEBUG_PRINT_LIMIT=1000 npm run test -- src/features/analytics/components/cards/retention-card.test.tsx src/features/analytics/components/current-state-views.test.tsx src/features/analytics/components/retention-map-model.test.ts src/features/analytics/components/analytics-exact-table.test.tsx src/features/analytics/components/analytics-card-controls.test.tsx src/testing/architecture-boundaries.test.ts --maxWorkers=1
rtk git diff --check
```

Skipped full `npm run lint`, `npm run format`, `npm run check`, `npm run build`: final assembled-source gates remain root-owned. Standalone `npm run db:check` deferred to full check; `npm run db:generate` inapplicable without schema changes; `npm run zip` outside requested implementation. Human installed-extension happy/edge smoke with visual proof remains required before PR review/merge; actual unsupported device gesture checks are pending, not N/A.

## Task 4: Topics, Signals, And Workload

**Files:**

- Create: `src/features/analytics/components/cards/topics-card.tsx` and `.test.tsx`
- Create: `src/features/analytics/components/cards/memory-signals-card.tsx` and `.test.tsx`
- Create: `src/features/analytics/components/cards/backlog-card.tsx` and `.test.tsx`
- Create: `src/features/analytics/components/cards/upcoming-card.tsx` and `.test.tsx`
- Modify: `src/features/analytics/components/historical-views.tsx` only if extracting the existing Topic plot/inspection pieces; this is the current Topic owner.
- Modify: `src/features/analytics/components/current-state-views.tsx` only if extracting existing Memory Signals list/inspection pieces; this is the current Signals owner.
- Test: `src/features/analytics/components/current-state-views.test.tsx` for Signals preservation.
- Modify: `src/features/analytics/domain/workload-presentation.ts` and `.test.ts` for strict watch counts.
- Modify: `src/features/analytics/components/workload-views.tsx` and `.test.tsx` for the existing threshold segment model, markers, inspection and copy.
- Modify: `src/styles/analytics.css` only for compact Topics/Signals/workload presentation.
- Test: `historical-views.test.tsx`, `current-state-views.test.tsx`, `workload-views.test.tsx`, and `domain/workload-presentation.test.ts` plus the existing weighted Topic/domain/contract suites.

- [x] **Step 1: Add failing exact-count and threshold tests.**

Topics must show every qualifying topic through paged horizontal bars, full names, reviewed weighted ordering and sixteen-cell breakdown; low-evidence topics retain their independent list/additional count. Signals retains all returned flags/canonical links/rank and total qualifying versus top25 returned count, three rows wide/two narrow with page clamp. Backlog fixtures cross 5 in both directions, include a point at exactly5, known zero and unknown days. Green is strictly below5; amber at5 and above; crossings split exactly and create no measured marker. Unknown days break segments. Upcoming keeps exact fixed14 local dates and Due/Overdue/Total/Today semantics.

- [x] **Step 2: Run RED and implement the four adapters.**

Run new and existing Topic/workload/current-state suites. Expected: new compact assertions fail. Topics Overview uses shared weighted helper, no score target. Details **Scores / Ratings / Evidence / Method** preserves original Good/Easy success rate/goal status/editor and direct overlapping memberships. Prefer bounded topic pages to horizontal chart scrolling so full names and card geometry remain clear.

Signals is a paginated linked problem list without meaningless Chart/Table control. Details **Problems / Scope / Method** preserves exact flags. Backlog Overview shows current overdue count and fitted daily plot; Details **Days / Summary / Method** includes peak, known/unknown days and strict threshold accounting. Change `withinWatchDays` to count `<5` and `aboveWatchDays` to count `>=5`, and label that meaning explicitly. Upcoming Overview uses width-filling fixed-date bars; Details **Days / Summary / Method** retains all exact values. Both use their supplied independent frames, not selected historical labels.

- [x] **Step 3: Run GREEN, review, and commit.**

Run all new/focused Topic/Signals/workload/threshold suites and typecheck. Fresh specification then quality review. Root commits `feat: compact topic signals and workload analytics`.

## Completion Boundary

All ten adapters are complete when all underlying measurements/actions are reachable, their focused tests pass, and independent reviews approve. Continue to page assembly/browser proof. The obsolete full-width wrappers are not used by the final page; delete only confirmed unused presentation after preserving meaningful regressions. Required full gates and human extension proof are recorded in the assembly plan.


## Task 4 October 10 execution record

All four production adapters are implemented. Independent SPEC review found a hidden Scope/Method page reset gap in Signals; the original actor repaired it and six regressions passed. Independent QUALITY review found stale Topics inspection after footer focus left the card and an inclusive/exclusive Method date-label mismatch; the original actor repaired both, including the adjacent empty-bucket positive-timezone fallback. Fresh re-reviews passed with no unresolved findings. The 13-file freeze hashes matched at both final reviews. No other application implementer ran concurrently.

The final original focused run passed 270 tests in 11 suites; subsequent affected checks passed 18 Signals/current-state tests and 17 Topics/historical tests after ten meaningful regression additions. These are separate runs, not a claim that 280 were rerun together. Independent SPEC reproduced its two failing cases and then passed both; QUALITY passed three independent regressions plus 33 affected/architecture tests after repair. Required final assembled-source gates remain pending.

Root CUA production-component proof used Zod-validated actual SQLite/service fixtures, regenerated successfully across 15 scenarios and six range/timezone contexts. At 320px all four cards fit the 512px shell in Overview and Details: long Topics all 33 Ratings field groups including sixteen matrix cells, all sixteen Evidence fields with five returned low-evidence topics plus one additional, all 25 returned Signals and a full long three-reason title, workload all exact fields/summary/method/final dates. Three native Topics inspection pages retain their pin; Tab out dismisses it; a 95% goal draft survives hiding/reopening. Included Method dates now end October 5, not exclusive October 6. Strict green-below-five/amber-at-five segments and dots, unknown breaks/last-day unavailability, all-unknown inspection and measured zero forecast were checked. At 1360px all ten adapter Overview shells remain 464px; these four Details remain the same height. Final bundled-font/page/state proof remains pending.

Independent final commands:

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- --config /private/tmp/task4-spec-vitest.config.mts --maxWorkers=1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/memory-signals-card.test.tsx src/features/analytics/components/current-state-views.test.tsx --maxWorkers=1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- --config /private/tmp/task4-quality-review.config.mts --maxWorkers=1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx src/features/analytics/components/historical-views.test.tsx src/testing/architecture-boundaries.test.ts --maxWorkers=1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" node node_modules/vitest/vitest.mjs run --config /private/tmp/cognipace-analytics-refactor-proof/fixture.config.ts
rtk proxy shasum -a 256 -c /private/tmp/task4-source-freeze.sha256
rtk git diff --check
```

The implementer commands and explicitly skipped checks below describe this bounded adapter phase; final assembly must run required full gates. Human installed-extension happy-path/edge-case realtime smoke with screenshot/recording proof remains pending and required before PR review/merge.

## Final commands run and results

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx src/features/analytics/components/cards/memory-signals-card.test.tsx src/features/analytics/components/cards/backlog-card.test.tsx src/features/analytics/components/cards/upcoming-card.test.tsx src/features/analytics/components/historical-views.test.tsx src/features/analytics/components/current-state-views.test.tsx src/features/analytics/components/workload-views.test.tsx src/features/analytics/domain/workload-presentation.test.ts src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/domain/performance-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts --maxWorkers=1 > /private/tmp/task4-final-focused.log 2>&1
```

PASS:11 suites270 tests, final run duration14.61s.

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run typecheck > /private/tmp/task4-final-typecheck.log 2>&1
```

PASS: WXT prepare and tsc, exit0.

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx eslint src/features/analytics/components/cards/topics-card.tsx src/features/analytics/components/cards/topics-card.test.tsx src/features/analytics/components/cards/memory-signals-card.tsx src/features/analytics/components/cards/memory-signals-card.test.tsx src/features/analytics/components/cards/backlog-card.tsx src/features/analytics/components/cards/backlog-card.test.tsx src/features/analytics/components/cards/upcoming-card.tsx src/features/analytics/components/cards/upcoming-card.test.tsx src/features/analytics/components/workload-views.tsx src/features/analytics/components/workload-views.test.tsx src/features/analytics/domain/workload-presentation.ts src/features/analytics/domain/workload-presentation.test.ts > /private/tmp/task4-final-eslint.log 2>&1
```

PASS: touched source/tests lint exit0, no output.

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx prettier --check src/features/analytics/components/cards/topics-card.tsx src/features/analytics/components/cards/topics-card.test.tsx src/features/analytics/components/cards/memory-signals-card.tsx src/features/analytics/components/cards/memory-signals-card.test.tsx src/features/analytics/components/cards/backlog-card.tsx src/features/analytics/components/cards/backlog-card.test.tsx src/features/analytics/components/cards/upcoming-card.tsx src/features/analytics/components/cards/upcoming-card.test.tsx src/features/analytics/components/workload-views.tsx src/features/analytics/components/workload-views.test.tsx src/features/analytics/domain/workload-presentation.ts src/features/analytics/domain/workload-presentation.test.ts src/styles/analytics.css > /private/tmp/task4-final-format.log 2>&1
rtk git diff --check
rtk git status --short
```

PASS: all13 matched files formatted, clean whitespace, exactly13 intended changed/new files. Formatting writes were limited to this same file list.

## Commands skipped and remaining validation

- `npm run lint`, `npm run check`, `npm run build`: deliberately root-owned after final assembly; no parallel full WXT gates.
- `npm run format`: repository-wide formatting is outside this bounded task; all touched files have final Prettier check.
- `npm run db:check`: no database or persisted behavior changes; applicable full check deferred to root.
- `npm run db:generate`: no schema/migration change.
- `npm run zip`: outside the requested adapter phase.
- Human installed-extension happy-path/edge-case realtime smoke and screenshot/recording proof remain required before PR review/merge. They are pending, not N/A. Parent root is preparing actual-service SQLite fixtures and CUA proof; the implementer performed no browser interactions.

Required human/parent follow-through: desktop and320px/zoom full names plus long3flag Signals; all qualifying Topics and low-evidence additional count, all16 cells, goal draft/save/error/Cancel; Signals rank25/canonical links/returned-versus-qualifying; Backlog4→6,6→4,exact5flat/markers,known0/singleton/trailingunknown/allunknown, all30dates; Upcoming14dates/zero schedule/mixed/tiny positive segments/only prior-date overdue, all count/context fields. Root reported earlier successful long Topic3inspection-page native click proof and bounded Method/Scope proof; final15fixture reproof and fresh SPEC/QUALITY are still parent-owned at this handoff.

Suggested commit: `feat: compact topic signals and workload analytics`. Product effect includes the approved strict amber-at-five boundary. Rollback is the13-file Task4 diff; runtime/persistence transport remains compatible.

## Additional exact focused commands

Each RED result above is intentionally failed behavior evidence; GREEN runs below passed unless listed as a correction above.

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/workload-views.test.tsx src/features/analytics/domain/workload-presentation.test.ts --maxWorkers=1 > /private/tmp/task4-threshold-red.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx src/features/analytics/components/cards/memory-signals-card.test.tsx src/features/analytics/components/cards/backlog-card.test.tsx src/features/analytics/components/cards/upcoming-card.test.tsx --maxWorkers=1 > /private/tmp/task4-cards-red.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx --maxWorkers=1 > /private/tmp/task4-topics-green.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx --maxWorkers=1 > /private/tmp/task4-topic-inspection-red.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx --maxWorkers=1 > /private/tmp/task4-topic-inspection-green.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx -t "keeps pinned" --maxWorkers=1 > /private/tmp/task4-topic-footer-red.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx --maxWorkers=1 > /private/tmp/task4-topic-footer-green.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/backlog-card.test.tsx -t "all-unknown" --maxWorkers=1 > /private/tmp/task4-unknown-red.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/backlog-card.test.tsx src/features/analytics/components/cards/upcoming-card.test.tsx src/features/analytics/components/workload-views.test.tsx --maxWorkers=1 > /private/tmp/task4-workload-fit-green.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx -t "original seven" --maxWorkers=1 > /private/tmp/task4-topic-id-red.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx --maxWorkers=1 > /private/tmp/task4-topic-id-green.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx src/features/analytics/components/cards/memory-signals-card.test.tsx --maxWorkers=1 > /private/tmp/task4-final-copy-focused.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx eslint src/features/analytics/components/cards/topics-card.tsx src/features/analytics/components/cards/topics-card.test.tsx src/features/analytics/components/cards/memory-signals-card.tsx src/features/analytics/components/cards/memory-signals-card.test.tsx > /private/tmp/task4-final-copy-eslint.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx prettier --check src/features/analytics/components/cards/topics-card.tsx src/features/analytics/components/cards/topics-card.test.tsx src/features/analytics/components/cards/memory-signals-card.tsx src/features/analytics/components/cards/memory-signals-card.test.tsx > /private/tmp/task4-final-copy-format.log 2>&1
```

The full11suite invocation above was also run earlier to `/private/tmp/task4-green.log`; corrected failures are recorded above. The six-card/workload/domain subset was run to `/private/tmp/task4-cards-green.log` (36 passed). The final workload-fit invocation first encountered the temporary JSX parse error, then was rerun GREEN24 after correction; logs now show the final result. Full touched `npx eslint` was first run to `/private/tmp/task4-eslint.log` and corrected one unnecessary test cast. `npm run typecheck` first ran to `/private/tmp/task4-typecheck.log`, then reran GREEN after test fixture/import correction.

## Fresh SPEC finding repair and refreeze

Fresh read-only SPEC found P2: hidden Memory Signals Scope/Method copy pages did not reset when current report context changed. This reopened the freeze. Same implementer moved copyPage into the existing keyed pagination state. As-of/timezone/returned row identity changes reset both problem and copy pages even while Overview hides Details; equivalent reports with newly allocated rows/reasons retain both pages. No API, geometry, content or ownership change.

Six new parameterized component regressions cover Scope and Method under changed asOf, timezone and row slug identity, each proving equivalent hidden rerender retention before changed-context reset. `/private/tmp/task4-signals-hidden-copy-red.log`:6 expected failures,4 prior tests passed. GREEN focused MemorySignals/current-state suites:18 tests passed. Previous final Task4 full11suite270 pass remains valid for unchanged owners; the six added tests give276 Task4 focused assertions in total. Full gates still root-owned; no new commits/docs/page assembly.

Exact repair validation commands:

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/memory-signals-card.test.tsx --maxWorkers=1 > /private/tmp/task4-signals-hidden-copy-red.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/memory-signals-card.test.tsx src/features/analytics/components/current-state-views.test.tsx --maxWorkers=1 > /private/tmp/task4-signals-hidden-copy-green.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx eslint src/features/analytics/components/cards/memory-signals-card.tsx src/features/analytics/components/cards/memory-signals-card.test.tsx > /private/tmp/task4-signals-hidden-copy-eslint.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx prettier --write src/features/analytics/components/cards/memory-signals-card.tsx src/features/analytics/components/cards/memory-signals-card.test.tsx
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx prettier --check src/features/analytics/components/cards/memory-signals-card.tsx src/features/analytics/components/cards/memory-signals-card.test.tsx > /private/tmp/task4-signals-hidden-copy-format.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run typecheck > /private/tmp/task4-signals-hidden-copy-typecheck.log 2>&1
rtk git diff --check
```

GREEN focused18; touched lint/format, WXT prepare/tsc and whitespace checks all exit0. Hash manifest refreshed. Root owns fresh reviewer reproof and final browser/gates/commit.

## Fresh QUALITY findings repair and refreeze

Fresh read-only QUALITY confirmed two P2s: native Topic inspection persisted after footer focus Tabbed outside the card, and Topics Method described the raw exclusive periodEnd as an included date. Same implementer reopened freeze and repaired only Topics card/test owner.

- Added a min-width-zero card-scope wrapper with bubbling boundary blur dismissal. All within-card mark/footer focus retains inspection; keyboard or touch pins and native footer clicks remain usable. Focus leaving from any descendant closes inspection, restores Overview pager and clears polite inspection content. It adds no visible copy, shell height, scrolling or API change.
- Method context now reuses the already-computed inclusive local `period`; exact ISO start and `Period end (exclusive)` remain separate exact fields. Parent noted the adjacent empty-bucket positive-timezone start fallback; both fallback dates now use the existing shared getAnalyticsDateKey helper in the report timezone, preferring supplied bucket date keys.
- `/private/tmp/task4-topics-quality-red.log`: three intended failures (keyboard/touch footer exit dismissal plus exclusive-end Method copy),7 prior tests passed. `/private/tmp/task4-topics-local-fallback-red.log`: intended Tokyo empty-bucket start-day failure. GREEN Topics/historical2suites17 passed, including old within-card paging, all16 cells, original7 fields and draft behavior.

Exact repair validation commands:

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx --maxWorkers=1 > /private/tmp/task4-topics-quality-red.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx -t "empty-bucket" --maxWorkers=1 > /private/tmp/task4-topics-local-fallback-red.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/components/cards/topics-card.test.tsx src/features/analytics/components/historical-views.test.tsx --maxWorkers=1 > /private/tmp/task4-topics-quality-green.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx prettier --write src/features/analytics/components/cards/topics-card.tsx src/features/analytics/components/cards/topics-card.test.tsx
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx eslint src/features/analytics/components/cards/topics-card.tsx src/features/analytics/components/cards/topics-card.test.tsx > /private/tmp/task4-topics-quality-eslint.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npx prettier --check src/features/analytics/components/cards/topics-card.tsx src/features/analytics/components/cards/topics-card.test.tsx > /private/tmp/task4-topics-quality-format.log 2>&1
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run typecheck > /private/tmp/task4-topics-quality-typecheck.log 2>&1
rtk git diff --check
```

Final affected focused17 tests, touched lint/format, WXT prepare/tsc and whitespace pass. Manifest refreshed. Since original270-task focused run,6 Signals and4 Topics tests were added:280 total assertions across the same11suites. Affected suites were rerun after each repair; full repo gates still root-owned and not run here. Fresh independent re-review/browser reproof remain parent-owned.
