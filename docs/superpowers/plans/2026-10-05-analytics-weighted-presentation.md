# Analytics Weighted Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supply shared, inspectable weighted Performance, cumulative paired Recall, weighted Topics, and normalized Time models for the approved compact page.

**Architecture:** Derive scores and period-to-date rows from existing exact difficulty/rating counts and paired Recall transport. Add the missing sixteen-cell topic matrix to the existing read producer and validator. Geometry is a separate pure function; held values remain explicitly distinct from new evidence. Both Overview and Details consume these feature-local models.

**Tech Stack:** TypeScript, existing Analytics types and scales, Zod, Vitest. No new dependency, persistence or assessment-policy change.

---

Status: Tasks 1 and 2 implemented and independently reviewed; Task 3 follows. The approved design is `docs/superpowers/specs/2026-10-05-analytics-performance-layout-design.md`; the final source is `assets/2026-10-05-analytics-range-summary-approved.html`. Root owns commits and independent reviews.

## Task 1: Shared Weighted And Cumulative Models

**Files:**

- Create: `src/features/analytics/domain/performance-presentation.ts`
- Create: `src/features/analytics/domain/performance-presentation.test.ts`
- Create: `src/features/analytics/domain/cumulative-recall-presentation.ts`
- Create: `src/features/analytics/domain/cumulative-recall-presentation.test.ts`
- Create: `src/features/analytics/domain/time-target-presentation.ts`
- Create: `src/features/analytics/domain/time-target-presentation.test.ts`

- [x] **Step 1: Write failing weighted-score tests using existing difficulty-stat fixtures.**

Use this fixed rubric:

```ts
export const performanceRatingPoints = {
  again: 0,
  hard: 50,
  good: 80,
  easy: 100,
} as const
export const performanceDifficultyInfluence = {
  easy: 1,
  medium: 2,
  hard: 3,
  unknown: 1,
} as const
```

Construct exact rating counts Easy `{again:1,hard:1,good:15,easy:8}`, Medium `{again:5,hard:10,good:30,easy:10}`, Hard `{again:5,hard:4,good:9,easy:2}`, Unknown all zero. Expect 100 valid ratings, 13,210 weighted points, 195 weighted units, and unrounded score `13210 / 195`. Add all Again (measured zero), all Good (80), empty (null), Unknown/Unclassified at influence 1, unequal bucket populations, invalid-only leading rows, internal/trailing empty rows, and a period-total invariant.

```ts
expect(result).toMatchObject({
  validRatings: 100,
  weightedPoints: 13210,
  weightedUnits: 195,
})
expect(result.score).toBe(13210 / 195)
expect(aggregatePerformance(allGoodCounts).score).toBe(80)
expect(aggregatePerformance(allAgainCounts).score).toBe(0)
expect(aggregatePerformance(emptyCounts).score).toBeNull()
```

- [x] **Step 2: Run RED and implement exact aggregation.**

Run `rtk npm run test -- src/features/analytics/domain/performance-presentation.test.ts`. Expected: missing exports or new score assertions fail. Export `aggregatePerformance` accepting four difficulty rating-count records, and `buildPerformancePresentation(cohort)` accepting existing `ProblemSolvingCohortView`. Keep a reusable count-only matrix type so Topics does not invent timing or outcome fields.

```ts
export interface PerformanceStats {
  score: number | null
  weightedPoints: number
  weightedUnits: number
  validRatings: number
  unclassifiedRatings: number
}
```

The implementation iterates difficulty keys and rating keys, adds `count * ratingPoints * influence` to points, `count * influence` to units, and actual counts to valid ratings. `score` is null iff units are zero, otherwise points/units. Do not round before display. New and follow-up use existing canonical raw cohorts. Retain recorded/invalid evidence in the presentation alongside these score fields from the supplied cohort/rows.

