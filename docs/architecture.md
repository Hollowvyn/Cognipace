# Architecture

## System Shape

CogniPace is a local-first WXT Chrome MV3 extension. It has four runtime
surfaces:

- Popup: compact command surface for review-now and study-next guidance.
- Dashboard: larger inspection and management surface for Library, Tracks,
  Settings, Overview, and Analytics routes.
- LeetCode content-script overlay: in-page practice session UI and LeetCode page
  capture bridge.
- Background service worker: trusted runtime boundary for database access,
  sender authorization, service calls, snapshot persistence, and cache
  invalidation.

The intended dependency direction is:

```text
entrypoints -> app -> features -> platform/lib/components
```

Entrypoints boot surfaces. The app layer composes screens, routing, providers,
and surface shells. Features own product behavior. Platform and lib modules own
shared infrastructure and product integrations. Shared UI components stay
generic.

## Source Layout

- `src/entrypoints`: WXT boot files for `background.ts`,
  `leetcode.content.tsx`, `popup`, and `dashboard`.
- `src/app`: surface composition, dashboard routing, popup shell, overlay app,
  providers, and app-level styles.
- `src/components`: shared UI primitives only, currently under
  `src/components/ui`.
- `src/extension`: extension runtime messaging plus background service-worker
  policy and handler registration.
- `src/features`: product-owned feature modules.
- `src/hooks`: shared React hooks that are not owned by one feature.
- `src/lib`: product integrations such as FSRS, GitHub, and LeetCode readers.
- `src/platform`: browser, database, HTTP, query, secrets, and time
  infrastructure.
- `src/styles`: shared styling support.
- `src/testing`: shared fixtures, setup, helpers, and boundary tests.
- `src/types`: shared TypeScript types.
- `src/utils`: small generic utilities.

Keep new code inside the owning feature or infrastructure folder. Avoid adding a
new cross-cutting layer unless it removes proven duplication.

## Runtime Surfaces

### Entrypoints

Entrypoints in `src/entrypoints` are thin boot files:

- `src/entrypoints/background.ts` registers background handlers.
- `src/entrypoints/popup/main.tsx` mounts the popup React app.
- `src/entrypoints/dashboard/main.tsx` mounts the dashboard React app.
- `src/entrypoints/leetcode.content.tsx` mounts the LeetCode overlay content
  script.

Entrypoints should not own product logic. They connect WXT to the app layer.

### App Layer

The app layer owns surface composition:

- `src/app/providers`: Query Client, cache invalidation listener, and shared
  React providers.
- `src/app/popup`: popup app shell and popup-specific components.
- `src/app/dashboard`: TanStack Router routes, navigation, route modals, and
  dashboard pages.
- `src/app/overlay`: LeetCode overlay app composition.

App code may coordinate features, but domain rules and persistence belong in the
owning feature or platform module.

### Features

Features own product capabilities. A typical feature folder can contain:

- `api`: runtime contracts, serializers, and surface-facing API hooks.
- `components`: feature-owned React components.
- `data`: repositories and persistence adapters for that feature.
- `domain`: pure domain models, rules, reducers, and calculations.
- `hooks`: feature-owned React hooks.
- `server`: background-service-worker service functions.

Not every feature needs every folder. Add only the folder needed for the change.

## Feature Ownership

- `app-shell`: popup, dashboard, and overlay shell data composition.
- `analytics`: local dashboard analytics read models: evidence-gated
  historical charts, current retention health, fragile knowledge, future load,
  and explainable readiness. It owns chart presentation contracts but not
  practice persistence or FSRS scheduling.
- `overlay-session`: LeetCode overlay UI state, timer, page sync,
  submission automation, and review action orchestration.
- `practice`: FSRS-backed practice state, review logs, scheduling details,
  suspension, resets, and historical log preservation.
- `problems`: problem identity, catalog rows, Library behavior, edit data,
  companies, standardized topics, topic alias resolution, topic parent rollups,
  difficulty, premium status, and page upserts.
- `imports`: content-file contracts, normalization and planning, preview/apply
  workflow, and import diagnostics. It delegates catalog writes to Problems and
  curriculum writes to Tracks.
- `queue`: review recommendation composition for today.
- `tracks`: curriculum tracks, groups, ordered memberships, active track and
  group state, progress, and dashboard track management.
- `settings`: persisted preferences, defaults, validation, and settings form
  behavior.
- `sync`: GitHub Gist configuration, sync metadata, directional pull/push
  rules, Settings/header sync UI, and background orchestration.
- `genai`: AI provider settings contracts, trusted provider key storage,
  connection testing, and background-owned BYOK calls through `src/lib/ai`.
- `dev-smoke`: hidden dashboard-only extension development smoke checks for
  background health, Analytics, queue, notifications, GenAI config, and opt-in
  live GenAI provider validation.
- `assessment`: deterministic solve-time and recall-rating domain rules.
- `leetcode-review-assistant`: session-only code analysis schemas, rubric,
  prompt, consistency checks, and background service.
- `leetcode-capture`: LeetCode metadata, content, and submission result reads
  through the content-script/background bridge.

When behavior crosses features, keep writes behind the owning feature's server
service or repository and return serialized data through the runtime boundary.

## FSRS Scheduling And Queue Semantics

The `src/lib/fsrs` module is the only production boundary that imports
`ts-fsrs`. It translates the app's ratings, cards, and review logs into the
library's types, delegates scheduling and retrievability calculations, and
maps the returned card back to the persisted snapshot. Features must not
recalculate stability, difficulty, intervals, or due dates.

The facade also provides validated immutable scheduler profiles and captured
review-context calculations. Profiles record the effective weights, retention,
maximum interval, scheduler mode, step arrays and supported library/model
versions. Their canonical representation reconstructs exactly; imports that
would change during native normalization reject. Correction calculations use
the recorded pre-review card, event time and profile. The legacy compatibility
operation requires an unambiguous complete history and labels its inferred
evidence explicitly. Practice's existing Save/Update wiring remains the current
consumer path; persisted evidence and guarded command integration have separate
implementation phases.

The persisted `ts-fsrs` `card.due` value is stored as `FsrsCardSnapshot.dueAt`
and is the sole authority for a reviewed card's schedule. Read models derive
overdue and due-today state from that date using the browser's local calendar;
retrievability remains an independent estimate used for presentation and
future-card reinforcement ranking. Target retention is a scheduling input on
review writes only. Updating it does not rewrite existing cards or reschedule
their persisted due dates.

The queue feature owns a deterministic, daily-goal-capped waterfall:

1. overdue FSRS cards, oldest `dueAt` first;
2. FSRS cards due on the local calendar date, earliest `dueAt` first;
3. future-scheduled reviewed cards, lowest current retrievability first, as
   optional reinforcement; and
4. eligible new Library problems.

