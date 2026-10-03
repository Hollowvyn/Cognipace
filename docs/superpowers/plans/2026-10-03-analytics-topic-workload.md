# Analytics Topic and Workload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the approved rising topic columns, compact memory signals,
daily backlog line and exact per-segment schedule counts.

**Architecture:** Keep Analytics ownership and existing serialized data, except
removing the five-topic row cap. Compose the existing Settings-owned Review
Success editor in the screen. Reuse local chart primitives and share workload
inspection only between the two workload views.

**Tech Stack:** React 19, TypeScript, Recharts 3, Zod 4, Vitest, Tailwind, WXT.

**Approved design:** `docs/superpowers/specs/2026-10-03-analytics-topic-workload-design.md`.
The user reviewed this file and requested implementation. Continue through all
steps without another design or execution-choice approval.

## Task 1: All qualifying topics and rising columns

Files under `src/features/analytics/`:
`domain/historical-presentation.ts`, `api/analytics-contracts.ts`,
`components/historical-views.tsx`; matching existing tests. Screen wiring belongs
only to Task 4 so independent edits cannot collide.

- [x] Extend the existing topic test to supply six qualifying topics and verify
      all six survive in stable ascending order with omitted count zero. Extend the
      existing contract test to accept six rows while retaining qualification and
      low-evidence behavior. Run these focused files and record the expected failure.
- [x] Remove only the qualifying cap:

```ts
// historical-presentation.ts
rows: qualifying.map((entry) => ({
  id: entry.normalizedTopic,
  topic: entry.topic,
  reviewSuccess: entry.reviewSuccess,
  goodEasy: entry.goodEasy,
  validRatings: entry.validRatings,
  distinctProblems: entry.distinctProblems,
  evidence: 'Measured',
})),
strongerQualifyingTopics: 0,
// analytics-contracts.ts
rows: z.array(topicPerformanceRowSchema),
```

- [x] Add `targetReviewSuccess: number` and `targetEditor?: ReactNode` props to
      `TopicPerformanceView`. Keep categorical plotting separate from the calendar
      historical-chart abstraction. Replace the horizontal layout with rising
      columns; categorical X axis, fixed numeric Y axis from 0 to 1, and target
      reference at the supplied fraction. Compare unrounded fractions for status.
- [x] Use the plot container width with a 96px minimum topic slot, bounded
      horizontal scrolling, wrapped full topic labels and an overflow-only hint.
      Keep the goal editor outside scrolling. Show 0% and 100% labels with clearance.
- [x] Use one-decimal percentages plus exact counts and explicit goal status in
      inspection/Table. Preserve empty and low-evidence states. Arrow/Home/End
      selection must reveal the active column; pointer, keyboard and tap must expose
      the same topic. Retain all qualifying topics in Table.
- [x] Run topic domain, contract and historical-view tests. Amend existing
      fixtures instead of introducing duplicate charts or broad fixture builders.

Run: `rtk npm run test -- src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/components/historical-views.test.tsx`.
Expected: all selected tests pass.

## Task 2: Compact inline Memory Signals

Files: `src/features/analytics/components/current-state-views.tsx`,
`src/features/analytics/domain/current-state-presentation.ts`, matching tests.

- [x] Update existing component assertions for an accessible ordered list, five
      ranked canonical links per page and all reason texts; preserve page reset on
      new data and top-25/total messaging. Run the component test to observe failure.
- [x] Replace only Memory Signals' three-column table with semantic rows. Use
      rank plus linked title, a wrapping reason line beneath and quiet separators.
      Reuse the existing pagination implementation; keep titles and controls usable
      at 320px. Do not modify Retention Map or its table.
- [x] Change reason text in the domain producer, never parse labels in the UI:
      `Estimated recall 70% · below FSRS target`, `Overdue · 2d`,
      `Low durability · 3d`. Preserve kind/order, severity, rank and every reason.
- [x] Keep the list's available width bounded at 36rem. Card width and minimum
      body-height changes are screen/panel integration owned by Task 4.