Each cumulative row preserves original raw interval fields and adds `interval`, `cumulative`, `state: 'unavailable' | 'updated' | 'held'`, and `lastUpdatedInterval` with original ID/start/end. Unavailable rows precede the first valid rating; updated rows add actual points/units; empty rows after evidence carry the previous total without adding observations. Final cumulative totals must equal aggregate cohort totals. Do not average interval scores. Keep a prior comparison only when both current and prior actual valid counts are at least ten and a real prior period exists; All time has no comparison.

- [x] **Step 3: Add paired Recall RED tests and implement the cumulative model.**

Run `rtk npm run test -- src/features/analytics/domain/cumulative-recall-presentation.test.ts`. Fixtures include 48 recalled of 52 eligible pairs with estimate sum 46.16, giving observed `48/52` and predicted `46.16/52`, unequal interval pair counts, measured zero, invalid/no pairs, leading unavailable, internal/trailing holds, and unchanged source rows. Pair estimates are pooled using each unrounded `pairedReviews * fsrsEstimate`.

Export `buildCumulativeRecallPresentation(rows)` with original raw `ObservedRecallVsFsrsRow` fields and cumulative pair count, recalled count, estimate sum, observed/predicted rates, difference, state and last-updated interval. The service owns the earliest-pair frame from the preceding phase; never independently crop the end or choose a new recent date range. A leading no-pair row remains unavailable, not zero. An inactive interval has zero new pairs and identical cumulative numerator/denominator to its predecessor. The endpoint and hero use the same unrounded pooled rates.

- [x] **Step 4: Add Time RED tests and implement target-normalized rows.**

Export `buildTimeTargetPresentation(cohort, targets, subset = 'all')`. Consume each known difficulty's selected-period `time[subset]` median and timing counts; Unknown contributes coverage/details but has no target bar. Each row includes difficulty, timed/eligible assessments, median seconds, target minutes, percent of target, difference minutes and difference percentage. Null median stays unavailable; do not fabricate zero-time bars.

```ts
const percentOfTarget =
  medianSeconds === null ? null : (100 * medianSeconds) / (targetMinutes * 60)
const differenceMinutes =
  medianSeconds === null ? null : medianSeconds / 60 - targetMinutes
```

Test 10-minute median against a 20-minute target (50%, -10 minutes), 45 against 30 (150%, +15 minutes), exactly 100%, missing durations, successful subset independently from all, Unknown coverage, and asymmetric counts. Keep ratios above 100 uncapped; domain includes 100 and largest available ratio. The hero is timed coverage, never an average of the three medians. Timing subset meaning remains rating-derived Hard/Good/Easy, distinct from the persisted-correct headline time.

- [x] **Step 5: Run model GREEN, format, review, and commit.**

Run all three new test files together. Expected: all pass. Format only those files. Fresh specification review then quality review; root commits `feat: add weighted analytics presentation models`.

## Task 2: Weighted Topic Evidence Contract

**Files:**

- Modify: `src/features/analytics/domain/historical-presentation.ts`
- Modify: `src/features/analytics/domain/historical-presentation.test.ts`
- Modify: `src/features/analytics/api/analytics-contracts.ts`
- Modify: `src/features/analytics/api/analytics-contracts.test.ts`
- Modify: `src/testing/analytics-fixtures.ts` and impacted topic fixtures.

- [x] **Step 1: Write failing joint-count, ordering, and conservation tests.**

Add `ratingCountsByDifficulty` to `TopicPerformanceRow`, exactly four difficulty keys × four rating keys, each a nonnegative integer. Existing `reviewSuccess`, `goodEasy`, valid count and direct membership fields remain. Tests cover direct topic deduplication/normalization, overlapping memberships, Unknown influence, current difficulty, invalid exclusion, >=10 valid ratings and >=3 distinct problems eligibility, and sorting by unrounded weighted score, then count descending, then name. Do not roll up ancestors or truncate qualifying rows.

Add schema tests that reject negative/fractional/missing cells, sum not equal to valid ratings, Good/Easy cells not equal to goodEasy, and `reviewSuccess !== goodEasy/validRatings`. Accepted matrices conserve all counts.

