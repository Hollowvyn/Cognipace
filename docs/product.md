# Product

## Product Summary

CogniPace is a local-first Chrome MV3 extension for deliberate LeetCode review and
study pacing. It helps a user keep two loops visible while studying:

- what to review now, using FSRS-backed spaced repetition
- what to study next, using the active curated track

The app is intentionally a compact browser tool, not a SaaS app, hosted study
platform, or general React dashboard.

## Target User

CogniPace is for someone preparing for coding interviews who already uses
LeetCode, wants to remember previously solved problems, wants curated progression
through study tracks, and wants guidance inside the browser without creating an
account.

## Core Problem

Interview prep often splits into two weak workflows: random LeetCode grinding
with poor retention, or curated lists that do not remind the user to review older
material. CogniPace combines retention and progression by showing both a review
target and the next track target.

## Product Principles

- Extension-first: optimize for popup, dashboard, overlay, and background
  service-worker realities.
- Local-first: persisted user data lives in the extension.
- No account system: no sign-in, authentication, or hosted identity in the
  current scope.
- No backend service: scheduling, queue composition, tracks, and settings run
  locally.
- Compact workflows: prefer direct actions, short copy, and low ceremony.
- Explicit scope: future ideas are not approved work until a human explicitly
  asks for them.

## Current Status

Implemented or meaningfully wired:

- Popup command surface
- LeetCode content-script overlay
- Dashboard shell and navigation
- Overview guided-practice home with today's progress and recorded practice time
- Library/Problems management
- Tracks workspace and management
- Settings
- Backup, restore, and clear local data from Settings
- Analytics dashboard route for local review-health reporting
- Optional GitHub Gist pseudo-sync from Settings > Data Management
- FSRS-backed practice scheduling
- AI assessment settings and trusted local provider key storage for approved
  BYOK providers
- Runtime messaging, cache invalidation, local database, migrations, and seed data

## Product Surfaces

### Popup

The popup is the fast command surface. It should answer what to review now and
what to study next without becoming a mini dashboard.

Current behavior:

- shows compact metric tiles
- shows a review recommendation
- allows recommendation shuffle when available
- shows study-mode or freestyle track guidance
- opens the current problem when a problem action is available
- links to Settings and Tracks where relevant
- keeps feedback scoped to the affected surface area

### LeetCode Overlay

The overlay runs on LeetCode problem pages and supports in-context practice
logging.

Current behavior:

- collapsed, expanded, and docked visual modes
- timer start, pause, and reset
- target-time awareness
- quick submit preparation from the collapsed state
- expanded submit, fail, update, restart, and rating controls
- focused Solve, AI, and reserved Notes tabs in expanded mode
- timer, assessment, submission dates, Help, review actions, feedback, and
  next-step guidance in Solve; the full review footer appears only in Solve
- existing completed-submission analysis in AI, with loading, error, unavailable,
  and disabled explanations plus Settings and Retry where useful
- a reserved Notes placeholder without editing or persistence
- settings access from the overlay
- compact expanded-mode Help access that opens a YouTube search for the current problem in a new tab
- an explicit AI hints action beside YouTube in Solve's Help row, using the
  selected saved provider, model, and key independently of whether automatic
  AI assessment is on or off
- one requested batch of one to three progressively stronger short pointers:
  the first appears immediately when ready, and Reveal next exposes the next
  pointer locally without another provider request
- session-only hints that retain their batch, revealed count, and disclosure
  across folding/reopening Help, tab switches, collapse/dock/restore, accepted
  or failed review saves, rating updates, and ordinary metadata refetches;
  none of these actions generates another batch
- hints reset on Restart, a different problem, page reload, overlay remount,
  selected problem-input changes, a changed or removed saved connection, or
  clear local data; toggling automatic AI assessment alone preserves them
- page metadata and problem context sync through content-script/runtime messages

Hints exist only in the current overlay session. They never write review/log
fields, rating, solve time, FSRS, Analytics, backup, or sync data. Notes remains
a reserved, deferred tab without editing or persistence.

Submission notes stay in LeetCode. Existing saved CogniPace log fields remain
preserved in local practice history, backups, and sync; overlay review saves and
rating updates do not edit those fields.

#### Automatic code analysis

When AI assessment is enabled and its saved connection is available, each
completed matching LeetCode submission can produce one automatic analysis in
the expanded overlay. Accepted and useful failed results use the full submitted
code, language, problem statement, examples, constraints, follow-ups, and
available diagnostics. Incomplete or oversized essentials show an unavailable
state rather than analyzing a visible editor fragment. Retry refreshes the
original pinned submission, even if LeetCode now has a newer submission.

The compact Option A report shows a factual summary and three independent
scores out of five: Approach, Efficiency, and Code Style. Approach exposes
Current, Suggested, Key idea, and optional Consider. Efficiency exposes
Current complexity, Suggested complexity, and Suggestions, with time and
auxiliary-space comparisons shown independently. Code Style exposes
Readability, Structure, and Suggestions. Each category and Suggested
implementation uses an independent native disclosure, initially closed.

A materially preferred replacement strategy cannot receive Approach 5. Small
bounds or a strict memory limit can make brute force appropriate. A hash map
can improve expected time while worsening auxiliary space; accepted tests and
runtime milliseconds do not prove optimality or Big-O. Language advice must
preserve signatures and intentional types. Kotlin inference is optional polish:
initialized Int locals may omit redundant annotations, Long inference needs a
Long initializer such as 0L, and a retained empty generic collection needs its
type on either the annotation or initializer. A justified direct LongArray is
also valid.

Suggested code is labeled AI-generated and Untested, with Copy feedback and
complexity assumptions. CogniPace never executes or submits that code. A
report may explain why no responsible implementation is available.

