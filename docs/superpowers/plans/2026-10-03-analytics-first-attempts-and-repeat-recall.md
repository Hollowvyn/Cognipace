# First Attempt Outcomes and Repeat Recall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task-by-task. Track each phase before starting the next.

**Goal:** Add two first-recorded outcome rates with independent saved goals and
make Recall compare only eligible repeat reviews with their paired FSRS estimates.

**Architecture:** Analytics owns pure cohort selection, bucket aggregation,
readiness, serialized views, and feature UI. Settings owns the two new goals and
uses its existing partial-save/runtime/cache path. No database migration, new
permission, or new runtime/sync mechanism is required.

**Tech stack:** TypeScript, React, Recharts, Zod, ts-fsrs, existing SQLite-backed
Settings, Vitest, and Testing Library.

**Design:**
`../specs/2026-10-03-analytics-first-attempts-and-repeat-recall-design.md`.
This plan is saved for written-spec review. Execution has not started.

## Phase 1: Shared cohorts and serialized evidence

### Task 1: Pure population selection

Create `src/features/analytics/domain/review-cohorts.ts` and
`review-cohorts.test.ts`. Modify
`src/features/analytics/domain/historical-presentation.ts` and
`src/features/analytics/domain/chart-data.ts` to consume shared repeat pairs.
Keep the existing event shape and `(reviewedAt, id)` ordering.

- [ ] Add a regression selecting first Again despite later Good, and an invalid
      earliest row despite a later valid rating. For shuffled rows A2 Good, A1 Again,
      B1 Hard, C1 Good, the selected IDs must be A1, B1, C1.
- [ ] Run the focused domain suite and observe the new regression fail before
      adding the helper.
- [ ] Implement earliest selection over raw history before all report filters:

```ts
export function selectFirstRecordedAttempts(
  events: readonly AnalyticsReviewEvent[],
): AnalyticsReviewEvent[] {
  const ordered = [...events].sort(
    (a, b) =>
      a.reviewedAt.getTime() - b.reviewedAt.getTime() ||
      a.id.localeCompare(b.id),
  )
  const firstByProblem = new Map<string, AnalyticsReviewEvent>()
  for (const event of ordered) {
    if (!firstByProblem.has(event.problemSlug)) {
      firstByProblem.set(event.problemSlug, event)
    }
  }
  return [...firstByProblem.values()]
}
```

- [ ] Move/reuse the current per-card replay pairing in the same helper module.
      Replay all valid history and use `replayed[index - 1].card` for every index
      greater than zero; emit no pair at index zero. Apply the report window after
      replay. Preserve valid zero estimates and rating-derived recalled outcomes.
- [ ] Make historical and compatible legacy Recall builders consume those
      emitted pairs, preserving existing serialized keys while changing their
      evidence to the approved repeat population. Add tests for an initial before
      the window, a repeat with null correctness, and initial-only history.
- [ ] Run:

```sh
rtk npm run test -- src/features/analytics/domain/review-cohorts.test.ts src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/domain/chart-data.test.ts
```

Done when selection is deterministic, no later rating is promoted, and both
Recall computation paths agree on the same paired repeat population.

### Task 2: First-outcome rows, totals, API, and independent readiness

Modify `src/features/analytics/domain/historical-presentation.ts`,
`src/features/analytics/domain/summary.ts`,
`src/features/analytics/server/analytics-service.ts`,
`src/features/analytics/api/analytics-contracts.ts`, and
`src/testing/analytics-fixtures.ts`. Update the matching `.test.ts` files.

- [ ] Define `views.firstAttemptOutcomes` with rows containing the existing
      interval identity/partial fields, four rating counts, raw-first count,
      excluded-invalid count, valid-first count, both outcome numerators, both
      nullable rates, and measured/not-measured evidence. Add weighted period totals
      and a shared percentage scale. Keep full serialized rows until display trim.
- [ ] Aggregate only selected first records in each existing local bucket:

```ts
const validFirstAttempts = again + hard + good + easy
const hardGoodEasy = hard + good + easy
const goodEasy = good + easy
const firstAttemptSuccess =
  validFirstAttempts > 0 ? hardGoodEasy / validFirstAttempts : null
const firstAttemptGoodEasy =
  validFirstAttempts > 0 ? goodEasy / validFirstAttempts : null
```

- [ ] Add `historicalReadiness.firstAttemptOutcomes`, derived from valid-first
      counts over the original bucket array. Replace Recall's correctness-presence
      readiness source with exact paired-repeat counts. Keep readiness thresholds
      and unrelated metric readiness unchanged.
