# First Attempt Outcomes and Repeat Recall

Status: the user approved the two-outcome design and separate first-attempt
targets on October 3, 2026. Production implementation is complete; automated
validation and production-component proof are recorded in the
[handoff](../handoffs/2026-10-03-analytics-first-attempts-and-repeat-recall.md).
Required human installed-extension smoke remains pending before review or merge.

## Purpose and approved direction

Analytics should answer two separate questions: how outcomes on newly tracked
problems are changing, and how well previously reviewed problems are recalled.
The user chose **Two outcome rates** in the companion preview, then approved
two target references with separate saved goals.

**New Problem Success** asks “How are your first recorded outcomes changing?”
It shows a primary Hard + Good + Easy curve and a thinner Good + Easy curve.
Both divide by the same four-rating first-record population. A shift from Hard
to Good can therefore be visible even when the primary success rate is flat.

**Recall vs FSRS Estimate** compares rating-derived recalled outcomes with
reconstructed retrievability on the same eligible repeat reviews. Initial
reviews still build the memory state for later reviews; they do not enter
either comparison curve.

These are recorded assessment outcomes. Neither chart proves unassisted
solving, first-ever exposure, raw submission success, or causal ability growth.

## First-record population

Select exactly one earliest retained raw review per `problemSlug`, across cards
and modes, using chronological `reviewedAt`, then lexical attempt ID for ties.
Choose the record before applying rating validity or the report date window.
Keep the existing tie convention; do not add creation timestamps or a database
migration for this phase.

An earlier out-of-range record prevents an in-range repeat from being counted
as new. An earliest Again remains a failure after later success. An invalid
earliest rating anchors the problem but is excluded from both denominators;
never replace it with the next valid rating. Nullable correctness, missing FSRS
logs, and conflicting persisted correctness do not invalidate a supported
rating.

For each local-date bucket:

```text
validFirstAttempts = Again + Hard + Good + Easy
hardGoodEasy = Hard + Good + Easy
goodEasy = Good + Easy
firstAttemptSuccess = hardGoodEasy / validFirstAttempts
firstAttemptGoodEasy = goodEasy / validFirstAttempts
```

A zero denominator gives two null rates; a positive denominator with all Again
gives two measured zero rates. Aggregate period numerators and denominators
before dividing. Corrections update the selected record's current rating;
resets, deletions, and restored chronology can change retained history. The
definition stays “first recorded in retained history.”

Persist no new novelty, hint, retry, or submission flags. Preserve rating counts
and excluded-first-rating counts in the serialized view. Report period-wide
exclusions even when an outer interval has no measurable curve and is trimmed
from the displayed chart/table window.

## Repeat comparison and evidence

Group valid history by card, replay its full chronological sequence, and omit
replay index zero only from emitted pairs. For each later event, reconstruct
the pre-review estimate from the prior replayed card. Keep finite probabilities
from zero through one; a true repeat estimate of zero remains valid.

Use those exact pairs for the observed numerator, estimate mean, sample count,
and Recall readiness. Align the compatible legacy Recall payloads with the same
population instead of leaving a second calculation that includes initials.
Other review-volume, rating-mix, Memory Strength, and Topic calculations keep
their existing populations.

First-attempt readiness counts only valid selected first records. Both new
curves share readiness; first attempts cannot make repeat Recall ready. Reuse
the existing range/span/active-bucket/gap gates without changing thresholds.
Sparse observations stay visible with their sample counts. These gates govern
presentation, not statistical confidence. The two populations are not promised
to partition every stored attempt: invalid records and card replay eligibility
can leave events in neither chart.

## Targets

The new graph has two Settings-owned preferences:

| Field                        | Visible label                | Outcome            | Default |
| ---------------------------- | ---------------------------- | ------------------ | ------- |
| `targetFirstAttemptSuccess`  | Target First-attempt Success | Hard + Good + Easy | 90%     |
| `targetFirstAttemptGoodEasy` | Target Good + Easy           | Good + Easy        | 90%     |

Accept whole percentages from 0 through 100, stored as fractions. The new goals
are independent aspirations, with no ordering constraint between them or the
existing review goals. Measured Good + Easy still cannot exceed measured
Hard + Good + Easy for the same population.

Keep existing Target Recall and Target Review Success meanings and their
approved aspiration rule `targetReviewSuccess >= targetRecall` unchanged.
No first-attempt save changes either existing goal.

