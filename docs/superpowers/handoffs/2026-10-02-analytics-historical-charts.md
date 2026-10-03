# Analytics Historical Charts Handoff

PR: [#184](https://github.com/Hollowvyn/Cognipace/pull/184) (draft).

Current status: implemented, with empty-edge trimming on all four historical
charts. Human installed-extension smoke remains pending before review or merge.

Original implementation checkpoint: saved locally on `codex/analytics-layout-polish`.
The user approved the chart previews and explicitly requested implementation
of the first four charts before the remaining panels. The phase plan was saved
in `8f73d27` before source implementation, after incorporating `origin/main`
at `a20e8c6`. That checkpoint preceded the later request to create draft PR #184.
No merge or release publication was requested.

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

## Follow-Up: Empty Edge Trimming

The user explicitly requested empty beginning and ending periods be trimmed
from Recall, Practice Rhythm, and Ratings Mix while preserving middle gaps.
The approved design/plan addendum was committed before source changes. This
supersedes the original full-window display policy; exact approved snapshot
assets and the original screenshots remain unchanged historical records.

`trimHistoricalEmptyEdges` returns an immutable contiguous first-supported to
last-supported slice. Recall retains either known rate; Practice retains
review volume, valid ratings, or a finite success rate; Ratings retains valid
ratings. Measured 0% is supported. Chart, Table, inspection, and reset keys use
that same slice. Internal unavailable periods keep their bridges, zero-volume
slots, or gray hatching. Recall series toggles cannot move dates. Memory
Strength's rows, original service data, selected-period totals/comparisons,
readiness, serialized Y scales, grouping, and report context are unchanged.
Empty/all-empty inputs keep explicit empty states; one supported interval keeps
its real calendar bounds and single-point guidance. Recall's trend count now
uses known visible rates, including an FSRS-only singleton.

Passed after the last source edit: **5 focused files / 59 tests**, independent
lint, full check **191 files / 1,994 tests**, and production build. Formatting
and diff whitespace checks passed. The initial test run had **7 expected
failures / 28 passes** before trimming was implemented. Independent review
found two partial-cohort cases (FSRS-only trend count and zero-volume known
Practice evidence); both were fixed and covered, with no remaining substantive
findings. Existing jsdom scroll notices and build chunk warnings remain nonfatal.

Exact follow-up validation commands:

```sh
rtk npm run test -- src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/memory-practice-views.test.tsx
rtk npm run test -- src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/memory-practice-views.test.tsx src/features/analytics/components/historical-views.test.tsx src/features/analytics/components/analytics-screen.test.tsx
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk proxy npx prettier --write docs/product.md docs/architecture.md docs/testing.md design.md
rtk proxy npx prettier --check docs/product.md docs/architecture.md docs/testing.md design.md
rtk proxy npx prettier --ignore-path /dev/null --write docs/superpowers/plans/2026-10-02-analytics-historical-charts.md docs/superpowers/specs/2026-10-02-analytics-layout-polish-design.md docs/superpowers/specs/2026-10-02-analytics-memory-practice-approved-design.md docs/superpowers/specs/2026-10-02-analytics-recall-approved-design.md docs/superpowers/specs/2026-10-02-analytics-ratings-mix-approved-design.md docs/superpowers/handoffs/2026-10-02-analytics-historical-charts.md
rtk proxy npx prettier --ignore-path /dev/null --check docs/superpowers/plans/2026-10-02-analytics-historical-charts.md docs/superpowers/specs/2026-10-02-analytics-layout-polish-design.md docs/superpowers/specs/2026-10-02-analytics-memory-practice-approved-design.md docs/superpowers/specs/2026-10-02-analytics-recall-approved-design.md docs/superpowers/specs/2026-10-02-analytics-ratings-mix-approved-design.md docs/superpowers/handoffs/2026-10-02-analytics-historical-charts.md
rtk proxy git diff --check
```

Agent browser proof used the actual production components with ten supplied
intervals, including empty prefixes, an internal gap, and empty suffixes.
Recall, Practice, and Ratings displayed **09/09–09/26**; Memory retained
**09/03–10/02**. Recall Home/End selected the first/last measured intervals;
arrow navigation still inspected **09/15–09/17** as unavailable. Practice End
reported the final retained cohort; Memory Home still inspected its supplied
empty beginning. Ratings Table contained the same six retained intervals.
The 320px light-theme check had no page overflow and preserved the middle gray
stripe. Live SVG bounds matched their measured chart hosts. The full-page
capture returned saved pixels with shrunken SVG plots despite correct live
rendering; the wide proof was replaced with two ordinary viewport captures.
The saved viewport images were inspected directly after capture. No production
chart sizing change was needed.

- [Wide trimmed charts, dark](assets/2026-10-02-analytics-historical-charts/edge-trim-dark.jpg)
- [Lower trimmed charts, dark](assets/2026-10-02-analytics-historical-charts/edge-trim-lower-dark.jpg)
- [Narrow trimmed Ratings, light](assets/2026-10-02-analytics-historical-charts/edge-trim-narrow-light.jpg)
- [Follow-up fixture entry](assets/2026-10-02-analytics-historical-charts/fixture-edge-main.tsx.txt)

Skipped: `rtk npm run zip` because packaging/release behavior is unchanged;
`rtk npm run db:generate` because no schema changed (`db:check` passed).
Human installed-extension ready-history happy path and sparse-history edge
cases remain pending before review or merge. The updated Dashboard Analytics
checklist in [docs/testing.md](../../testing.md) explicitly covers empty edges,
retained middle gaps, 0%/partial cohorts, Chart/Table windows, and untrimmed
Memory Strength. This is a patch presentation change; reverting the follow-up
implementation restores the previous window without data migration or recovery.

## Follow-Up: Memory Strength Empty Edges

The user then approved the same empty-edge treatment for Memory Strength.
This supersedes the previous follow-up's Memory exception. The approved design
and focused plan were committed in `3104ba0` before source implementation.
All four historical views now use the contiguous first-supported through
last-supported slice for Chart, Table, and inspection.

Memory's support predicate is a finite `medianStrengthDays`. Missing quartiles
or fewer than four eligible reviews cannot discard a known median; those
conditions govern whiskers only. Internal unavailable periods remain in place.
Finite zero is retained defensively at the view boundary; validated runtime
stability remains positive and its contract is unchanged. Source rows, exact
dates/values, fitted serialized duration scale, discrete whisker eligibility,
report context, readiness, and service data remain unchanged.

The new component regressions cover both trimmed ends, internal unavailable
inspection and bridges, frozen input and scale, small cohorts, sub-day medians,
singleton guidance/real intervals, all-null history, and Chart/Table parity.
The initial red run had **3 expected failures / 10 passes**. After the change,
**4 focused files / 47 tests** passed. Independent review found no behavior
issues and caught a test-only readonly scale typing mismatch before the full
check; the fixture now copies the domain/ticks into the existing mutable
contract shape. Full validation passed **191 files / 1,996 tests**, independent
lint, production build, formatting, and whitespace checks. Existing jsdom
scroll notices and the build's large-chunk warning remain nonfatal.

Exact validation commands for this follow-up:

```sh
rtk npm run test -- src/features/analytics/components/memory-practice-views.test.tsx
rtk npm run test -- src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/memory-practice-views.test.tsx src/features/analytics/components/historical-views.test.tsx src/features/analytics/components/analytics-screen.test.tsx
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk proxy npx prettier --write src/features/analytics/components/memory-practice-views.tsx src/features/analytics/components/memory-practice-views.test.tsx
rtk proxy npx prettier --write --ignore-path /dev/null docs/product.md docs/architecture.md docs/testing.md design.md docs/superpowers/specs/2026-10-02-analytics-memory-practice-approved-design.md docs/superpowers/specs/2026-10-02-analytics-recall-approved-design.md docs/superpowers/specs/2026-10-02-analytics-ratings-mix-approved-design.md
rtk proxy npx prettier --check --ignore-path /dev/null docs/product.md docs/architecture.md docs/testing.md design.md docs/superpowers/specs/2026-10-02-analytics-memory-practice-approved-design.md docs/superpowers/specs/2026-10-02-analytics-recall-approved-design.md docs/superpowers/specs/2026-10-02-analytics-ratings-mix-approved-design.md
rtk proxy npx prettier --ignore-path /dev/null --write docs/superpowers/specs/2026-10-02-analytics-layout-polish-design.md docs/superpowers/plans/2026-10-02-analytics-historical-charts.md docs/superpowers/handoffs/2026-10-02-analytics-historical-charts.md
rtk proxy npx prettier --ignore-path /dev/null --check docs/superpowers/specs/2026-10-02-analytics-layout-polish-design.md docs/superpowers/plans/2026-10-02-analytics-historical-charts.md docs/superpowers/handoffs/2026-10-02-analytics-historical-charts.md
rtk proxy git diff --check
```

Browser proof reused the actual production components and the archived
[empty-edge fixture entry](assets/2026-10-02-analytics-historical-charts/fixture-edge-main.tsx.txt).
With ten supplied intervals, Memory now displays **09/09–09/26** instead of
**09/03–10/02**, retaining the internal **09/15–09/17** unavailable period.
Home/End selected the exact first/last supported intervals, arrow inspection
still exposed the middle gap, and Table contained the same six retained rows.
The supplied 0–50-day duration scale and four supported quartile ranges stayed
unchanged. At 1440px the Memory SVG matched its 532px host; at 320px it matched
its 270px host, and page scroll width stayed 320px. Ordinary viewport capture
bytes were saved and inspected directly; frozen design assets and earlier proof
images remain unchanged. A transient Recharts zero-dimension warning appeared
on Chart tab remount; subsequent measured bounds and saved viewport captures
confirmed the settled layout.

- [Memory trimmed, wide dark](assets/2026-10-02-analytics-historical-charts/memory-edge-trim-dark.jpg)
- [Memory trimmed, narrow light](assets/2026-10-02-analytics-historical-charts/memory-edge-trim-narrow-light.jpg)

Skipped: `rtk npm run zip` because packaging/release behavior is unchanged;
`rtk npm run db:generate` because no schema changed (`db:check` passed inside
`check`). Human installed-extension happy-path and sparse-history edge-case
smoke remain pending before PR review or merge. The current Dashboard Analytics
checklist now includes Memory's trimmed edges, internal gaps, small cohorts,
single/all-empty medians, and preserved scale/whiskers. The PR stays draft.
This is a patch presentation change; reverting the Memory follow-up restores
the previous display window without a migration or recovery step.