- [x] Run component and domain tests; preserve canonical URL assertions and
      distinguish the FSRS retention target from personal Recall.

Run: `rtk npm run test -- src/features/analytics/components/current-state-views.test.tsx src/features/analytics/domain/current-state-presentation.test.ts`.
Expected: all selected tests pass.

## Task 3: Daily backlog line and schedule segment counts

Files: `src/features/analytics/components/workload-views.tsx`,
`src/features/analytics/components/workload-views.test.tsx`; a feature-local
inspection helper only if both views actually reuse it.

- [x] Amend existing tests to exercise straight threshold-aware line geometry,
      null gaps, a known zero, an isolated known row, exact watch boundaries, and
      matching keyboard/tooltip selection. Observe intended failures first.
- [x] Replace step segments with straight connectors split at five. Each finite
      original row gets an independent dot, including zero/singleton. Keep supplied
      scale and dates, unknown gaps, status colors and understated reference bands.
      Preserve all summaries; add no intermediate count observations.
- [x] Use one synchronized workload selection for pointer/tap/keyboard and its
      active marker/inspector. Support arrows, Home/End, Enter/Space and Escape;
      hide duplicate permanent live-value copy. Refresh or clamp selection against
      new rows. Include date, exact count, unknown/watch status and report context.
- [x] Keep the existing schedule's fixed 14 rows, stacked exact Due/Overdue
      geometry, pink hatch, and all-zero empty state. For each positive segment,
      center its own integer only when rendered width and height fit text with 4px
      clearance. Keep the hatch from obscuring text.
- [x] Place tiny counts above their bar; explicitly name mixed and overdue-only
      fallback components. Measure labels at plot edges and against neighbors,
      stagger/wrap with clear association where necessary. Never inflate segments,
      duplicate totals, or label zero segments. Test due-zero/overdue-positive Today.
- [x] Add compact behavioral coverage for mixed/tiny/zero labels and synchronized
      schedule inspection. Reuse existing fixtures and keep test additions below
      production additions. Run the workload component tests.

Run: `rtk npm run test -- src/features/analytics/components/workload-views.test.tsx`.
Expected: all selected tests pass.

## Task 4: Screen integration, authority docs and verification

Files: `src/features/analytics/components/analytics-screen.tsx`,
`src/features/analytics/components/analytics-chart-panel.tsx` only if a small
optional body-height prop is needed; related existing tests; `docs/product.md`,
`docs/architecture.md`, `docs/testing.md`, `design.md`.

- [x] Pass `data.views.practiceRhythm.targetReviewSuccess` into Topic Performance.
      Compose `AnalyticsTargetEditor` with `metric="reviewSuccess"`, the existing
      target values and save callback; duplicate no preference or mutation logic.
- [x] Limit the Memory Signals card to 36rem and remove only its artificial
      minimum body height. Preserve panel order and all earlier historical charts.
- [x] Run focused screen and panel tests. Review each task against the approved
      spec, then review simplicity/quality. Resolve failures before full validation.
- [x] Update the authority sections for all-topic ordering/goal, inline signals,
      straight backlog snapshots, count labels, and required manual smoke cases.
      Record exact validation commands run/skipped and human proof still needed.