- [x] **Step 2: Run RED, populate the matrix and sort through the shared helper.**

Run `rtk npm run test -- src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts`. Expected: new matrix/order assertions fail. Increment the current difficulty/rating cell in the existing direct-topic producer after validity and selected-window filtering. Use `aggregatePerformance(row.ratingCountsByDifficulty).score` to sort; preserve existing raw rating success fields and eligibility.

- [x] **Step 3: Run GREEN, review, and commit.**

Run the same suites plus service tests to prove validated message production. Expected: all pass. Fresh specification then quality review. Root commits `feat: weight topic performance by question difficulty`.

## Task 3: Natural Active Curves And Flat Inactive Holds

**Files:**

- Create: `src/features/analytics/domain/cumulative-trend-geometry.ts`
- Create: `src/features/analytics/domain/cumulative-trend-geometry.test.ts`

- [ ] **Step 1: Add failing geometry fixtures.**

Input points contain actual numeric `x`, `startX`, `endX`, value, and cumulative state. Return semantic active cubic segments and horizontal held segments; marker coordinates only for updated points. Verify no path/marker before first evidence, held values add no marker, long inactive spans are flat, resumed change begins at the active interval's start rather than earlier inactive time, active curves stay between neighboring values, local extrema do not overshoot, equal active values remain flat/solid with measured marks, and trailing holds extend to the supplied visible end cutoff. Both performance and recall use this same geometry.

```ts
interface CumulativeTrendPoint {
  x: number
  startX: number
  endX: number
  value: number | null
  state: 'unavailable' | 'updated' | 'held'
}
```

- [ ] **Step 2: Run RED and implement bounded monotone cubic segments.**

Run `rtk npm run test -- src/features/analytics/domain/cumulative-trend-geometry.test.ts`. For each contiguous active run use slope-limited monotone tangents (zero at slope changes/extrema); clamp cubic control ordinates within each segment's endpoint values. On an inactive run draw horizontal held spans. When evidence resumes, use a synthetic geometry anchor at the next active interval's start carrying the preceding cumulative value; the anchor never becomes evidence, a tooltip row, or a marker. Tangent at a hold joins flat. Keep geometry separate from aggregation and chart scales.

For an active segment from `(x0,y0)` to `(x1,y1)`, encode cubic controls at one-third/two-thirds of its horizontal span with slope-limited ordinates. The consumer draws one continuous path per run and a long-dashed hold path, preserving natural shared tangents between consecutive updates. Do not join unavailable leading points, diagonally bridge held intervals, or smooth a discrete zero into invented evidence.

- [ ] **Step 3: Run GREEN, review, and commit.**

Run new geometry tests and the Performance/Recall tests. Expected: all pass. Fresh specification review then quality review; root commits `feat: model continuous analytics trends with honest holds`.

## Validation And Continuation

- [ ] Run focused tests before full `rtk npm run lint`, `rtk npm run check`, and `rtk npm run build` after integration.
- [ ] Record exact commands and skipped commands. Human installed-extension Analytics/Chart Targets happy-path and edge-case smoke remains pending until the full UI is available.
- [ ] Continue to compact production composition and browser proof. Pure models alone do not satisfy the approved Analytics page.

## Task 1 Execution Record

Six pure model/test files are implemented. Performance preserves raw totals/rows alongside exact weighted evidence, cumulative states and explicitly gated prior comparison. Recall pools the same eligible pairs without rounding or changing its supplied frame. Time exposes period medians, exact target differences, unclassified coverage and an uncapped padded domain. Specification and quality reviews passed without findings; the quality reviewer also verified architecture boundaries.

