# Analytics Historical Charts Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute these tasks with separate file ownership and review. Track the steps below through implementation and validation.

Status: implemented locally. Automated checks and agent component proof passed;
human installed-extension smoke remains pending before PR review or merge. See
the [implementation handoff](../handoffs/2026-10-02-analytics-historical-charts.md).

**Goal:** Implement the approved Recall, Memory Strength, Practice Rhythm, and Ratings Mix designs in the dashboard, leaving the other panels for a later iteration.

**Architecture:** Keep presentation and inspection inside the Analytics feature and use the existing Recharts/ChartContainer/ChartTable patterns. Feature-owned rows remain the single source of exact values. Only Memory Strength's existing duration-scale helper changes its domain calculation.

**Tech Stack:** React 19, TypeScript, Recharts 3.10, Tailwind product tokens, Vitest and Testing Library, WXT.

---

## Approved Scope And References

The user explicitly authorized implementation of the four previews on 2026-10-02.
The [main design](../specs/2026-10-02-analytics-layout-polish-design.md),
[approved Recall snapshot](../specs/2026-10-02-analytics-recall-approved-design.md),
and [approved Memory/Practice snapshot](../specs/2026-10-02-analytics-memory-practice-approved-design.md)
record the decisions. Ratings Mix's
[approved snapshot](../specs/2026-10-02-analytics-ratings-mix-approved-design.md)
is archived with its exact source and screenshots.

Do not copy illustrative values into production. Keep 14-day daily, 30-day
three-day, and 90-day weekly grouping and the supplied row set. Do not change
runtime schemas, database access, persistence, permissions, scheduling, or
readiness. Topic Performance, Retention Map, Memory Signals, Backlog, and
Upcoming Load retain their current implementation. Avoid a global chart or
formatter restyle that changes those deferred panels.

## Task 1: Shared Historical Presentation And Inspection

**Files:**

- Create `src/features/analytics/components/charts/historical-chart.tsx` and its focused tests.
- Create `src/features/analytics/components/charts/historical-chart-model.ts` and its focused tests.
- Modify `src/features/analytics/components/charts/line-segments.tsx` and its existing tests only for optional marker/bridge rendering.
- Preserve generic `src/components/ui/chart.tsx` and `chart-table.tsx` unless a demonstrated defect requires a reusable correction.

- [x] Add calendar model regressions for midpoint coordinates, shortened edge intervals, daylight-saving boundaries, cross-year formatting, one bucket, and sparse tick selection.
- [x] Use date-key UTC ordinals solely as local-calendar coordinates. Keep the original keys for displayed intervals:

```ts
const day = (key: string) => Date.parse(`${key}T00:00:00.000Z`) / 86_400_000
const startX = day(row.bucketStart)
const endX = day(row.bucketEnd) + 1
const x = (startX + endX) / 2
```

- [x] Define `HistoricalChartTimeFrame` as the existing `asOf`, `timeZone`, and `requestedDays` fields. Derive the report year in that timezone; show MM/DD in the report year and /YY outside it, and both years for cross-year intervals.
- [x] Add a feature-local chart frame with numeric calendar XAxis, sparse normal-interval date ticks, readable horizontal grids, explicit quantities/units, and independent supplied Y-axis domains. Select fewer supplied Y ticks when needed, preserving every domain and observation.
- [x] Add one native full-plot inspection control: actual pointer/tap position chooses the nearest original row; focus and arrows expose the same row; Escape hides the tooltip. Clamp/reset selection when the row set changes. Keep initial tooltip hidden and no permanent bottom detail row. Render a quiet selected guide; only measured values receive highlights.
- [x] Preserve enough top/bottom range padding for boundary markers and low whiskers. Use the Recharts public plot/axis scale hooks for marks and inspection coordinates, rather than internal state or fabricated values.
- [x] Extend `LineSegments` with optional circle/diamond dots, active highlighting, and gap dash styling while preserving defaults for deferred charts.
- [x] Run focused shared-model, inspection, and existing line-segment tests before chart integration.

