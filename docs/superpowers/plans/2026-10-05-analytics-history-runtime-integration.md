# Analytics History Runtime Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire approved 30 / 90 / All time history bounds, the paired Recall frame, independent workload dates, and four truthful period totals through the existing Analytics runtime.

**Architecture:** Build one report from the existing complete, deduplicated repository read. The reviewed history-window foundation supplies explicit selection, nominal/display/prior bounds, calendar bins, and the fixed backlog frame. Runtime validation preserves these meanings; presentation never guesses a duration from a selector string. Keep this phase's visible change limited to the range control and truthful headline data; the compact page composition follows in its own plan.

**Tech Stack:** TypeScript, existing Zod runtime schemas, Drizzle read repository, Vitest, React dashboard route and query hooks. No migration, dependency, permission, sync, or assessment-policy change.

---

Status: written for execution following the history-window foundation. User approved the final prototype and continuation; execution mode is already authorized. Root owns commits, authority-doc alignment, and final full validation.

## Contract Decisions

Public `AnalyticsRange` becomes `30 | 90 | 'all'`. Legacy URL `14` and malformed values normalize to 30 through `parseAnalyticsHistorySelection`. The old pure `buildAnalyticsTimeFrame` may retain its finite 14-day input for tests and independent daily helper callers, but public messages and visible choices have no 14-day range.

Keep numeric `AnalyticsTimeFrame.requestedDays` separate from selection: existing finite helper frames use 14/30/90; All time uses null. Add optional foundation `history` and `grouping` metadata to this internal type for compatibility with legacy helper callers. Reports produced by the service always populate them. Runtime response validation must require correct selection/duration agreement and validate supplied metadata, including empty-history null starts and zero buckets. Do not create artificial historical intervals merely to satisfy an old `.min(1)`.

The service-selected frame has:

```ts
const frame: AnalyticsTimeFrame = {
  asOf: bounds.asOf,
  timeZone: bounds.timeZone,
  timeZoneFallback: bounds.timeZoneFallback,
  requestedDays: bounds.nominalDays,
  periodStart: bounds.displayStart ?? bounds.periodEnd,
  periodEnd: bounds.periodEnd,
  buckets: bucketPlan.buckets,
  history: bounds,
  grouping: bucketPlan.grouping,
}
```

`periodStart = periodEnd` represents an empty internal frame; `history.displayStart = null` is the truthful public display origin. Consumers guard empty buckets. Historical calculations use the display start because it contains every selected retained record; comparisons use `history.previous`, never shift this clipped display start.

The Recall view receives its own `timeFrame`: find the earliest eligible pair in the selected period from complete prehistory replay, replace only the display start/key and available-day span, then rebuild its bins through the same as-of. Do not derive the new start by slicing a globally grouped interval. No pairs gives empty Recall rows with an unavailable value. Retain selected-period pair counts and eligible-pair readiness semantics; the card's exact dates/grouping come from its supplied frame.

Backlog reconstruction and presentation receive the independent foundation 30-day daily frame. Upcoming remains next 14 local dates. Current snapshots retain the report as-of. Add `timeFrame` to the backlog view if needed so chart/table/inspection cannot accidentally use the selected historical grouping.

## Task 1: Runtime Frames, Selection, And Comparisons

**Files:**

- Modify: `src/features/analytics/domain/analytics-time.ts`
- Modify: `src/features/analytics/api/analytics-contracts.ts`
- Modify: `src/features/analytics/server/analytics-service.ts`
- Modify: `src/features/analytics/domain/analytics-range-policy.ts`
- Modify: `src/features/analytics/domain/analytics-readiness.ts`
- Modify: `src/features/analytics/domain/historical-presentation.ts`
- Modify: `src/features/analytics/domain/chart-data.ts`
- Modify: `src/features/analytics/domain/workload-presentation.ts`
- Modify: `src/features/analytics/domain/summary.ts`
- Modify: `src/app/dashboard/navigation/routes.tsx`
- Modify: `src/platform/query/query-keys.ts`
- Modify: `src/features/analytics/components/analytics-range-control.tsx`
- Modify: `src/features/analytics/components/charts/historical-chart-model.ts`
- Modify: `src/features/analytics/components/analytics-readiness-state.tsx`
- Modify: `src/features/analytics/components/analytics-screen.tsx` only for honest scope labels and independent frames before the compact UI phase.
- Test: adjacent domain, contract, service, route, range-control, query and fixture tests impacted by these changes.
- Modify: `src/testing/analytics-fixtures.ts` only for compatible complete response fixtures.