Analysis remains in overlay session state: no report database, query-cache
entry, export, sync payload, or analytics score. Saving a review stays immediate
while analysis is pending. AI never selects or changes recall rating,
correctness, solve time, FSRS scheduling, or track progress, and report arrival
causes no review write. The former AI recall-rating override has been retired.

The overlay distinguishes idle, capture preparation, generation, ready,
unavailable, and controlled-error states, with Settings and Retry where useful.
Capture preparation has a 15-second deadline, background analysis a 30-second
deadline including configuration loading, and the whole client operation a
50-second deadline. There is one provider attempt per request. Explicit Retry
uses a new request identity for the retained submission. New attempts,
configuration/key/model changes, navigation, restart, disable, and clear/reset
cancel or invalidate stale work. Reset keeps the same handled attempt idle
until an explicit Retry; collapse, docking, and opening report details do not
start extra provider calls.

### Dashboard

The dashboard is the control and inspection surface for product state.

Current behavior:

- Library manages problem rows, filters, details, create/edit modals, and problem
  practice actions.
- Tracks manages active track workspace, groups, ordered problems, progress,
  create/edit, activation, deletion, and reset progress. Its All tracks
  collection starts expanded and can be collapsed with or without an active
  track. It shows every available track, emphasizes the active track, and
  offers explicit activation, New Track, and a compact Import tracks action.
  Clicking a track card's summary opens a compact read-only preview of its
  ordered groups, questions, and topics inside the same outlined card. Only one
  track preview can be open at a time; collapsing All tracks closes it.
  Groups can be collapsed individually;
  the card's management actions stay available. Previewing does not activate
  the track or change the active group.
  Import tracks opens a template-first dialog with a downloadable track JSON
  example, file selection, preview, diagnostics, and explicit apply. Imported
  tracks are not automatically activated.
- Settings manages persisted user preferences through a dirty-state form workflow.
- Data Management in Settings exports full local backups, validates and restores
  full backups, imports versioned content files, configures optional GitHub Gist
  pseudo-sync, and performs explicit full local clear/reset. Content imports
  accept questions (`problems`), tracks, companies, and topics independently
  or together. Preview shows planned additions and row-level diagnostics; valid
  entries can be applied when unrelated rows are invalid. Imports add missing
  values and associations while preserving stored scalar values, track/group
  order and placements, and practice progress. Missing, null, and empty
  optional data does not clear local content. See the
  [content format reference](import-format.md) for the v1 contract.
- Full backups export version 6 and accept supported versions 1–6. Restore
  preserves recorded history and scheduling evidence; older backups explicitly
  retain unknown historical configuration. Existing due dates and progress are
  not recalculated by restore. Newly exported backups require an updated client.
  If replacement still needs publication, Data Management shows Retry saving.
  It finishes saving the already applied data rather than restoring again. If
  data is saved but sync bookkeeping failed, the same action retries only sync
  status. Further writes, imports, exports and sync wait for recovery. The
  selected restore draft remains available while pending; Settings reload can
  show recovery while the same background worker remains alive.
- The dashboard header shows compact pull and push shortcuts after GitHub Gist
  sync is configured.
- Analytics shows four selected-period activity totals and ten local evidence
  cards, with 30 days (default), 90 days, or All time selection. Available values
  remain visible with metric-specific guidance. Retention and Signals are
  current snapshots, Backlog stays Last 30 days, and Upcoming stays Next 14 days.
- Overview shows the current review recommendation, Reviews Due, Completed
  Today, Streak, Time Today, active-track guidance, and a Today Queue preview.
  Time Today sums saved elapsed time for all assessments recorded on today's
  browser-local calendar date, including repeated and failed attempts. Untimed
  assessments contribute no time. An overnight session belongs to the date its
  assessment was recorded. Corrections replace the existing attempt's time;
  resetting a problem's practice removes its retained time. The total refreshes
  with the existing practice invalidation and dashboard reread behavior.

### Background Service Worker

The background service worker owns trusted extension runtime work:

- local database access
- runtime sender authorization
- runtime handler registration
- feature service calls
- database snapshot persistence
- cache invalidation broadcasts
- GitHub Gist sync orchestration and background-only token access
- local due-review reminder scheduling through Chrome alarms and notifications

## Features

### Practice Scheduling

The current streak counts consecutive browser-local calendar days meeting the
daily goal in unique practiced problems. An unfinished today preserves the
streak earned through yesterday; meeting today's goal adds today. The streak
breaks only after a day ends below its goal. A disabled daily goal reports no
streak.

Practice state is local and FSRS-backed. The persisted database owns practice
facts, and UI surfaces read them through feature services and runtime messages.
On each saved review, CogniPace passes the rating, review time, and configured
target retention to `ts-fsrs`, then persists the returned card and review log.
The persisted FSRS `card.due` value, stored locally as `dueAt`, is the authority
for the next review date. Current retrievability is a separate FSRS estimate for
display and queue ranking; it does not replace or cancel the persisted due date.

Database upgrades preserve existing history, due dates, settings and earned
progress. Older reviews have unknown scheduling provenance rather than an
invented historical configuration. Imported card identities and recorded
scheduling evidence are retained. New reviews capture their pre-review card,
original event time and complete scheduling profile prospectively. Update
corrects exactly the acknowledged latest attempt and revision using that
original context, preserving its identity, event time, application order,
solve time, log and review count. Verified legacy compatibility records a
legacy-derived context using the saved user retention at first acceptance; it
does not claim to recover the unknown original profile. Ambiguous or incomplete
legacy history explains why Update is unavailable. A genuine new review can
establish captured context without rewriting earlier history.

