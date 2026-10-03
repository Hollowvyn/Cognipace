# Analytics Historical Charts Handoff

Status: implemented and saved locally on `codex/analytics-layout-polish`.
The user approved the chart previews and explicitly requested implementation
of the first four charts before the remaining panels. The phase plan was saved
in `8f73d27` before source implementation, after incorporating `origin/main`
at `a20e8c6`. No PR, push, merge, or release publication was requested.

## Details

Observed Recall vs FSRS Estimate, Memory Strength, Practice Rhythm, and Ratings
Mix now use the approved treatments in the real dashboard. Sparse calendar
ticks remain independent of all supplied observations; marks use the midpoint
of each actual interval. MM/DD dates, full inspection ranges, other-year /YY,
grouping, shortened edge intervals, report time, and in-progress context are
shared across charts and exact-value tables.

- Recall uses solid circles, short-dashed estimate diamonds, longer missing
  bridges, a target caption above the plot, and compact native series controls.
  Hiding a series removes its curve, markers, and inspected rate together.
  Signed differences use serialized values, with no permanent bottom detail row.
- Memory Strength uses discrete supported Q1–Q3 whiskers and median markers.
  Its fitted duration domain preserves every finite extremum, low-value
  clearance, and an actual two-day minimum. The approved 0.5–44 day example
  fits 0–50 days instead of the former 0–80 range.
- Practice Rhythm combines muted completed-review columns with a mint Review
  Success line, independent labeled axes, exact numerator/denominator context,
  and the visible association explanation.
- Ratings Mix retains all supplied periods. Empty composition gets a full-height
  neutral gray diagonal hatch; populated categories preserve exact fractions.
  Contrasting 12px whole-percentage labels appear only when their measured
  width and height fit. Counts and precise shares remain in inspection/Table.

The Analytics feature owns the shared calendar model, plot frame, inspection,
and seven-row table. Pointer position and keyboard focus/arrows/Home/End select
the same original rows; Escape hides details, and missing values never acquire
measured markers. Table scrolling contains only the table so its scrollbar
cannot cover the pagination buttons. Single-point and wholly empty guidance
remain explicit.

The dashboard gives the Recall and Memory/Practice area more room. The pair
stacks below 1040px of available content; its plots stay aligned when readiness
messages differ. Scoped historical styles leave Topic Performance, Retention
Map, Memory Signals, Recent Overdue Backlog, and Upcoming Review Load for their
later iteration. Data contracts, runtime methods, persistence, permissions,
scheduling, and readiness calculations are unchanged. Product, architecture,
design, and testing authority now describe the implemented behavior.

Exact approved source, screenshots, and checksums are preserved separately in
the [Recall](../specs/2026-10-02-analytics-recall-approved-design.md),
[Memory/Practice](../specs/2026-10-02-analytics-memory-practice-approved-design.md),
and [Ratings Mix](../specs/2026-10-02-analytics-ratings-mix-approved-design.md)
archives. Frozen artifacts were not reformatted or overwritten.

## Issue

No issue: direct user-requested work with approved designs and a committed
phase-sized implementation plan.

## Testing

- [x] `rtk npm run check` passed: database checks, WXT type generation,
      TypeScript, ESLint, and **191 files / 1,985 tests** after the last source edit.
- [x] `rtk npm run lint` passed independently.
- [x] `rtk npm run build` passed after the last source edit; local production
      extension output is `dist/chrome-mv3`.
- [x] Focused model, scale, inspection, marker, view, panel, and screen tests
      passed: **13 files / 103 tests**. The three affected view suites were
      repeated after the final table-scroll change: **25 tests** passed.
- [x] Repository formatting, explicit ignored Markdown formatting, and diff
      whitespace checks passed. All three approved snapshot manifests match
      their recorded SHA-256 and byte counts.
- [x] Independent spec and quality reviews completed; findings were repaired.
      The final table-wrapper review found no remaining substantive issue.
- [ ] Human installed-extension happy-path and edge-case smoke with screenshots
      or a recording remains pending before PR review or merge.

