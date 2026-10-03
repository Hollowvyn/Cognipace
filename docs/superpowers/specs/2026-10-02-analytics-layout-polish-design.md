# Analytics Chart Layout Polish

Status: Memory Strength's fitted scale with whiskers and Practice Rhythm's mixed
plot are human-approved and saved in the
[exact approved checkpoint](2026-10-02-analytics-memory-practice-approved-design.md).
Recall's tooltip-only refinement is also human-approved and saved in its
[exact approved checkpoint](2026-10-02-analytics-recall-approved-design.md).
Ratings Mix's striped empty slots and percentage labels are also approved.
On 2026-10-02 the user authorized implementing these four historical charts
first and explicitly deferred the other panels to a later iteration. The
focused execution plan is
[historical charts implementation](../plans/2026-10-02-analytics-historical-charts.md).
Broader page reorganization, Topic Performance, current memory, and workload
refinements below remain proposed and outside this implementation phase. The
companion previews are illustrative rather than screenshots of a changed
extension.

## Goal

Make the existing Analytics page feel deliberate, legible, and coherent. The
user is satisfied with its data and content; the requested change concerns chart
presentation and page layout.

## Findings

- The page is capped at 64rem, leaving supporting charts cramped in paired
  cards.
- Panel titles reference the undefined `--cp-section-title-font-size` token.
- Each view places controls, summaries, explanations, and legends independently,
  so neighboring plots begin at different heights.
- Recharts default styling leaves reference labels and value labels faint.
- Practice Rhythm overlays two quantities on unlabeled opposing axes.
- Memory Strength's stacked IQR area creates an unexplained wedge. Its larger
  scale includes genuine quartile evidence; the approved fitted scale must
  retain all of that evidence.
- Retention Map's six region captions and two threshold captions collide with
  points. Its legend does not visually match the colored marks.
- Retention duration formatting rounds a `0.01d` logarithmic tick to `0d`.

## Recommended Direction: Balanced

Retain Terra Compact's existing typography, tonal surfaces, mint/amber/pink
semantics, and compact spacing. Expand the page's maximum width to about 80rem
within the dashboard shell. Pair supporting charts only when the available
Analytics content width is at least 1040px, leaving each panel about 512px wide.
Stack them below that threshold. Verify the result at 1440px and 1280px desktop
viewports and at 768px and 360px narrow viewports, accounting for the sidebar.

Organize the page into three visibly separated groups:

1. **Review history**: full-width recall comparison; Memory Strength and Practice
   Rhythm paired; Ratings Mix and Topic Performance paired.
2. **Current memory**: full-width Retention Map followed by Memory Signals.
3. **Review workload**: paired Recent Overdue Backlog and Upcoming Review Load.

Keep the existing range control and summary metrics. Explicitly label historical
scope, current-state scope, and the fixed forecast window.

Every graphical panel has a consistent title/question area, compact Chart/Table
toolbar, plot area, visible legend, and supporting context. Paired plots share
top and bottom alignment while displayed as charts. Expanded explanations and
tables may grow naturally without clipping or artificial fixed card heights.
Retain all existing explanatory content in an accessible methodology disclosure
and chart footer. Confidence warnings and single-point notes remain visible.
Memory Signals remains a table-only panel with its existing three columns and
five-row pagination; it does not acquire a Chart/Table toggle or legend.

The alternative **Wide plots** layout stacks supporting historical charts. It
offers more room for long ranges but lengthens the page. Balanced is recommended
because it keeps related measures close when there is enough space.

## Chart Treatment

- **Recall comparison**: keep observed and estimated series, measured markers,
  next-valid dashed bridges, adaptive serialized scale, and target retention.
  Use a stronger solid observed line with circle markers and a quieter short-
  dash estimated line with diamond markers. Use visibly longer dashes for
  missing-evidence bridges. Keep the target line thin, with its caption above
  the plot instead of across the data. Use quiet horizontal grids without a
  vertical plot box. Preserve the serialized percentage domain; give boundary
  markers rendering clearance without extending the domain beyond 100%.
  The grouped tooltip retains the signed observed-minus-estimate difference
  in percentage points, paired/recalled counts, provenance, and evidence.
  Highlight the selected bucket's observed circle and estimated diamond with
  one quiet guide; unknown buckets receive no active markers. Keep counts and
  the comparison inside the tooltip, with no duplicate selected-period row
  below the plot. Maintain legible model and bridge contrast in both themes.
  Use the serialized difference, rather than subtracting rounded labels.