Submit and Update freeze an accepted command before transport. Repeated delivery
returns its original acknowledgement and fresh current details without repeating
review or track effects. Saved feedback follows durable snapshot publication.
A storage or transport failure retains the accepted command for Retry; pending
state locks rating/session changes and does not show success. Stale two-tab
corrections retain the selected draft for deliberate refresh/reselect. Restart
after success creates a genuine new review. Reset and full restore rotate live
generations so old accepted commands cannot mutate replacement data.

Target-retention changes are prospective. They are used by `ts-fsrs` on the
next saved review and do not reschedule existing cards or rewrite their due
dates. Reviewed cards are classified against the browser's local calendar:
cards due before today are overdue, cards due today are due today regardless of
the time of day, and later cards remain scheduled. Suspended and unstarted
problems are not due.

### Queue

The Today Queue composes recommendations from local practice state and problem
data using a fixed waterfall, capped at the configured daily goal: overdue FSRS
cards first, then cards due today, then future-scheduled reviewed cards with the
lowest current retrievability for optional reinforcement, and finally eligible
new Library problems. Overdue and due-today cards are ordered by their FSRS due
date; reinforcement uses retrievability with deterministic ties. Popup guidance
should keep queue recommendation and track progression visibly separate.
User-facing labels reserve Overdue for prior local dates and Due today for the
current local date. Aggregate counts that include both use Reviews due.

### Problems And Library

Problems owns LeetCode problem identity, difficulty, premium status, topics,
companies, catalog rows, and problem-level practice details. Library is the
dashboard surface for inspecting and editing that problem data.

Library topics remain editable as problem metadata. Saved topic labels are
standardized through stored aliases using exact normalized lookup, so variant
labels such as LeetCode page labels or older local labels resolve to the same
persisted topic where an alias exists. Captured LeetCode page topics merge into
the problem without clearing unrelated local or manually edited topics; manual
Library edits replace the direct topic assignments.

Direct assignments remain distinct from graph-derived membership. A narrower
topic inherits its `broader` ancestors for read-model rollups, while
cross-cutting `applies-to` relations do not imply ancestry or membership. The
Library Topics filter searches canonical names and their aliases, but each
selectable option remains one canonical topic. Selecting a topic includes its
descendants by default; users can turn off Include subtopics to match direct
assignments only. Match any is the default when several topics are selected;
Match all requires every selected topic. These rules apply alongside the other
Library filters, and an empty topic selection places no topic constraint.

The product does not include a topic graph management UI. Graph-derived
membership is a Problems read-model capability used by Library filtering; it
does not change direct problem assignments or imply that Analytics uses topic
ancestors. Content import resolves exact normalized labels and existing stored
aliases; an unknown label becomes its own canonical topic. Import files cannot
author topic aliases or hierarchy relations, which remain deferred.

### Tracks

Tracks owns curriculum progression. Track completion is independent of global
practice history by default, and active track/session state is local database
state. Tracks can contain groups and ordered problem memberships.

The create/edit modal uses full-width ordered group sections with shaded headers
and larger group titles. Questions form a continuous ordered list with thin
dividers and quieter titles, making the group/question hierarchy clear. Select
a group to expand its Library problem picker and question list; Rename reveals
its title field. Click an expanded header again to collapse it; all groups may
be closed.
Opening another group closes the previous one. Rename, New Group, and an invalid
group title on Save open the relevant section. Question titles and difficulty
remain visible, and the Change button opens a menu for moving a question to
another group. Moving appends it to the destination without changing the source
selection. Empty groups may be removed when another group remains.

Every track group's problem table uses Library-style pagination with a fixed
15 problems per page. The footer shows the page size and visible range;
Previous/Next controls appear only when there is more than one page in Tracks
and Library. Switching track or group starts at the first page; paging preserves
the group's explicit problem order and does not change track progression.

Expanded track problem rows offer **Remove from track** beside Edit. Removal
only affects that track membership and its track completion; the Library
problem, global practice/review data, and other track memberships remain.
Remaining problems keep their relative order, and empty groups remain editable.

The active track's `Next` target is the first incomplete, non-suspended
membership in explicit group and problem order. FSRS due state does not reorder
track progression; due reviews remain a separate review target. Popup and
dashboard current-chapter guidance identify that next membership's group, with
no current chapter when no eligible question remains. Selecting a group tab
changes only the workspace view for the current visit without retargeting `Next`
or saving a browsing selection. Reopening Tracks or switching active tracks
refreshes guidance and starts on the next question's group, falling back to the
first group when there is no next question. Refetching preserves a valid browsing
tab; removing that group selects the next question's group or first group for
the rest of the visit.

While Study Plan mode is active and the problem belongs to the active track,
`hard`, `good`, and `easy` reviews complete that track problem. `again` does not
complete a currently incomplete track problem. Free Practice does not write
active-track progress, and a later `again` review does not clear an existing
completion. FSRS scheduling and global practice history remain separate from
track completion.

Each track offers **Allow external progress**, off by default. When enabled,
any saved `hard`, `good`, or `easy` review for a member question counts, including
reviews before track creation and future reviews in Free Practice or another
track. A later separate `again` does not erase that evidence. Updating a review
can add or remove its credit; an older remaining successful review still counts.
The editor previews eligible selected questions, and expanded question details
identify External progress or Completed in this track with the rating and date.
Owned track completion takes precedence over external evidence.

External credit is derived from review history and does not create track-ledger
entries or change FSRS. Corrections update existing linked ledger entries even
after switching practice mode or active track. Turning the option off removes
only external credit. Reset Progress clears the track's owned ledger and turns
external progress off while keeping practice history; re-enabling the option
restores historical credit. Resetting a question's global practice history
removes its review evidence and owned completion across tracks.

### Settings

Settings owns persisted preferences, defaults, validation, and the dashboard
settings form. Changes should flow through the settings feature API and
invalidate affected query families.

