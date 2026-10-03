# Analytics Chart Targets Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Save independent Recall and Review Success goals and edit them directly in the first and third Analytics charts.

**Architecture:** Settings owns a validated, defaulted, atomic target pair in its existing JSON preference record. Analytics exposes the goals and fits percentage scales around them; feature-owned chart controls save through the existing Settings mutation and update cached chart goals from the successful response. FSRS retention, current-state diagnostics, scheduling, observations, and count scales remain unchanged.

**Tech Stack:** TypeScript, React, Zod, TanStack Query, existing Settings repository/runtime, Recharts, Vitest/Testing Library.

Approved spec: [Analytics Chart Targets](../specs/2026-10-02-analytics-chart-targets-design.md).
Continue on `codex/analytics-layout-polish`, draft PR #184. The user explicitly
approved normal preferences with existing backup and configured sync inclusion.
Use `rtk` for every shell command. Settings and Analytics domain work may run
in parallel with separate file ownership; root owns chart/editor integration.

## Task 1: Saved Target Pair

Files: `src/features/settings/domain/settings.ts`, domain/index and public
index exports, their tests, `src/features/settings/data/settings-repository.test.ts`,
`src/features/settings/hooks/use-settings-draft.test.tsx`, and focused
`src/features/backup` tests. No migration or new runtime method.

- [ ] Write and run failing regressions for old settings/defaults, invalid
      subsection isolation, cross-target validation, atomic persistence,
      rejected patches, unrelated Settings Save, Reset Defaults, and backup
      round-trip.

```ts
expect(parseStoredUserSettings(oldSettings).analytics).toEqual({
  targetRecall: 0.9,
  targetReviewSuccess: 0.9,
})
expect(() =>
  mergeUserSettings(defaultUserSettings, {
    analytics: { targetRecall: 0.95, targetReviewSuccess: 0.9 },
  }),
).toThrow()
```

- [ ] Add exported `AnalyticsTargets`, `analyticsTargetsSchema`, and
      `defaultAnalyticsTargets`. Scalars are finite fractions 0 through 1;
      full-pair validation requires `targetReviewSuccess >= targetRecall`.
      Add a defaulted `analytics` subsection, optional patch fields, explicit
      deep merge, and minimal changed-field patches. Normalize malformed stored
      analytics to only analytics defaults. Preserve other saved sections.

```ts
const defaultAnalyticsTargets = { targetRecall: 0.9, targetReviewSuccess: 0.9 }
// Full schema's refinement reports:
// Review Success target must be at least your Recall target.
// createMergedUserSettings merges current.analytics with patch.analytics.
```

- [ ] Run focused Settings/domain/repository/draft and backup tests; review
      compatibility before handing off. Save exact red/green results. Root
      owns commits to avoid concurrent Git mutations.

## Task 2: Target-Aware Analytics Model And Cache

Files: `src/features/analytics/domain/historical-presentation.ts`,
`src/features/analytics/domain/summary.ts`,
`src/features/analytics/server/analytics-service.ts`,
`src/features/analytics/api/analytics-contracts.ts`,
`src/features/analytics/api/analytics-api.ts`, their tests, and non-component
Analytics fixtures. Root updates component fixtures separately.

- [ ] Write and observe failing model/service/API tests showing chart goals
      differ from FSRS retention, both references fit 0%/100%, goal changes
      preserve rows/count scales/retention results/cards, missing empty-view
      defaults are 90/90, and a successful save updates cached targets/scales.
- [ ] Replace only the active Recall view's `targetRetention` with
      `targetRecall`; add `targetReviewSuccess` to Practice's view. Add both
      targets to historical presentation options with independent defaults.
      Load Settings.analytics in the service and validate serialized outputs.
      Keep top-level, legacy, and Retention Map targetRetention fields intact.

```ts
observedRecallVsFsrs: {
  rows: observedRows,
  targetRecall: targets.targetRecall,
  scale: percentageScale(observedRows.flatMap(r => [r.observedRecall, r.fsrsEstimate]), [targets.targetRecall]),
},
practiceRhythm: {
  rows: rhythmRows,
  targetReviewSuccess: targets.targetReviewSuccess,
  countScale: toPresentationScale(countScale),
  percentageScale: percentageScale(rhythmRows.map(r => r.reviewSuccess), [targets.targetReviewSuccess]),
},
```