Queue code does not import `ts-fsrs` or own an alternate due threshold. The
Review Order setting is no longer user-facing and is ignored by queue logic;
its persisted value remains only as a temporary schema-v1 compatibility field.

## Runtime Messaging

Runtime messaging is the extension boundary between UI surfaces and trusted
background work.

- Feature API contracts live in `src/features/*/api/*-contracts.ts`.
- Shared protocol types and message helpers live in `src/extension/messaging.ts`.
- Sender and method authorization lives in
  `src/extension/background/runtime-policy.ts`.
- Background handler registration lives in
  `src/extension/background/register-handlers.ts`.
- Feature service functions live in `src/features/*/server`.
- Feature repositories and persistence adapters live in `src/features/*/data`.
- The hidden dashboard smoke route at `/dev/smoke` calls dashboard-only
  `devSmoke.run` for local extension development checks; it is not part of
  primary dashboard navigation.

The normal request path is:

```text
UI hook or surface action
-> feature API method / sendMessage
-> src/extension/messaging.ts protocol method
-> registerBackgroundHandlers()
-> Zod request parse
-> sender authorization in runtime-policy.ts
-> feature server service
-> feature data repository if persistence is needed
-> Zod response parse or serializer
-> UI cache update through TanStack Query
```

### Runtime Boundary Rules

- Validate every request and response that crosses the extension boundary with
  Zod schemas from feature API contracts or `src/extension/messaging.ts`.
- Add every callable method to `src/extension/messaging.ts` and authorize its
  allowed surfaces in `src/extension/background/runtime-policy.ts`.
- Do not trust claimed `surface` values until
  `assertCanSenderCallExtensionMethod` has compared the request to the actual
  Chrome sender.
- Serialize `Date` values as ISO strings in runtime contracts. Convert them back
  to `Date` objects inside background services or domain code.
- After database writes, flush the database snapshot before broadcasting cache
  invalidation.
- Broadcast invalidation tags for every query family affected by a write.

### Content Import

The `imports` feature owns the v1 content format and shared import workflow in
Settings and the Tracks import modal; the
complete public contract is in [docs/import-format.md](import-format.md). It
uses the existing database schema and owner repositories: Problems persists
questions, companies, topics, and their direct question associations; Tracks
persists tracks, groups, and ordered question memberships. Content import adds
to those existing records and does not change the full-backup format or require
a schema migration.

The dashboard route `/tracks/import` composes the existing import panel with a
track-focused template and file chooser. It uses the same preview/apply/retry
controller and accepts the existing v1 content contract, including accompanying
question metadata. Close, Escape, and backdrop dismissal are disabled during
apply and while a committed import still needs its browser-storage save retried.
The Tracks feature remains responsible for activation; importing does not
activate a track.

The All tracks collection's inline card preview belongs to Tracks. It mounts
the existing useTrackForEdit query only when opened and renders each group's
explicit problem order against the returned Library metadata. It shares the
existing track query cache and invalidation path, performs no writes, and
does not change track/group selection. Its collapsible group sections reuse
the editor's visual hierarchy without rendering editing controls.

The dashboard-only runtime methods are `imports.preview`, `imports.apply`, and
`imports.retryPersistence`. Their request and response payloads use Zod
contracts, and sender authorization checks the actual dashboard sender. All
three methods run through the shared background mutation queue. Apply rebuilds
the plan against current local state in that queue and compares its fingerprint
with the preview. If relevant content changed, it returns a fresh stale preview
without writing; the user must review and explicitly apply that preview.

An accepted apply inserts the catalog and curriculum changes in one database
transaction. After commit, the background marks local sync data dirty and flushes
the database snapshot. A successful flush is followed by `problems`, `tracks`,
and `analytics` invalidation broadcasts and automatic-push scheduling when Gist
sync is configured. A snapshot failure does not undo the already committed
transaction: the UI reports that content was added but could not be saved to
browser storage, and the handler retains a pending-persistence state. Retrying
flushes that committed state without applying the database changes again. Once
the retry succeeds, the handler clears the pending state, broadcasts
invalidations, and schedules sync. If no pending snapshot exists, retry asks the
UI to preview again.

Topic labels are resolved by exact normalized lookup against stored canonical
labels, IDs, and aliases. Unknown labels become standalone canonical topics;
content import does not create topic aliases or hierarchy relations. Stored
aliases are consulted during lookup; topic relation rows remain untouched.

## State And Data Flow

SQLite is the source of truth. TanStack Query is the UI server-state cache.
Local component state is for draft fields, filters, open dialogs, and transient
surface state.

The mutation flow is:

```text
user action
-> runtime command
-> DB write
-> sync metadata dirty mark for local mutations
-> snapshot flush
-> invalidation broadcast
-> safe automatic push scheduling when Gist sync is configured
-> query refetch
-> render
```

Background mutations are serialized through the mutation queue in
`src/extension/background/register-handlers.ts`. The app DB comes from
`src/platform/db/instance.ts`, which restores a matching stored snapshot or
creates a fresh migrated and seeded database.

### Analytics Read Models And Chart Story

Analytics calculations remain feature-owned and read-only. The only editable
Analytics behavior is the chart-goal preferences owned by Settings.
Difficulty And Recorded Time is implemented on this branch with passing automated
checks and production-component browser validation.
The chart-target and merged Practice Rhythm implementations and automated/fixture
validation are recorded in their handoffs; human installed-extension happy-path
and edge-case smoke with screenshot or recording proof remains pending before
review or merge. The background Analytics
service reads the full review history once for a request, together with the
current FSRS cards and supporting local state; chart components do not make
per-chart database calls. Its data flow is:

```text
review and FSRS inputs
-> analytics range policy
-> effective evidence window and readiness
-> metric-specific presentation buckets
-> Zod runtime contract
-> explicit chart components
```

The owners in that flow are:

- `src/features/analytics/domain/analytics-range-policy.ts` selects and builds
  local-date bucket boundaries. The current contract supports 14-day daily,
  30-day three-day, and 90-day weekly presentation buckets.
- `src/features/analytics/domain/analytics-readiness.ts` derives the effective
  window and readiness gates. `S`, `A`, `G`, `K`, and `E` mean eligible
  assessments, active buckets, longest gap, gap runs, and effective buckets.
- `src/features/analytics/data/analytics-repository.ts` reads current catalog
  `problemDifficulty` and persisted `elapsedSeconds`, preserving attempt-ID
  deduplication across topic joins. Numeric FSRS difficulty remains separate.