Review settings expose the FSRS target-retention input. Review Order is not a
user-facing setting: queue ordering follows the fixed waterfall, while the
legacy stored `review.order` value is retained only for settings schema-v1
compatibility. Changing target retention never rewrites existing schedules.

Settings exposes an AI connection for OpenAI, Anthropic, Google Gemini, or
OpenRouter using the user's own selected-provider API key. Choosing a provider
fills an editable suggested model; OpenRouter suggests `openrouter/free`.
Saved custom model IDs survive reopening Settings exactly. OpenRouter's
**Use free models** action changes only the connection draft to `openrouter/free`,
clears old verification, and requires **Save & make active** to persist.
**Discard connection changes** restores the saved provider and model.

**Active provider** always shows the saved provider and model, even while another
provider is selected in the editor. Multiple provider keys can be saved; AI
assessment uses only the active provider's key. A blank saved model shows no
active provider, and a missing active key is identified separately.

**Save & make active** saves the selected provider, model, and any newly entered
key without making a provider request. For another provider with a saved key,
**Make active** reuses that key and activates the displayed model. Other provider
keys remain saved. Saving is disabled for an unchanged active connection.

The separate **Test connection** button checks the saved active connection with
a small structured request, without saving or activating anything. Unsaved
connection edits must be saved or activated first. Testing works while
assessment is disabled and does not enable it. A failed test keeps the saved
connection and shows controlled authentication, permission, model access,
billing, quota, network, timeout, refusal, or output guidance. Saving other
preferences leaves unfinished AI connection edits alone.

OpenRouter's free route chooses a free model automatically; quality, latency,
availability, and usage limits can vary. Users can explicitly enter another free
or paid model ID. CogniPace never configures paid fallback model IDs or switches
a failed free request to a paid model. Connection testing checks basic access
and structured output, not full report quality or every future routed model.
OpenRouter forwards submission code and problem context to a model provider;
OpenRouter and provider data policies apply, including account privacy routing
settings.

AI assessment has a separate enable control for automatic completed-submission
code analysis. Saving, activating, or testing a connection does not enable
assessment, and assessment can be turned off even when its key or model is
missing. Reset Defaults disables assessment and clears provider/model
configuration while preserving saved provider keys. Removing a key refreshes
its availability across extension surfaces; connection results become stale
when the configuration or saved key changes.

Provider API keys are stored in trusted local extension secret storage, never in
backup exports, sync payloads, logs, or unmasked UI payloads. Trusted background
code calls the approved BYOK provider hosts through a reusable Vercel AI SDK
integration. Development smoke testing can also run an opt-in live provider
check from the hidden dashboard smoke route. Neither connection testing flow
reveals stored secret values.

### Analytics

Analytics owns the local dashboard route for review health, historical recall
and practice patterns, current memory state, workload, and weak-area
inspection. Its calculations remain read-only and derived from local practice
state. The narrowly editable chart goals are Settings-owned preferences; they
do not introduce hosted reporting or account behavior.

The four headlines use the selected period, resolved report timezone, and as-of
cutoff, derived from deduplicated raw assessments before chart eligibility
filters. Review days counts distinct local assessment dates; Questions solved
counts unique problems with a persisted correct outcome; Observed correctness
is persisted true/(true+false), excluding unknown flags without a rating fallback.
Recorded solve time sums finite positive seconds on every persisted correct
assessment, including repeat successes, with timed-success/total-success
coverage. Display hours and minutes while retaining exact seconds; positive
subminute time remains distinct from zero. Wholly unknown correctness and
wholly missing successful timing stay unavailable; empty activity or known
zero successes can show zero solved/time. No finite headline mixes all-time
totals, and Review days cannot exceed the available calendar dates.

The four equal 148px headline cards reflow from four to two to one column.
The ten chart cards follow this reading order: Performance / Time vs target,
Practice / Topic performance, Recall / Memory strength, Retention map / Memory
signals, then Overdue backlog / Upcoming reviews. At an actual page-content
width of at least 736px, two 360px cards fit with a 16px gap and all ten cards
are 464px high; below that boundary they stack at 512px. Overview, Breakdown/
Details, Chart, Table, loading, sparse, empty, and error states retain those
same shells. Short descriptions and local controls leave a definite remaining
plot area. Breakdown/Details replace the plot and reclaim the hero space;
Overview restores filters, series, selections, and trigger focus. Fitting
subsections and bounded pages retain every original raw field, row, linked
question, calculation, provenance note, goal, action, and error without
clipping, smaller text, or internal vertical scrolling. Page lengths adapt to
usable space and clamp/reflow on range or width changes even while hidden.

Performance defaults to First attempts, with optional Follow-up practice,
using the existing first-recorded/later raw cohorts. It is
`sum(weight * points) / sum(weight)`: Again 0, Hard 50, Good 80, Easy 100;
current catalog Easy/Medium/Hard weights are 1/2/3, and Unknown has weight 1,
displayed as Unclassified without treating it as Easy. The hero rounds to an
integer /100; inspection retains one decimal and calculations keep full
precision. Actual valid assessments are the evidence count, never weighted
units. All Good is 80, all Again is measured zero, and no valid ratings is
unavailable. There is no time/recency penalty or percentage goal on this index.

Performance Breakdown retains Ratings, Difficulty, Mix, and Intervals, plus
the original pooled outcome curves, difficulty Trend/Compare, raw outcome
choices, goals, and method. The pooled Hard + Good + Easy and Good + Easy
rates include every difficulty, including Unknown, using summed valid counts.
Their fits retain both curves and raw goals independently of visibility.
Pooled raw plots trim invalid-only outer buckets, retain internal gaps and
measured zero, and preserve the original calendar rows in exact values.
Weighted finite comparisons use unrounded score-point differences; raw-rate
comparisons retain percentage-point meaning. Either period below ten valid
assessments says Sparse comparison, and All time omits a prior delta.