- [ ] **Step 1: Add focused failing contract/service/route tests.**

Use existing test database factories `insertAnalyticsProblem` and `insertAnalyticsHistory` in `analytics-service.test.ts`; explicit existing fixture helpers remain the source of persistence syntax. Add these assertions around fixtures with earliest raw record Sep 24 and as-of Oct 5, 2026:

```ts
expect(summary.range).toBe(30)
expect(summary.timeFrame.history).toMatchObject({
  nominalStartKey: '2026-09-06',
  displayStartKey: '2026-09-24',
  availableDays: 12,
  previous: { start: '2026-08-07T00:00:00.000Z' },
})
expect(summary.timeFrame.buckets).toHaveLength(12)
expect(summary.timeFrame.grouping).toEqual({ unit: 'day', step: 1 })
expect(summary.views.overdueBacklog.rows).toHaveLength(30)
expect(summary.views.upcomingReviewLoad.rows).toHaveLength(14)
```

For All time, test empty history and a raw invalid-rating record before the first eligible pair: All retains that raw history origin; Recall starts on the pair's actual local date and uses its own grouping. Add sparse paired history over multiple years and assert it keeps the long span, rather than cropping to the last active week. Finite prior counts must include the complete nominal prior window even when current history is young. All time has no prior delta/direction and no fabricated prior assessments.

Update old tests asserting a user-visible 14-day range to the approved public contract and adjust evidence expectations honestly: a young 30-day report still requires 24 observations, not the former 14-day threshold. Route assertions:

```ts
expect(parseAnalyticsHistorySelection('all')).toBe('all')
expect(parseAnalyticsHistorySelection('14')).toBe(30)
expect(parseAnalyticsHistorySelection('90')).toBe(90)
expect(parseAnalyticsHistorySelection('garbage')).toBe(30)
```

Verify navigation preserves the existing `context` search value, request schema accepts literal All time, query keys distinguish all/30/90 and timezone, and malformed runtime frames fail validation.

- [ ] **Step 2: Run RED.**

Run `rtk npm run test -- src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/server/analytics-service.test.ts src/app/dashboard/routes.test.tsx`. Expected: new semantic assertions fail before changes. Record the actual failure, not a setup error.

- [ ] **Step 3: Implement the frame integration.**

Read history/settings/current cards concurrently before constructing the selected bounds. Remove dependence on `buckets[0]!`; use the supplied frame start even when empty. Use foundation APIs directly and a small feature-local adapter for the frame shape above. For comparisons, use:

```ts
const prior = options.timeFrame.history?.previous
const previousEvents = prior
  ? events.filter(
      (event) =>
        event.reviewedAt >= new Date(prior.start) &&
        event.reviewedAt <= new Date(prior.asOf),
    )
  : []
```

Legacy finite pure-helper callers without metadata retain equivalent nominal finite logic. A null requested duration always yields no prior comparison. Update all prior arithmetic in problem-solving, rating mix, and legacy Hard/Again summaries; do not use numeric negation on nullable duration. Preserve cohort ordering before window filters and complete FSRS replay.

Readiness accepts empty arrays as truthful no-evidence, retains actual observations rather than carried values, and receives explicit grouping rather than inferring it from the string selector. For finite selections keep existing formula and minimums (24 for 30, 45 for 90); for All time cap policy days at 90 and apply the same formula. Never multiply evidence by available days or the number of held rows. Shorter recommendations are only 30 or 90 as appropriate; there is no automatic range substitution. `requestedBuckets` permits zero while minimum observation policy remains positive.

Use the Recall-specific rebuilt frame for pair rows, chart scope, inspector labels, and bucket-aligned readiness keys. Retain full selected pair count; choosing different display bins cannot create additional evidence. Preserve raw reconstructed paired rates in the transport. Tighten pair contract invariants: recalled count cannot exceed pair count; zero pairs have null rates/difference and unmeasured evidence; positive pairs have measured rates, observed `recalledCount / pairedReviews`, and exact unrounded difference.

`historicalGroupingLabel` consumes explicit grouping metadata (daily, 3-day, weekly, monthly, quarterly, yearly, stride years) with legacy finite fallback only. Scope says All time rather than `all days` or `null days`; empty metadata has no invented date range. Backlog inspector must say daily/Last 30 days regardless of historical selection.