## Task 2: Recall And Ratings Mix

**Files:**

- Create `src/features/analytics/components/recall-ratings-views.tsx` and focused tests.
- Modify the existing `src/features/analytics/components/historical-views.test.tsx` assertions that describe the superseded dates/dashes.
- Root owns the facade extraction in `historical-views.tsx`; workers do not edit it concurrently.

- [x] Recall: use solid observed circles, opaque short-dashed model diamonds, and visibly longer gap bridges. Preserve target/domain, put the target caption above the data, and show one selected guide with measured highlights.
- [x] Add native compact series switches; hide each curve, marks, and tooltip rate together, hide the signed difference unless both are visible, and keep shared sample counts. Update the accessible chart description for one/both/neither visible series.
- [x] Tooltip/table retain full range, grouping, complete/in-progress context, report time, paired/recalled counts, evidence, and reconstruction provenance. Read serialized differences rather than subtracting rounded display values:

```ts
const percent = (value: number) => `${Number((value * 100).toFixed(1))}%`
const gap = (value: number) =>
  `${value < 0 ? '−' : '+'}${Number((Math.abs(value) * 100).toFixed(1))} pp`
```

- [x] Ratings: retain exact share geometry and original four categories. Rows with zero valid ratings get neutral full-height diagonal stripes and explicit unavailable composition; populated zero-count categories remain zero-height. Preserve the whole-period empty state.
- [x] Center whole-percentage labels in colored segments with contrasting text. Measure usable width/height and omit labels that cannot fit without shrinking type or altering shares. Counts and more precise shares remain in tooltip/table; rounded labels may total 99% or 101%.
- [x] Preserve Ratings summary/comparison gates and seven-row table pagination. Verify leading and internal empty slots, true zero shares, unavailable values, partial state, series visibility, and keyboard inspection.

## Task 3: Memory Strength And Practice Rhythm

**Files:**

- Create `src/features/analytics/components/memory-practice-views.tsx` and focused tests.
- Modify `src/features/analytics/domain/analytics-scales.ts`, `analytics-scales.test.ts`, and affected `historical-presentation.test.ts` expectations.
- Update superseded IQR/date assertions in `historical-views.test.tsx` under root coordination.

- [x] Replace the connected IQR wedge with discrete supported Q1–Q3 whiskers, clear median markers, and a compact Median/Middle 50% key. No range for fewer than four eligible estimates or unknown quartiles.
- [x] Fit Memory's duration domain to all finite median/Q1/Q3 values. Preserve a two-day minimum window and empty fallback, with about five nice intervals. Do not transfer negative lower padding upward:

```ts
const span = hi - lo
const window = Math.max(span * 1.2, 2)
const padding = (window - span) / 2
const lower = Math.max(0, lo - padding)
const upper = Math.max(hi + padding, lower + 2)
```

- [x] Verify representative 0.5–44 days fits 0–50, preserves all extrema, and retains sub-day/equal/single/empty/non-finite behavior. Percentage and magnitude scale defaults remain unchanged.
- [x] Practice remains one mixed plot: muted volume columns and a clear mint Review Success line with measured markers and dashed unknown bridges. Label Reviews on the left and Review Success (%) on the right; retain independent serialized scales and visible association language.
- [x] Tooltip/table retain eligible counts, quartiles, median/change/provenance and Good+Easy numerator/valid-rating denominator respectively. Distinguish zero completed volume from unknown success.

## Task 4: Integration, Real Rendering, And Handoff

**Files:**

- Modify `src/features/analytics/components/historical-views.tsx` to retain Topic Performance and re-export the four new views without circular imports.
- Modify `src/features/analytics/components/analytics-screen.tsx` to pass report context and give the Memory/Practice pair adequate width before stacking.
- Modify scoped Analytics styles/panel options only where needed for approved typography, controls, contrast and alignment; leave deferred panel treatments unchanged.
- Update relevant `docs/product.md`, `docs/architecture.md`, and `docs/testing.md` sections, plus a dated handoff under `docs/superpowers/handoffs`.