Time vs target is an independent peer with its own first/follow-up control.
Its overview leads with timed/eligible coverage and shows known-difficulty
period median bars against current Settings allowances: a shared 100%
reference, uncapped overtime, and direct median/target/Under-Over-On labels.
`percentOfTarget = 100 * medianSeconds / (targetMinutes * 60)`; minute
difference is `medianSeconds / 60 - targetMinutes`. Do not infer a pooled
median from difficulty medians. Unknown contributes coverage and exact
details but has no comparable allowance.

Routine sample, update, timing/backlog coverage, and in-progress context uses
reserved neutral slots, with full reasons in Details. Shortened young history
does not add a page warning. Initial loading keeps the headline and chart
shells; range changes clear incompatible old values immediately. Same-key
Updating may retain a snapshot; a failed refresh retains that exact snapshot
and its original as-of with persistent failure status and Retry. No eligible
evidence remains unavailable, while genuine zero work or no flagged problems
is measured. Load errors stay in the fixed shell, save errors stay associated
with their field and draft, and floating feedback is supplementary. Use one
polite range/refresh announcement. Existing tooltip access remains truthful;
tooltip cleanup is deferred. Human installed-extension happy-path and
edge-case smoke with screenshot or recording proof remains required before
PR review or merge.

Target Recall and Target Review Success are independent saved goals, both
defaulting to 90%, regardless of FSRS target retention. Each accepts whole
percentages from 0 through 100. Target Review Success must be at least Target
Recall: this intentionally stricter aspiration never constrains measured
rates. For the same review population, measured Review Success cannot exceed
measured Recall, but these charts can use different eligible populations.

Recall overview keeps Target Recall; its Details Goals surface offers both
Recall and Review Success buttons, one editor at a time. Performance's raw-rate
goals remain reachable from Breakdown Ratings and its Goals surface. Practice
retains Review Success, and Topics exposes that goal only beside raw rating
details. A blocked pair names the rule and offers its counterpart in the same
Goals surface. Each native target button opens a compact inline editor with one percentage input for that chart, Save, Cancel,
and a short rating-combination and counterpart-limit hint. The input receives
focus; Enter saves and Escape cancels and returns focus. Invalid values or an
invalid pair cannot save, and the editor never adjusts the other goal
automatically. A refreshed counterpart updates the hint and validation without
replacing the active draft. Saving sends only the edited goal; Settings merges
and validates the final pair atomically, preserving the latest other goal.
Saving shows a pending state and prevents duplicate submissions. Success
updates both references from the saved result;
failure keeps the prior goals and the open draft with a persistent, associated
field error. Overview/Details navigation preserves the draft and error. Cancel
changes no saved values. Controls remain available with empty or sparse data,
and reopening, reloading, or changing range preserves saved goals.

Settings Save preserves the pair; Reset Defaults restores 90%/90%. Older
settings or backups with no goals use those defaults. A malformed analytics
subsection falls back only to its defaults, preserving unrelated preferences.
The user-approved pair travels through existing full backups and optional
configured Gist sync as normal settings. It changes neither FSRS scheduling,
cards, due dates, reconstruction, Retention Map, readiness, nor practice
outcomes.

The New problems population has two additional independent saved goals:
Target First-attempt Success (Hard + Good + Easy) and Target Good + Easy.
Each defaults to 90% and accepts whole percentages from 0 through 100.
Neither constrains the other or the existing Recall/Review Success goals.
The raw outcome view shows only the selected measure's reference and compact
editor, using the existing one-key save path. Follow-up practice uses Recall
or Review Success as the corresponding raw-rating aspiration; its population
can differ from the FSRS-paired Recall population.
Missing older fields default individually. Malformed local new fields recover
individually without resetting a valid existing pair; backup validation remains
strict. Settings Save preserves all four goals, and Reset Defaults restores all
four to 90%. The new goals use the existing settings backup and configured sync
paths and never change measured outcomes or FSRS schedules.

Historical Analytics uses adaptive presentation buckets and evidence gates:

- The implemented range choices are 30 days (default), 90 days, and All time.
  Legacy 14-day links normalize to 30. Young history uses available retained
  dates without changing selection; sparse established history preserves real
  inactive dates. Grouping is daily through fourteen available dates, three-day
  through thirty, then calendar weeks; All time longer than a year uses the
  first month/quarter/year grouping that fits sixty intervals, with bounded year
  strides for longer history. All time has no prior comparison. Finite prior
  comparisons retain the complete nominal window and matched as-of cutoff.
  Global origin is the earliest retained nonfuture raw review before metric
  filters. The sixty-interval bound limits chart output, not the complete-history
  read or FSRS replay. Every eligible record remains in totals; grouping never
  averages bucket percentages, scores, or medians.
- Recall's supplied display frame begins at its first eligible selected pair
  and ends at the report as-of. Long genuinely paired history remains long;
  display grouping never improves its underlying readiness.
- Noncumulative historical trend plots trim only unsupported beginning and ending buckets from
  their presentation. Chart, Table, and inspection share the contiguous
  first-supported through last-supported
  slice, preserving every internal gap and each retained bucket's exact dates
  and values. Trimming does not change the selected range, service data,
  selected-period totals, readiness, supplied scales, or report time.
- Readiness's effective evidence window describes usable history separately
  from those rows; it does not control trimming or authorize invented values.
  When the selected range is not ready, neutral card metadata and Details
  explain the relevant shortfall. An explicit link can offer the richest shorter
  ready range; available charts remain visible.
