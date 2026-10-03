# First Recorded Outcomes Investigation

Status: read-only investigation and proposed direction. No metric, chart,
capture, scheduling, Settings, or schema behavior was changed. This is not an
approved implementation specification.

The user asked how Analytics could show improvement on new questions, using
Hard + Good + Easy on each problem's first recorded attempt. Three independent
agents investigated data provenance, metric/architecture, and product/chart
placement. All recommend a separate observed-only measure, with a clearly
defined first-recorded population.

## Recommendation

Add a compact **First Recorded Attempt Success** panel as a companion to Recall.
The plain-language question is: **“How are your outcomes on newly tracked
problems changing?”** Its primary rate is:

```text
successful first records = first Hard + first Good + first Easy
rated first records = first Again + first Hard + first Good + first Easy
rate = successful first records / rated first records
```

Each problem contributes at most once. The metric describes the current rating
of its earliest assessment in retained history. It cannot certify that the
problem was genuinely unfamiliar, that the solve was unassisted, or that this
was the first raw LeetCode submission. Use a short retained-history definition
in the description or calculation details rather than labeling it first-ever
ability or an interview-readiness score.

Keep Good + Easy available in inspection and the period summary as a second,
stricter rating breakdown. Do not call it independent solving: assistance and
hints are not persisted. Automatic Easy is deliberately gated to recall
reviews; first-solve automatic ratings are normally Good, Hard, or Again.
Manual/overridden Easy still belongs in the requested formula.

## Cohort rules

1. Consume the existing full retained history and group by `problemSlug`, not
   card, topic, track membership, or problem-creation date.
2. Choose the earliest chronological record before filtering dates, valid
   ratings, success, modes, difficulty, or topics. The existing Analytics
   convention orders `reviewedAt`, then ID. Persisted `createdAt` could be added
   to the internal read model as a timestamp tie breaker without a migration;
   exact timestamp ties remain inherently ambiguous. Decide and document the
   tie policy in the approved design.
3. Apply the selected report's date range and timezone buckets to those chosen
   records. An earlier out-of-range attempt prevents a later review from being
   classified as new in the current range.
4. All four valid ratings enter the denominator. Again is a failed first
   assessment with zero numerator contribution. Later success never replaces it.
5. An invalid earliest rating is unavailable and excluded from the measurable
   denominator. Report excluded-first-record counts; never promote a later valid
   record. Nullable correctness and missing legacy FSRS logs do not invalidate
   a supported rating.
6. No eligible first records means `null`, not 0%. All Again with a valid
   denominator is a measured 0%. Period totals sum numerators and denominators,
   rather than averaging bucket percentages.
7. Corrections update the selected record's current rating without adding a
   problem. Reset/deletion/backup replacement can change retained history and
   therefore the selected record; no lifetime-history completeness marker exists.

Example: A is first Again and later Good; B is first Hard; C is first Good.
The first-recorded success rate is **2/3 (66.7%)**, with **1/3 (33.3%) Good +
Easy**. Choosing the first successful solution instead produces 3/3 and removes
the initial failure being measured.

## Placement options

| Option                                            | Benefit                                                                     | Cost or ambiguity                                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Separate compact panel, recommended               | Both progression and memory evidence remain visible with clear populations. | Adds one historical measure and vertical space.                                                                                  |
| A First attempts / Reviews mode in the first card | Saves space and makes the cohort choice explicit.                           | Must replace the heading, question, FSRS series, target treatment, evidence, tooltip, and Table together; one measure is hidden. |
| A third line in the existing Recall chart         | Directly shares dates and screen space.                                     | Different denominators/readiness and an inapplicable initial FSRS comparison make the visual easy to misread.                    |

The separate panel should use existing calendar buckets, sparse MM/DD or
MM/DD/YY labels, full tooltip ranges, edge trimming, internal gaps, measured
points, pointer/tap/keyboard inspection, and seven-row Chart/Table parity.
Start with one success curve, visible sample size, and precise rating counts in
inspection. Reuse the established fitted percentage-scale/clearance treatment.
No count axis, duplicate rating stack, or new saved target is needed initially.
Existing Recall and Review Success goals retain their current meanings.

Independent readiness must use only eligible first records. Existing readiness
policy can supply initial product gates: 12/24/45 eligible assessments for
14/30/90 days, plus span, active buckets, and gap checks. These are presentation
gates, not statistical proof of improvement. Keep sparse values visible and show
the actual numerator/denominator; one point cannot establish a trend.

