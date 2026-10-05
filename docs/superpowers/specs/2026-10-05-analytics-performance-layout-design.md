# Analytics Performance And Layout Design

Date: 2026-10-05

Status: the user approved the Value first visual direction, weighted Performance,
cumulative Recall, and natural trend connections. This consolidated written
specification awaits the user's review before phase-sized implementation plans.

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
verbatim. Value first is the chosen
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
| 1   | Performance     | Assessment time   |
| 2   | Practice        | Topic performance |
| 3   | Recall          | Memory strength   |
| 4   | Retention map   | Memory signals    |
| 5   | Overdue backlog | Upcoming reviews  |

All ten overview cards share the same width and collapsed desktop height of
464px. The two-column rule applies to the analytics widgets rather than requiring
an extra decorative four-card wrapper. There are no full-width chart exceptions
in the normal overview, including Practice and Retention map.

The existing combined first-outcome and difficulty outcome/Mix views move into
Performance Breakdown. They remain available as explanations, not additional
overview cards. Assessment time moves out of that nested section into its own
peer card. Preserve each underlying measurement and all qualifying items.

Keep the existing explicit 14/30/90-day selector in the page header. Show one
concise scope line with actual selected dates, timezone, and report as-of context.
Retain page-level historical readiness guidance and its explicit shorter-range
action; do not change the range automatically. Repeated evidence explanations
belong in each card's Details rather than permanent paragraphs.

Replace the three large summary tiles with a compact activity line containing
the existing all-time review count and all-time active-day count. Label both
scopes honestly. Remove the duplicate Observed correctness hero; its current
Good + Easy calculation remains available in rating details. Do not relabel that
calculation as independent correctness or change an all-time count into a
selected-period count by changing only its caption.

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
| Assessment time   | Median time by difficulty               |
| Practice          | Rating mix and review volume            |
| Topic performance | Weighted scores across all assessments  |
| Recall            | Repeat reviews · period to date         |
| Memory strength   | FSRS stability after review             |
| Retention map     | Estimated recall and memory durability  |
| Memory signals    | Problems that need attention            |
| Overdue backlog   | Daily overdue reviews                   |
| Upcoming reviews  | Scheduled reviews · next 14 days        |

Performance's header action is Breakdown. Other charts use Details for secondary
explanation. Chart/Table uses one consistent compact two-state control in the
card's local control row. Memory signals remains a linked list with pagination,
not a chart with a meaningless Chart/Table switch. Do not add inert controls.

On desktop, the plot slot grows to use the card's remaining definite height;
the plot must not determine its parent's height through an aspect ratio or
fixed nested minimum. Use at least 220px of plot height, reserving sufficient
space for controls, axes, reference captions, and wrapping legends. At narrow
widths, use natural outer height and a minimum 240px plot slot so wrapped copy,
controls, validation errors, and long names remain available.

Chart and Table are peers within the overview. Retain seven-row historical and
Retention tables and their exact pagination; use compact rows and reserve space
for pagination. If a table or detail cannot fit without clipping, its expanded
mode may grow naturally. Equal height is the collapsed overview contract, not a
reason to hide rows or create a vertically scrolling card.

Breakdown and Details replace the card's plot area with their selected content;
Back to overview restores the prior chart/table, filters, and selection. Expanded
content can grow naturally without stretching the adjacent card's plot. Long
calculation notes, target editors, validation errors, and Retention pinned details
must be fully accessible; they may extend an expanded card. Closing returns the
overview to its common height. Expanding/collapsing retains focus appropriately.

Memory signals uses a compact three-item preview per overview page to fit the
shared desktop height. Show linked titles and wrapping reasons, the actual
qualifying/returned counts, and pagination. Its Details mode retains the full
existing five-row pagination, all typed flags/severity, and the returned-top-25
versus qualifying-total distinction. No problem or reason is discarded.

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
raw-rate comparisons retain their existing percentage-point meaning.

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

Keep the full selected calendar domain and original rows for these two views,
including leading unavailable and trailing held intervals. Date positions,
midpoints, sparse ticks, cross-year labels, and shortened edge buckets remain
real. Fitted Recall scales include both cumulative series and the saved Recall
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

Assessment time retains the existing raw first/follow-up controls, Trend/Compare,
Minutes/current-target-percentage, timing subset, difficulty identity, and
median/quartile rules. Its local cohort is independent of the Performance
card's control; its selected cohort remains visibly labeled. Current targets are
references, not speed grades or historical policy snapshots. No timing estimate
is inferred from the weighted score.

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
Backlog keeps straight known-day connections and unknown breaks. Upcoming
keeps all fourteen date slots and separate exact Due/Overdue stacks. Do not apply
cumulative holding or smoothing to counts, forecasts, stability, or current
model estimates. Those quantities have different meanings.

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
  existing eligibility/range/readiness, and topic joint aggregation.
- `src/features/analytics/api/analytics-contracts.ts`: topic joint-count transport
  and shared pair invariants, including paired count/value availability.
- `src/features/analytics/server/analytics-service.ts`: compose the existing
  validated read model, without chart-specific database calls.
- `src/features/analytics/components`: common panel slots/control placement,
  feature-specific Performance breakdown and cumulative Recall presentation.
- `src/styles/analytics.css`: scoped definite-height/plot-slot and density rules.
- `src/app/dashboard/screens/analytics-page.tsx`: existing route/header composition
  only where needed; domain calculations stay inside Analytics.

Separate execution into three phase-sized plans after written-spec approval:

1. Pure weighted/cumulative models and topic runtime contract.
2. Performance/Recall UI, breakdowns, goals, and exact inspection/Table parity.
3. Ten-card organization, shared plot sizing, bar density, copy, all remaining
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
equal collapsed card heights, plot growth, bar spacing, long labels, natural
holds, actual midpoint geometry, expanded content, and keyboard/touch controls.
The concept preview is separate design evidence, not production-component proof.

Before PR review or merge, the human engineer must rebuild/reload the installed
extension and complete happy-path and edge-case Analytics smoke with screenshots
or recording. Include 14/30/90 days, ready/sparse/empty history, a genuine zero,
leading/internal/trailing gaps, one update, an in-progress bucket, cross-year
context when available, goal saves/failures, topic coverage, and all current-state
and workload interactions. Record unexercised cases as pending; do not mark
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