- Practice Rhythm joins intervals supplied by the existing practice and rating
  views by ID plus exact start/end dates. A missing counterpart stays
  unavailable. A known zero completed-review count is an observation. Composition
  and success retain their supplied availability; completed-review counts remain
  independently supplied.
- Noncumulative historical line charts retain their next-valid-point bridges
  across missing evidence. A bridge is a visual connection, never an interpolated
  data value; unknown buckets receive no markers or tooltip values.
  Performance and paired Recall instead accumulate through the period. Before
  eligible evidence they are unavailable; supported updates use real interval
  midpoints and measured markers. Later inactive intervals hold the prior
  aggregate as horizontal long dashes through as-of, with zero new evidence,
  unchanged cumulative counts, and the actual last updated interval. Holds add
  no samples, active buckets, or readiness. Bounded natural connections stay
  within supported endpoint values and do not move in unsupported time. Raw
  interval and cumulative values/counts remain separate in inspection/Table.
  Do not carry or smooth counts, forecasts, stability, or current model estimates.
- Readiness is metric-specific and explainable. A range or metric can be held
  back for too little usable span, too few eligible assessments or active
  buckets, a gap that is too long, or too many gaps. Readiness is guidance for
  confidence, not a reason to hide an otherwise available chart.

The advanced measurements remain available within the ten-card composition:

- **Raw outcomes and recorded time** retain New problems, Trend, all three
  difficulties, Hard + Good + Easy, percent of the current time target, all
  timed assessments, and assessment-share Mix as advanced defaults. Performance
  and Time own independent local cohorts. Follow-up practice selects
  every later raw assessment. Earliest selection uses complete retained history
  per problem across cards and modes, ordered by assessment time then ID,
  before rating, period, difficulty, or timing filters. An invalid earliest
  rating is excluded from rates without promoting a later assessment; a
  pre-period first record prevents a recent repeat from becoming new. Future
  records after the report's as-of time are excluded.
  Easy uses mint circles, Medium blue diamonds, and Hard amber triangles across
  raw outcomes and Time. Their independent difficulty controls hide a series
  and its inspection values without changing the chosen measure, fitted scales,
  or dates. With all three hidden, show Select a difficulty;
  Difficulty Mix still includes the full selected raw population.
  Hard + Good + Easy and Good + Easy divide by the same valid-rating count,
  including Again. All Again is measured zero; no valid ratings is unavailable.
  Period rates use summed counts, not averages of bucket percentages. Compare
  shows full-period difficulty outcomes and time medians/quartiles, with exact
  current/prior valid denominators and percentage-point changes against the
  immediately preceding equivalent local-calendar period. Either denominator
  below ten produces Sparse comparison rather than a directional claim.
  Time reads finite positive saved elapsed seconds. All timed assessments can
  include Again or invalid ratings; successful ratings requires valid Hard,
  Good, or Easy. Show timed/eligible counts. Medians need one timed assessment;
  quartiles need four, and Trend shows their middle-50% whiskers only when one
  difficulty is isolated. Minutes is available alongside percent of the current
  Settings-owned difficulty allowance, with current references and no cap at
  100%. These are recorded assessment durations: paused time is excluded,
  running idle time may remain, and unsaved prior work is unknown. Strict Timing
  may rate an accepted overtime solution Again. Current targets and catalog
  difficulty are not historical policy snapshots or a speed score.
  Difficulty Mix switches between raw assessment share and positive recorded-
  time share, with neutral Unknown separate from Easy/Medium/Hard. Invalid
  ratings still count in Mix; Unknown is excluded from the three outcome/time
  difficulty series. Follow-up counts are Assessments, since one problem can
  contribute several records. The summary reports selected-period assessment
  days, assessments/distinct problems, Good + Easy over valid ratings, and
  invalid exclusions. Raw Trend plots retain the contiguous first-through-last
  known-difficulty activity window for their local cohort, preserving internal gaps independently
  of visibility, measure, or timing subset. Exact tables and inspection retain
  counts, timing coverage, full intervals, partial status, and timezone/as-of.
- **Recall** pairs valid rating-derived outcomes with reconstructed FSRS
  retrievability immediately before the same repeat reviews. Again remains a
  paired failure in the denominator; only Hard, Good, and Easy contribute to
  recalled counts. Each card's complete valid-rating history is replayed,
  including initial and pre-range records for state; its first replayed
  assessment is never emitted. Both curves, compatible summary series, and
  Recall readiness use the exact same eligible pairs. Null or conflicting
  correctness flags do not change this rating-derived population; a genuine
  zero FSRS estimate remains valid. Initial-only history leaves Recall empty
  while First attempts can remain available.
  Through each bucket, observed recall is cumulative recalled/cumulative pairs;
  FSRS is the pair-weighted mean of unrounded bucket estimates. Latest values
  equal selected-period totals and Recall has no difficulty weights. Zero pairs
  means both rates and their difference are unavailable. Positive pairs require
  finite rates, recalled no greater than paired, observed = recalled/paired,
  and the exact observed-minus-estimate difference.
  Observed recall uses a solid line and circles; the estimate uses short dashes
  and diamonds. Long horizontal dashes mean no new paired reviews, preserving
  cumulative counts and last update through report as-of. Series toggles hide
  the curve, markers, and inspection rate together; the signed full-precision
  percentage-point difference appears only with both visible. Shared counts
  remain available. Raw interval rates/counts stay separate from cumulative
  rates/counts in inspection/Table.
  Recall labels its supplied first-selected-pair-to-as-of dates and grouping,
  preserving internal inactivity and trailing holds. Long paired history is
  not cropped to recent activity. Display grouping changes neither eligible
  pairs/totals nor underlying readiness on the global selected-history frame.
  Its fit includes both cumulative series and the saved Target Recall at 0%
  or 100% independently of visibility. With multiple intervals the domain
  begins at the first actual midpoint with 12px left clearance and ends at
  as-of; a singleton retains its interval domain and centered marker. True date
  ticks and full intervals remain available. One update plus holds is still
  not enough for a trend.
