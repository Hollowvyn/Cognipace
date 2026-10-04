# Retention Map full landscape handoff

Branch: `codex/analytics-retention-landscape`, based on `origin/main` after PR
#187 merged. The approved design and implementation plan are indexed in
`docs/superpowers/README.md`.

## Delivered behavior

Retention Map includes every eligible active reviewed problem. The producer and
Zod contract no longer enforce a 30-row/rank cutoff. Eligibility, estimates,
deterministic ranking, full-cohort scales/status counts and Memory Signals'
separate 25-row limit retain their owners.

The chart uses exact log-duration/linear-recall positions, three consistent
status shapes, restrained bands, the FSRS scheduling target and a seven-day
durability benchmark. All/Below target share the original rows with the seven-row
Table, preserve the full landscape and explain empty results in either tab.
Pinned details and every overlapping candidate are available below the plot;
native keyboard inspection reaches all questions and reveals offscreen rows.

Box magnification supports reversed, nested and edge selections; canceled and
thin drags do not pin questions. Double-click/reset preserves pinned details.
Wheel/pinch anchors use public inverse scales, panning uses the actual padded
scale extents, and marks retain their screen size. Filter/viewport state is local
presentation state. There are no new dependencies, permissions, persistence
fields, migrations or runtime methods.

## Review and size

Independent data specification/quality review and UI specification/quality
review completed. Three UI findings were corrected: shared empty-state copy,
hover/Enter identity parity and inverse-scale wheel/pinch anchoring. Browser
integration also corrected Chart/Table switching dismissing a pin. Ponytail's
initial suggestion removed four redundant gesture-state lines. The follow-up
PR review reused the existing sparse-tick helper and fixture point parser,
removing another 11 lines without removing test cases.

Production adds 1,362 lines and removes 643; tests add 334 and remove 143. There
are no committed bulk fixtures. Both added-line and net-line test/production
ratios are below the user's maximum 1:1. Browser harnesses and generated data
remain outside the repository.

## Automated validation

Commands used the pinned Node 24.20.0/npm 11.19.0 environment through
`rtk proxy env PATH=/Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin:/opt/homebrew/bin:/usr/bin:/bin`.
Passed:

- `npm test -- src/features/analytics/domain/current-state-presentation.test.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/components/current-state-views.test.tsx src/features/analytics/components/retention-map-model.test.ts src/features/analytics/components/analytics-screen.test.tsx` — 97 tests in five files.
- `npm run lint`.
- `npm run check` — DB consistency, WXT preparation/typecheck, lint and 2,176 tests in 196 files.
- `npm run build` — production Chrome MV3 extension in `dist/chrome-mv3`.
- `npx prettier --ignore-path /dev/null --check design.md docs/architecture.md docs/product.md docs/testing.md docs/superpowers/README.md docs/superpowers/specs/2026-10-04-analytics-retention-landscape-design.md docs/superpowers/plans/2026-10-04-analytics-retention-landscape.md docs/superpowers/handoffs/2026-10-04-analytics-retention-landscape.md src/features/analytics/api/analytics-contracts.ts src/features/analytics/api/analytics-contracts.test.ts src/features/analytics/domain/current-state-presentation.ts src/features/analytics/domain/current-state-presentation.test.ts src/features/analytics/components/analytics-screen.tsx src/features/analytics/components/current-state-views.tsx src/features/analytics/components/current-state-views.test.tsx src/features/analytics/components/retention-map-chart.tsx src/features/analytics/components/retention-map-model.ts src/features/analytics/components/retention-map-model.test.ts src/styles/analytics.css` — explicit paths include planning files normally excluded by `.prettierignore`.
- `git diff --check`.

Follow-up cleanup validation uses the same pinned environment: the focused
command `npm test -- src/features/analytics/components/current-state-views.test.tsx src/features/analytics/components/retention-map-model.test.ts src/features/analytics/components/charts/historical-chart-model.test.ts`
passes all 20 tests in three files. Production-component browser checks were
not repeated for this behavior-equivalent helper reuse; the existing browser
proof remains below. `npm run lint`, `npm run check` (2,176 tests in 196 files),
`npm run build`, `npx prettier --ignore-path /dev/null --check src/features/analytics/components/retention-map-model.ts src/features/analytics/components/current-state-views.test.tsx docs/superpowers/handoffs/2026-10-04-analytics-retention-landscape.md`
and `git diff --check` also pass for the cleanup.

The full test suite emits existing jsdom `scrollTo` notices. Build emits the
existing large-chunk warning; neither command failed.

## Production-component browser proof

`rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node /private/tmp/verify-retention-production.cjs`
drives local Chrome with
Playwright against actual production components and generated domain inputs.
All ten check groups pass with no page errors: full/final-row access, exact
selected-point containment across forward/reverse/nested boxes, thin/outside/
Escape handling, reset pin preservation, all 25 coincident choices, stable
filters/empty/single/boundary/350-row cases, wheel/Shift-pan/blur/resize,
cursor anchoring and hover/Enter parity, light/dark desktop/320px layout, and
native touch pinch/pan/tap.

Local proof directory:
`/Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0fb5d-b2c6-74e0-adff-a0ea6cef7dce/retention-production-proof/`.
It contains `browser-results.json`, default desktop light/dark, magnified,
selected-detail and mobile light/dark PNGs. This is agent proof using illustrative
data, not human smoke in the installed extension.

## Required human smoke and skipped validation

**Pending before PR review or merge**, per `docs/agent-governance.md`: reload the
built extension and complete Dashboard Analytics Retention Map step 19 in
`docs/testing.md`, including happy-path full-cohort/filter/pin/Table/zoom and
edge-case overlaps, empty results, canceled/reversed selections, keyboard,
touch and both themes. Attach installed-extension screenshot or recording
proof. Confirm FSRS state, due dates and Settings stay unchanged.

- `npm run zip` skipped: extension artifact/packaging behavior is untouched.
- `npm run db:generate` skipped: no schema or persisted shape changes;
  `npm run check` includes `npm run db:check`.
- Human installed-extension smoke/proof remains pending; agent browser checks
  cannot replace it.

Release impact: feature-level Analytics enhancement. Rollback is reverting this
change and rebuilding; no persisted data needs recovery.
