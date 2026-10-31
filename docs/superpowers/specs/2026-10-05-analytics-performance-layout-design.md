# Analytics Performance And Layout Design

Date: 2026-10-05

Status: approved for phase-sized implementation planning. The user approved the
Value first direction, weighted Performance, cumulative Recall, natural trend
connections, the ten-card page, and target-relative timing. The final review
also explicitly preserves green backlog lines strictly below the watch threshold,
with amber at the threshold and above it. The user subsequently approved the
researched 30 days / 90 days / All time policy, available-history display for
new users, independent workload scopes, and deferred tooltip cleanup.
Implementation is in progress through the reviewed date-foundation and runtime
integration phases. The subsequent approved refinement makes
Overview and Details equally sized, gives Recall an explicit paired-history
display frame, replaces page-moving data notices with fixed card states, and
adds four selected-period headline cards. The user approved the final prototype
and authorized continuing implementation.

## Problem And Outcome

Analytics has the required evidence, but its presentation makes that evidence
hard to scan: nested and full-width sections interrupt the grid, descriptions
compete with plots, bars leave excessive gaps, and multiple rating-combination
percentages all appear to mean success.

The overview will answer five related questions: how am I performing, how am I
practicing, how is my memory changing, which problems need attention, and what
review work is waiting? Performance becomes one inspectable score out of 100.
Recall remains an observed percentage compared with historical FSRS estimates.
The approved curves flow through recorded summaries and hold flat during
inactivity. Charts use the space allocated by consistently sized cards.

## Approved Visual Reference

Preserve the [approved source](./assets/2026-10-05-analytics-value-first-approved.html)
verbatim as the earlier exploration. The final approved page reference is
[the range and summary prototype](./assets/2026-10-05-analytics-range-summary-approved.html).
It includes the final card heights, paired Recall frame, and four headline cards.
Value first is the chosen
variant. The other variant and editable design controls are exploration tools,
not product requirements. The source uses illustrative data, not the user's
production history. Its four cards establish appearance, not the final card count.

The approval applies to the large leading value, restrained typography, quiet
grid lines, subtle Performance area fill, natural connections, compact actions,
and equal overview heights. Translate these into existing Terra Compact tokens,
Nunito Sans UI text, Literata page title, and both supported themes.

The reference marks illustrative bucket end dates. Production retains the real
calendar midpoints and interval boundaries specified below. Do not lengthen a
transition into an inactive interval to match the mock's apparent smoothness.

## Page Organization

Use one page-width grid, with two equal columns whenever each card can retain at
least 360px of usable outer width. Stack below that threshold. Desktop reading
order forms consecutive 2×2 groups, with the final workload pair:

| Row | Left            | Right             |
| --- | --------------- | ----------------- |
| 1   | Performance     | Time vs target    |
| 2   | Practice        | Topic performance |
| 3   | Recall          | Memory strength   |
| 4   | Retention map   | Memory signals    |
| 5   | Overdue backlog | Upcoming reviews  |

All ten cards share the same width and fixed desktop height of
464px. The two-column rule applies to the analytics widgets rather than requiring
an extra decorative four-card wrapper. There are no full-width chart exceptions
in the normal overview, including Practice and Retention map.

The existing combined first-outcome and difficulty outcome/Mix views move into
Performance Breakdown. They remain available as explanations, not additional
overview cards. Assessment time moves out of that nested section into its own
peer card. Preserve each underlying measurement and all qualifying items.

Use the explicit 30 days / 90 days / All time selector in the page header, with
30 days as the default. The range remains selected until the user changes it.
Show one concise scope line with actual displayed dates, timezone, and report
as-of context. Historical evidence guidance remains metric-specific and never
hides an available value. Repeated evidence explanations belong in each card's
Details rather than permanent paragraphs.

Show four equal headline cards above the chart grid. They all use the selected
30 days / 90 days / All time window, the resolved report timezone, and the same
as-of cutoff. Four columns fit a wide desktop; use two columns and then one as
space narrows. These compact summary cards are separate from the ten chart
cards and have equal heights within every state. Show the selected dates once.

| Card                 | Definition                                                                                                                                 | Compact evidence caption                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Review days          | Distinct report-local dates with at least one retained recorded assessment in the period.                                                  | Days with recorded practice                      |
| Questions solved     | Distinct problems with at least one persisted `isCorrect === true` assessment in the period. Repeated successes count once.                | Unique questions marked correct                  |
| Observed correctness | Persisted true results divided by persisted true plus false results in the period. Null correctness is excluded without a rating fallback. | Correct count of assessed count                  |
| Recorded solve time  | Sum finite positive persisted elapsed seconds on successful assessments in the period, including repeated successful assessments.          | Timed successful attempts of successful attempts |

Derive these from the same deduplicated raw selected events, before narrowing
historical chart eligibility. They include first and repeat assessments, all
current difficulties, and untimed records as appropriate. Questions solved is
not a count of review attempts, newly encountered problems, current practice
status, or the latest-solved timestamp. Correctness means the saved assessment
result; it does not claim independent judge acceptance, unaided solving, or
first-try correctness. Existing assessment policy may mark an accepted overtime
solution unsuccessful. Do not change that policy in this refactor.

