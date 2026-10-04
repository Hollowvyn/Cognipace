# Retention Map Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the
> independent read-model and chart tasks, followed by specification and code
> quality reviews. Track execution with the checkboxes below.

**Goal:** Implement the approved full memory landscape with reliable box zoom
and complete inspection/Table access.

**Architecture:** Reuse the Analytics payload and FSRS ownership. Remove only
the Retention Map transport/presentation caps; implement local chart viewport
and interaction state through public Recharts scales. Keep Memory Signals and
all other charts unchanged.

**Tech stack:** React 19, TypeScript, Recharts 3.10, Zod, Vitest/Testing Library.

## Task 1: Complete eligible cohort

Files: `src/features/analytics/domain/current-state-presentation.ts` and its
existing test; `src/features/analytics/api/analytics-contracts.ts` and its
existing test.

- [x] Change the existing generated 31-question regression to require 31 rows,
      rank 31 and the final slug; assert status accounting equals the full cohort.
      Reuse the existing input factory and summary fixture for schema acceptance.

  ```ts
  expect(views.retentionMap.rows).toHaveLength(31)
  expect(views.retentionMap.rows.at(-1)).toMatchObject({
    rank: 31,
    slug: 'risk-30',
  })
  ```

- [x] Run `npm test -- src/features/analytics/domain/current-state-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts`;
      confirm the new over-30 expectation fails before the production change.
- [x] Remove `.slice(0, 30)` before assigning retention ranks, remove rank
      `.max(30)` and retention rows `.max(30)`. Preserve positive integer ranks,
      validated numeric data, eligibility, sorting, status counts and full domains.

  ```ts
  const retainedRetentionRows = orderedRetentionRows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }))
  ```

- [x] Rerun the focused command. Keep generated eligibility/threshold cases
      compact; do not add another bulk service/repository fixture.

## Task 2: Full-landscape rendering and local viewport

Files: modify `src/features/analytics/components/current-state-views.tsx` and
its existing test; create `retention-map-chart.tsx` and `retention-map-model.ts`
in that same component directory; add one compact model test only if the math
cannot be adequately covered through component/browser behavior. Scope any
needed styles to `src/styles/analytics.css`. Update the Retention panel copy in
`src/features/analytics/components/analytics-screen.tsx`.

- [x] Preserve Memory Signals and existing table pagination. Replace the capped
      summary with full counts and All/Below target controls; use the filtered
      original rows for both Chart and Table, with stable full-data domains.
- [x] Extract the Retention chart into its feature file. Render only three
      status bands/keys, exact circle/diamond/triangle coordinates, top reference
      captions and explicit axes. Share duration/status labels with the Table.
- [x] Add controlled viewport domains with `allowDataOverflow` on both axes,
      fixed glyph sizes and quiet sparse ticks. Use the public plot and forward/
      inverse scale hooks to implement one native plot inspection button.

  ```tsx
  <XAxis
    allowDataOverflow
    dataKey="targetDurationDays"
    domain={viewport.duration}
    scale="log"
    type="number"
  />
  <YAxis
    allowDataOverflow
    dataKey="retrievability"
    domain={viewport.recall}
    type="number"
  />
  ```

- [x] Implement hover/tap/keyboard access and an overlap chooser, using original
      row identity. Keep all filtered questions reachable by arrows/Home/End and
      reveal an offscreen active question. Put complete pinned details below the
      chart with canonical links, focus restoration and outside/Escape dismissal.
- [x] Implement the approved drag box: clamp normalized corners to the plot,
      require at least 12px in each dimension, and fit without cropping. Perform
      viewport math in log-duration/linear-recall space, constrain to the full
      domain and finite maximum magnification. Keep wheel/pinch/pan and explicit
      plus/minus/reset controls; prevent the trailing drag click from pinning.
- [x] Preserve the pre-double-click pin when resetting. Give box-cancel Escape
      priority over details dismissal. Cancel gesture state on lost capture,
      pointer cancellation, blur and resize.
- [x] Rewrite outdated point-button tests around visible native interaction.
      Cover full/filter/Table parity, collision choice, keyboard final-question
      access, pin/reset/cancel behavior and regenerated small fixtures. Run
      `npm test -- src/features/analytics/components/current-state-views.test.tsx`
      and the model test if created. Existing Memory Signals assertions must pass.

## Task 3: Integration, proof and handoff

Files: update `docs/product.md`, `docs/architecture.md`, `docs/testing.md`,
`design.md`, and `docs/superpowers/README.md`; create a dated handoff in
`docs/superpowers/handoffs/`. Put browser harnesses and generated screenshots
outside committed production/test trees; use real production components.

- [x] Review Task 1 and Task 2 against the approved spec, then review quality
      and prune unnecessary code/duplicated tests. Measure added production versus
      test/fixture lines; enforce the user's at-most-1:1 requirement.
- [x] Run the combined focused tests, `npm run lint`, `npm run check`,
      `npm run build`, and Prettier checks for touched source/Markdown files.
      Record exact commands and any skipped validation with its reason.
- [x] Browser-check the production component at desktop and 320px in light/dark:
      above-30 cohort, zero/one point, dense exact overlaps, below-target empty,
      reversed/nested/edge box zoom, thin drag, release outside, cancel/blur/resize,
      double-click pin preservation, wheel anchor, native touch pinch and keyboard
      reveal. Capture default, magnified and selected-detail proof.
- [x] Update authoritative wording and the manual smoke checklist; record
      human installed-extension smoke/proof as pending rather than N/A.
- [x] Commit with Conventional Commit titles and prepare a PR-ready handoff.
      Do not merge or claim human smoke completion.

Done when every eligible row is available, all approved interactions have
production-component proof, required automation passes and independent review
has no unresolved findings. Remaining human extension smoke is explicit.