- [ ] **Step 4: Run focused GREEN and inspect the diff.**

Run `rtk npm run test -- src/features/analytics/domain/analytics-time.test.ts src/features/analytics/domain/analytics-readiness.test.ts src/features/analytics/domain/analytics-range-policy.test.ts src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/domain/chart-data.test.ts src/features/analytics/domain/workload-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/server/analytics-service.test.ts src/features/analytics/api/analytics-api.test.tsx src/app/dashboard/routes.test.tsx`. Expected: all selected suites pass. Resolve relevant failures; do not loosen tests or validators simply to accept an incoherent response. Run typecheck to catch all nullable-duration consumers before review.

- [ ] **Step 5: Specification review, then quality review and commit.**

Root dispatches fresh read-only reviewers and routes fixes back to the implementer. After both pass, root commits the focused integration with `feat: integrate analytics history selections`. Do not stage unrelated work.

## Task 2: Truthful Selected Activity Summary

**Files:**

- Modify: `src/features/analytics/domain/summary.ts`
- Modify: `src/features/analytics/domain/summary.test.ts`
- Modify: `src/features/analytics/server/analytics-service.ts`
- Modify: `src/features/analytics/server/analytics-service.test.ts`
- Modify: `src/features/analytics/api/analytics-contracts.ts`
- Modify: `src/features/analytics/api/analytics-contracts.test.ts`
- Modify: `src/testing/analytics-fixtures.ts`

- [ ] **Step 1: Add failing raw-activity tests.**

Expose `buildSelectedActivity(events, { start, asOf, timeZone })` from summary, consuming raw `AnalyticsReviewEvent` with persisted correctness. Deduplicate IDs defensively as the repository does. Test `isCorrect: true` with rating Again, false with rating Easy, and null with rating Good. For one slug with two successful durations 60 and 120, assert one unique question, two successful assessments, and 180 seconds. Add local-midnight boundaries, invalid/future dates, invalid ratings, zero/negative/nonfinite/missing durations, empty activity, all failures, all-unknown correctness, and partial timing coverage.

Use these exact required fields (additional denominator metadata is allowed when it improves truthful captions):

```ts
interface AnalyticsSelectedActivity {
  assessmentDays: number
  recordedAssessments: number
  knownCorrectnessAssessments: number
  successfulAssessments: number
  distinctSuccessfulProblems: number | null
  observedCorrectness: number | null
  timedSuccessfulAssessments: number
  untimedSuccessfulAssessments: number
  successfulRecordedSeconds: number | null
}
```

Observed correctness is true/(true+false), without a low-sample cutoff or a rating fallback. Wholly unknown nonempty correctness gives null unique-solved/time; empty activity or known zero successes gives 0 unique-solved/time. Successful records with no positive recorded timing give null time. Preserve exact positive seconds, summing repeated successes.

- [ ] **Step 2: Run RED, implement aggregation and additive validated `activity`.**

Run `rtk npm run test -- src/features/analytics/domain/summary.test.ts`. Expected: new raw-activity tests fail. Aggregate once from selected raw events before narrowing chart eligibility. Keep the legacy raw Good/Easy measure separate, rather than renaming it into correctness. Ensure service response and message serialization carry `activity`; validate nonnegative counts, timed + untimed = successful, successful <= known <= recorded, and consistent null/zero/rate meanings. Cross-check service activity against a database fixture with conflicting rating/flag and repeated timed successes.

- [ ] **Step 3: Run GREEN, review, and commit.**

Run `rtk npm run test -- src/features/analytics/domain/summary.test.ts src/features/analytics/server/analytics-service.test.ts src/features/analytics/api/analytics-contracts.test.ts`. Expected: all pass. Fresh specification review then quality review. Root commits `fix: derive analytics activity from selected assessments`.

## Phase Completion And Validation

- [ ] Format only touched files with repository Prettier.
- [ ] Run `rtk npm run lint`, `rtk npm run check`, and `rtk npm run build` with Node 24.20.0/npm 11.19.0.
- [ ] Record exact run/skipped commands and reasons. No database generation: no persisted-schema change. Do not mark required human extension smoke as N/A.
- [ ] Update current authority docs to describe the implemented selection/frames/activity while preserving honest old-layout status until the compact UI phase lands.
- [ ] Continue directly to the weighted presentation and compact UI phases already authorized by the user. This phase alone does not complete the Analytics refactor.