- [x] Run spec compliance review, then code-quality review, and resolve actionable findings.
- [x] Render the real React views with populated, missing, single-point and empty fixtures at wide and narrow sizes. Verify boundary clearance, readable labels/keys, exact tooltip/table values, unknown inspection, tap coordinates, keyboard and series controls. Save screenshots of the implemented components.
- [x] Run focused tests, then required full checks:

```sh
rtk npm run test -- src/features/analytics/components/charts/historical-chart-model.test.ts src/features/analytics/components/charts/historical-chart.test.tsx src/features/analytics/components/recall-ratings-views.test.tsx src/features/analytics/components/memory-practice-views.test.tsx src/features/analytics/components/historical-views.test.tsx src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/components/charts/line-segments.integration.test.tsx src/features/analytics/domain/analytics-scales.test.ts src/features/analytics/domain/historical-presentation.test.ts
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
```

- [x] Format touched Markdown explicitly with `--ignore-path /dev/null`, because the spec/plan directory is ignored by normal Prettier discovery. Never format frozen approved snapshot assets.
- [x] Record exact passed/failed/skipped commands and reasons, screenshot links, risks, patch release impact, and rollback. Prepare human ready-history and sparse-history extension smoke for 14/30/90 days, Chart/Table, range changes, missing/zero/single buckets, boundary markers and narrow input. Human screenshot/recording proof is still required before PR review or merge; agent fixture checks do not replace it.
- [x] Save a scoped Conventional Commit checkpoint. Leave the change locally reviewable; do not publish, merge, or claim human smoke was run.

## Done When

All four implemented charts match the approved treatments, preserve exact
feature-owned values and missing evidence, and are usable with pointer,
keyboard and narrow layouts. Required automated checks and fixture visual
proof are recorded honestly. Later-panel design work remains deferred.

## Follow-Up: Trim Empty Edges (Approved 2026-10-02)

The user supplied the exact change; see the master design's approved follow-up.
This is a focused presentation adjustment on draft PR #184.

- [x] Add a generic immutable `trimHistoricalEmptyEdges(rows, hasData)` helper
      in `charts/historical-chart-model.ts`. Find the first/last supported row
      and return that inclusive slice, or `[]` when none are supported.
- [x] Add model regressions for leading/trailing empties, internal gaps,
      measured zero, one supported interval, empty/all-empty input, unchanged
      object identities, and calendar bounds after trimming.
- [x] Use the helper in `recall-ratings-views.tsx` and `memory-practice-views.tsx`
      for Recall, Ratings, and Practice only. Predicates are Recall either rate
      known; Practice positive completed reviews/valid ratings or known success;
      Ratings positive valid ratings. Use surviving rows for Chart/Table,
      inspection, reset keys, and trend counts; leave Memory untouched.
- [x] Update focused component tests for Home/End at retained endpoints, unknown
      middle inspection, 0%/activity without success, preserved totals, and
      untrimmed Memory. Update superseded leading-slot fixtures to internal gaps.
- [x] Update current product/architecture/design/testing authority and handoff;
      preserve exact approved archive assets.
- [x] Capture the actual production components with leading/internal/trailing
      empty fixtures; verify the endpoints, middle gap, and Memory window.
- [x] Run focused tests, then `rtk npm run lint`, `rtk npm run check`,
      `rtk npm run build`, `rtk npm run format`, explicit ignored Markdown
      formatting, and `rtk proxy git diff --check`. Record skipped zip/schema
      generation and pending human extension smoke with reasons.
- [x] Save a Conventional Commit, push the existing PR branch, and update draft
      PR #184's description and proof. Keep human smoke pending before review
      or merge.