- **Memory strength** shows median reconstructed post-review FSRS stability in
  days. Discrete Q1–Q3 whiskers show the middle 50% only when the bucket has at
  least four eligible reviews and known quartiles. The duration scale fits all
  finite median and quartile values with padding and a minimum two-day window;
  it preserves the observed extrema rather than forcing a broad fixed scale.
  Tooltip and Table retain eligible counts, median change, evidence, and
  reconstruction provenance. A finite median supports the retained activity
  window, including zero and sub-day values, without requiring quartiles or
  four eligible reviews. The four-review requirement applies only to whiskers.
- **Practice** combines exact rating composition and completed-review
  volume in one plot. It stacks supplied shares bottom to top as Easy, Good,
  Hard, Again on the fixed 0–100% left axis, labeled Rating share (%). The upper
  boundary of Good + Easy expresses Review Success; there is no additional
  success curve. Completed reviews use a thin neutral line and small measured
  markers on the independent supplied right axis, labeled Reviews. Count zero
  remains known, unavailable counts remain unavailable, and completed counts
  are never derived from valid-rating counts. The saved Target Review Success
  reference uses the left percentage axis and remains visible at 0% or 100%.
  Its compact goal remains reachable through the fitting Goals surface,
  including Table and empty or sparse states. Goal edits do not change shares, review-count scale,
  observations, rows, dates, gaps, or trimming.
  The activity window spans the first through last union interval with positive
  completed reviews, positive valid-rating counts in either source view, or a
  finite supplied success rate including 0%. Every internal interval remains.
  An internal interval without available rating composition has a full-height
  neutral gray diagonal hatch; a zero category in a populated bucket stays
  zero-height. Whole-percent labels appear at readable 12px only when they fit
  without colliding with the count line or target; rounded labels can total 99%
  or 101% without changing exact geometry.
  Friendly Overview labels map Easy/Good/Hard/Again to Strong/Solid/Effortful/
  Needs practice while retaining original rating names in inspection and Details. Shared inspection and fitting paged exact values retain completed
  reviews, each
  rating count and precise share, Good + Easy numerator/valid-rating denominator,
  supplied success, target, each metric's evidence, full interval, timezone/as-of,
  and complete/in-progress context. A native Reviews switch hides the count
  line, markers, right axis, and tooltip count together, preserving rows, dates,
  target, and all Table values. Accessible copy reflects visible series.
  The selected-period Hard + Again summary and evidence-gated prior-period
  comparison remain in Details. Distinct rating and count readiness guidance
  remains available when they differ, without hiding supported data. The
  visible explanation describes association rather than causation; a count-line
  crossing with the percentage target has no percentage meaning. A wholly
  unsupported selected period shows the explicit empty state.

Historical trend plots use sparse calendar-date axis labels without dropping retained
chart rows. Bucket marks sit at the midpoint of their actual local-date interval,
including shortened edge intervals. Memory strength and Practice keep
their interval-boundary X domains and padding.
Labels use MM/DD in the report's as-of
year and MM/DD/YY for other years; cross-year tooltip intervals show both years.
Pointer or tap position selects the nearest retained original bucket. A native
focusable inspection button provides the same tooltip through keyboard focus,
Left/Right arrows, Home/End, and Enter/Space; Escape hides it. Inspection includes
the full bucket range, grouping, complete or in-progress state, report time, and evidence
without a permanent extra detail row. Fitting paged exact values use the same retained rows and supplied values as
the relevant chart, preserving every field and unavailable state. A metric without
supported buckets shows its explicit empty state.

Topic performance shows every topic with at least ten valid ratings across
three distinct valid-reviewed problems, using the same weighted /100 rubric
over All assessments. Sort by unrounded score ascending, actual valid count
descending, then normalized topic name. Full names and all qualifying rows
remain accessible through bounded pages; the alphabetical first five
low-evidence topics retain their separate list and exact additional count.
The compatibility count for omitted qualifying topics is zero. Each row carries all sixteen nonnegative
integer rating-by-difficulty cells: their total equals valid ratings, Good/Easy
equals its raw numerator, and raw Review Success is Good/Easy divided by valid
ratings. Original raw rates, counts, and unrounded below-goal status remain in
rating details with the saved Review Success editor. Weighted scores have no
percentage goal. Topic counts overlap when reviews have several direct topics;
they are not additive contributions to the overall score. Current direct
assignments apply to retained history without ancestor rollups.

Overdue backlog uses its independent Last 30 days daily frame and connects
known snapshots with straight lines and small measured dots. Unknown days break
the line; zero and isolated observations remain visible. Lines and markers are
green strictly below five and amber at or above five, including flat five. Pointer, tap and
keyboard inspection share the same date/count/status; a connector crossing five
is not an additional observation. The current value is the last supplied day's
count; an unknown last day stays unavailable without carrying an earlier count.
Known peak and below-five/at-or-above-five day totals exclude unknown days, and
the two threshold totals sum to known days. Upcoming reviews retains its fixed
Next 14 days schedule snapshot, Today plus thirteen local dates, with separate
exact Due and Overdue segment counts. It does not simulate future reviews or
rescheduling. Only Today includes cards due before today's local date; an earlier
time today remains Due. Labels sit inside
when they fit, with readable outside fallbacks for tiny segments. Zero segments
stay zero-height and receive no label; Table and inspection retain their zeros.