- `src/features/analytics/domain/review-cohorts.ts` selects earliest raw events
  per problem and complementary later records across cards/modes before
  validity, report-period, timing, or difficulty filters. An invalid first event
  is never promoted. Its separate per-card valid-rating replay constructs
  repeat-only FSRS pairs; replay index zero never enters Recall. Both legacy
  and historical Recall builders/readiness consume those same pairs.
  `historical-presentation.ts` supplies both raw problem-solving cohorts with
  bucket and period/prior outcome counts, positive-time distributions, Unknown
  accounting, current targets, and fitted scales. Period rates use summed
  numerators/denominators; time uses existing quantiles with four-observation
  quartile support. Future events are excluded at as-of. Current catalog
  difficulty and time allowances are not attempt-time policy snapshots.
  Problem Solving supplies the canonical first-attempt counts; independent
  first-attempt readiness sums valid counts across all four difficulty groups.
- `src/features/analytics/domain/chart-buckets.ts` and
  `src/features/analytics/domain/chart-data.ts` aggregate each metric only from
  eligible evidence, preserve unknown buckets as `null`, and classify solid or
  dashed next-valid-point line continuity. Practice Rhythm retains zero-volume
  buckets after its first supported bucket.
- `src/features/analytics/api/analytics-contracts.ts` validates the serialized
  read model with Zod before it crosses the extension runtime boundary.
- Settings owns defaulted `analytics.targetRecall` and
  `analytics.targetReviewSuccess` fractions in its existing JSON preferences,
  both 0.9 by default. Full-pair validation requires finite values from 0
  through 1 and Success greater than or equal to Recall; this is a goal rule,
  never a rule for measured chart rates. Missing older fields use defaults;
  malformed stored analytics falls back only to analytics defaults. Explicit
  deep merge and validated patches preserve unrelated preferences and save
  the pair atomically. Analytics' target mutation reuses `useUpdateSettings`,
  `settings.updateSettings`, the Settings repository, and existing query
  invalidation. Each graph sends only its edited target property; the Settings
  transaction merges against the latest stored counterpart before validating
  the pair. UI validates against current props without discarding an active
  draft when the counterpart refreshes. Successful saved results update cached
  chart goals, Recall's fitted percentage scale, and the compatible legacy
  Practice percentage scale; failed saves leave those caches unchanged. The
  merged Practice composition uses a fixed `[0, 1]` presentation scale, so goal
  edits cannot alter its rating geometry or supplied count scale. No new runtime
  method, table, migration, Chrome permission, or Settings page section is
  needed. Settings Save preserves the pair; Reset Defaults restores 0.9/0.9.
  The user explicitly approved inclusion in existing backup export/restore and
  configured Gist settings payloads, without a new sync mechanism.
- Settings also owns `analytics.targetFirstAttemptSuccess` and
  `analytics.targetFirstAttemptGoodEasy`, each defaulting to 0.9 on a whole-percent
  fraction grid. They are independent of each other and of the existing pair.
  Missing fields default independently, malformed local new fields recover
  independently, and strict imports reject malformed supplied values. The
  existing partial mutation updates references and fitted outcome scales in
  both problem-solving cohorts across cached ranges without changing measured
  rows, totals, timing distributions, or readiness. Reset Defaults restores all
  four targets. The Zod problem-solving view validates outcome identities,
  difficulty-total conservation, timing eligibility/coverage, and quartile
  support before runtime transport. The existing service passes saved
  `settings.assessment.timeTargetsMinutes` using its existing settings read;
  there is no new query, endpoint, persistence, or timing write.
- Historical view components own their chart descriptions and semantic series.
  `LineSegments` in
  `src/features/analytics/components/charts/line-segments.tsx` renders measured
  runs and dashed next-valid-point bridges without interpolating data.
- `new-problem-success-view.tsx` owns the expanded Difficulty And Recorded Time
  section's shared local cohort, Trend/Compare, outcome measure, difficulty
  visibility, time units/subset, and Mix controls. `analytics-screen.tsx` places
  its paired Success/Time plots and full-width Mix below the combined New Problem
  Success/Recall pair. `combined-problem-outcomes-view.tsx` pools the canonical
  new-problem counts across Easy/Medium/Hard/Unknown for its two simultaneous
  curves; it neither averages difficulty rates nor rebuilds raw cohorts. Its
  fitted domain uses both pooled rates and both first-attempt goals, independently
  of the known-difficulty plot scale and controls. No duplicate runtime view is
  needed. Practice remains full width, followed by the Memory/Topic pair,
  Retention Map, Memory Signals, and workload pair.
  The view transforms supplied values for presentation; it does not rebuild raw
  cohorts. New problems selects first-attempt goals; Follow-up practice selects
  Recall/Review Success aspirations while naming its different raw population.
  Only the selected measure's existing Settings-owned editor/reference is shown.
  Shared Easy/Medium/Hard identities are mint circles, blue diamonds, and amber
  triangles. Hidden difficulties leave both plots and inspection, while Mix
  retains all raw assessments/positive-time sums, including neutral Unknown.
  Compare uses supplied full-period rates, time medians/quartiles, exact current/
  prior denominators, and Sparse comparison when either valid n is below ten.
  Time transforms seconds to minutes or percent of current allowances; quartile
  whiskers require four timed records and one visible difficulty in Trend.
- Shared `historical-chart.tsx`, `LineSegments`, date/report helpers, ChartTable,
  and seven-row `historical-table.tsx` retain immutable supplied rows, calendar
  midpoints, sparse ticks, exact Table values, and native keyboard/touch
  inspection. Long-dash bridges connect measured neighbors across unavailable
  intervals without creating observations. The paired problem-solving Trend
  window is one contiguous slice supported by any known-difficulty raw activity,
  preserving internal gaps independently of visibility, measure, or time subset.
  `trimHistoricalEmptyEdges` retains Recall when either rate is known, including
  zero; Memory requires a finite median, including zero/subday values, rather
  than quartile support. Recall enables `startAtFirstPoint`: multiple intervals
  begin at the first midpoint with 12px left clearance and retain the last
  interval's end; a singleton keeps its original domain and centered point.
  Series visibility cannot shift dates or supplied fits. Memory retains its
  fitted duration scale; Recall's percentage fit includes its saved goal at
  zero or one. Practice's fixed percentage axis preserves its independent count
  scale. Feature components and native editors own semantics and preferences;
  drawing primitives do not persist data. Scoped styles remain in
  `src/styles/analytics.css`. Goal edits never change observations, timing,
  FSRS scheduling, or Retention Map values.