Exact root validation commands:

```sh
rtk npm ci
rtk npm run prepare:wxt
rtk npm run test -- src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/charts/historical-chart.test.tsx src/features/analytics/components/charts/line-segments.test.tsx src/features/analytics/components/charts/line-segments.integration.test.tsx src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/memory-practice-views.test.tsx src/features/analytics/components/historical-views.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/domain/analytics-scales.test.ts src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/components/analytics-chart-panel.test.tsx src/components/ui/chart.test.tsx src/components/ui/chart-table.test.tsx
rtk npm run test -- src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/memory-practice-views.test.tsx src/features/analytics/components/historical-views.test.tsx
rtk npm run typecheck
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk proxy npx prettier --write design.md docs/architecture.md docs/product.md docs/testing.md
rtk proxy npx prettier --ignore-path /dev/null --write docs/superpowers/README.md docs/superpowers/plans/2026-10-02-analytics-historical-charts.md docs/superpowers/specs/2026-10-02-analytics-layout-polish-design.md docs/superpowers/specs/2026-10-02-analytics-memory-practice-approved-design.md docs/superpowers/specs/2026-10-02-analytics-recall-approved-design.md docs/superpowers/specs/2026-10-02-analytics-ratings-mix-approved-design.md docs/superpowers/handoffs/2026-10-02-analytics-historical-charts.md
rtk proxy npx prettier --ignore-path /dev/null --check docs/superpowers/README.md docs/superpowers/plans/2026-10-02-analytics-historical-charts.md docs/superpowers/specs/2026-10-02-analytics-layout-polish-design.md docs/superpowers/specs/2026-10-02-analytics-memory-practice-approved-design.md docs/superpowers/specs/2026-10-02-analytics-recall-approved-design.md docs/superpowers/specs/2026-10-02-analytics-ratings-mix-approved-design.md docs/superpowers/handoffs/2026-10-02-analytics-historical-charts.md
rtk proxy python3 /private/tmp/verify-analytics-design-snapshots.py
rtk proxy git diff --check
```

The initial baseline command below failed before tests could load because this
fresh checkout did not yet have WXT's generated `.wxt/tsconfig.json`. After
`rtk npm run prepare:wxt`, the same command passed **24 tests**:

```sh
rtk npm run test -- src/features/analytics/components/historical-views.test.tsx src/features/analytics/components/analytics-chart-panel.test.tsx src/features/analytics/components/analytics-screen.test.tsx
```

New regression tests initially failed for fitted-scale extrema, optional marker
clipping/paint order, and the historical panel option before implementation.
An intermediate full `rtk npm run check` had four failures from superseded
table column/context expectations; these were corrected before the final pass.
An initial `rtk npm run lint` included temporary browser-harness files outside
the TypeScript project; moving that harness outside the repository fixed it.
Final validation has no test, type, or lint failures. Existing jsdom
`Window.scrollTo` notices and the build's large-chunk warning remain nonfatal.

### Browser Component Proof

An isolated Vite page rendered the actual production React views, panel,
readiness component, SurfaceRoot, and app styles using illustrative typed
fixtures. It did not load the installed extension runtime or live database,
and it made no application data writes. The temporary server is stopped after
capture. Fixture source is saved as text beside the screenshots for recovery:

- [Fixture entry](assets/2026-10-02-analytics-historical-charts/fixture-main.tsx.txt)
- [Vite config](assets/2026-10-02-analytics-historical-charts/fixture-vite.config.ts.txt)
- [Proof CSS](assets/2026-10-02-analytics-historical-charts/fixture-proof.css.txt)
- [HTML entry](assets/2026-10-02-analytics-historical-charts/fixture-index.html.txt)

Server command used:

```sh
rtk proxy node node_modules/vite/bin/vite.js --config /private/tmp/cognipace-analytics-preview/vite.config.ts --host 127.0.0.1 --port 4317 --strictPort
```