Historical readiness does not hide useful analytics. Performance, Time vs target,
Recall, Practice, Memory strength, and Overdue backlog keep showing available points when a historical selected range is unready; a
one-point series says that it is not enough for a trend yet. Retention map,
Memory signals, and the fixed Next 14 days Upcoming reviews remain
available as current or forecast views. Retention Map shows every eligible active,
non-suspended reviewed problem, with no 30-question cutoff, at its exact current FSRS
retrievability and total modeled durability. Durability is the interval from
the latest review until recall crosses the scheduling target, not remaining
time or time until due. The FSRS target is independent of personal chart goals.
All/Below target filters preserve full-cohort counts and fitted domains. Three
status keys pair color with circles, diamonds and triangles. Hover, tap and a
native keyboard inspector expose the same original questions; a nearby-memory
chooser preserves access to coincident points. Pinned details replace the plot
with a canonical LeetCode link, exact supplied values and dates in a fitting
selection surface within the fixed card. Paged exact values retain all eleven
original problem fields and every filtered question.
Drag a rectangle to magnify that region; double-click or Reset view restores
the full landscape while preserving pinned details. Wheel/pinch zoom,
Shift-drag/touch pan and plus/minus controls remain available. Magnification
updates true log-duration and linear-recall axes while marks keep their screen
size. Keyboard inspection reveals offscreen questions. Zoom and filter state
are presentation-only; they never change FSRS cards, scheduling or Settings.
Memory signals is a compact ranked list with canonical LeetCode problem links
and wrapping reasons directly beneath each title, using fitting bounded pages. Its
Scope retains current report as-of, timezone, and fallback context independently
of historical selection. Equivalent current reports preserve the page. Reasons identify estimated recall below the FSRS retention target,
calendar-date overdue reviews, or low total target-crossing durability. Its FSRS
target is separate from the personal Recall goal; durability is not time until
due. Severity, every returned flag in original order, and the returned-top-25
versus total-qualifying distinction remain intact.

Observed correctness is the persisted share of eligible assessments marked
correct. It is not FSRS-predicted recall, retention, or a record of first-try
performance: the current review history does not identify retries or hints.
Predicted recall and current retrievability are FSRS estimates, not guaranteed
outcomes. The memory profile is based on tracked local FSRS cards and includes
due today, overdue, learning, review, average retrievability, and low-sample
messaging when local data is sparse. Live Analytics due state and the current
day of Upcoming Review Load use the same selected-timezone calendar boundary as
the practice read model: an earlier time today remains due today, while a prior
local date is overdue.

### Sync

GitHub Gist sync is optional, BYOK, and pseudo-real-time rather than live
collaborative editing. A user stores a GitHub token locally, creates or connects
a private CogniPace Gist, and can use explicit manual directional actions to
move data. Pull latest updates this browser from the connected Gist. Push local
updates the connected Gist from this browser.

Settings presents sync as a connection summary instead of an always-open token
form. Not-connected users open a Connect GitHub Sync dialog to add a masked
GitHub token and connect or create a private Gist. Connected users stay
connected when auto-sync is paused; the Manage connection dialog supports stored
token validation, token replacement, token deletion, and Gist connection
changes.

When entering or replacing a token, the dialog links to GitHub's fine-grained
token form with a local-date CogniPace name, no expiration, and only Gists
write access prefilled. Gists write includes the read access needed for pull
actions.

Local writes always save locally first, mark data as needing push, and schedule a
safe background push through Chrome alarms. Opening popup, dashboard, or overlay
surfaces performs a safe remote check and clean-pulls changed Gist data only
when local data has no unpushed changes.

Automatic sync never force-overwrites local data or the Gist. Dirty local data
blocks automatic pull, changed remote data blocks automatic push, and manual
force pull or force push remains the recovery path after confirmation. Manual
action feedback is shown in dialogs so the direction and result of the operation
stay clear. Retryable sync failures do not roll back local saves.

Settings is the setup and recovery surface; once sync is configured, the
dashboard header also provides compact shortcuts for quick pull and push actions
with the same force-pull and force-push confirmation rules. Pausing auto-sync
only stops automatic open-check and mutation-triggered sync behavior; manual
pull and push actions continue to work from Settings and the dashboard header.

GitHub tokens are stored in trusted `chrome.storage.local` extension storage and
are only read by the background service worker. Tokens are not included in
backup exports, sync envelopes, logs, or UI status payloads.

### LeetCode Capture

LeetCode capture reads page metadata, page content, and submission result
information from the content script and passes validated data through runtime
messaging. Captured page topics are treated as additional problem metadata and
merge with existing Library topics instead of replacing them.

## Non-Goals

- account creation
- authentication
- hosted CogniPace cloud sync service
- hosted backend services
- multi-user or team workflows
- generic SaaS dashboard expansion
- mobile app support
- broad browser support beyond the current Chrome MV3 target

## Future Candidates

These are possible future directions, not approved work by default:

- overview home polish
- richer analytics
- improved notification strategy beyond the current local due-review reminder
- passphrase lock for local BYOK secrets
- enterprise KMS-backed secret wrapping
- richer sync conflict previews and selective merge policies

## Success Criteria

The current product stage is successful when a user can:

- open the popup and identify a useful review target
- identify the next problem in the active track
- open a LeetCode problem page and log a review from the overlay
- inspect and maintain Library problems
- manage tracks and active progression
- adjust settings
- export, restore, and clear local data from Settings
- optionally keep extension installs aligned through GitHub Gist sync
- keep all persisted state local unless explicitly using the optional Gist sync

## Canonicality

This document owns current product behavior and scope. Technical structure lives
in `docs/architecture.md`. Manual verification lives in `docs/testing.md`. Visual
and interaction guidance lives in `design.md`. Superpowers specs and plans are
planning artifacts unless a current doc explicitly says otherwise.
