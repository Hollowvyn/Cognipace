# Problem Solving Model Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to execute the checked tasks in order.

**Execution:** Implemented in three independently reviewed phases, consolidated into the final feature commit. Automated and production-component checks passed; human installed-extension smoke remains pending. The [UI validation record](./2026-10-04-analytics-problem-solving-ui.md#validation-record) owns the final evidence.

**Goal:** Supply both approved raw cohorts with difficulty outcomes, recorded-time distributions, mix counts, prior-period evidence, and saved references through the existing Analytics summary.

**Architecture:** Extend the existing historical presentation builder and summary contract. Reuse rating counters, quantiles, calendar helpers, and the existing settings read. Leave FSRS pairing, persistence, endpoints, and permissions unchanged.

**Tech Stack:** TypeScript, Zod, Vitest, existing SQLite repository projection.

## Approved Input

Follow `../specs/2026-10-04-analytics-problem-solving-design.md` and the Phase 1 input plan. This phase can execute under the user's approved combined design and instruction to implement. It has no new product decision.

## Task 1: Pure Aggregation

Files: `src/features/analytics/domain/historical-presentation.ts` and its existing test.

- [x] Add compact failing cases to the existing test for invalid earliest records, later assessments, unknown difficulty, partial boundaries, and positive recorded time. Include an invalid rating with positive time: it belongs in Mix and all-timed coverage, but not successful timing or outcome rates.
- [x] Run `rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx vitest run src/features/analytics/domain/historical-presentation.test.ts`. Confirm failure for the absent view.
- [x] Add optional `problemDifficulty` and `elapsedSeconds` to historical inputs; add optional current difficulty timing allowances to options, defaulting to the Settings-owned defaults for generic callers. Production supplies saved values.
- [x] Export the following fixed data shape; do not serialize presentation-control state:

```ts
type OutcomeStats = {
  again: number
  hard: number
  good: number
  easy: number
  recordedAssessments: number
  excludedInvalidRatings: number
  validRatings: number
  hardGoodEasy: number
  goodEasy: number
  successRate: number | null
  goodEasyRate: number | null
}
type TimeStats = {
  eligibleAssessments: number
  timedAssessments: number
  totalSeconds: number
  medianSeconds: number | null
  q1Seconds: number | null
  q3Seconds: number | null
}
type DifficultyStats = OutcomeStats & {
  time: { all: TimeStats; successful: TimeStats }
}
type Difficulties = Record<
  'easy' | 'medium' | 'hard' | 'unknown',
  DifficultyStats
>
// Rows extend the existing historical base with `difficulties`.
// PeriodStats extends OutcomeStats with assessmentDays, distinctProblems,
// and difficulties. CohortView contains rows, totals, previous, outcomeScale,
// and timeScales.{all,successful}.{minutes,targetPercent}.
// views.problemSolving contains cohorts.{newProblems,followupPractice},
// targets: AnalyticsTargets, timeTargetsMinutes: {easy,medium,hard},
// and previousPeriod: {start,asOf} serialized ISO strings.
```

- [x] Generalize the existing rating counter and retain the old first-attempt wrapper. Select raw first/later cohorts before range, rating, difficulty, or timing filtering. Filter future records at as-of. Use current catalog difficulty; undefined maps to Unknown.
- [x] Aggregate bucket and period/prior stats independently from raw events. Success is H+G+E/valid; Good+Easy uses the same denominator. All-timed eligibility is raw recorded assessments; successful timing requires `isReviewRating(rating) && rating !== 'again'`. Only finite positive seconds are observed. Reuse median and Tukey hinges; quartiles require four observations. Count local assessment days and distinct problem slugs.
- [x] Shift start and as-of by the requested local-calendar day count for the prior period. Preserve exact counts even when current or prior valid n is below ten; the UI labels those comparisons Sparse.
- [x] Fit outcome scales from both rates across all known difficulties plus both applicable saved goals. Fit each timing subset/unit from its full known-difficulty positive duration distribution and current references; percent uses 100, without clamping overtime. Keep all rows in transport.
- [x] Update `applyHistoricalChartTargets` to patch the new view's saved goals and both outcome scales immediately, preserving rows and timing distributions.
- [x] Repeat the focused command; expect all tests passing. Keep new test/fixture lines below production lines and avoid bulk fixtures.

## Task 2: Runtime And Service Integration

Files: `src/features/analytics/api/analytics-contracts.ts`, its existing test, `src/features/analytics/server/analytics-service.ts`, its existing test, `src/testing/analytics-fixtures.ts`, and target-cache tests if needed.

- [x] Add focused failing contract cases for outcome count/rate mismatch, timing coverage exceeding eligibility, unsupported quartiles, and mix totals failing conservation. Reuse one small generated summary.
- [x] Add the fixed object schemas to `analyticsViewsSchema`. Counts are nonnegative integers, rates are nullable [0,1], seconds finite/nonnegative, timing targets positive, and scales use the existing schema. Refine numerator/denominator identities, raw/valid/excluded identities, time availability/coverage, quartile ordering/support, and difficulty totals.
- [x] Pass `settings.assessment.timeTargetsMinutes` into the existing builder using the already-read settings/history. Do not add a query or route.
- [x] Extend the common serialized-summary factory once with an empty view from the pure builder, instead of copying nested fixtures across tests. Adapt only direct typed literals that need the new contract.
- [x] Run `rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npx vitest run src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/server/analytics-service.test.ts src/features/analytics/api/analytics-api.test.tsx`. Expect all passing, including target-cache updates.

## Task 3: Review And Checkpoint

- [x] Root reviews the diff against the approved denominator/time/current-target rules, then an independent agent reviews correctness and simplicity.
- [x] Format touched source with pinned `npx prettier --write` and run `rtk proxy git diff --check`.
- [x] Run `rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:$PATH npm run lint` and `npm run check` with that same prefix. Repository read changes also require `npm run db:check`.
- [x] Include reviewed model files in the final feature commit, `feat(analytics): show difficulty outcomes and recorded time`.

The UI plan owns rendering and production-component proof. Human installed-extension happy-path and edge-case smoke remains pending until the rebuilt UI exists; record it honestly in the final handoff.