Verified RED: absent modules first, then 26 semantic failures against empty exports. Final GREEN: 26 tests (Performance 15, Recall 5, Time 6); independent quality validation including architecture: 42 tests. Root independently reran the three model suites with 26 passes. Pinned typecheck, six-file ESLint, Prettier write/check and whitespace checks passed.

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/domain/performance-presentation.test.ts src/features/analytics/domain/cumulative-recall-presentation.test.ts src/features/analytics/domain/time-target-presentation.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/domain/performance-presentation.test.ts src/features/analytics/domain/cumulative-recall-presentation.test.ts src/features/analytics/domain/time-target-presentation.test.ts src/testing/architecture-boundaries.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run typecheck
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm exec eslint -- src/features/analytics/domain/performance-presentation.ts src/features/analytics/domain/performance-presentation.test.ts src/features/analytics/domain/cumulative-recall-presentation.ts src/features/analytics/domain/cumulative-recall-presentation.test.ts src/features/analytics/domain/time-target-presentation.ts src/features/analytics/domain/time-target-presentation.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm exec prettier -- --write src/features/analytics/domain/performance-presentation.ts src/features/analytics/domain/performance-presentation.test.ts src/features/analytics/domain/cumulative-recall-presentation.ts src/features/analytics/domain/cumulative-recall-presentation.test.ts src/features/analytics/domain/time-target-presentation.ts src/features/analytics/domain/time-target-presentation.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm exec prettier -- --check src/features/analytics/domain/performance-presentation.ts src/features/analytics/domain/performance-presentation.test.ts src/features/analytics/domain/cumulative-recall-presentation.ts src/features/analytics/domain/cumulative-recall-presentation.test.ts src/features/analytics/domain/time-target-presentation.ts src/features/analytics/domain/time-target-presentation.test.ts
rtk git diff --check
```

Full `npm run lint`, `npm run check` and `npm run build` are deferred to the integration checkpoint; this task adds unwired pure models. Required human extension smoke and production responsive proof remain pending until the compact composition is implemented. No database generation is needed because persisted schema is unchanged. Continue directly to topic joint evidence and trend geometry.

## Task 2 Execution Record

The producer now supplies the strict sixteen-cell difficulty/rating matrix for every qualifying direct topic. Ordering uses the shared unrounded Performance score, with the existing count/name tie breakers. Original raw rates, membership normalization, overlapping topics, eligibility and complete qualifying lists remain available. The transport validates cell presence/type and reconciles both counts and the raw rate. Narrow existing fixtures were updated; the compact Topic UI follows in the adapter phase.

RED recorded 63 contract and five historical assertion failures before implementation. Final focused GREEN passed 279 tests across five suites. The specification review passed; independent quality review passed 295 tests including architecture. Quality review identified masked conservation-test failures; the corrected cases recompute the raw rate and require a single issue at the relevant count path. The patched contract suite passed 177 tests independently for root and quality review. Typecheck, eight-file ESLint, Prettier and whitespace checks passed.

```sh
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/server/analytics-service.test.ts src/features/analytics/components/historical-views.test.tsx src/features/analytics/components/analytics-screen.test.tsx
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/server/analytics-service.test.ts src/testing/architecture-boundaries.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run test -- src/features/analytics/api/analytics-contracts.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm run typecheck
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm exec -- prettier --check src/features/analytics/domain/historical-presentation.ts src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/api/analytics-contracts.ts src/features/analytics/api/analytics-contracts.test.ts src/testing/analytics-fixtures.ts src/features/analytics/components/historical-views.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/server/analytics-service.test.ts
rtk proxy env PATH="/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH" npm exec -- eslint src/features/analytics/domain/historical-presentation.ts src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/api/analytics-contracts.ts src/features/analytics/api/analytics-contracts.test.ts src/testing/analytics-fixtures.ts src/features/analytics/components/historical-views.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/server/analytics-service.test.ts
rtk git diff --check
```

Full `npm run lint`, `npm run check`, `npm run build` and repository-wide `npm run format` are deferred to page integration; focused touched-file formatting ran. No `npm run db:generate` is needed because persistence is unchanged. Actual-production fixtures were regenerated successfully with the new runtime matrix. Production UI proof and human installed-extension happy-path/edge-case smoke remain pending. Continue to natural cumulative geometry.