- **Memory Strength**: the user chooses whiskers. Retain the median line and
  show each supported Q1–Q3 range with a subdued vertical stem and short end
  caps. Draw the stronger median line and clear median markers above them.
  Explain `Median` and `Middle 50%` in a compact visible key. Do not draw a
  connected filled wedge across missing buckets. Keep ranges available only
  when there are at least four eligible review estimates.
- **Memory Strength scale**: the user authorizes tighter scaling because low
  values crowd the bottom. Keep a linear, adaptive duration axis that contains
  every supported median, Q1, and Q3. Use roughly 10% observed-span padding on
  each side, clamp the lower bound to zero without transferring excess negative
  padding upward, retain the two-day minimum window and empty-data fallback,
  and target approximately five nice tick intervals. This representative
  0.5–44-day extent fits about 0–50 days instead of 0–80. Add about 8–12px of
  rendering clearance below low marks and about 6px above high marks, applying
  the same mapping to ticks, grids, stems, caps, and median points. Keep tick
  units explicit; do not use an axis break or silently switch to logarithmic
  days. Linear scaling cannot greatly separate sub-four-day values while also
  retaining a 44-day upper quartile.
- **Practice Rhythm**: the user explicitly prefers a mixed graph. Use one plot
  with subdued review-volume bars behind a visually distinct Review Success
  line and measured markers at the same bucket positions. Label the left axis
  `Reviews` and the right axis `Review Success (%)`; reserve space for both and
  use one compact bar/line legend. Preserve the separate serialized scales,
  including the adaptive success domain, and avoid highlighting line/bar
  crossings as meaningful numeric comparisons. Keep the association note
  visible and preserve zero-volume buckets, unknown success values, and
  next-valid dashed bridges. One tooltip shows the period, completed reviews,
  success percentage, and Good + Easy numerator/valid-rating denominator.
- **Ratings Mix**: keep 100% stacked bars and the Again/Hard/Good/Easy order and
  colors. Use deliberate bar widths and a compact wrapping legend. For each
  displayed bucket with zero valid ratings, show a full-height neutral gray
  diagonally hatched placeholder at the same width as a measured bar. Its key
  and tooltip say `No valid ratings`; it is unavailable composition, not a
  fifth rating category or a measured 100%. In populated bars, center readable
  percentage labels with contrasting text inside every segment that can
  contain them. Use exact fractions for geometry and round only displayed
  labels. Do not enlarge small segments or shrink labels to force them to fit;
  their count/share remains available in the tooltip and table. Zero-count
  categories in a populated bucket remain zero-height slices. Preserve the
  existing whole-period empty state when no bucket has valid ratings.
- **Topic Performance**: retain the existing ranking, eligibility gates, and
  percentages. Reserve room for topic names and right-side value labels.
- **Retention Map**: keep its log duration scale, current recall scale, six
  semantic regions, and threshold lines. Move region explanations out of the
  point field into a color-and-shape key. Position threshold labels above or
  beside the plot; use rendering padding to keep boundary markers fully visible,
  preserving their coordinates and the serialized domains. Preserve
  sub-day tick precision. Retain hover/focus previews and pinned details.
- **Memory Signals**: keep five-row pagination, severity order, canonical links,
  and the existing three columns. Make signal chips wrap compactly instead of
  stretching into large fixed-width boxes.
- **Backlog**: retain threshold-sensitive step segments, truthful unknown days,
  the five-problem watch zone, and keyboard inspection. Use restrained region
  shading and an edge-positioned threshold label.
- **Upcoming load**: retain the fixed 14-day schedule, due/overdue stacking, and
  overdue hatching. Show actual colored/hatched swatches in the key.

All plots use explicit readable token-based tick, reference, and value labels;
quiet grids; consistent gutters; and tabular numbers.