Use thin dashed references in the corresponding curve colors. When the saved
percentages match, draw one neutral shared reference at that value and retain
both target labels, editors, and tooltip values. Never offset a reference to
make two equal values appear different.

Reuse the compact editor: one percentage input, Save/Cancel, Enter/Escape,
focus restoration, single-field patches, pending state, and retained failed
drafts. Keep both controls reachable in Chart, Table, sparse, and empty states.
Saving changes only the edited preference and derived reference/scale.

Default missing new fields individually so older saved Recall/Review Success
values survive. Recover malformed locally stored new goals independently of
the valid existing pair. Imported backups remain strictly validated. Use the
existing Settings persistence, snapshot, invalidation, backup, and configured
Gist settings serialization; add no runtime method, sync mechanism, permission,
table, or migration. Existing backup/sync settings paths were already approved
for chart goals; this adds preferences to that same mechanism.

## Visual and interaction contract

Place New Problem Success before Repeat Recall as companion cards, side by
side at the dashboard's existing wide two-column breakpoint and stacked below
it. Preserve merged Practice Rhythm and the remaining chart arrangements.

Match the selected preview: mint circles and a solid primary line, blue
diamonds and a thinner solid Good + Easy line. FSRS keeps its distinct short
dashes in Repeat Recall. Keep legends compact and preserve curve visibility
controls. Hiding a series never changes the activity window or fitted scale.

Use the existing 14/30/90-day local-calendar bucket policies. Trim outer
intervals without measurable evidence, preserve inner gaps, and retain
measured zeros. Place markers at true original interval midpoints. With
multiple retained intervals, start at the first midpoint with the approved
12px marker clearance; preserve the final interval's end boundary. A singleton
keeps its original interval and centered point.

Fit the shared new percentage scale to both complete curves and both targets,
including 0% and 100% targets, with endpoint marker clearance. Sparse MM/DD
labels use /YY outside the report year. Keep complete ranges, partial-period
status, as-of time, timezone, exact counts/rates/exclusions, and both goals in
inspection. Long dashed bridges mean unavailable intervals, never interpolated
outcomes. Avoid a permanent duplicate detail row below the plot.

Pointer, tap, and native keyboard inspection select the nearest retained
original bucket. Preserve Left/Right, Home/End, Enter/Space, Escape, visible
focus, light/dark readability, and seven-row table pagination. Chart, Table,
and tooltip use identical supplied rates/counts. Collapsed calculation details
explain retained-history limits and the Hard share between the two curves.

The preview's question-difficulty row is illustrative. This phase does not add
a difficulty filter, breakdown, or repository metadata projection. Production
inspection shows the real rating composition and excludes that mock detail.
Difficulty-adjusted comparisons are a separate iteration.

## Saved reference and scope

The original selected preview is preserved verbatim at
`assets/2026-10-03-analytics-first-attempts/approved-fragment.html`, with its
checksum and approval context in `manifest.json`. It contains illustrative
data. The subsequently approved dual-target treatment is specified above;
the original mock showed only the existing repeat Recall target.

The read-only provenance investigation is
`../audits/2026-10-03-analytics-first-recorded-outcomes.md`. Its one-line/no-new-
target starting recommendation is superseded by this approved design.

## Acceptance and validation

Require regression coverage for first Again then Good, earlier out-of-range
attempts, invalid first then valid later, mixed modes/cards/topics, shuffled and
tied records, null correctness, correction/reset/restored chronology, weighted
totals, zero versus null, and timezone/partial periods. Initial-only histories
must produce no Recall pairs; an initial before the window must still influence
the following repeat prediction. Evidence and legacy Recall counts must agree.

Verify both goal editors, old preference preservation, malformed stored-value
isolation, strict imports, Reset Defaults, independent concurrent saves, cache
refresh, failed-save drafts, coincident targets, target extremes, both curve
visibility switches, tables, and narrow/light/dark/keyboard states.

Use the canonical governance validation matrix for implementation. Required
human installed-extension happy-path and edge-case smoke with screenshot or
recording proof remains mandatory before PR review or merge. Design preview
inspection and automated fixtures do not replace that proof.

For this planning-only change, run Prettier on touched Markdown. Skip
`rtk npm run lint`, `rtk npm run check`, `rtk npm run build`,
`rtk npm run db:generate`, and standalone `rtk npm run db:check`: no production
source, runtime behavior, persisted shape, or schema is changed yet.