- [x] Run `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, touched-file
      Prettier and `rtk proxy git diff --check`. Expect success; fix any new failure.
- [x] Capture real production components at desktop and 320px in light/dark,
      including long/many topics, tiny/mixed/adjacent counts and sparse/zero backlog.
      Use a temporary proof harness outside tracked source; retain output proof.
- [x] Measure the diff's production vs test/fixture additions. Test/fixture
      additions must be at most 1:1. Prune duplicative assertions/fixtures instead
      of deleting meaningful boundary coverage to satisfy the budget.
- [x] Commit reviewed code with a Conventional Commit title. Provide the built
      dashboard and exact human installed-extension smoke checklist. Human happy
      path and edge-case screenshots/recording remain required before PR review or
      merge. Create a PR only if the user requests that handoff for this iteration.

## Implementation record

Implemented October 3, 2026 on `codex/analytics-topic-workload`.
Independent spec and quality reviews covered each panel; Topic review caught
and verified fixes for image-role ancestry and Escape/roving focus. The workload
watch caption was removed where it covered a measured five-dot.

The combined focused run passed 126 tests across eight files. Full `check`
passed 195 files and 2,108 tests; lint and production build passed. Build emits
the existing large-chunk warning; tests emit jsdom scrollTo notices.

Production-component browser proof uses a temporary Vite harness and sample
runtime responses outside tracked source. It passed 28 combinations: 1280px
and 320px; light/dark; normal, many topics, dense/tiny bars, overdue-only,
sparse history and zero states. Checks include document overflow, measured
label fit/collisions, exact dots, keyboard/tap inspection, pagination, bounded
topic scrolling and shared goal updates. This is agent proof, not installed
extension smoke. Screenshots are retained under the calling chats visualization
directory with `production-` filenames.

### Exact verification commands

Run from `/Users/tobiolutimehin/.codex/worktrees/analytics-topic-workload/cognipace-v2`
with the repository-pinned Node 24.20.0 and npm 11.19.0:

```sh
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin npm ci --offline
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin npm run prepare:wxt
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin npm run test -- src/features/analytics/components/historical-views.test.tsx src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/components/current-state-views.test.tsx src/features/analytics/domain/current-state-presentation.test.ts src/features/analytics/components/workload-views.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/components/analytics-chart-panel.test.tsx
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin npm run lint
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin npm run check
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin npm run build
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin npx prettier --check design.md docs/architecture.md docs/product.md docs/testing.md src/features/analytics
rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin npx prettier --ignore-path /dev/null --check docs/superpowers/plans/2026-10-03-analytics-topic-workload.md
rtk proxy git diff --check
rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node /private/tmp/check-cp-topic-workload-matrix.cjs
```

Initial test attempts were blocked by the shell's Node 26 default or absent
generated WXT types. Pinned Node 24 and `prepare:wxt` resolved those environment
failures. Expected red tests verified the topic cap, rising layout, inline
signals, workload geometry and keyboard regressions before their fixes.

No required automated command was skipped. `npm run db:generate` was not run
because database schema/migrations did not change; `npm run zip` was not run
because packaging/artifact behavior did not change. Installed-extension human
smoke is pending, since agent sample rendering cannot replace that requirement.

### Diff budget and handoff

Relative to merged main `7cccd2d7b63d8d01e226227ca9e62247e3c165e1`:
**462 test/fixture added lines versus 1,175 production added lines (0.39:1)**.
No permanent preview harness or additional fixture file was introduced.
Ponytail review found no further material complexity to remove after reusing
the existing report-context formatter.

The production build is in this worktree's `dist/chrome-mv3`. Preserve the
worktree and branch for the next handoff; no PR is created in this phase.
This is a user-visible Analytics feature change; the feature commit is a minor
release signal. Persisted data, scheduling, permissions and backup/sync formats
are unaffected. Reverting the feature commit restores the previous views.

Before PR review or merge, the human engineer must reload the rebuilt installed
extension and attach happy-path/edge-case screenshots or a recording for
`docs/testing.md` Analytics steps 17–21:

- Change the shared Review Success goal from Topic and Practice; verify both
  update, refresh persistence, all qualifying topics, low evidence and exact
  near-target status.
- Check long/many topic names at 320px, bounded scrolling, keyboard focus and
  tap inspection; Table must retain every qualifying topic.
- Check Memory Signals' ranks, complete inline reasons, canonical links,
  pagination, data refresh/reset and returned-top-25 versus total copy.
- Check backlog zeros, isolated observations, unknown gaps, final unknown
  current value, watch threshold and matching pointer/tap/keyboard selection.
- Check schedule mixed/tiny/neighboring/overdue-only bars, exact segment counts,
  all-zero state and date/report context; change historical ranges and confirm
  the fixed 14-day schedule remains available.