## Calendar Axis And Datapoints

Axis ticks, plotted observations, and aggregation intervals are independent:

- Historical axes represent actual local-calendar positions, rather than a list
  of equally spaced category names. Derive display coordinates from existing
  bucket date keys; preserve the original values and date boundaries. Use each
  metric's surviving interval extent, from the first retained interval start
  through the last interval end, without restoring unsupported leading buckets.
  Use calendar-day ordinals so daylight-saving transitions do not alter spacing.
- Ratings Mix's current rendered `views.ratingsMix.rows` includes the selected
  window's leading zero-rating buckets, although the legacy summary trims them.
  For the user's requested striped slots, preserve those already-rendered rows
  and their date window. The representative 30-day Ratings preview therefore
  has ten intervals from 09/03 through 10/02, with four striped slots and six
  populated bars. This treatment adds no rating observations and does not
  silently change the supplied row set or its trimming policy.
- Display approximately four to six readable calendar labels on a large plot
  and three or four on a small plot. Prefer ordinary calendar intervals such as
  weekly dates in a 30-day view.
  Tick labels contain a single date, not both ends of the aggregation range.
  Tick selection must consider rendered width and label bounds.
- Keep all supported datapoints even when their corresponding dates are not
  labeled. A point does not disappear because its axis tick is omitted.
- Position an aggregate statistic at its interval's calendar midpoint. Its
  tooltip and exact-value table explicitly identify the full interval; the
  midpoint is a display anchor, not a claim that one review occurred that day.
  Reflect the actual width of shortened edge intervals. An axis with only one
  retained bucket still spans its interval and preserves the single-point note.
- Retain the existing daily/three-day/weekly grouping for 14/30/90-day historical
  views in this presentation pass for Recall, Memory Strength, Practice Rhythm,
  and Ratings Mix, including Monday-aligned weeks and shortened edge intervals
  in the 90-day view. Show a compact grouping label such as `3-day summaries` in
  each of these panels. Recall ratios and rating shares need sample counts;
  memory strength needs a distribution. Replacing these with individual review
  dots would change their metric meanings.
- Backlog and forecast retain one point or bar per actual calendar day, with
  sparse axis labels. Retention retains one point per eligible problem and its
  duration axis. Topic Performance retains one ranked point per qualifying topic.
- Use the available numerator, denominator, eligible review count, quartiles,
  provenance, and evidence fields to make inspection richer. Preserve unknown
  buckets, dashed missing-evidence bridges, and zero-volume practice buckets.

Use `MM/DD` for compact dates in the report's current year, determined from its
existing as-of local date. Append `/YY` to dates in another year. For ranges that
cross years, show both years explicitly, for example `12/30/25–01/01/26`.
Within-year ranges retain both full month/day endpoints, for example
`09/09–09/11`; do not abbreviate the end to `11`. This rule applies consistently
to chart ticks, tooltip headings, and table period columns. A daily bucket shows
one date instead of repeating it. Preserve the local timezone and date-key
semantics; formatting must not shift dates through UTC.

The first four chart tooltips identify the whole bucket once and show all
relevant series together, with meaningful denominators: recalled/paired reviews
for Recall; median, Q1–Q3, and eligible reviews for Memory Strength; completed
reviews plus Good + Easy/valid ratings for Practice Rhythm; and each rating's
count/share plus total valid ratings for Ratings Mix. Unknown evidence is
explicitly unavailable, never formatted as zero. Label shortened edge intervals
as shorter periods based on their actual date-key duration; do not confuse a
shortened but complete leading week with an ongoing interval. Use the existing
`isPartial` value to mark the current interval `In progress` and expose the
report's as-of time; values remain capped at that instant even when the date
label spans today. Keep complete intervals in each exact-value table. Make
bucket inspection usable with hover, touch, and keyboard access without
requiring precise selection of a small marker.

Resolve the bucket from the pointer-down/tap location as well as pointer move;
keyboard activation retains the current bucket. The exact approved Memory and
Practice snapshot is frozen, but its sample tap handler relies on the last
pointer-move selection. Correct that interaction when implementing the approved
appearance; do not change the archived bytes.