Display solve time in hours and minutes, preserving exact seconds in the read
model. Missing durations do not become zero; show the timed-success coverage.
A successful cohort with no recorded timing is unavailable. A genuine empty
activity cohort or known zero successful assessments can show zero solved and
zero successful time; a wholly unknown correctness cohort cannot imply a known
success count. The older Good + Easy fraction remains a raw rating measure in
advanced details and must not supply the Observed correctness card. Review days
must never exceed the displayed available calendar days. No headline card mixes
in all-time totals while a finite range is selected.

## Historical Range And Available History

The approved choices serve three different questions:

| Selection | Purpose                       | Calculation scope                                    |
| --------- | ----------------------------- | ---------------------------------------------------- |
| 30 days   | Recent practice; default      | Today and the preceding 29 local dates               |
| 90 days   | Broader progress              | Today and the preceding 89 local dates               |
| All time  | The retained learning history | Earliest retained nonfuture raw review through as-of |

This is a product choice informed by established analytics practice, not a claim
that research establishes one optimal pair of durations.
[Anki's statistics manual](https://docs.ankiweb.net/stats.html) explains why
single-day retention can be noisy and recommends a monthly view; it also supports
all-history statistics and changes grouping with the selected span. Its current
default is twelve months, and its retention cohort is different from CogniPace's.
[Amplitude's dashboard documentation](https://www.amplitude.com/docs/analytics/dashboard-filter)
provides precedent for 30- and 90-day presets.
[NIST's sample-size guidance](https://www.itl.nist.gov/div898/handbook/prc/section2/prc242.htm)
supports distinguishing observation count from elapsed days. This is statistical
context, not a confidence model for dependent reviews or the weighted score.

Derive one shared nullable history origin from the earliest retained raw review
with a finite timestamp at or before as-of. Find it before rating validity,
first/follow-up classification, timing, topic, or FSRS-pair eligibility filters.
Use the report's resolved timezone. Account creation and a metric's first eligible
bucket are not substitutes for this origin. Keep the complete-history read for
cohort selection and FSRS replay; adding All time requires no extra per-card query.

For 30/90 days, preserve nominal calculation/comparison bounds separately from
display bounds. The display starts at the later of the nominal local-date start
and the shared history-origin local day. All time starts at the history-origin
local day. It ends at as-of; nominal period ends remain next local midnight,
exclusive. Do not use 24-hour millisecond subtraction for local dates.

Someone with twelve days of global history keeps 30 days selected and sees
"Showing your first 12 days · Sep 24–Oct 5." Values are available immediately
when their own evidence exists. Never manufacture zeros for days before tracking
started or require thirty elapsed days before showing a score. A long-time user
with twelve recent active days is a different case: preserve the whole selected
calendar window, including genuine inactive dates. Sparse cohorts likewise do
not move the shared page origin. Empty, invalid-date-only, or future-only raw
history produces an empty historical state while current-state cards remain
usable.

Preserve each clipped interval's actual bounds and its midpoint within the
visible domain. An origin inside an existing nominal bucket shortens that bucket;
it does not move its counts to a fake endpoint or leave a marker outside the
plot. Keep internal inactivity and trailing cumulative holds. Grouping is a
presentation choice: every eligible assessment stays in the selected totals;
sum raw numerators, denominators, and timing observations rather than averaging
bucket percentages, weighted scores, or medians.

All time is explicitly "All retained history." Use the approved cumulative
Performance and paired Recall formulas, without new recency weights or a second
recent score. Show actual eligible samples and the last updated interval. Held
rows never become evidence or active buckets. Long retained histories use bounded
adaptive calendar grouping, with grouping metadata supplied alongside intervals
rather than inferred from the selector.

Choose grouping from the available global calendar span, before metric-specific
evidence filters, except for the explicitly labelled paired Recall display frame
described below. Up to fourteen local dates uses daily buckets; fifteen through
thirty uses three-day buckets; longer 90-day views use Monday-start calendar
weeks. Three-day groups remain anchored at the nominal selected start, or the
history-origin day for All time, and intersect with the displayed domain.
All time uses Monday-start weeks through 365 available local dates. Beyond that,
choose the first calendar-month, calendar-quarter, or calendar-year grouping
whose intersecting interval count is at most sixty, including both clipped edges.
If annual intervals exceed sixty, use the smallest year stride from
1, 2, 5, 10, 20, 50, and so on that fits. Year groups begin on January 1 at a
multiple of the stride. Count intervals before constructing them. Preserve
Monday boundaries, real month lengths, leap dates, resolved-zone local midnights,
and the as-of cap. Show the actual grouping. A resolution change may change
intermediate plotted updates; the final pooled values and eligible counts must
stay identical. Empty history has no historical buckets or grouping.
The sixty-bucket bound limits chart output, not the complete-history read or
FSRS replay work; do not claim that it bounds all computation independently of
the number of retained reviews.

Readiness remains descriptive sample/cadence guidance, not a display gate or a
formal confidence guarantee. Keep the existing finite-range sample guidance:
24 eligible observations for 30 days and 45 for 90 days. For All time, use
`policyDays = max(1, min(availableDays, 90))` in the existing sample formula,
`ceil(max(12, policyDays * 0.5, min(policyDays, 30) * 0.8))`; the minimum never
grows beyond 45 solely because the history is older. These inherited product
thresholds do not certify weighted scores or dependent-review precision.

Compute span, active buckets, and gaps from raw new-evidence counts for each
metric within the resolved available-history domain. Pretracking dates are
absent, genuine inactive dates remain, and cumulative holds count as zero new
evidence. Preserve the existing effective-window coverage and gap rules, using
the finite selected duration or capped All time policy duration for coverage;
the allowed longest gap remains two real supplied intervals. Consume explicit
grouping rather than encoding months/quarters/years as approximate day widths.
Allow empty evidence arrays to return no-evidence guidance instead of throwing.
Guidance names sparse samples, limited updates, or actual inactive spans; it must
not claim a recorded hold cannot be drawn. One genuine update is still not a
trend, regardless of the sample volume. Explicit shorter-ready suggestions can
offer 30/90 only, with no automatic range changes and no 14-day recommendation.

For 30/90-day comparisons, the previous period is the immediately preceding
equal nominal local-calendar window with the same cohort. Young-history display
clipping must not shorten or shift that comparison. Retain sparse-comparison
rules and the existing matched as-of cutoff: shift the current as-of wall-clock
timestamp back by the nominal selection's calendar days, preserving milliseconds.
The prior nominal end is still exclusive next local midnight; records after the
shifted prior as-of are not compared. All time has no previous-lifetime comparison; omit that delta rather than
inventing an equally long earlier period.

The selected historical range applies to Performance, Time vs target, Practice,
Topic performance, Recall, and Memory strength. Retention map and Memory signals
remain current-state snapshots. Overdue backlog always shows the last 30 local
dates with exact daily known counts, explicit dates, and a "Last 30 days" caption.
Upcoming reviews always shows the next 14 local dates. Neither workload card
claims to follow All time. Backlog reconstructs the current retained active-card
cohort; daily lifetime reconstruction adds cost without supplying a complete
historical census. Weekly averages would change the daily watch-zone meaning.

Remove 14 days from the primary selector and recommendations. Legacy `range=14`
links resolve to the default 30-day selection; unsupported route values also
default to 30. Parse `all` explicitly and keep it distinct in requests and cache
keys; do not coerce it with `Number()`. Runtime contracts accept exactly 30, 90,
or `all`. Do not retain a hidden fourth primary choice.

## Card And Interaction Contract

Each overview card has a short title, one descriptive line, an optional meaningful
leading value with units/sample context, a compact local control row, a flexible
plot slot, and a short legend/footer. No extra question paragraph is shown.
Descriptions target 4–9 words; calculation, provenance, limitations, and precise
counts remain available through Details and inspection.

Suggested primary descriptions are:

| Card              | Description                             |
| ----------------- | --------------------------------------- |
| Performance       | First attempts · weighted by difficulty |
| Time vs target    | Median time by difficulty               |
| Practice          | Rating mix and review volume            |
| Topic performance | Weighted scores across all assessments  |
| Recall            | Repeat reviews · period to date         |
| Memory strength   | FSRS stability after review             |
| Retention map     | Estimated recall and memory durability  |
| Memory signals    | Problems that need attention            |
| Overdue backlog   | Daily overdue reviews · last 30 days    |
| Upcoming reviews  | Scheduled reviews · next 14 days        |

Performance's header action is Breakdown. Other charts use Details for secondary
explanation. Chart/Table uses one consistent compact two-state control in the
card's local control row. Memory signals remains a linked list with pagination,
not a chart with a meaningless Chart/Table switch. Do not add inert controls.

Tooltip cleanup is explicitly deferred to a separate project. Preserve existing
inspection access, keyboard/pointer/tap parity, and truthful values required by
the changed metrics and dates. Do not redesign tooltip appearance, introduce a
new tooltip framework, or expand tooltip interaction behavior in this refactor.

Every chart card retains the same outer height in Overview, Details, Chart,
Table, loading, no-data, partial-data, and error states: 464px on desktop and
512px when stacked on narrow screens. The plot slot uses the remaining definite
height; neither an aspect ratio nor a nested fixed minimum controls the shell.
The prototype's fixed header/body/footer tracks are the reference. Do not shrink
text, clip content, or introduce internal vertical scrolling to obtain uniformity.

Breakdown and Details replace the plot area and reclaim the hero slot. The header
action becomes Overview and restores the prior filters, series, and selections.
Use compact subsection tabs and bounded pages rather than stacking several tables
and notes. Keep every underlying measurement, linked problem, calculation,
provenance note, goal editor, and validation error reachable in a fitting
subsection. Performance starts with Ratings / Difficulty / Mix / Intervals;
Recall uses Summary / Intervals / Method and retains its separate Goals surface.
Advanced raw-outcome, timing trend/comparison, and other existing controls stay
accessible through appropriate fitting Details sections. Preserve focus and
restore it to the originating action on close.

Use four single-line data rows in wider cards and three in very narrow cards as
the initial table budgets; long-title problem lists use three rows in wider cards
and two when narrow. Refine page lengths from measured usable width/height.
Pagination preserves every row, clamps on range/width changes, and recalculates
even while plots are hidden. Keep the actual qualifying/returned counts and the
returned-top-25 versus qualifying-total distinction for Signals. No evidence or
reason is discarded. Retention selection and pinned problem details use a fitting
card view rather than enlarging the outer card.

### Stable Data And Action States

Routine evidence limitations occupy neutral metadata in existing header/footer
slots. Keep short sample, update-count, timed coverage, known backlog coverage,
and in-progress labels visible beside the affected metric; full reasons remain
available in Details. Distinct Practice rating/count limitations remain distinct.
Normal shortened history does not create a warning banner above the grid.

Initial loading keeps the complete headline and chart shells with appropriately
sized skeletons. Changing range clears incompatible old values immediately.
A same-key background refresh may retain the previous chart with Updating;
failed refresh retains the original as-of context and an explicit failed-refresh
status with Retry. It cannot imply successful new-range data or a current snapshot.
No eligible evidence replaces the plot within the existing card and shows an
unavailable hero. Genuine zero activity, zero due work, and no flagged problems
remain measured outcomes; unknown Recall or Backlog never becomes zero.

Load failures use a compact persistent message and Retry in the affected fixed
shell. Save/validation errors preserve the draft and stay beside their goal field,
with accessible error association. Floating feedback may supplement an action
confirmation but is never the only indication that a save failed. Use one polite
range/refresh announcement, not ten simultaneous readiness announcements.
Tooltip styling and interaction cleanup remain deferred.

## Weighted Performance

Use one fixed rating rubric:

| Recorded rating | Points | Friendly breakdown label |
| --------------- | ------ | ------------------------ |
| Again           | 0      | Needs practice           |
| Hard            | 50     | Effortful                |
| Good            | 80     | Solid                    |
| Easy            | 100    | Strong                   |

Question difficulty supplies influence: Easy 1, Medium 2, Hard 3. Unknown uses
baseline influence 1 and is displayed as Unclassified in breakdowns. This
preserves inclusion of valid unclassified assessments; it does not classify them
as Easy. Expose their count and share. Problem difficulty means current catalog
metadata, not FSRS's numeric difficulty or an attempt-time snapshot.

For eligible assessments, with rating points `p_i` and difficulty weights `w_i`:

```text
Performance = sum(w_i * p_i) / sum(w_i)
```

Keep full precision for calculation and status. Show a rounded integer `/100`
in the hero and one decimal in inspection/breakdown. It is a transparent product
index, not correctness probability, skill certification, or an FSRS input. A
Hard question has three times the influence, not an automatic bonus. Do not add
time, streak, recency, AI evaluation, or an extra failure penalty. Ratings may
already incorporate timing; applying a second timing penalty would double-count
that policy. All Good is 80; all Again is measured 0; an empty cohort is unavailable.
Do not introduce arbitrary letter grades, performance goals, or user-editable
rubric weights in this change.

The approved sample's 100 assessments produce 13,210 weighted points divided by
195 weighted units: 67.7436, displayed as 68/100. Its evidence remains 100,
not 195. Keep that reconciliation as a model acceptance example.

Default to First attempts. A compact cohort control also selects Follow-up
practice. Use the existing raw first-recorded-versus-later cohorts exactly:
earliest retained raw event per problem across modes/cards is selected before
validity, report-period, difficulty, or timing filters. Invalid first events do
not promote later events; an earlier pre-range attempt prevents a repeat being
treated as first. Exclude future records. Switching cohorts updates the leading
value, trend, sample, breakdown, and period comparison together.

First attempts is a compact label for first retained recorded assessments, not
proof of first exposure or an unaided solution. Calculation details state that
hints and earlier exposure are unknown.

Within the selected period, accumulate weighted points and weighted units through
each ordered bucket. The latest supported cumulative value equals the selected
cohort's whole-period hero and breakdown. Never average bucket or difficulty
averages. Keep raw bucket results separate and accessible in Table/inspection.
Counts shown as evidence are actual valid assessments, never weighted units.
The selected range resets accumulation; moving calendar windows can remove
earlier evidence and change the score without a new assessment. Label the trend
Period to date. Cumulative summaries can conceal recent deterioration, so preserve
raw interval scores and explicit sample counts in details.

Breakdown offers Ratings, Question difficulty, and Mix. Ratings shows original
rating, friendly label, raw count, rubric points, and difficulty-weighted
influence. Question difficulty shows raw/valid/invalid counts, weights, scores,
and current/prior comparison. Mix preserves assessment-share and recorded-time
share, including Unclassified. Retain existing difficulty visibility,
Trend/Compare, the raw outcome-rate choices, and all exact tables. Use Hard or
better and Good or better as concise advanced rate labels, with the original
rating definitions in calculation details. Never place a percentage goal on the
weighted `/100` axis.

Weighted period comparisons use score-point differences, not percentage-point
changes or differences between rounded heroes. Either period below ten valid
assessments shows Sparse comparison rather than a directional claim. Legacy
raw-rate comparisons retain their existing percentage-point meaning. These
comparisons exist only for 30/90 days, using nominal preceding windows; All time
omits them.

## Recall And Natural Continuity

Recall retains the existing paired repeat-review population: rating-derived
Hard/Good/Easy recalled outcomes paired with finite reconstructed FSRS
retrievability immediately before those exact reviews. Preserve complete
valid-history replay, pre-range initialization, initial replay exclusion,
rating eligibility, genuine estimate zero, and as-of exclusion. It is distinct
from Performance's raw follow-up population and from current Retention map values.
Valid Again outcomes remain paired failures in the denominator; only Hard,
Good, and Easy contribute to the recalled numerator. Do not restrict the pair
population to recalled outcomes.

Through bucket `k`, calculate:

```text
N_k = sum(pairedReviews)
ObservedRecall_k = 100 * sum(recalledCount) / N_k
FSRSAverage_k = 100 * sum(pairedReviews * unroundedFSRSMean) / N_k
```

`unroundedFSRSMean` is the existing fractional bucket mean over the same pairs.
Both values are unavailable when `N_k` is zero. Recall has no question-difficulty
weighting. The signed difference uses full precision and is shown in percentage
points only while both series are visible. Preserve separate native series
switches, solid observed lines/circles and short-dashed FSRS lines/diamonds.

The two cumulative lines use identical pairs and availability. Their latest
values, shared recalled/paired counts, and Details totals agree. Preserve raw
bucket outcomes/means separately; do not put a cumulative percentage beside an
interval-only denominator. Table and inspection show cumulative and interval
counts, both measures, complete/in-progress context, and the updated interval.

Performance and both Recall lines share this explicit continuity policy:

- Before the first eligible evidence: unavailable, with no carried value.
- With new eligible evidence: update the cumulative value at that bucket's
  actual calendar midpoint; markers identify only supported updates.
- With no new evidence after initialization: retain the previous aggregate,
  horizontal long dashes, zero new eligible observations, unchanged cumulative
  counts, and the last updated interval. This is a recorded aggregate hold.
- Continue trailing holds through the report's as-of boundary. Do not draw beyond
  as-of or trim away trailing inactivity for these cumulative views.
- An all-empty period is unavailable. Actual zero is a supported value, not a gap.

Use bounded monotone cubic connections for consecutive supported updates. Shared
tangents keep active runs flowing; horizontal tangents meet held spans and local
extrema. After an inactive span, hold through the next active bucket's start and
transition only inside that supported bucket to its actual marked midpoint.
Keep Bezier controls within endpoint X/Y bounds, with no overshoot, reversal,
vertical staircase, fake marker, or movement in unsupported time. Equal values
connect horizontally but retain their genuine update counts.

This geometry is drawing interpolation between supplied bucket summaries, not
an event-time trajectory or extra measured evidence. Pointer/tap/keyboard
inspection chooses original bucket rows, never values sampled from the curve.
Use the concise key Curves connect recorded summaries; dashes show no new
eligible reviews in Details. Visible per-chart keys say No new ratings or No
new paired reviews. Distinguish long held dashes from FSRS's short series dashes.

The last-update caption names the actual last eligible interval, for example
Updated during Sep 10–16. Do not invent an event timestamp from its bucket end.
The current contract is sufficient; adding raw-event payloads or new timestamps
solely to smooth the plot is unnecessary.

Performance retains the full available global-history calendar domain, leading
unavailable rows, and trailing holds. Paired Recall retains the selected-period
cohort and totals, but uses an explicit display frame from the earliest eligible
paired review inside that selection through the same report as-of boundary.
Choose its calendar grouping from that visible span with the same shared grouping
helper, keeping both series and interval details in the same frame. Label the
actual paired-history dates and grouping in the card. This is a display-only
exception; it never changes the page selection, eligible pair set, aggregate,
or underlying readiness. An All time span of 612 days whose first pair is Sep 9,
2026 shows Recall Sep 9–Oct 5, with the same 52 pairs and 48 recalled outcomes.
Retain internal inactivity and trailing holds. Never crop genuinely long sparse
paired history to recent activity, or invent leading values before its first pair.
Date positions, midpoints, sparse ticks, cross-year labels, and shortened edge
buckets remain real. Fitted Recall scales include both cumulative series and the saved Recall
goal independently of series visibility. Performance uses the fixed 0–100 point
axis. One genuine update remains insufficient for a trend; held rows do not
increase readiness, active-bucket counts, samples, or confidence.

## Topics, Remaining Charts, And Saved Goals

Topic performance uses the same weighted rubric over all valid selected-period
assessments, explicitly labeled All assessments. Retain current eligibility:
at least ten valid ratings across at least three distinct valid-reviewed
problems, current direct topic assignments, overlapping memberships, and no
ancestor rollups. Sort all qualifying topics by unrounded score ascending,
then actual valid count descending, then normalized topic name. Show `/100`,
not `%`; retain full names and every qualifying topic with bounded plot scrolling
and keyboard-selected-topic visibility. A topic is not an additive contribution
to the page score. Low-evidence topics remain explainable without being ranked
as reliable scores.

Do not color weighted topic scores as below a percentage goal. Any original
below-Review-Success-goal status belongs beside the raw rate in rating details.
The overview ranks weakest to strongest without inventing a weighted target.

Weighted topics require a domain/runtime addition: exact counts for the four
rating categories within each of Easy/Medium/Hard/Unknown. The current
Good + Easy numerator and valid total cannot reconstruct that joint distribution.
Retain existing raw-rate fields for advanced rating details and compatible
consumers. Add required `ratingCountsByDifficulty` to each topic row with all
sixteen nonnegative integer cells. Its total must equal `validRatings`, its
Good/Easy sum must equal `goodEasy`, and `reviewSuccess` must equal
`goodEasy / validRatings`. Validate these reconciliations with Zod;
no new database query per chart, table, or persisted review field is needed.

Time vs target shows one horizontal selected-period median bar for each known
difficulty, normalized against that difficulty's current Settings target. A
shared 100% reference makes the allowances comparable. Bars start at zero,
remain uncapped above 100%, fill their row, and use a restrained accent on only
the portion above the target. A muted remaining allowance may extend an
under-target bar to 100%; it is reference space rather than recorded time.
Difficulty is always named. Direct labels show median minutes, target minutes,
and the relative difference as Under, Over, or On target. Do not describe this
as a speed grade, acceptance rate, or percentage of assessments meeting target.

For a difficulty with a positive saved target and supported median:

- Percent of target = `100 * medianSeconds / (targetMinutes * 60)`.
- Difference minutes = `medianSeconds / 60 - targetMinutes`.
- Difference percent = `percentOfTarget - 100`.

Show timed/eligible coverage and the selected first/follow-up and timing cohort
explicitly. Use coverage as the leading overview value rather than a pooled
minute median inferred from three difficulty medians. One timed observation
supports a median; missing timed data stays unavailable. Unknown difficulty has
no comparable saved allowance and must not receive Easy's target through its
Performance baseline weight. Fit the percentage axis to the median ratios and
100% reference with padding, independent of series visibility.

The overview uses period medians. Details retains historical Trend, current/prior
Compare, Minutes/current-target-percentage, all/successful timing subsets,
original difficulty identities, exact coverage, and median/quartile rules.
All timed assessments remains the default; it can include Again and invalid
ratings with positive recorded duration. Its local cohort is independent of the
Performance card's control. Current targets are references rather than historical
policy snapshots, and changing them changes the comparison without changing
recorded seconds. Saved time excludes pauses and may include running idle time;
unsaved earlier work is unknown. No timing estimate or penalty is inferred from
the weighted score. Existing totals and Settings targets are sufficient; this
refinement adds no runtime fields, database queries, or persisted values.

Practice retains exact interval rating shares and independent completed-review
counts, missing-composition hatching, its saved Review Success reference,
Reviews visibility, union/trim rules, and association-only explanation in
Details. Friendly rating labels include the original rating names in inspection
and Table so rating Hard is not confused with question difficulty Hard.

Memory strength retains fitted median stability and supported quartile whiskers.
Retention map retains every eligible question, stable full-cohort domains,
All/Below target, exact status marks/counts, overlap chooser, pointer/touch/
keyboard inspection, box/gesture/button zoom, reset, and pinned linked details.
Current estimated recall and durability are not carried historical Recall.
Backlog uses its independent last-30-day daily domain and keeps straight known-day
connections and unknown breaks. Both its line
and measured markers are green strictly below the configured watch threshold and
amber at or above it. Split a crossing line at the exact threshold without adding a
new observation or changing its geometry; a flat line and every measured marker
at the threshold are amber. Upcoming keeps all fourteen date slots and separate
exact Due/Overdue stacks. Do not apply cumulative holding or smoothing to counts,
forecasts, stability, or current model estimates. Those quantities have different
meanings.

Saved goals retain existing Settings fields, units, defaults, atomic one-key
updates, backup compatibility, and configured sync behavior. Performance has
no percentage goal. Raw first-attempt goals remain reachable under Breakdown
Ratings; raw follow-up goals remain reachable there too. Recall Details has a
Goals section containing both Recall and Review Success buttons, one single-field
editor at a time. Practice retains Review Success; weighted Topics exposes the
legacy raw-rate goal only inside rating details, with its unit/cohort explicit.

Recall overview shows its compact saved Recall goal. Review Success must remain
at least Recall; a blocked edit names that rule and offers the counterpart
button in the same Details surface. Never auto-adjust the other preference.
Retain focused input, Enter/Save, Escape/Cancel/focus return, draft preservation
when the counterpart refreshes, pending/error states, duplicate-save protection,
and accessibility in Chart/Table/empty/sparse states. Goal edits change no
observations, weighted score, readiness, FSRS schedules, or Retention map values.

## Bar Geometry And Accessibility

Size bars from their actual projected slot, not a fixed 36px/44px cap. For date
bars derive slots from actual interval boundaries; preserve empty date slots,
known zeros, and shortened buckets. Normally use a 6px–14px gap, never more than
20% of the slot; relax the 6px minimum when a small slot requires it. Use the
remaining width for the bar. Categorical
difficulty/Compare columns follow the same rule. Topic slots retain their 96px
minimum for full-name access; their bars occupy that slot minus the bounded gap.
No axis/category compression may remove real calendar gaps.

Keep segment labels at readable size only when they fit. Use collision-aware
outside fallback for small positive workload segments, with no artificial bar
height. Zero has zero geometry. Maintain neutral missing-data patterns, contrast,
stable series colors and shapes, legible units, and quiet grid lines.

Retain native controls and inspection, visible focus, Left/Right/Home/End,
Enter/Space, Escape, pointer/tap parity, tooltip hidden initially, and exact
Chart/Table rows. Details cannot make saved-goal controls unreachable. At 320px
and 200% zoom, stack/reflow controls and reduce ticks rather than shrinking
essential text or introducing document overflow. Check long names, all series
hidden, both themes, empty/sparse data, pending saves, and failed saves.

## Ownership And Phase Boundaries

Keep `entrypoints -> app -> features -> platform/lib/components` intact.
Analytics owns these read-only calculations and components. Settings keeps goal
writes. Reuse the existing summary request, complete-history repository read,
runtime boundary, invalidation, and public feature exports. Do not add accounts,
backend reporting, new permissions, sync expansion, database migrations,
dependencies, or a generic chart framework.

Primary ownership remains:

- `src/features/analytics/domain`: pure weighted score, cumulative presentation,
  existing eligibility/readiness, available-history bounds and calendar grouping,
  and topic joint aggregation.
- `src/features/analytics/api/analytics-contracts.ts`: explicit 30/90/all selection,
  range/grouping context, topic joint-count transport, and shared pair invariants,
  including paired count/value availability.
- `src/features/analytics/server/analytics-service.ts`: compose the existing
  validated read model, without chart-specific database calls.
- `src/features/analytics/components`: common panel slots/control placement,
  feature-specific Performance breakdown and cumulative Recall presentation.
- `src/styles/analytics.css`: scoped definite-height/plot-slot and density rules.
- `src/app/dashboard/screens/analytics-page.tsx`: existing route/header composition
  only where needed; domain calculations stay inside Analytics.

Separate execution into phase-sized plans after written-spec approval:

1. [Pure history-window/calendar-grouping foundation](../plans/2026-10-05-analytics-history-window-foundation.md), with explicit selection,
   shared raw-history origin, nominal/display separation, bounded All time
   intervals, and independent daily backlog bounds.
2. Range runtime/service/route integration, sample guidance, explicit card scopes,
   and legacy 14-day link normalization.
3. Pure weighted/cumulative models and topic runtime contract.
4. Performance/Recall UI, breakdowns, goals, and exact inspection/Table parity.
5. Ten-card organization, shared plot sizing, bar density, copy, all remaining
   views, authority-doc updates, and complete verification.

Update `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, and
`design.md` with each shipped phase. Explicitly supersede the opening combined
outcome pair, full-width Problem Solving/Practice/Retention arrangement,
percentage-only Topic Performance, old summary-caption mismatch, and natural
height Memory signals overview. Supersede outer trimming and next-valid dashed
bridges only for cumulative Performance and paired Recall; retain the current
gap policy for other metrics. This planning artifact does not change current
authority or shipped behavior before implementation.

## Verification And Completion Criteria

Meaningful model tests cover weighting and denominator conservation; Unknown
inclusion; all Again/Good/Easy; invalid first events; pre-range/future events;
cumulative-versus-period equality; exact paired Recall aggregation; null/zero;
leading/trailing inactivity; range changes; topic overlaps/eligibility/order;
and unchanged readiness under held rows. Geometry tests cover rising/falling/
equal/boundary values, active runs, long gaps, singleton and shortened/partial
buckets, bounded curves, actual midpoint endpoints, and no activity invented in
holds. Runtime tests reject inconsistent pairs and topic count matrices.

Range regressions cover 30/90/all, same-day and twelve-day global histories,
first-only Recall emptiness, old history with sparse recent activity, empty and
future-only history, an origin inside an edge bucket, DST and year boundaries,
long lifetimes with a bounded number of real intervals, every record counted,
nominal prior comparisons independent of display clipping, and no All time
prior delta. Test exact fixed-30-day backlog scope under every primary selection,
unchanged fourteen-date forecasts, explicit cache keys, and legacy 14-day links.

Backlog regressions cover green below the configured threshold, amber at and
above it, flat threshold spans, both crossing directions, unknown-day breaks,
unchanged straight-line geometry, and no extra observation markers.

Timing regressions cover below/at/above-target medians, exact minute and percent
deltas, uncapped ratios above 100%, missing durations, Unknown without an
allowance, per-difficulty timed/eligible coverage, unchanged recorded seconds
after target edits, and preservation of all/successful timing subsets. Do not
reconstruct a pooled median from per-difficulty aggregates.

Recall contract refinements require `recalledCount <= pairedReviews`; zero pairs
means both rates/difference unavailable and evidence unmeasured; positive pairs
means both rates/difference finite, observed equals recalled/paired, and the
unrounded difference equals observed minus estimate. Derived cumulative/held
states and weighted scores remain in the shared pure presentation model, without
new runtime fields or a second aggregation in each chart component.

Focused component tests cover cohort changes, breakdown navigation, both Recall
switches, hidden-series inspection, cumulative/raw denominator parity, saved
goal counterpart access and race/error behavior, Table pagination, and empty
states. Prefer semantic regression tests over tests mirroring layout classes.

Each relevant code phase must run focused tests followed by `npm run lint`,
`npm run check`, and `npm run build`, as required by
`docs/agent-governance.md`. Phase plans name exact focused paths and commands.
No migration or artifact-packaging command is required unless scope changes.
Record exact commands run and exact skipped commands/reasons in each handoff.

Production-component browser proof must cover both themes at desktop/320px,
equal Overview/Details/state card heights, four correctly scoped headlines,
plot growth, bar spacing, long labels, natural holds, actual midpoint geometry,
paginated expanded content, and keyboard/touch controls.
The concept preview is separate design evidence, not production-component proof.

Before PR review or merge, the human engineer must rebuild/reload the installed
extension and complete happy-path and edge-case Analytics smoke with screenshots
or recording. Include 30/90 days and All time, young/sparse/empty/long history, a genuine zero,
leading/internal/trailing gaps, one update, an in-progress bucket, cross-year
context when available, goal saves/failures, topic coverage, and all current-state
and workload interactions. Confirm Last 30 days backlog and Next 14 days upcoming
remain independent of historical selection. Record unexercised cases as pending; do not mark
behavior-changing manual proof as N/A.

Completion means the new overview is glanceable and consistent, all existing
underlying evidence remains reachable, the weighted and paired cumulative math
is exact, unavailable/held/measured data stay distinguishable, and validation
and human-proof requirements are satisfied. This written-design commit alone
does not meet implementation completion criteria.

## Design-Only Validation Record

No application files changed in this design pass. The independent scoring and
layout reviews were read-only. The approved preview was previously inspected at
desktop and 320px with bounded curve checks and unchanged paired counts; this
does not replace future production-component or installed-extension proof.

Commands run for this written specification:

```sh
rtk proxy npx prettier --write docs/superpowers/specs/2026-10-05-analytics-performance-layout-design.md docs/superpowers/README.md
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --version
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --write docs/superpowers/specs/2026-10-05-analytics-performance-layout-design.md docs/superpowers/README.md
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check docs/superpowers/specs/2026-10-05-analytics-performance-layout-design.md docs/superpowers/README.md
rtk git diff --check
rtk proxy cmp /Users/tobiolutimehin/.codex/visualizations/2026/10/05/01a10d12-ff05-7513-a4cd-ab032061c820/analytics-natural-trend-preview.html docs/superpowers/specs/assets/2026-10-05-analytics-value-first-approved.html
```

The initial `npx` command failed with registry `ENOTFOUND` because this worktree
has no installed dependencies. Formatting and its check passed using the existing
canonical checkout's Prettier 3.8.3. `--ignore-path /dev/null` explicitly checks
the new spec even though planning artifacts are normally ignored. The whitespace
check passed, and the preserved preview is byte-for-byte identical.

Commands skipped: `rtk npm run lint`, `rtk npm run check`, and
`rtk npm run build`, because this commit contains planning Markdown and a
verbatim design reference only. Database generation/checks, packaging, and human
installed-extension smoke were not run because no app behavior, persisted shape,
or release artifact changed. All implementation validation remains pending under
the phase requirements above. This `docs(analytics)` commit has no release-trigger
impact; reverting it removes planning/reference files without changing user data.

For the target-relative timing refinement, the existing timing aggregation,
normalization, and Settings targets were reviewed independently without app
edits. The revised concept keeps 464px desktop cards and a 246px chart slot;
its target labels and expanded evidence were inspected at desktop and 320px.
These illustrative checks do not count as installed-extension proof.

Commands run for that specification refinement:

```sh
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --write docs/superpowers/specs/2026-10-05-analytics-performance-layout-design.md
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check docs/superpowers/specs/2026-10-05-analytics-performance-layout-design.md
rtk git diff --check
```

`rtk npm run lint`, `rtk npm run check`, and `rtk npm run build` remain skipped
because this refinement changes planning Markdown and the conversation concept,
with no application code or runtime behavior changed.

For the final backlog refinement, green applies strictly below the configured
watch threshold; measured points and flat spans at the threshold are amber.
The concept was visually inspected after the change. Its 30 measured days and
straight-line geometry are unchanged, with 5 green measured points and all
4 threshold points amber. Boundary crossings, a flat threshold span, and
unknown-day breaks passed the focused geometry audit.

Commands run for this refinement:

```sh
rtk proxy node /private/tmp/analytics-backlog-boundary-audit.mjs
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --write docs/superpowers/specs/2026-10-05-analytics-performance-layout-design.md docs/superpowers/README.md
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check docs/superpowers/specs/2026-10-05-analytics-performance-layout-design.md docs/superpowers/README.md
rtk git diff --check
```

`rtk npm run lint`, `rtk npm run check`, and `rtk npm run build` are skipped
for this design-only refinement. Application implementation, production-component
proof, and human installed-extension smoke remain pending.

For the approved range amendment, two independent read-only reviews checked
calendar grouping, raw-history origin, nominal comparison bounds, workload cost,
readiness counts, and route/cache compatibility. The source rationale above
supports the product decision without claiming scientifically optimal durations.
The first pure-foundation plan was checked inline for scope coverage, complete
code steps, matching signatures, and placeholder-free instructions. No application
files or visual reference were changed.

Commands run for this Markdown-only amendment and phase plan:

```sh
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --write docs/superpowers/specs/2026-10-05-analytics-performance-layout-design.md docs/superpowers/plans/2026-10-05-analytics-history-window-foundation.md docs/superpowers/README.md
rtk proxy node /Users/tobiolutimehin/WebstormProjects/cognipace-v2/node_modules/prettier/bin/prettier.cjs --ignore-path /dev/null --check docs/superpowers/specs/2026-10-05-analytics-performance-layout-design.md docs/superpowers/plans/2026-10-05-analytics-history-window-foundation.md docs/superpowers/README.md
rtk git diff --check
```

Commands skipped: `rtk npm run lint`, `rtk npm run check`, and
`rtk npm run build`, because this change contains planning Markdown only.
`rtk npm run test -- src/features/analytics/domain/analytics-history-window.test.ts src/features/analytics/domain/analytics-time.test.ts src/features/analytics/domain/analytics-range-policy.test.ts`
is also unrun: the new application module/tests are plan content, not implemented
files. The phase plan and all production/human verification remain unexecuted.

## Final Prototype Approval Amendment

The user approved the four-headline interactive prototype and then authorized
continuing the refactor. This amendment records the intervening approved changes
to fixed Details/mobile geometry, paired Recall display scope, quiet states, and
selected-period headline definitions. The approved rubric remains Again 0 /
Hard 50 / Good 80 / Easy 100; older exploration-state events showing Hard 35 do
not change it. Application implementation and required installed-extension human
proof are separate from this prototype approval.
