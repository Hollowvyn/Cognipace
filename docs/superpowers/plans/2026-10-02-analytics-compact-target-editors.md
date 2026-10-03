# Compact Analytics Target Editors Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute the phase-sized tasks. Root owns editor/UI/docs/proof; the delegated worker owns API and repository regressions. Root performs Git mutations.

**Goal:** Apply the user's refinement: a small single-target editor in each graph.

**Architecture:** Retain the existing native target caption, one percentage input,
Save/Cancel, and rating/constraint hint. UI validates against the latest other
goal but sends only the edited property. Existing Settings transaction merges
and validates the final pair; existing Analytics cache update uses the full
successful response. No storage, runtime contract, scale, or chart changes.

**Tech Stack:** Existing React, TypeScript, Zod, Settings/TanStack Query, Vitest.

Spec: [Chart Targets](../specs/2026-10-02-analytics-chart-targets-design.md).
Continue the existing `codex/analytics-layout-polish` branch and draft PR #184.
The user's request supersedes the earlier two-field presentation. The saved
goals, ordering rule, and failure/keyboard behavior remain approved.

Execution and proof: [handoff](../handoffs/2026-10-02-analytics-compact-target-editors.md).
Human installed-extension smoke remains pending before review or merge.

## 1. Independent Partial Saves

Files: `src/features/analytics/api/analytics-api.ts`, its test, and
`src/features/settings/data/settings-repository.test.ts`.

- [x] Add regressions showing each single-field request uses only its edited
      goal, cached summaries use the returned full pair, and a newer persisted
      counterpart survives each independent edit. Existing merged-pair rejection
      test already covers stale-client conflicts.
- [x] Run regressions: `rtk npm run test -- src/features/analytics/api/analytics-api.test.tsx src/features/settings/data/settings-repository.test.ts` (17 passed before/after; runtime already forwards partial patches). Observe type RED/GREEN with `rtk proxy npx tsc --noEmit -p tsconfig.json --pretty false`: TS2345 before widening the input, exit 0 afterward.
- [x] Use `Partial<AnalyticsTargets>` for the hook input and pass that patch
      unchanged to existing Settings. Preserve cancellation/cache/refetch order.

```ts
mutateAsync: async (targets: Partial<AnalyticsTargets>) => {
  const settings = await updateSettings.mutateAsync({
    surface: 'dashboard',
    patch: { analytics: targets },
  })
  // Existing request cancellation and cache application use settings.analytics.
}
```

- [x] Rerun focused tests and review returned settings/cache preservation.

## 2. Small Per-Chart Controls

Files: `src/features/analytics/components/analytics-target-editor.tsx`, its
test, and `analytics-screen.test.tsx`. Root owns these files.

- [x] Write and observe failing tests: exactly one focused input per chart;
      rating/constraint hints; partial save payloads; refreshed counterpart
      changes validation while preserving active draft; numeric boundaries,
      failed draft, pending lock, cancellation/focus, empty/Table integration.
- [x] Run RED: `rtk npm run test -- src/features/analytics/components/analytics-target-editor.test.tsx src/features/analytics/components/analytics-screen.test.tsx`.
- [x] Replace the paired string draft/two refs with the active field and one
      ref. Keep caption unchanged. Render a small max-width native form with
      one input, percent suffix, Save and Cancel in a row, then concise hints.

```ts
const key = metric === 'recall' ? 'targetRecall' : 'targetReviewSuccess'
const candidate = { ...targets, [key]: Number(draft) / 100 }
analyticsTargetsSchema.safeParse(candidate)
await onSave({ [key]: Number(draft) / 100 })
```

- [x] Preserve Save/Enter, Escape/Cancel, pending protection, failure draft,
      and effect-based focus restoration. Validate latest props without resetting
      draft on refresh; invalid ordering hints point to the counterpart target.
- [x] Rerun focused component and API tests.

## 3. Review, Proof, And PR

Files: current product/design/architecture/testing docs, spec/index/plan,
new handoff `docs/superpowers/handoffs/2026-10-02-analytics-compact-target-editors.md`,
and new proof assets. Preserve all prior screenshots.

- [x] Read-only spec and quality review; resolve real findings.
- [x] Update authority and human smoke to one input per chart, partial writes,
      and safe counterpart constraints. Keep human installed-extension proof
      pending before review/merge.
- [x] Capture and inspect actual production controls at wide/narrow light/dark
      widths; verify small size, no overflow, focus, invalid/saved states, and
      pair alignment. Clean up temporary tab/viewport/server.
- [x] Run `rtk npm run check`, `rtk npm run lint`, `rtk npm run build`,
      `rtk npm run format`, touched-Markdown Prettier and
      `rtk proxy git diff --check`. Record exact commands/results and skips.
- [x] Commit, push, update/attach draft PR #184; do not merge or release.

Done when each graph edits only its own target in a smaller control, persisted
counterparts are preserved, validation and fixture proof pass, and the existing
draft PR documents final behavior.