- `src/features/analytics/components/practice-ratings-model.ts` is the pure
  presentation join for unchanged `views.practiceRhythm` and `views.ratingsMix`.
  It keys rows by ID plus exact `bucketStart`/`bucketEnd`, sorts their interval
  union, and retains original source objects. An absent counterpart is
  unavailable; known completed-review zero remains zero. The contiguous retained
  window starts/ends with positive completed reviews, positive valid-rating
  counts in either view, or finite supplied Practice success including zero.
  Internal gaps remain; selected-period totals, comparison, readiness, report
  metadata, and serialized scales are untouched. No runtime contract, schema,
  persistence, scheduling, permissions, or sync change is needed.
  `practice-ratings-view.tsx` renders exact supplied Easy/Good/Hard/Again shares
  bottom to top on the fixed percentage axis. The Good + Easy boundary expresses
  Review Success without a duplicate success curve. Supplied completed reviews
  use a thin straight neutral line and measured markers on `view.countScale`,
  independently of valid-rating counts. Missing composition is hatched, while a
  known zero category remains zero-height. Shared inspection/Table rows retain
  completed counts, precise rating counts/shares, Good + Easy numerator and
  valid-rating denominator, supplied success, target, each metric's evidence,
  full interval, partial state, timezone, and report time. The native Reviews
  switch hides the line, markers, right axis, and tooltip count together, without
  changing dates, rows, target, or Table values. The selected-period challenging
  summary and evidence-gated prior comparison remain below the view. The chart
  explains association only: count-line crossings with a percentage target
  carry no percentage meaning.
- Topic Performance retains all qualifying domain rows in its Zod-validated
  view, preserving success/count/name ordering and bounded low-evidence details.
  Its omitted-qualifying compatibility count is zero. The screen supplies the
  existing Practice `targetReviewSuccess` and Settings-owned editor; no new
  preference or message is introduced. Categorical columns have a fixed
  percentage scale, bounded scrolling and synchronized full-topic inspection.
- Memory Signals render supplied ranks, canonical titles and typed reasons as
  compact inline rows. Reason wording is produced by the owning domain, not
  parsed by the view. The panel opts into natural body height and a 36rem cap;
  other panels retain their body-height default.
- Workload views preserve their domain contracts. Backlog draws exact known
  daily dots and straight threshold-aware connectors, with null dates breaking
  runs. Upcoming labels original positive stack components without minimum bar
  heights or duplicate totals. Workload inspection uses supplied dates/counts
  and the report context for pointer, tap and keyboard. The reconstructed
  backlog timestamp rule remains distinct from Upcoming's local-date overdue
  classification.
- Retention Map returns every eligible current-state row. Its Zod contract keeps
  positive ranks and valid estimates without the former 30-row/rank limit;
  Memory Signals keeps its separate 25-row limit. Full-cohort scales/counts and
  eligibility remain domain-owned. `current-state-views.tsx` composes the
  All/Below target filter and the same filtered Chart/Table rows.
  `retention-map-chart.tsx` owns a local controlled viewport and native
  inspection/gesture state; `retention-map-model.ts` keeps presentation math and
  shared labels feature-local. Public Recharts plot, forward and inverse scales
  support exact log/linear coordinates. Both axes use `allowDataOverflow` so
  zoom does not expand to include offscreen rows. Filtering keeps the full
  fitted domain; zoom never recomputes memory estimates. Fixed-size status marks
  retain true positions, overlapping points have a member chooser, and keyboard
  inspection can reveal offscreen rows. No new persistence, message, dependency,
  permission, migration or generic chart-interaction framework is introduced.
- `src/lib/leetcode/domain/problem-url.ts` owns canonical problem URLs; the
  retention details and fragile-knowledge rows use `createLeetCodeProblemUrl`
  rather than constructing links in chart components.

The Analytics service applies the range policy, calculates readiness separately
for each metric's eligibility rules, and builds its Zod-validated summary.
Legacy summary series may trim unsupported leading history. Historical trend
views trim unsupported edges at the component presentation boundary,
preserving the service response, selected-period totals, readiness, supplied
scales, report time, and internal gaps. Historical readiness is exposed as
confidence context; it does not suppress available Difficulty And Recorded Time, Recall Quality, Practice
Rhythm, Memory Strength, or Recent Overdue Backlog points. Current Retention
Health, Fragile Knowledge, and the fixed 14-day Upcoming Review Load do not
depend on the historical range being ready.

Readiness diagnostics are a read-only view of that same production
calculation—not a second implementation. They include `S/A/G/K/E`, selected
bucket boundaries, gate thresholds, and which evidence each metric accepted or
rejected. Treat the diagnostics as an explanation of the serialized chart data;
do not use them to recalculate a competing result in the UI. Queue summaries
expose `dueToday`, `newAvailable`, `queueLoad`, and `recommendationReason`
aliases while preserving legacy queue fields for existing consumers.

Due-review notifications are local background work. The extension declares the
Chrome `notifications` permission so `src/extension/background/due-notification.ts`
can create one due-review reminder per day when enabled. Notification scheduling
uses Chrome alarms, local dedup state, and the queue summary `dueToday`
semantics; React components must not call `chrome.notifications` directly.

Automatic Gist sync is orchestrated in the background layer. After a local
mutation commits, sync metadata is marked dirty, the database snapshot is
flushed, normal invalidation is broadcast, and an alarm-backed auto-push is
scheduled when Gist sync is configured. Alarm jobs run through the same mutation
queue as manual sync work, so remote restores and local writes stay serialized.

Opening popup, dashboard, or overlay surfaces calls the safe
`sync.checkRemoteOnOpen` runtime path. That path clean-pulls changed remote Gist
data only when local metadata is not dirty; dirty local data skips the remote
fetch. Manual `sync.pullLatest` and `sync.pushLocal` runtime methods remain
dashboard-only. Pull requests default `confirmLocalOverwrite` to `false` and
push requests default `confirmRemoteOverwrite` to `false`; the sync service
enforces both defaults so force pull and force push only happen after a UI
confirmation dialog. The `enabled` flag controls automatic sync only; manual
directional actions remain available whenever token and Gist configuration are
present.

## External APIs And Secrets

REST and GraphQL calls use request declarations over `src/platform/http`.
These integrations should define typed request functions in the owning
`src/lib/<integration>/api` module and inject `fetch` in tests. Feature services
or readers call those declarations instead of constructing ad hoc `fetch` calls.
SDK-backed AI transport instead stays inside `src/lib/ai`, which supplies a
controlled fetch wrapper to the official adapters and tests native wire responses.

Current integrations:

- `src/lib/github/api`: GitHub Gist REST requests for sync.
- `src/lib/leetcode/api`: LeetCode GraphQL and submission REST requests used by
  LeetCode capture readers.
- `src/lib/ai`: reusable structured generation through Vercel AI SDK, official
  OpenAI/Anthropic/Google adapters, and OpenRouter's dedicated
  `@openrouter/ai-sdk-provider`. The library accepts explicit credentials,
  model, prompt, and Zod schema; GenAI owns configuration and trusted key
  loading. SDK/provider imports are confined to this library. OpenRouter uses
  the fixed `https://openrouter.ai/api/v1` endpoint, strict structured outputs,
  and `provider.require_parameters: true`; there is no editable transport URL.

BYOK secrets use `src/platform/secrets`, backed by `chrome.storage.local` with
trusted-context access. UI surfaces may save or delete secrets through runtime
messages, but secret reads stay in the background service worker. Secret values
must not be exported in backups, serialized in sync envelopes, logged, or stored
in TanStack Query cache payloads or mutation variables. Stored-token validation also runs through a
dashboard-authorized runtime method so the UI can test the saved token without
receiving or echoing the secret value.

