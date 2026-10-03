# Merged Practice Rhythm Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute
> this approved phase with independent specification and quality review.

**Goal:** Replace separate Practice Rhythm/Ratings Mix dashboard cards with the
approved mixed stacked-ratings chart and completed-review line.

**Architecture:** Join the existing immutable serialized views at the feature
presentation boundary. A dedicated merged component owns rendering and shared
inspection/Table rows; the screen retains Settings editor composition. Existing
historical primitives own dates, axes, inspection, and pagination.

**Tech Stack:** React 19, TypeScript, existing Recharts public scales, Vitest and
React Testing Library, scoped analytics CSS.

## Task 1: Join intervals and render the merged view

**Files:** Create `src/features/analytics/components/practice-ratings-model.ts`
and `.test.ts`; create `practice-ratings-view.tsx` and `.test.tsx` in that same
directory. Modify `src/styles/analytics.css` only for scoped merged colors.

- [x] Write join regression tests before implementation. Supply reordered
      arrays, absent counterparts, equal IDs with different boundaries,
      count-only edges, measured zero success, internal empty rows, and entirely
      empty history. Freeze inputs and assert original rows are retained.
- [x] Run `rtk npm run test -- src/features/analytics/components/practice-ratings-model.test.ts`
      and observe RED. Implement a typed interval union sorted by date with a
      contiguous supported slice. The key is
      `JSON.stringify([row.id, row.bucketStart, row.bucketEnd])`.
      A merged row exposes `practice`, `ratings`, and nullable
      `completedReviews`, retaining original objects. Support is positive
      completed reviews, positive valid-rating counts in either source, or a
      supplied finite Practice success rate including zero.
- [x] Write component tests before rendering code. Assert percentage/count
      coordinates are independent, Easy/Good/Hard/Again bottom-to-top exact
      shares, hatching and zero category geometry, target 0/1 on left axis,
      unavailable composition with known zero count, visibility parity without
      date/window changes, full interval/evidence and supplied success in
      keyboard inspection, seven-row pagination, and empty target availability.
- [x] Run `rtk npm run test -- src/features/analytics/components/practice-ratings-view.test.tsx`
      and observe RED. Implement this public interface:

      ```tsx
      export function PracticeRatingsView({ view, ratingsView, timeFrame, targetControl }: {
        view: AnalyticsViews['practiceRhythm']
        ratingsView: AnalyticsViews['ratingsMix']
        timeFrame?: HistoricalChartTimeFrame | undefined
        targetControl?: ReactNode
      }) { /* exact supplied rows and existing shared primitives */ }
      ```

      Pass `yAxes` with primary `id: 'ratings'`, scale
      `{domain:[0,1],ticks:[0,.25,.5,.75,1]}`, `padding:{top:6,bottom:8}`,
      and optional `id:'count'`, right orientation, `view.countScale`. Use
      `HistoricalTargetLine value={view.targetReviewSuccess} yAxisId="ratings"`.
      Draw stack rects with public X/Y scales. Draw counts on the count axis
      with a thin neutral path and measured circles (3px ordinary / 4px active).
      Known zeros join normally; missing counts remain unmarked. Keep category
      labels measured for fit and skip overlaps with target/count crossings.
      Use one shared tooltip and Table slice. Keep prior-period summary honest.

- [x] Run both new suites and existing historical suites. Format touched source.
      Specification review must precede quality review; fix actionable findings.

## Task 2: Compose one dashboard card

**Files:** Modify `src/features/analytics/components/analytics-screen.tsx`,
`analytics-screen.test.tsx`, and `historical-views.tsx`.

- [x] Add a failing screen regression: one Practice Rhythm region contains
      the target and merged chart, and no separate Ratings Mix region exists.
      Include rating readiness differing from practice readiness.
- [x] Run `rtk npm run test -- src/features/analytics/components/analytics-screen.test.tsx`
      and observe the intended failures.
- [x] Export/import `PracticeRatingsView`, pass `view={data.views.practiceRhythm}`
      and `ratingsView={data.views.ratingsMix}`, retaining the existing
      `AnalyticsTargetEditor metric="reviewSuccess"` and callback. Place Recall
      and Practice as full-width cards, then Memory/Topic in a responsive pair.
      Keep the Topic component and later panels unchanged. Expose differing
      rating readiness with the existing `AnalyticsReadinessState compact`.
- [x] Update only obsolete screen expectations; run screen, target-editor,
      model, and merged-view tests. Review specification and then quality.

## Task 3: Validation, proof, docs, and existing PR

**Files:** Update `design.md`, `docs/product.md`, `docs/architecture.md`,
`docs/testing.md`, `docs/superpowers/README.md`; create
`docs/superpowers/handoffs/2026-10-03-analytics-practice-ratings-merge.md` and proof
assets under `docs/superpowers/handoffs/assets/2026-10-03-analytics-practice-ratings-merge/`.

- [x] Amend current authority to the three-card historical composition and
      merged plot, fixed percent scale, separate count scale, preserved goals,
      readiness and comparison, interval union, and human smoke checklist.
- [x] Render actual production components in an isolated Vite fixture using
      ready, sparse, zero, count-only, partial/cross-year and empty rows. Capture
      desktop light/dark, 320px light/dark, keyboard gap inspection, Table, and
      target editing. Inspect each screenshot; verify 320px no horizontal
      document overflow. Fixture saves must be clearly distinguished from
      Settings persistence and human extension smoke.
- [x] Run `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`,
      `rtk npm run format`, touched Markdown Prettier and `rtk proxy git diff --check`.
      Record exact commands/results. `rtk npm run db:generate` is skipped because
      no schema changes; `rtk npm run zip` is skipped because packaging is
      unchanged. Keep human realtime installed-extension smoke pending.
- [x] Complete final independent review and resolve findings. Commit with a
      Conventional Commit title, push `codex/analytics-layout-polish`, and update
      draft PR #184 using the existing PR template and `--body-file`. Attach the
      existing PR to this task. Leave it draft until required human smoke proof.