- [ ] Reuse one pure scale/goal application helper for service construction
      and successful cache updates. Add `useUpdateAnalyticsTargets` in the
      Analytics API, using existing `useUpdateSettings`, atomically sending
      `{ surface: 'dashboard', patch: { analytics: targets } }`. After success,
      apply returned Settings.analytics to all cached Analytics summaries;
      existing settings invalidation remains responsible for fresh data.
      Failed saves cannot modify cache. Expose `mutateAsync(targets)` for UI.
- [ ] Run focused Analytics model, service, contract, API, and scale tests;
      save exact red/green results and review spec compliance before handoff.

## Task 3: Compact Graph Editors And References

Files: new `src/features/analytics/components/analytics-target-editor.tsx`
and test; `analytics-screen.tsx` and test; `recall-ratings-views.tsx`,
`memory-practice-views.tsx`, their tests, and historical component fixtures.
Scoped `src/styles/analytics.css` only if layout needs it.

- [ ] Write and run failing editor/component tests for both captions,
      first-focused input, numeric limits/whole values, pair validation,
      Enter/Save, Escape/Cancel/focus return, pending duplicate prevention,
      persistence failure, saved captions, sparse/empty availability, and
      right-axis reference lines at 0%/100%.
- [ ] Create a feature-owned native disclosure editor with props:

```ts
type AnalyticsTargetEditorProps = {
  targets: AnalyticsTargets
  metric: 'recall' | 'reviewSuccess'
  onSave: (targets: AnalyticsTargets) => Promise<unknown>
}
```

      Use string drafts for percentage inputs so empty/invalid text cannot
      become 0 accidentally. Validate integer 0–100, then the shared schema.
      Show both inputs with rating-combination hints; never auto-adjust the
      other target. Submit only one pending save. Keep failed drafts open and
      return focus to trigger on cancel/success. Show Saving and useful errors.
      Inline panel opens above the plot and wraps within narrow chart width.

- [ ] Compose editors from AnalyticsHistoricalStory using its two serialized
      goals and `useUpdateAnalyticsTargets`. Pass a native control slot to
      each chart view; no persistence in drawing primitives. Controls remain
      available in empty states and Chart/Table views.
- [ ] Rename Recall target tooltip/description and keep only its dashed line
      in SVG. Place explicit native target caption above the plot; remove
      duplicate generic SVG caption. Add Practice's dashed line on
      `useYAxisScale('success')`, with matching color/key and explicit tooltip
      context. Preserve established axes, trim rules, dates, gaps, and marks.
- [ ] Run focused editor, historical charts, screen, and API integration tests.

## Task 4: Review, Proof, And Delivery

Files: current `docs/product.md`, `docs/architecture.md`, `docs/testing.md`,
`design.md`, spec/index, new handoff
`docs/superpowers/handoffs/2026-10-02-analytics-chart-targets.md`, and new
viewport proof images under that handoff's assets. Existing frozen previews
and proof remain unchanged.

- [ ] Review each completed boundary for spec compliance, then code quality;
      resolve findings and rerun affected focused tests.
- [ ] Update authority with editable goals, preserved read-only calculations,
      independent defaults, goal ordering, save behavior, backup/optional sync,
      and human extension smoke cases.
- [ ] Use actual production components in an illustrative local fixture.
      Capture wide/narrow light/dark editor/closed/invalid/saved states and
      0%/100% target clearance. Save ordinary viewport pixels and inspect the
      saved files. Clean up temporary tab, viewport override, and server.
- [ ] Run focused tests, then `rtk npm run lint`, `rtk npm run check`,
      `rtk npm run build`, `rtk npm run format`, explicit touched-Markdown
      Prettier, and `rtk proxy git diff --check`. Database check runs inside
      check; skip `rtk npm run db:generate` without schema changes and
      `rtk npm run zip` without packaging changes, with reasons recorded.
- [ ] Save Conventional Commit(s), push existing branch, update and attach
      draft PR #184 with final behavior/test count/proof. Keep human installed-
      extension happy/edge smoke pending before review or merge.

Done when both graphs use saved independent goals, editors enforce the approved
rule and handle failure, reload/backup compatibility is tested, FSRS outputs
remain unchanged, and automated/fixture proof is recorded.