- [ ] Extend strict response validation and all empty constructors/fixtures.
      Validate integer nonnegative counts, rating sums, bounded nullable rates,
      `goodEasy <= hardGoodEasy <= validFirstAttempts`, and consistent availability.
      Do not add reconstructed provenance to the first-outcome view.
- [ ] Assert the A/B/C fixture gives first success 2/3 and Good + Easy 1/3;
      all-Again is measured zero; no valid first records gives null. Verify many
      initial records cannot make Recall ready and target changes cannot alter
      rates, samples, readiness, replay, or exclusions.
- [ ] Run:

```sh
rtk npm run test -- src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/domain/summary.test.ts src/features/analytics/server/analytics-service.test.ts src/features/analytics/api/analytics-contracts.test.ts
```

Done when runtime parsing, first-period totals, and both independent readiness
objects agree with the cohort regressions. Commit the coherent domain/API phase
with `feat(analytics): separate first outcomes from repeat recall`.

## Phase 2: Settings-owned goals and cached references

### Task 3: Defaulted independent first-attempt goals

Modify `src/features/settings/domain/settings.ts`,
`src/features/analytics/domain/historical-presentation.ts`, and
`src/features/analytics/api/analytics-api.ts`. Update Settings domain/repository/
draft tests, Analytics API tests, and existing backup contract/repository tests.

- [ ] Add the two fraction keys to the existing Analytics settings shape:

```ts
targetFirstAttemptSuccess: firstAttemptTargetFractionSchema.default(0.9)
targetFirstAttemptGoodEasy: firstAttemptTargetFractionSchema.default(0.9)
```

- [ ] Define `firstAttemptTargetFractionSchema` as a finite 0–1 number on the
      whole-percent grid using a rounding tolerance. Keep existing legacy decimal
      target validation compatible. Preserve the existing Review Success >= Recall
      refinement exclusively on that old pair; do not compare either new goal.
- [ ] Default absent keys independently, normalize malformed stored new values
      without resetting a valid existing pair, and keep import validation strict.
      Extend partial-merge and changed-field patch generation so new-only saves and
      Reset Defaults work without changing unrelated preferences.
- [ ] Supply the saved new targets in `views.firstAttemptOutcomes`. Extend
      `applyHistoricalChartTargets` and the existing mutation cache update across all
      cached ranges. Fit the new scale using both curves and both goals. Failed
      saves leave prior references intact; concurrent changes preserve other keys.
- [ ] Exercise old two-key settings, absent analytics, malformed stored new
      fields, valid 29%, extremes, arbitrary new-goal ordering, strict invalid import,
      Reset Defaults, and one-key saves. Use existing backup/configured sync paths;
      introduce no new sender or synchronization behavior.
- [ ] Run:

```sh
rtk npm run test -- src/features/settings/domain/settings.test.ts src/features/settings/data/settings-repository.test.ts src/features/settings/hooks/use-settings-draft.test.tsx src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/analytics/api/analytics-api.test.tsx
```

Done when saved references survive reload/defaulting and cache updates preserve
all four independent preference values. Commit with
`feat(analytics): save separate first attempt goals`.

## Phase 3: Feature UI and release proof

### Task 4: Reuse compact goal editors

Modify `src/features/analytics/components/analytics-target-editor.tsx` and its
test. Extend its binary metric mapping into local metadata for `recall`,
`reviewSuccess`, `firstAttemptSuccess`, and `firstAttemptGoodEasy`. Map the two
new metric IDs to the exact settings fields and approved labels. Preserve the
existing focus, draft, pending/error, and single-key save behavior.

- [ ] Test each new editor saves its own key only, accepts either ordering of
      new targets, preserves old goals, validates integer percentages, and retains
      failed drafts. Verify Enter/Escape and restored focus.
- [ ] Run:

```sh
rtk npm run test -- src/features/analytics/components/analytics-target-editor.test.tsx
```

### Task 5: New outcome graph and paired dashboard composition

Create `src/features/analytics/components/new-problem-success-view.tsx` and its
test. Modify `historical-views.tsx`, `analytics-screen.tsx`,
`charts/historical-target-line.tsx`, `charts/chart-definitions.ts`, and
`src/styles/analytics.css`; update their matching component/catalog tests.

- [ ] Compose `HistoricalChart`, `LineSegments`, `HistoricalTable`, and
      `ChartTable` with a shared `trimHistoricalEmptyEdges` slice selected by known
      first-outcome evidence. Both curves and target extremes use the supplied
      stable shared scale. Preserve exact interval/calendar inspection behavior.