GenAI provider keys use `src/platform/secrets` with IDs `genai:openai`,
`genai:anthropic`, `genai:google`, and `genai:openrouter`. UI/runtime status
exposes exactly four key-presence booleans. Raw keys stay out of the app
database, backups, sync envelopes, logs, query caches, mutation variables, and
returned runtime data. Approved AI host permissions are exactly:

- `https://api.openai.com/*`
- `https://api.anthropic.com/*`
- `https://generativelanguage.googleapis.com/*`
- `https://openrouter.ai/*`

Provider calls run in trusted background code after configuration and key
checks. Explicit model objects use controlled fetch with redirects rejected,
SDK retries disabled, bounded output, and telemetry disabled. Strict SDK/Zod
and report-consistency validation remain required. OpenRouter requests specify
only the selected model, without paid fallback IDs or privacy overrides;
OpenRouter can perform internal routing within CogniPace's single request.

Metadata keeps requested `model` as configuration identity and optionally adds
bounded `resolvedModel` for a successful OpenRouter response that identifies a
served model. Missing, blank, oversized, equal-to-request, or router-alias values
are omitted. Runtime identity checks continue using requested provider/model
and trusted key revision. Reports remain session-only; evaluation artifacts
preserve metadata without expanding app persistence or sync.

Controlled errors use actual HTTP status and allowlisted machine metadata.
OpenRouter's HTTP-200 errors can contain embedded numeric error codes and the
adapter may expose wrapped or flattened data. Billing (402) is distinct from
request quotas (429). Unknown 503 stays a network failure; model-unavailable
guidance can mention required capabilities and privacy/routing settings without
claiming a diagnosed cause. Raw SDK messages, bodies, and metadata.raw never
cross the runtime boundary. The complete deadline includes preparation,
headers, body reading, and validation.

Dashboard-only `genai.testConnection` accepts the saved provider and model
identity. It loads credentials in the background, makes a fixed small
structured request, and rejects stale configuration or credential results.
Its 20-second deadline includes database and secret preparation; the client
has a separate 25-second deadline for a missing worker response. Secret
operations await retryable trusted-storage readiness without waiting for the
database. Background runtime listeners register synchronously during startup.

Settings owns a separate AI connection draft and serializes its writes with
ordinary preference saves and Reset Defaults. Its Active provider summary reads
saved configuration independently of the editor. Save & make active persists
the provider/model and any entered key; Make active reuses another provider's
saved key. Neither action calls the provider. The separate Test connection
action calls the existing saved-configuration endpoint without writing settings
or secrets. Unchanged saving and testing unsaved edits are disabled. Only one
provider/model pair is active, while provider keys remain stored independently.
AI configuration writes and secret changes broadcast GenAI invalidation; a
volatile query-cache revision
invalidates connection results even when key-presence booleans stay the same.
Pending presence/availability reads are cancelled before refetch; combined
Settings/GenAI events also cancel the initial Settings read so it cannot restore
an obsolete provider or model. The existing application cache listener owns these events. Secret writes do
not dirty database sync state. Development smoke may also call the configured
provider, and smoke output redacts provider error details that could contain a
secret.

### LeetCode code analysis

Ownership follows the existing feature direction. `src/lib/ai` owns reusable
structured SDK transport and the direct official provider adapters. GenAI owns
saved configuration, availability, trusted credentials, and connection testing.
`leetcode-review-assistant` owns the versioned report and request schemas,
rubric, prompt, consistency checks, and analysis service.
`leetcode-capture` and `src/lib/leetcode` own full matching submission and
problem content, including follow-ups and refreshable capture caches.
`overlay-session` owns the session controller and Option A presentation.
Deterministic assessment remains in `assessment`, and persistence/FSRS/progress
remain behind their existing owning services.

The content script sends strict Zod envelopes to
`genai.analyzeLeetCodeSubmission` and `genai.cancelLeetCodeAnalysis`.
`src/extension` authorizes generation against the sender's actual HTTPS
LeetCode problem URL and tracks cancellation by tab, frame, and request owner.
Cancellation also permits the owning same-host tab after SPA navigation so it
can stop obsolete work. Payload identities bind request, attempt, submission,
problem slug, and configuration revision. The background reloads the trusted
configuration snapshot before publishing; changed configuration cannot publish
a successful old report. UI cancellation and identity checks reject stale
responses after navigation, new attempts, restart, disable, clear, or key/model
changes.

Analysis requires complete essentials: code up to 32,000 characters and the
serialized problem context up to 24,000 characters. Optional diagnostics above
2,000 characters are omitted and named explicitly. Code and problem content are
never silently truncated. Preparation refreshes the immutable submission pin
and has a 15-second deadline; the retained pin survives unavailable reads for
Retry. A request has one SDK generation with an 8,192-token output budget and a
30-second background deadline including database/configuration/secret loading.
The controller bounds the complete client operation at 50 seconds. Retry makes
a fresh request identity for the same retained submission; repeated terminal
events and disclosure/collapse/dock actions do not generate another request.

The report uses independent /5 category scores and time/auxiliary-space
comparisons. Consistency validation rejects incompatible strategy/score,
language, and complexity claims without silently rewriting them or making a
second provider call. This establishes contract consistency, not compilation,
correctness, human rubric quality, or universal optimality. Suggested code is
rendered as text, labeled AI-generated and Untested, and is never executed or
submitted by the product.

Reports and in-flight operations stay in session/controller state, outside
TanStack Query query and mutation caches and the database. Report completion
causes no invalidation, sync, review write, or rating change. The retired
recommendation endpoint and save-time AI wait/recall override have no forwarding
aliases. Keys remain in trusted local secret storage and outside analysis
payloads, report/cache data, logs, exports, and sync. The existing authorized
key-save transport and provider authentication still carry keys where required.

Evaluation inputs live in the owning review-assistant testing folder, and the
test-only private environment configuration lives in GenAI testing. The opt-in
harness calls the real `analyzeCode` SDK path with six cases and stores only
report, provider metadata, criterion, and checked date in
`/private/tmp/cognipace-ai-evaluation`. Its environment option does not replace
or read the application's trusted secret store. Normal tests skip all six live
cases before reading any evaluation provider/model/key values.

### Manual adaptive hints

`overlay-session` owns transient hint history, disclosure and the in-flight
operation above visual modes. Solve Help explicitly requests one new hint at a
time, up to three successful hints per session. Folding/reopening, mode/tab
changes, review saves/updates and ordinary editor edits preserve history without
requesting generation. Restart, navigation, reload/remount, selected problem
input changes, saved connection changes/removal and local-data clear invalidate
history and reject late output. Assessment enable-only toggles preserve it.

