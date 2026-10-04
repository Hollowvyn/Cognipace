# Difficulty And Recorded Time Analytics

Status: the user approved the combined preview and chose to expand New Problem
Success into this section on 2026-10-04. This document describes approved future
behavior; it does not claim that the production extension implements it.

## Purpose And Placement

Show how recorded outcomes, recorded assessment time, and the practiced
difficulty mix change across the selected period. Expand the existing New
Problem Success position into one section containing paired Success and Time
plots, followed by a full-width Difficulty Mix plot. Remove the separate
rendering of the superseded New Problem Success card when this section ships.
Keep Recall vs FSRS Estimate a separate memory comparison, with its existing
eligibility and calculation rules.

The section uses the page's existing 14/30/90-day range, report timezone, and
as-of context. It stacks the paired plots on narrow screens and provides exact
Table views. Existing memory, topic, retention, and workload behavior remains
outside this change.

## Approved Controls And Defaults

- New problems is the initial population; Follow-up practice selects later
  recorded assessments.
- Trend is the opening view. Compare shows full-period Easy/Medium/Hard outcome
  columns and time medians/quartiles, using the same chosen population and
  outcome measure.
- Trend initially shows Easy, Medium, and Hard together. One shared legend
  toggles each difficulty in both plots. Hidden difficulties also leave
  inspection; they remain in the full-population Difficulty Mix.
- Success shows one outcome measure at a time: Hard + Good + Easy initially,
  or Good + Easy. Changing visible difficulties preserves the selected measure.
- Time initially shows percent of the current difficulty time target. Minutes
  is an alternative. All timed assessments is the initial timing population;
  successful ratings selects valid Hard/Good/Easy records only.
- Difficulty Mix switches between assessment share and recorded-time share.
  Its opening measure is assessments.
- Presentation controls are local to the view. Reuse the Settings-owned goal
  editors and mutation path for saved goals; introduce no new preferences.

## Cohorts And Denominators

Use the existing complete retained review history, deduplicated by attempt ID.
Select the earliest raw record per problem, across cards and modes, ordered by
assessment timestamp then lexical ID. Perform this selection before rating,
period, timing, or difficulty filters.

New problems contains those earliest records. Follow-up practice contains every
other raw record, including problems first recorded before the selected period.
An invalid earliest rating is excluded from outcome rates without promoting a
later record to first. Later raw records are independent of the FSRS-paired
Recall population. Future records after the report's as-of time are excluded.

For each difficulty and the exact same valid-rating population:

- Hard + Good + Easy rate is their count divided by all valid ratings, including
  Again in the denominator.
- Good + Easy rate is their count divided by that same denominator.
- No valid ratings produces an unavailable rate; an all-Again population
  produces measured zero.
- Period rates and changes use summed numerators/denominators, never an average
  of bucket percentages.

Difficulty Mix counts all recorded assessments in the chosen raw cohort,
including a record with an invalid rating. Its time allocation sums positive
recorded durations from those same records. Easy/Medium/Hard/Unknown remain
separate, and their counts reconcile to the cohort total. Follow-up records can
count one problem multiple times; label this measure Assessments.

Current catalog difficulty classifies historical assessments. Numeric FSRS
difficulty is a different field and is never used for Easy/Medium/Hard.
Unknown is included neutrally in Mix and excluded explicitly from the three
outcome and time difficulty series.

## Recorded Assessment Time

Read persisted `elapsedSeconds`. Only finite positive durations support a time
observation; null, zero, negative, or nonfinite values remain unavailable.
All timed assessments includes Again and invalid-rating records with a valid
duration. The successful-only subset requires a valid rating and Hard, Good, or
Easy. Display timed/eligible counts per difficulty and interval.

Compute the median and Q1/Q3 from recorded durations, reusing the existing
quantile convention. A median can be shown with one through three timed
records. Quartiles require at least four. Combined Trend shows median lines;
isolating one difficulty reveals available middle-50% whiskers. Compare shows
the full-period medians and available quartiles for all three difficulties.

Percent of target is recorded duration divided by the current
`settings.assessment.timeTargetsMinutes` allowance, converted to the same unit.
The percent view has a shared 100% current-target reference. Minutes uses each
difficulty's current reference. The preview's 20/35/50-minute allowances are
illustrative; production reads the current saved settings.

Label these observations recorded assessment time. Paused time is excluded;
running idle time can be included, and earlier unsaved work is unknown. They do
not establish cumulative completion time or active-solving efficiency. Strict
Timing can turn an accepted overtime solution into Again. Historical timing
rules and attempt-time difficulty were not snapshotted, so current-target
comparison is not historical policy compliance or a speed score.