- [ ] Render mint H+G+E circles and blue solid G+E diamonds. Use an optional
      target-line stroke prop whose default preserves current charts. The reference
      decision is:

```ts
const sharedTarget =
  view.targetFirstAttemptSuccess === view.targetFirstAttemptGoodEasy
```

- [ ] For `sharedTarget`, render one neutral reference at the common value;
      otherwise render two references matching their curves. Keep both compact
      editors and tooltip target values in either case. Do not offset equal goals.
- [ ] Put New Problem Success before Repeat Recall in a responsive two-card
      group. Preserve Practice Rhythm and the remaining composition. Update Recall
      copy to explain repeat-only pairing and initial-only empty states.
- [ ] Show actual rating counts/exclusions, both rates and goals, full intervals,
      partial status, timezone/as-of context, and retained-history caveats. Omit the
      mock difficulty row. Period exclusions use full-period totals even when outer
      empty intervals are trimmed. Avoid duplicate bottom details.
- [ ] Test zero/null, unequal/equal targets, extremes, fitted scale, singleton,
      edge trim/internal gaps, curve toggles, tap/keyboard, seven-row pagination,
      empty/Table controls, independent readiness, and existing chart geometry.
- [ ] Run:

```sh
rtk npm run test -- src/features/analytics/components/new-problem-success-view.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/charts/historical-chart.test.tsx src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/charts/line-segments.integration.test.tsx src/features/analytics/components/charts/chart-definitions.test.ts
```

### Task 6: Authority docs, proof, and draft PR handoff

- [ ] Update `docs/product.md`, `docs/architecture.md`, `docs/testing.md`,
      `design.md`, and `docs/superpowers/README.md` to describe implemented behavior
      only after source changes pass. Record actual evidence in
      `docs/superpowers/handoffs/2026-10-03-analytics-first-attempts-and-repeat-recall.md`.
- [ ] Run the focused runtime/invalidation regressions:

```sh
rtk npm run test -- src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.test.ts src/platform/query/cache-invalidation.test.ts
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
```

`check` includes database checks, typecheck, lint, and the full suite. Skip
`rtk npm run db:generate` because no SQL schema changes; record that reason.

- [ ] Independently review cohort logic and goal persistence, then inspect
      production-component fixtures in wide/narrow and light/dark states. Include
      unequal/equal goals, empty, sparse measured zero, tooltip, Table, and editors.
      Save real screenshots when browser policy allows; never call synthetic source
      snapshots installed-extension smoke proof.
- [ ] Prepare the human installed-extension checklist: first Again then Good,
      first-only and repeat-only populations, a pre-range initial/recent repeat,
      goal save/reload/cancel/failure, old preferences, Table/keyboard, and narrow/
      light/dark inspection. Human screenshots or recordings remain required before
      PR review or merge; leave the existing PR draft while that proof is pending.
- [ ] Record exact passed/skipped commands and remaining risk, commit the
      integrated UI/docs with a Conventional Commit, and update the existing PR
      description around the final behavior using its current template. Keep
      screenshots/validation honest and do not create a second PR for this phase.

## Planning validation

This turn saves design/plan/reference files only. Run Prettier on touched
Markdown and JSON, and verify the preserved fragment's checksum. No production
test/build/schema command is applicable until execution. Record those exact
skips in the design and final handoff; do not mark future human smoke as N/A.

### Results for the planning commit

Passed:

```sh
rtk proxy npx prettier --ignore-path /dev/null --write docs/superpowers/README.md docs/superpowers/specs/2026-10-03-analytics-first-attempts-and-repeat-recall-design.md docs/superpowers/plans/2026-10-03-analytics-first-attempts-and-repeat-recall.md docs/superpowers/specs/assets/2026-10-03-analytics-first-attempts/manifest.json
rtk proxy npx prettier --ignore-path /dev/null --check docs/superpowers/README.md docs/superpowers/specs/2026-10-03-analytics-first-attempts-and-repeat-recall-design.md docs/superpowers/plans/2026-10-03-analytics-first-attempts-and-repeat-recall.md docs/superpowers/specs/assets/2026-10-03-analytics-first-attempts/manifest.json
rtk proxy git diff --check
```

A read-only `rtk proxy python3` check also confirmed that the saved fragment is
byte-identical to its source and matches the manifest SHA-256. Preserve that
source without formatting it.

Skipped `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`,
`rtk npm run db:generate`, and standalone `rtk npm run db:check`: only planning
Markdown, a checksum manifest, and the exact existing preview snapshot changed.
Production implementation, production visual verification, and required human
installed-extension smoke remain pending.