`leetcode-capture` prepares complete matching problem context without requiring
a submission: canonical title, statement, `examples[].rawText`, constraints,
host and slug. Problem identity contains these inputs; diagnostics, topics,
official hints, follow-ups and authentication data remain excluded. Incomplete,
mismatched or oversized problem input is rejected without truncation. Serialized
problem JSON is limited to 24,000 characters, 50 examples and 100 constraints.

`src/lib/leetcode/editor` owns a read-only complete editor snapshot bridge.
A static MAIN-world content script reads the live solution Monaco model on each
explicit hint request. It identifies the editor attached to the solution root
and rejects missing or ambiguous models; virtualized visible lines and Monaco's
input textarea cannot establish completeness. Strict bounded page envelopes
bind request UUID, host and slug, validate source/origin/location, and clean up
on completion, abort and timeout. Page data remains untrusted and grants no
extension authority. Complete code is bounded to 32,000 characters per snapshot;
empty text is valid. Capture failure offers Retry, never problem-only fallback.
This adds no Chrome permission, provider host or extension API in the page world.

`leetcode-review-assistant` owns strict single-turn contracts and generation.
Each request carries the current `{ code, language, capturedAt }` snapshot and
at most two previous `{ snapshot, hint }` turns alongside problem and connection
revision/provider. One response contains `{ text, strength, progress }`. A hint
is trimmed, nonblank, at most 600 characters and rendered as inert text.
The first turn is light/initial. Identical code/language (normalizing only line
endings) forces stuck and escalates light to medium to heavy. Changed code lets
the model assess semantic progress: improved returns to light; cosmetic edits,
irrelevant changes and regressions strengthen guidance. Heavy remains heavy if
still stuck. Validation rejects inconsistent transitions and duplicate hints.
The prompt preserves valid strategies, targets the smallest remaining gap and
avoids complete implementations or invented defects. A model progress judgment
is not proof of correctness; live provider quality requires separate evaluation.

Every Get next hint and Retry captures fresh code and makes one new provider
request. A failure does not consume a slot; previous hints remain visible during
pending/error states. A completed hint remains bound to its request-time code,
even if the learner types while generation is pending. Editor changes do not
invalidate historical guidance. Problem/connection identity and request-owner
checks still reject obsolete output. History and snapshots remain session-only,
outside database, query/mutation caches, backup and sync.

GenAI exposes only `{ available, provider, revision }` to the content script;
`revision` is an opaque UUID, and availability uses the selected saved provider,
model, and key independently of automatic-assessment enablement. The private
key-bearing connection identity remains in background memory. Selected
provider/model/key changes rotate the revision; unselected provider keys and
enable-only changes do not. Per-database issued/committed read ordering and a
captured registry reset epoch prevent late configuration reads from overwriting
a newer observation or repopulating a reset registry.

Broad GenAI invalidation refetches public connection metadata; the history
survives when revision and selected problem inputs remain the same. Full local-data
reset/restore rotates the private in-memory registry before broadcast. The
single existing application cache listener recognizes the existing full
replacement signature and clears cached public hint metadata after cancelling
reads and before refetch, so a failed or hung read cannot retain ready hints.
Ordinary Settings/provider invalidation retains cached metadata while fetching.
Queries contain only public metadata; pointers use session memory and plain
runtime APIs, outside query/mutation caches and persistence.

`src/extension` validates strict Zod envelopes and binds generation to the
sender's actual supported HTTPS LeetCode host and problem slug. Hints and
automatic reports have separate tab/frame/request operation maps and owning
cancellation; the same-host owner may cancel after SPA navigation. Reports keep
their existing automatic cancellation rules, including assessment disable;
hints remain independent and survive enable-only toggles. Neither operation
can cancel the other's request.

Hint preparation has a 15-second deadline. The whole background operation,
including startup/database/configuration/key loading, generation, and the final
connection check, is bounded at 30 seconds. The complete client operation is
bounded at 50 seconds. A request makes at most one provider attempt with
`maxOutputTokens: 1024`. Public connection metadata has a 20-second whole
background deadline and a 25-second client deadline. Explicit Retry creates a
fresh request UUID; stale-configuration/not-configured recovery refreshes
metadata within that same client deadline. A missing connection offers Settings
without automatic generation.

Hint completion has no review, rating, correctness, solve-time, FSRS, Analytics,
backup, or sync effects. This adds no database shape, migration, Chrome
permission, provider host, authentication, backend, or persisted log format.

## Database And Persistence

Database files live under `src/platform/db`:

- `src/platform/db/schema`: Drizzle schema modules.
- `src/platform/db/migrations`: generated SQL migrations and metadata.
- `src/platform/db/migration-sql.ts`: bundled migration SQL used at runtime.
- `src/platform/db/seed.ts`: initial local catalog seed.
- `src/platform/db/instance.ts`: app DB opening, migration, snapshot restore,
  snapshot scheduling, and snapshot flushing.
- `src/platform/db/snapshot.ts`: Chrome storage snapshot serialization.

Schema change rules:

- Update the owning schema module in `src/platform/db/schema`.
- Generate a migration with `npm run db:generate`.
- Check migrations with `npm run db:check`.
- Update repositories, serializers, feature contracts, and tests that touch the
  changed shape.
- Keep database writes behind the owning feature repository or service.

Snapshot compatibility is deliberately bounded. The app opens a snapshot when
its fingerprint matches the current migration SQL. Only the exact through-0007,
through-0008, and through-0009 migration sequences allowlisted in
`src/platform/db/snapshot-upgrade.ts` are eligible for automatic upgrade; the
app validates the matching schema and runs only migrations after that supported
prefix. When both snapshot keys are
absent, the app treats the profile as a fresh install and creates and seeds a
new database. A partial pair, malformed value, or unknown or unsupported
fingerprint fails startup. Automatic downgrade is unsupported. On failure, the
original available snapshot values remain available for recovery; the app does
not clear them and silently seed a fresh database.

Before a supported upgrade replaces the active snapshot, the app retains the
original snapshot and fingerprint in the baseline's recovery slot:
`cognipace_db_recovery_topics_v1` for through-0007,
`cognipace_db_recovery_tracks_v1` for through-0008, or
`cognipace_db_recovery_fsrs_v1` for through-0009. Earlier copies survive later
upgrades. An existing recovery record is not overwritten by a different
original; an identical retry retains the first timestamp. Matching current
snapshots skip preparation and publication. A through-0009 source that
is already current skips historical taxonomy reconciliation during future
upgrades; fresh and older supported sources retain the existing mapping. These
recovery values are private local data. Never log or
share their contents in an issue; use the scoped local export procedure in
`docs/testing.md` if recovery is needed. Startup diagnostics must describe the
failure without printing snapshot bytes, topic values, tokens, or settings.

### Problem Topic Graph