The user accepts the last two workload charts' proposed layout and treatment.
Preserve their daily marks, step/stack behavior, shading, hatching, and layout;
apply only the shared compact date formatting and necessary verification.

The existing service reads timestamped review history before aggregating it, so
finer-grained historical presentation is possible later. This pass does not
introduce daily/adaptive grouping changes or a new raw-review runtime payload;
those would require a separate approved metric/evidence design. Reducing axis
labels alone does not require changing the aggregation policy.

## Scope And Ownership

The presentation remains owned by `src/features/analytics/components` and the
Analytics route. The Memory Strength duration-scale adjustment belongs in the
existing `src/features/analytics/domain/analytics-scales.ts` helper; its only
production caller supplies Memory Strength's medians and quartiles. Keep the
existing runtime scale shape and serialize the revised domain through that
owning presentation builder. Preserve all metric values, quartile eligibility,
other charts' domains, background-service read semantics, runtime contracts,
evidence gates, selected ranges, missing-data semantics, persistence, permissions,
and scheduling rules. Changes to generic chart or Chart/Table primitives must
remain reusable and avoid restyling unrelated product surfaces.

The mockup uses representative values from the supplied screenshots and
illustrative quartile ranges to communicate layout. It is not a recalculation
of the user's local data.

Recall's approved inspection preview also uses illustrative paired counts
constructed to match the rounded screenshot percentages. Its exact fractions
are 5/6, 12/14, 3/4, 2/2, 3/5, and 6/8 for supported buckets; missing sample
counts are unavailable. Production keeps the actual serialized counts, rates,
and difference. The stronger sample-count treatment does not claim statistical
confidence or mastery.

## Phase-Sized Execution Outline

### Phase 1: Page And Panel Structure

Primary files:

- `src/app/dashboard/screens/analytics-page.tsx`
- `src/features/analytics/components/analytics-screen.tsx`
- `src/features/analytics/components/analytics-chart-panel.tsx`
- `src/features/analytics/components/analytics-readiness-state.tsx`

Establish the wider responsive workspace, section groups, defined heading
typography, consistent panel framing, and accessible secondary explanations.
Do not add a new architecture layer solely to align card content.

### Phase 2: Historical Charts

Primary files:

- `src/features/analytics/components/historical-views.tsx`
- `src/features/analytics/components/charts/chart-shared.tsx`
- `src/features/analytics/domain/analytics-scales.ts`
- `src/features/analytics/domain/analytics-scales.test.ts`
- `src/features/analytics/domain/historical-presentation.test.ts`
- `src/features/analytics/components/charts/line-segments.tsx`, only if marker
  distinction requires a small reusable option

Implement calendar-based coordinates and sparse ticks, readable axes and
legends, discrete Q1–Q3 range rendering, and Practice Rhythm's mixed plot with
explicit count and percentage axes. Tighten Memory Strength's duration scale
and provide marker clearance while retaining all eligible ranges. Preserve
existing Chart/Table parity and complete date ranges during inspection.

### Phase 3: Current Memory And Workload

Primary files:

- `src/features/analytics/components/current-state-views.tsx`
- `src/features/analytics/components/workload-views.tsx`
- directly affected component tests and current design/testing documentation

Declutter retention annotations, correct duration labels, tighten signal chips,
apply shared compact workload date formatting, and finish responsive and keyboard
verification. Preserve the workload layout and chart treatment accepted by the
user.

## Validation Plan

After design approval, install the pinned dependencies with `npm ci`, then run
the affected existing tests before full checks:

```sh
rtk npm run test -- src/features/analytics/domain/analytics-scales.test.ts src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/components/analytics-screen.test.tsx src/features/analytics/components/analytics-chart-panel.test.tsx src/features/analytics/components/analytics-readiness-state.test.tsx src/features/analytics/components/historical-views.test.tsx src/features/analytics/components/current-state-views.test.tsx src/features/analytics/components/workload-views.test.tsx src/features/analytics/components/charts/line-segments.integration.test.tsx src/components/ui/chart.test.tsx src/components/ui/chart-table.test.tsx src/app/dashboard/routes.test.tsx
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
```