Browser checks covered 1440px light/dark, 1280px stacking, and 320px narrow
layouts without page overflow. Memory/Practice plot bounds matched at wide
widths, including mixed readiness. Narrow Practice axis headers staggered
without overlap; Ratings labels disappeared when space was insufficient while
their exact values remained available. Ready, sparse, single-point, and empty
states were captured. The 100% active Recall glyph remained unclipped and
painted above curves. Keyboard Home/End/arrows/Escape, unknown inspection,
series visibility, and native table Next/Previous were exercised. Recall
inspection showed exact 5/6 = 83.3% and −6.7 pp, plus the current partial bucket
and report timezone. Physical touch and hover without focus were not verified
in the browser; pointer coordinates and hover Escape have automated coverage.
14/90-day and cross-year grouping have model tests but still need the human
extension cases below.

The temporary development harness emitted duplicate-root notices during HMR
and initial zero-size chart warnings before responsive measurement. A fresh
reload settled to SVG bounds matching the chart hosts; the saved ready proof
was captured after that layout settled. These notices are not a passing claim
about the installed extension's console.

### Skipped Validation And Required Human Smoke

- `rtk npm run zip`: no packaging/release workflow changed and no store upload
  was requested; the production build passed.
- `rtk npm run db:generate`: no schema or migration changes; `db:check` passed
  inside the full check.
- Human realtime installed-extension smoke is pending, as required by
  `docs/agent-governance.md`; agent fixture proof does not replace it.

Use the **Dashboard Analytics** flow in [docs/testing.md](../../testing.md):

- [ ] Load/reload this worktree's `dist/chrome-mv3` extension, reopen Analytics,
      and test separate ready-history and sparse-history datasets.
- [ ] Test 14/30/90 days, daily/three-day/weekly grouping, range changes, report
      timezone, shortened edges, cross-year dates, and the current partial bucket.
- [ ] Compare exact Chart/Table values, counts, provenance, unavailable values,
      seven-row paging, and reset after range changes.
- [ ] Exercise pointer, physical tap, keyboard focus/arrows/Home/End/Enter/Space,
      Escape, series controls, unknown buckets, and marker/whisker boundary clearance.
- [ ] Check fitted Memory ranges, supported/unsupported quartiles, mixed Practice
      axes and zero/unknown distinctions, striped Ratings slots, and label fit.
- [ ] Repeat wide/narrow, light/dark, and mixed readiness. Confirm deferred
      panels retain their current behavior through the real extension runtime.
- [ ] Record build, datasets, ranges, widths, themes, exact passed/pending cases,
      and attach ready-history plus sparse-history screenshots or a recording.

## Screenshots

These are implemented production components with fixtures, not installed-
extension smoke or the frozen design previews.

- [Ready, dark](assets/2026-10-02-analytics-historical-charts/ready-dark.jpg)
- [Ready, light](assets/2026-10-02-analytics-historical-charts/ready-light.jpg)
- [Exact Recall inspection](assets/2026-10-02-analytics-historical-charts/recall-inspection.jpg)
- [Narrow Practice Rhythm](assets/2026-10-02-analytics-historical-charts/narrow-practice.jpg)
- [Narrow Ratings Mix](assets/2026-10-02-analytics-historical-charts/narrow-ratings.jpg)
- [Ratings Table page two](assets/2026-10-02-analytics-historical-charts/ratings-table.jpg)
- [Mixed readiness](assets/2026-10-02-analytics-historical-charts/mixed-readiness.jpg)
- [Sparse, light](assets/2026-10-02-analytics-historical-charts/sparse-light.jpg)
- [Single measured point](assets/2026-10-02-analytics-historical-charts/single-point.jpg)
- [Empty selected period](assets/2026-10-02-analytics-historical-charts/empty.jpg)

## Risk, Release, And Recovery

Patch release impact: presentation, inspection, and Memory duration fitting in
the four historical dashboard charts. Principal integration risks are real
extension report data and input/layout behavior, covered by the pending human
smoke above. There is no persisted-shape change or new permission. A scoped
revert of the implementation commit restores the previous presentation without
a database migration or data recovery. Keep the frozen approved design archives
as the source for any later visual correction.