## Goals And Comparison

For New problems, use the existing independent First-attempt Success and
First-attempt Good + Easy goals. For Follow-up practice, use existing Recall
and Review Success goals as reference aspirations, naming the displayed rating
combination and clarifying that the plotted later-record cohort can differ from
the FSRS-paired Recall cohort. Neither reference changes eligibility or measured
rates. Show only the chosen outcome measure's reference and editor.

Compare with the immediately preceding equivalent local-calendar period. Show
the current and prior valid denominators, the selected measure's exact rates,
and percentage-point change. If either difficulty group has fewer than ten
valid ratings, show Sparse comparison instead of a directional claim. Compare
Table values follow the selected outcome measure and time units.

## Dates, Scales, And Inspection

Reuse the supplied adaptive bucket boundaries, including partial edge buckets:
14 days uses daily buckets, 30 days three-day buckets, and 90 days weekly
buckets. Both Trend plots use a single contiguous first-supported through
last-supported window based on any known-difficulty raw activity in the chosen
cohort. Hiding a difficulty, switching the measure, or filtering successful
timing does not change that window. Preserve every internal gap.

Place marks at actual interval midpoints. Use sparse local-calendar date ticks,
MM/DD within the as-of year and MM/DD/YY outside it. Inspection shows the full
interval and years when relevant, timezone/as-of context, partial status, valid
outcome counts, and timed/eligible counts. A long-dash connector can bridge
measured points across unavailable intervals; it creates no observations or
interpolated tooltip values.

Fit outcome domains to both measure options and their applicable saved goals
for the chosen population. Fit time domains to the full eligible distribution
and current references for the chosen units/population, including available
quartiles. Hiding a difficulty must not shift either domain. Time medians and
whiskers retain top/bottom marker clearance. Mix remains a 0–100% stack.

Easy uses mint circles, Medium blue diamonds, and Hard amber triangles across
the two trend plots and difficulty legend; Mix uses the same category colors
with neutral Unknown. Compare keeps those difficulty identities. Match labels
to colors and shapes so color is not the only encoding.

One interval inspection per plot reports visible difficulties at the same
bucket. Keyboard Left/Right/Home/End navigates intervals; Escape dismisses, and
touch can pin details. Neither a hidden series nor an unavailable interval
receives a fabricated value. With no selected difficulty, show Select a
difficulty; with no eligible evidence, show the appropriate outcome/time empty
state. Exact tables retain raw/valid/excluded counts and timing coverage.

The section's compact summary uses the selected raw cohort and report period:
assessment days, recorded assessments/distinct problems, and Good + Easy over
valid ratings. Explicitly show invalid-rating exclusions. Do not reuse the
current all-time SQLite review-day count with a selected-period caption.

## Ownership And Scope

- Extend the existing Analytics repository projection with `problemDifficulty`
  and `elapsedSeconds`; preserve topic-join deduplication.
- Reuse `selectFirstRecordedAttempts`, adding the complementary raw later-record
  selector. Leave FSRS reconstruction/pairing unchanged.
- Keep pure aggregation in the Analytics domain and extend the existing
  historical presentation/service flow with one problem-solving view.
- Supply both raw cohorts, all/successful timing distributions, bucket and
  period/prior counts, and current references through the existing summary.
  Validate runtime payloads with Zod before transport.
- Reuse HistoricalChart, LineSegments, target editors, ChartTable,
  HistoricalTable, and report/date helpers. Keep shared section state in one
  feature component. Do not create another chart framework or endpoint.
- Reuse existing quantiles/rating counters and compact test factories. Added
  test and fixture lines must not exceed added production source lines; avoid
  bulk JSON, copied preview fixtures, and implementation-mirroring assertions.

No schema migration, new Chrome permission, account/backend behavior, expanded
sync behavior, or timer write change is required.

## Delivery And Proof

Phase 1 supplies the existing stored fields and reusable raw cohort selector.
The phase-sized plan is `../plans/2026-10-04-analytics-problem-solving-inputs.md`.
Subsequent model/contract and UI work must follow this approved design and get
their own concrete phase-sized plans before execution.

Production validation follows `docs/agent-governance.md`: focused tests, lint,
full check, build, and production-component visual checks for light/dark and
narrow screens. Human happy-path and edge-case smoke in the rebuilt installed
extension with screenshot/recording proof remains required for shipping UI.
The illustrative preview is design evidence only.

The exact approved preview and its SHA-256 manifest are preserved outside the
repository in this chat's durable visualization directory as
`analytics-problem-solving-combined-approved.html` and
`analytics-problem-solving-approved.json`. This keeps the approved reference
without copying the prototype into production source or automated fixtures.