Add focused regression coverage for changed accessible controls, exact
Chart/Table values, evidence gaps, quartile eligibility, sub-day duration labels,
and retention details. Calendar regressions include daylight-saving transitions,
cross-year formatting, unequal edge interval widths, and one retained bucket.
Scale regressions cover all quartile extrema, lower-bound clamping without
excess upper padding, small sub-day values, equal values, one supported estimate,
the two-day minimum window, and non-finite/empty input fallback. Do not add tests
that merely mirror styling classes.

Capture a populated fixture preview at wide and narrow content widths to verify
label bounds, plot alignment, and readability. The human engineer must still
complete real-time extension smoke and attach ready-history and sparse-history
proof before PR review or merge, as required by `docs/agent-governance.md`.

Human smoke includes 14/30/90-day ranges, Chart/Table switching, unknown buckets,
single-point history, Practice Rhythm zero-volume buckets, retention keyboard
navigation/pinning/dismissal, Memory Signals pagination and links, backlog
thresholds, forecast hatching, and narrow-width operation.

## Done When

- Chart titles, labels, legends, and units are readable in both app themes.
- Paired plots align and stack before becoming cramped.
- No annotations overlap plotted evidence or clip boundary markers.
- Existing exact values and missing-evidence semantics remain intact.
- Required automated validation is recorded honestly, and human smoke proof is
  identified as complete or still pending.

## Draft Validation Record

Commands run successfully for this proposed design:

```sh
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --write docs/superpowers/specs/2026-10-02-analytics-layout-polish-design.md
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --check docs/superpowers/specs/2026-10-02-analytics-layout-polish-design.md
rtk proxy node --check /private/tmp/analytics-layout-direction.js
rtk proxy node --check /private/tmp/analytics-memory-practice.js
rtk proxy python3 /private/tmp/check-analytics-recall.py
rtk proxy node --check /private/tmp/analytics-recall.js
rtk proxy python3 /private/tmp/check-analytics-recall-refined.py
rtk proxy node --check /private/tmp/analytics-recall-refined.js
rtk proxy python3 /private/tmp/check-analytics-ratings.py
rtk proxy node --check /private/tmp/analytics-ratings-mix.js
rtk proxy python3 /Users/tobiolutimehin/.codex/plugins/cache/openai-bundled/visualize/1.0.45/skills/visualize/scripts/render.py /Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0fb5d-b2c6-74e0-adff-a0ea6cef7dce/analytics-ratings-mix.html --serve --port 4187
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --write docs/superpowers/specs/2026-10-02-analytics-layout-polish-design.md
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check docs/superpowers/specs/2026-10-02-analytics-layout-polish-design.md
rtk git diff --check
```

The initial Markdown formatting commands above did not override the ignored
spec directory. The approved checkpoint records the subsequent explicit
`--ignore-path /dev/null` formatting and checks of both touched Markdown files.

The revised illustrative preview rendered in the browser. Its historical
calendar axes show four wide `MM/DD` labels and three narrow labels, using a
two-week interval plus the period end on the narrow layout. At a 360px browser
viewport, the first four charts' date labels have at least 19px between their
bounds, and the preview has no horizontal overflow. Memory Strength and
Practice Rhythm plot tops and bottoms align at the default desktop width.
Existing missing-bucket bridges remain intact.

Native browser actions verified grouped tooltip inspection, left/right bucket
navigation, the final interval's full range and `In progress` state, Escape
dismissal, full ranges and unavailable values in Table mode, and keyboard
Chart/Table switching. A Playwright locator press timed out; the documented
native browser action successfully completed the same interaction. No browser
console errors were reported. A screenshot captures full-period inspection.

The focused Memory Strength/Practice Rhythm preview compares fitted and current
linear duration scales while retaining whiskers in both. The fitted example
uses 0–50-day ticks in 10-day steps and gives the lowest median 13.88px of
clearance from the plot edge. All five eligible sample whiskers remain visible;
the two-review sample correctly has a median without a range. The comparison
control switches to the 0–80-day scale and back. Practice remains a mixed plot
with the existing representative 0–20 review domain and 0–100% success domain.
Grouped inspection verifies Good + Easy/valid-rating counts and distinguishes
zero review volume from unavailable success. Table mode preserves complete
intervals, missing values, low-sample range unavailability, and the ongoing
interval label. Keyboard Chart/Table switching passed. At a 360px viewport,
both cards stack without overflow, date labels have at least 8px separation,
and no console errors were reported. The temporary viewport override was reset.

