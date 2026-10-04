# Retention Map full landscape

## Approved direction

The user chose the Full landscape preview, approved drag-box magnification with
double-click reset, and asked to finish implementation. The map answers:
**Which reviewed memories are weak now, and how durable are they?**

Remove the 30-question cutoff. Include every eligible active reviewed question
in both Chart and Table. Eligibility, FSRS estimates, the scheduling retention
target, status thresholds, deterministic ranks and historical-range independence
stay owned by the existing read model. New, suspended and unsupported questions
do not have eligible coordinates. Memory Signals keeps its separate scope.

## Composition and semantics

- Default to the full cohort. Offer All and Below target filters. Filters do not
  refit the full landscape or change counts, original rows or estimates.
- Summarize the full on-target/watch/needs-attention counts once, with matching
  green circles, amber diamonds and pink triangles. Draw healthy points first
  with restrained opacity, risks above them and the inspected point last.
- Preserve exact point coordinates. Do not jitter, sample, aggregate or size dots
  by a different metric.
- Label X **Memory durability (days, log)** and Y **Estimated recall now (%)**.
  Durability is the total modeled interval from the latest review to crossing
  the FSRS scheduling target; it is not remaining time or a due-date prediction.
- Keep the fitted full-cohort percentage scale and positive log-duration scale.
  Mark the FSRS scheduling target and seven-day product benchmark. Use sparse
  readable ticks, inset fixed-size glyphs and subtle status bands. Remove the
  six competing region captions and duplicate legend entries.
- Show in-view versus filtered/full counts when magnified. Keep the numerical
  cohort summary and Table complete even if a point is outside the viewport.

## Inspection and navigation

One native keyboard inspection control covers the plot. Hover previews the
nearest visible point; a tap/click pins details. If multiple points overlap or
are near the pointer, show a compact chooser containing every candidate. Arrow
keys and Home/End visit every filtered question; reveal a keyboard-selected
question if outside the current viewport. Enter/Space pins it. No hundreds of
individual point tab stops are needed.

Pinned details sit below the plot, include a canonical LeetCode link, status,
estimated recall, target/gap, durability, last review, due date, difficulty and
lapses. Closing restores focus to the inspection control. Outside dismissal
and Escape remain available. Escape during a box gesture cancels the box and
preserves the pin. Filtering out a pinned question dismisses it safely.

Table uses the same filtered original rows, exact counts and seven-row
pagination. Selecting Table does not erase the chart viewport or selection.
Below target with no matching rows has a clear local empty state and retains
All, Chart/Table and the complete cohort summary.

## Magnification

Primary mouse drag draws a rectangle; release fits that entire rectangle into
the plot without cropping selected points. Reversed drags work. The log X and
linear Y axes update to their true visible domains. Glyphs/text remain screen
sized. Double-click and the explicit Reset view control restore the full fitted
landscape while retaining pinned details.

Keep wheel zoom anchored to the pointer, touch pinch/pan, Shift-drag pan and
keyboard-accessible plus/minus controls. Constrain the viewport to the full
landscape and a finite maximum magnification. Ignore thin/tiny boxes. Cancel
unfinished gestures on Escape, pointer cancellation, lost capture, blur or
resize. Distinguish clicks from drags and preserve pre-double-click pin state.
Zoom/filter are transient presentation state, not Settings or persisted FSRS
mutations. No new dependency, runtime method, Chrome permission or schema
migration is required.

## Ownership and proof

Analytics keeps this behavior feature-local. `current-state-views.tsx` composes
the filtered chart/table; `retention-map-chart.tsx` owns rendering and inspection;
`retention-map-model.ts` contains only presentation math/labels needed by those
views. Use the installed Recharts public plot/scale/inverse-scale hooks and
controlled domains with `allowDataOverflow`. Do not build a generic zoom layer.

Use generated rows and compact behavioral regressions. Tests and committed
fixtures must not exceed production code in this change. Preserve existing
Memory Signals coverage. Verify a cohort above 30, all-candidate overlap access,
exact reset, pin preservation, canceled/reversed/edge gestures, both themes,
320px layout, keyboard access and touch interaction.

Required automation: focused tests, `npm run lint`, `npm run check`,
`npm run build`, and Prettier for touched files. Human happy-path and edge-case
smoke in the installed rebuilt extension, with screenshots or recording,
remains required before PR review or merge. Production-component browser proof
is recorded separately and must not be described as human extension smoke.