The problems feature owns topic writes, canonical identity, aliases, typed
relations, and read models. The curated registry currently has 81 canonical
topics; `Heap` is a safe alias for `Heap (Priority Queue)`, not a second
canonical topic.

- `topics` is the durable topic registry. Rows include stable ids, display
  labels, and timestamps.
- `topic_aliases` resolves exact normalized labels to topic rows. Lookup applies
  Unicode NFC normalization, whitespace folding, dash normalization, and
  case-insensitive matching; it does not use fuzzy matching. New unknown labels
  receive collision-checked UUID-backed ids, so label spelling is not an id
  allocator.
- `topic_relations` is a typed directed graph. A `broader` row points from the
  narrower child (`source_topic_id`) to its broader parent
  (`target_topic_id`); `applies-to` records a cross-cutting relationship and
  never contributes to ancestry.
- `problem_topics` stores direct problem-topic assignments only. Parent rollups
  are derived for read models instead of being written as assignments.
  `effectiveTopicIds` contains a direct topic and its transitive `broader`
  ancestors, while `parentTopics` contains only those ancestors. For example,
  a DFS-to-Tree `applies-to` relation does not imply ancestry, and a legacy
  BFS-to-Tree relation is discarded rather than making BFS a Tree child.

The Problems Library read model owns this expansion: each row returns its
direct `topics` separately from `effectiveTopicIds`, and the Library options
include canonical topics with their aliases. The Library topic predicate
consumes those validated fields; it does not traverse the graph in the UI. By
default the filter matches against effective membership, so a selected broader
topic matches directly tagged descendants. Direct-only mode checks `topics`
instead. Any requires at least one selected ID and All requires every selected
ID in the chosen membership set. No selected IDs means no topic constraint,
regardless of mode. Alias search discovers canonical options and selecting an
alias match selects its canonical ID; picker query text alone does not filter
problem rows. Topic matching combines with other facets and global search keeps
its existing semantics. Filtering uses each problem row once, and counts,
selected-row bulk actions, and track creation consume the same filtered rows.
Graph-derived membership is currently used by the Library read model; this does
not claim that Analytics includes topic ancestors.

Manual Library create, edit, and bulk metadata writes use replace semantics for
direct problem topics: the saved topic list replaces the previous direct topic
assignments after alias resolution. LeetCode capture writes use merge semantics:
captured page topics are resolved and added to the existing direct topic set
without clearing local or manual topics.

Backup schema version 5 exports typed relations as
`{ sourceTopicId, targetTopicId, kind, createdAt, updatedAt }` alongside
`topics` and `topicAliases`, and requires `allowExternalProgress` on track rows.
Import accepts backup versions 1 through 5 and normalizes v1-v4 tracks to false
before current validation; v3's untyped parent/child
edges become `broader` edges with child as source and parent as target. Unknown
future versions are rejected. Sync keeps its envelope version
and its existing dirty-local, overwrite-confirmation, and authorization rules,
but a client that only understands backup v4 cannot read newly exported v5
backups.

Automatic database upgrade is a separate, deliberately narrow compatibility
path: only the exact shipped 0000–0007, 0000–0008, and 0000–0009 migration SQL
prefixes allowlisted in `src/platform/db/snapshot-upgrade.ts` may upgrade
automatically to the current schema. For fresh and older supported sources, the
Problems reconciliation callback runs on the staged database after incremental
SQL and before snapshot publication. It preserves direct assignments and
custom aliases, validates the complete registry, and retains the old snapshot
and fingerprint in the local recovery record. A through-0009 source retains its
catalog without repeating the historical conversion. Unsupported fingerprints
or a reconciliation collision fail without replacing the stored snapshot.

Migration 0009 adds the default-false track setting. The upgrade validates the
entire supported baseline schema, applies only missing migrations, checks
integrity, and publishes the staged snapshot last. The v8 Track upgrade uses
`cognipace_db_recovery_tracks_v1`, preserving the earlier Topics recovery record
alongside the v8 original. Each recovery slot rejects overwriting a different
original; a retry with the same original is supported. Failed upgrades retain the
active stored snapshot and all recovery copies. Shipped migration SQL is never
rewritten.

The through-0009 fingerprint `1144ce07` is registered before FSRS metadata
migrations. Compatibility registration adds no migration and changes no current
FSRS card, review, due date, track credit, or user preference. Populated
singleton tests use a test-only appended table to prove staging, independent
recovery, and reopen behavior; an actual later schema migration requires its own
preservation proof.

### Effective Track Completion

Tracks persists `allowExternalProgress` alongside each track and retains its
owned `track_problem_progress` ledger. The feature's completion read model gives
owned completion precedence, then optionally derives external completion from
the latest remaining successful review (`hard`, `good`, or `easy`), ordered by
review time and attempt ID. It does not use aggregate practice status or the last
rating. Membership rows and catalog totals share this resolver; Next selects the
first incomplete, non-suspended membership in explicit group/problem order.
Successful review evidence is read in batches for requested slugs, including
editor eligibility previews, with no synthetic progress writes.

Active-track guidance derives its current group from Next's membership, or null
when no eligible question remains. Workspace group tabs are local browsing
state, initialized from that guidance on mount and reset when the active track
changes; browsing does not write the persisted session group or affect shell
guidance.

The session persists only the active track choice. The legacy
`track_session.active_group_id` column remains solely for existing database
snapshots and backup compatibility; live session models ignore it and new
sessions store null. Remove it in a future preserving migration with compatible
readers for older backups. The obsolete group-selection runtime command and
mutation path have been removed.

The Tracks service owns active-track guidance. The repository supplies catalog
progress, ordered memberships, and the selected track without a second Next
resolver or unused session metadata.

Practice writes new owned progress only in Study Plan mode. Review corrections
reconcile existing ledger rows linked to that attempt regardless of current mode
or active track, without resurrecting deleted progress. Track reset deletes its
ledger and disables external progress in one transaction. Existing practice and
track invalidation refreshes Tracks and app-shell guidance. Content import v1
remains additive: new tracks default false and existing settings are preserved.

## Query Invalidation

Query keys live in `src/platform/query/query-keys.ts`. Invalidation tag mapping
lives in `src/platform/query/cache-invalidation.ts`.

Background writes broadcast events with tags such as `practice`, `problems`,
`queue`, `settings`, `sync`, `tracks`, and `app-shell`. The listener in
`src/app/providers/cache-invalidation-listener.tsx` parses the event and
invalidates the mapped query keys.

When adding or changing data dependencies:

- Add or reuse a query key in `src/platform/query/query-keys.ts`.
- Add or update tag mapping in `src/platform/query/cache-invalidation.ts`.
- Broadcast the smallest correct set of tags from the background write path.
- Include cross-feature query families when a write changes derived views. For
  example, problem catalog writes can affect Library, Analytics, practice
  details, queue, track workspace, and shell data.

## UI Architecture Rules