The focused Recall refinement preserves a 20–100% example domain with 8px
range inset and 1.5px clearance above the active highest circle. It uses six measured
points per series and four total missing-evidence bridges, with circle/diamond
series identities and distinct short versus long dashes. At 360px its date
ticks are 09/09, 09/23, and 10/02, with at least 22px between labels and no
horizontal overflow. At a 736px viewport its four weekly labels have at least
108px separation. Browser actions verified grouped final-period and unavailable
bucket details, signed percentage-point differences, keyboard arrows and
Escape, keyboard Chart/Table switching, and synchronized series toggling.
Selecting the plot midpoint changes the inspected bucket to that location.
An initial coordinate action under the viewport override missed the plot;
the semantic whole-plot action completed the inspection. Source review confirms
pointer-down/click use that same coordinate mapping. Physical touch-device
testing remains part of future extension smoke. The final screenshot was saved,
the temporary viewport override reset, and no console errors reported.

The approved Recall source has no permanent selected-detail row. Later browser
checks verified single-step navigation to unknown buckets with no active marks,
exact 5/6 and 12/14 rates displayed as 83.3% and 85.7%, and serialized-fixture
differences displayed as −6.7 pp and +0.7 pp. At 320px the surface measured 288px
with no horizontal overflow; its tooltip stayed within the plot width. The
approved snapshot records clean and tooltip proof and exact recovery checks.

The focused Ratings Mix preview retains ten displayed intervals from 09/03
through 10/02, four full-height striped empty slots, and six populated stacks.
All 18 nonzero segments retain exact fraction geometry and show centered 12px
whole-percentage labels at both 736px viewport width and 512px card width.
The stripe rectangles exactly match the 230px plot height. Browser inspection
confirmed the full-period ranges, no-valid-rating composition unavailability,
zero-count categories in populated bars, single-step arrows, Escape, Table
counts/shares, and the final interval's In progress state. At 320px and 360px,
the surface has no horizontal overflow, and the three date labels remain
separate; in-bar labels that cannot fit are omitted while tooltip/table values
remain available. At 320px, table overflow is contained in its scrollable table
wrapper. Clean screenshots were saved at normal and supporting-card sizes,
the temporary viewport override was reset, and no console errors were reported.
The preview server was stopped after verification. Physical touch and live
extension checks remain deferred until implementation.

The Ratings label palette was checked with WCAG sRGB relative luminance and
`(lighter + 0.05) / (darker + 0.05)`. Against the selected label text, the
Again/Hard/Good/Easy fills give 5.49/5.40/5.29/4.70:1 contrast in light appearance
and 6.94/8.62/7.31/7.76:1 in dark appearance. The read-only check was:

```sh
rtk proxy python3 -c 'l=lambda h:sum(w*(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4) for w,v in zip((.2126,.7152,.0722),(int(h[i:i+2],16)/255 for i in (0,2,4)))); ratio=lambda a,b:(max(l(a),l(b))+.05)/(min(l(a),l(b))+.05); names=["Again","Hard","Good","Easy"]; light=["c06a65","a87906","258e86","34865a"]; dark=["fbb0aa","ffd449","5bdcc9","8fdfa9"]; print([(name,round(ratio(a,"000000"),2),round(ratio(b,"173c28"),2)) for name,a,b in zip(names,light,dark)])'
```

The following application checks are deferred until the approved implementation
exists; no application code changed in this design checkpoint:

```sh
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
```

The focused component command above and human extension smoke are also deferred
until there is an implemented page to validate. A design preview does not prove
the behavior of the live extension.

## Release And Recovery

Suggested implementation PR title: `fix(analytics): improve chart layout and readability`.
This is a dashboard presentation fix with no persisted-data migration. Reverting
the presentation changes restores the previous UI without affecting local data.