A higher aggregate rate can coincide with easier questions, different topics,
changed timing/rating settings, or assistance. An eventual difficulty breakdown
or difficulty/topic filter would help compare similar practice. Existing
catalog difficulty can be read without a migration, but current metadata is
not a historical snapshot. FSRS numerical card difficulty must not substitute
for LeetCode Easy/Medium/Hard. Avoid an adjusted ability score or automatic
“you improved” verdict in this phase.

## Finding about the existing Recall chart

Current Recall is not repeat-only. `buildPairedReviews` replays all valid
reviews, creates an initial card for index zero, and accepts finite estimates
from 0 through 1. The installed scheduler returns numeric 0 for a new-state
card, so initial records currently affect both the observed rate and the mean
FSRS estimate. A regression explicitly expects initial Good plus repeated
Again to produce two paired reviews and 50% observed recall.

That initial scheduler value is not an individualized prediction of solving an
unfamiliar problem. The new first-recorded panel should have no FSRS estimate.
Adding it can preserve current Recall behavior. A separate approved refinement
could make Recall repeat-only: replay first reviews to build the correct later
memory state, but omit them from paired observations and estimates. Do not
silently change existing counts, readiness, or goal semantics while adding the
new measure. Current Recall readiness also has persisted-correctness eligibility
that differs from its visible rating-derived pairs; the new measure must not
reuse that readiness flag.

## Data and architecture evidence

- `src/platform/db/schema/review-attempts.ts:11` stores problem/card IDs, rating,
  mode, review time, elapsed time, nullable correctness/logs, and created/updated
  timestamps. It has no novelty, retry, hint, submission ID, history-completeness,
  or reset-generation fields.
- `src/features/analytics/data/analytics-repository.ts:109` reads full retained
  history, sorts by review time/ID, and deduplicates topic joins by attempt ID.
  `analytics-service.ts:91` already reads this once per report.
- `src/features/analytics/domain/historical-presentation.ts:608` contains current
  initial-plus-repeat pairing; its test at line 143 verifies the mixed cohort.
  Installed `node_modules/ts-fsrs/dist/index.cjs:1638` establishes new-state 0.
- `src/features/overlay-session/hooks/use-overlay-review-actions.ts:293` records
  manual/quick/watched results with the same LeetCode mode. Submission automation
  at `use-leetcode-submission-automation.ts:96` does not enumerate all later raw
  submissions while a saved session exists.
- `src/features/assessment/domain/assessment.ts:125` derives correctness from
  the final rating; strict overtime can force Again. `rules/easy-gate.ts:18`
  requires a recall review before automatic Easy. These are assessment outcomes,
  not objective acceptance or assistance provenance.
- `src/features/practice/data/practice-repository.ts:184` corrects the existing
  event while preserving identity/review time/creation time. Its reset at line
  312 deletes reviews and cards. First-seen/catalog/card timestamps cannot prove
  lifetime first attempts.
- `src/features/backup/data/backup-repository.ts:110` exports IDs/timestamps;
  restore/replacement at line 160 preserves saved event timestamps but cannot
  certify that every earlier event was present. Content imports do not import
  practice attempts.
- `docs/product.md:453` already explains that history does not identify retries
  or hints. Current product authority remains unchanged by this investigation.

The minimal implementation would be an Analytics-owned pure cohort selector
and bucket aggregator, a serialized view with counts/exclusions/scale and its
own Zod-validated readiness, and a feature-owned historical panel. Existing
full-history reads suffice; no new storage, capture action, migration, permission,
or sync mechanism is required for this retained-history metric.

## Validation and future acceptance cases

The metric agent ran the existing supporting suites:

```sh
rtk npm run test -- src/features/analytics/domain/historical-presentation.test.ts src/features/analytics/server/analytics-service.test.ts src/features/analytics/data/analytics-repository.test.ts src/features/analytics/api/analytics-contracts.test.ts
```

Result: **98 tests passed in four files**. Root and the other investigators used
static reads. `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`,
`rtk npm run db:generate`, and standalone `rtk npm run db:check` were skipped for
this investigation because no production or schema code changed. The audit
Markdown receives an explicit Prettier check.

Future regression cases must include Again then Good, out-of-range earliest
records, invalid-first then valid-later, shuffled/tied/backfilled records,
multiple cards/topics, nullable or conflicting correctness, absent FSRS logs,
correction without duplication, reset/delete/restore semantics, weighted totals,
timezone/DST/partial intervals, measured zero versus no sample, independent
readiness, and exact Chart/Table/tooltip parity. Production implementation would
also require full validation and human installed-extension happy-path and
edge-case smoke with visual proof before PR review or merge.