- Keep UI surfaces compact and direct. Popup is not a mini dashboard.
- Dashboard pages own layout and route-level composition; feature components own
  feature-specific interaction and display.
- Route definitions and modal nesting live in
  `src/app/dashboard/navigation/routes.tsx`; route labels and path metadata live
  in `src/app/dashboard/navigation/route-manifest.ts`.
- Feature components should call feature API hooks or receive already-loaded
  data. They should not reach into repositories or database modules.
- Keep draft form state local to the surface or feature hook until the user
  saves.
- Put shared primitives in `src/components/ui` only when they are product-agnostic
  and reusable by multiple surfaces.
- Use the tokens and interaction direction in `design.md` for visible UI work.
- Validate empty, loading, error, and disabled states for popup, dashboard, and
  overlay changes.

## Common Change Recipes

### Add Runtime Method

1. Add request and response schemas in the owning feature's
   `src/features/<feature>/api/*-contracts.ts`.
2. Add serializers in `src/features/<feature>/api` if the response contains
   dates, domain objects, or database rows.
3. Add the method to `ProtocolMap` in `src/extension/messaging.ts`.
4. Add allowed surfaces to `methodSurfaceAccess` in
   `src/extension/background/runtime-policy.ts`.
5. Register the handler in `src/extension/background/register-handlers.ts`.
6. Parse the request with Zod, authorize the sender, call the owning feature
   service, and parse or serialize the response.
7. If the method writes data, run it through the DB mutation flow, flush the
   snapshot, and broadcast invalidation tags.
8. Directional sync methods such as `sync.pullLatest` and `sync.pushLocal` must
   follow the same Zod parsing, sender authorization, owning service,
   snapshot-flush, and invalidation rules. Destructive overwrite flags must
   default to `false` in the Zod request schema and be asserted in handler tests.
9. Add focused tests for contracts, authorization, handler behavior, and the
   calling API hook as appropriate.

### Add Database Table Or Column

1. Update the relevant Drizzle schema module in `src/platform/db/schema`.
2. Export it through `src/platform/db/schema/index.ts` if needed.
3. Run `npm run db:generate` and review the generated migration under
   `src/platform/db/migrations`.
4. Run `npm run db:check`.
5. Update feature repositories in `src/features/<feature>/data`.
6. Update feature domain models, API contracts, serializers, and services.
7. Update seed data in `src/platform/db/seed.ts` if fresh installs need default
   rows.
8. Add or update repository and integration tests.
9. Follow the bounded migration compatibility and recovery behavior above and
   the local recovery procedure in `docs/testing.md`. Never treat local data
   reset as an acceptable default for a migration.

### Add Or Modify Dashboard Route

1. Add or update the page in `src/app/dashboard/screens`.
2. Update route metadata in `src/app/dashboard/navigation/route-manifest.ts`.
3. Update route definitions and modal nesting in
   `src/app/dashboard/navigation/routes.tsx`.
4. Put route-level layout in `src/app/dashboard/layout` when it is dashboard
   structure, not feature behavior.
5. Put reusable feature UI in `src/features/<feature>/components`.
6. Read and mutate data through feature API hooks.
7. Add route tests in `src/app/dashboard/routes.test.tsx` and feature component
   tests for meaningful behavior.

### Add Feature Mutation

1. Define the user-facing behavior in the owning feature.
2. Add or update the feature API contract and client API hook.
3. Implement domain validation or state transitions in
   `src/features/<feature>/domain`.
4. Implement persistence in `src/features/<feature>/data` if the mutation writes
   local data.
5. Implement the background service in `src/features/<feature>/server`.
6. Register the runtime method and allowed surfaces.
7. Serialize dates and response objects at the runtime boundary.
8. Broadcast invalidation tags for every affected query family.
9. Test the domain rule, repository or service write, runtime handler, and UI
   caller.

### Change Popup Behavior

1. Start in `src/app/popup/popup-app.tsx`,
   `src/app/popup/popup-shell.tsx`, and popup components under
   `src/app/popup/components`.
2. If the change alters shell data, update `src/features/app-shell`.
3. If the change alters queue recommendations, update `src/features/queue`.
4. If the change alters study-mode or track guidance, update
   `src/features/settings` or `src/features/tracks`.
5. Keep popup state compact and avoid moving dashboard workflows into popup.
6. Update popup tests and any affected feature tests.

### Change Overlay Behavior

Selected expanded-tab state lives in the overlay session above the visual
modes. `ExpandedOverlay` keeps Solve, AI, and Notes panels mounted and renders
the full review footer only in Solve. Ordinary tab switches retain native AI
disclosures, Copy feedback, and each panel's scroll position; hidden panels and
their controls are inaccessible. A save completed while expanded preserves the
current tab at completion; a save completed while collapsed or docked opens
Solve. A new problem or Restart selects Solve. AI generation stays owned by the
session controller, and tab navigation starts no provider call or Practice write.

1. Start in `src/app/overlay/overlay-app.tsx` for composition changes.
2. Use `src/features/overlay-session` for overlay UI state, timer, page
   sync, submission automation, and review actions.
3. Use `src/features/leetcode-capture` for page metadata, content, and
   submission result reads.
4. Use `src/features/practice` for saved review results and practice details.
5. Use `src/features/problems` for problem upserts from page data.
6. Preserve content-script-only access for LeetCode read methods in
   `runtime-policy.ts`.
   The overlay does not own editable practice logs. Its review save and override
   requests omit log patches, preserving historical fields through Practice.
   The standalone log-editing endpoint and unused assessment draft flag are
   removed; historical log fields remain in persisted data and read contracts.
7. Test collapsed, expanded, docked, timer, rating update, save, and page-sync behavior
   when the change touches those flows.

### Add Or Change External API Calls

1. Add request declarations in the owning `src/lib/<integration>/api` folder.
2. Use `src/platform/http` REST or GraphQL helpers instead of direct `fetch`.
3. Keep product parsing and fallback behavior in the owning feature or reader.
4. Inject `fetch` or `HttpClient` in tests; do not hit real external services.
5. Redact credentials and sensitive values from thrown errors or debug payloads.
6. Add request-shape tests plus focused behavior tests at the reader/service
   boundary.

## Validation By Change Type

- Docs-only change: run `npx prettier --check <changed-docs>`.
- Runtime messaging change: run focused contract, runtime policy, handler, and
  feature API tests.
- Database change: run `npm run db:generate` when creating migrations,
  `npm run db:check`, focused repository tests, and affected feature tests.
- Domain change: run focused domain tests and any service tests that exercise
  the domain rule.
- Dashboard UI change: run affected component/route tests and manually inspect
  the dashboard route.
- Popup change: run popup tests and manually inspect the popup in the extension.
- Overlay or LeetCode capture change: run overlay-session and LeetCode capture
  tests, then manually inspect a LeetCode problem page.
- Broad feature change: run targeted tests first, then `npm run check` before
  handoff.
