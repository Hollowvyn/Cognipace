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

Currently incomplete or intentionally light:

- Overview is a dashboard route with a planned guided-practice home.

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
- structured draft fields managed through the overlay session
- settings access from the overlay
- compact expanded-mode Help access that opens a YouTube search for the current problem in a new tab
- page metadata and problem context sync through content-script/runtime messages

### Dashboard

The dashboard is the control and inspection surface for product state.

Current behavior:

- Library manages problem rows, filters, details, create/edit modals, and problem
  practice actions.
- Tracks manages active track workspace, groups, ordered problems, progress,
  create/edit, activation, deletion, and reset progress.
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
- The dashboard header shows compact pull and push shortcuts after GitHub Gist
  sync is configured.
- Analytics shows local review-day totals, all-time review counts, current
  streak, low-sample-aware observed rating quality, a tracked-card memory
  profile, current retention health, fragile knowledge, and a fixed 14-day
  upcoming-review forecast. Its historical charts use the selected 14-, 30-,
  or 90-day range as evidence-gated presentation windows rather than promising
  a trend from sparse local history.
- Overview currently reserves route ownership for a future guided-practice home.

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

Practice state is local and FSRS-backed. The persisted database owns practice
facts, and UI surfaces read them through feature services and runtime messages.
On each saved review, CogniPace passes the rating, review time, and configured
target retention to `ts-fsrs`, then persists the returned card and review log.
The persisted FSRS `card.due` value, stored locally as `dueAt`, is the authority
for the next review date. Current retrievability is a separate FSRS estimate for
display and queue ranking; it does not replace or cancel the persisted due date.

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

Tracks owns curriculum progression. Track completion is separate from global
practice history, and active track/session state is local database state. Tracks
can contain groups and ordered problem memberships.

Every track group's problem table uses Library-style pagination with a fixed
15 problems per page. The footer shows the visible range and Previous/Next
controls. Switching track or group starts at the first page; paging preserves
the group's explicit problem order and does not change track progression.

Expanded track problem rows offer **Remove from track** beside Edit. Removal
only affects that track membership and its track completion; the Library
problem, global practice/review data, and other track memberships remain.
Remaining problems keep their relative order, and empty groups remain editable.

The active track's `Next` target is the first incomplete, non-suspended
membership in explicit group and problem order. FSRS due state does not reorder
track progression; due reviews remain a separate review target. Selecting an
active group changes the workspace view without retargeting `Next`.

While Study Plan mode is active and the problem belongs to the active track,
`hard`, `good`, and `easy` reviews complete that track problem. `again` does not
complete a currently incomplete track problem. Free Practice does not write
active-track progress, and a later `again` review does not clear an existing
completion. FSRS scheduling and global practice history remain separate from
track completion.

### Settings

Settings owns persisted preferences, defaults, validation, and the dashboard
settings form. Changes should flow through the settings feature API and
invalidate affected query families.

Review settings expose the FSRS target-retention input. Review Order is not a
user-facing setting: queue ordering follows the fixed waterfall, while the
legacy stored `review.order` value is retained only for settings schema-v1
compatibility. Changing target retention never rewrites existing schedules.

AI assessment settings can store provider preference and model configuration.
Provider API keys are stored in trusted local extension secret storage, never in
backup exports, sync payloads, logs, or unmasked UI payloads. When configured,
trusted background code can call the approved BYOK provider hosts for OpenAI,
Anthropic, and Google Gemini. Development smoke testing can optionally run a
live provider check, but that hidden dashboard smoke route is not normal product
navigation and never reveals stored secret values.

### Analytics

Analytics owns the local dashboard route for review health, historical recall
and practice patterns, current memory state, workload, and weak-area
inspection. It is read-only and derived from local practice state; it does not
introduce hosted reporting or account behavior.

Historical Analytics uses adaptive presentation buckets and evidence gates:

- The implemented range choices are 14 days with daily buckets, 30 days with
  three-day buckets, and 90 days with weekly buckets. The selection is always
  explicit and never silently changes to a shorter period.
- For each metric, Analytics removes only unsupported leading buckets from its
  presentation window. Internal and trailing gaps remain unknown; it does not
  fill them with invented values. When the selected range is not ready, the
  page explains the relevant evidence shortfall and can offer the richest
  shorter ready range as a link; the available chart still remains visible.
- Practice Rhythm keeps every bucket after the first supported practice bucket.
  A bucket with no reviews is plotted as zero review volume, while correctness
  remains unknown unless an eligible correctness assessment exists.
- A dashed line bridge means two measured values are separated by a missing-
  evidence gap. It is a visual connection only, never an interpolated data
  value. Historical line charts connect each measured point to the next valid
  point so sparse history does not create a broken visual story; unknown
  buckets still do not receive markers or tooltip values.
- Readiness is metric-specific and explainable. A range or metric can be held
  back for too little usable span, too few eligible assessments or active
  buckets, a gap that is too long, or too many gaps. Readiness is guidance for
  confidence, not a reason to hide an otherwise available chart.

Historical readiness does not hide useful analytics. Recall Quality, Practice
Rhythm, Memory Strength, and Recent Overdue Backlog keep showing available
points when a historical selected range is unready; a one-point series says
that it is not enough for a trend yet. Retention Health, Fragile Knowledge, and
the fixed 14-day Upcoming Review Load remain available as current or forecast
views. Retention Health compares each active problem's current FSRS
retrievability with the configured target; its hover/focus preview can be
pinned for details and provides a canonical LeetCode link. Fragile Knowledge
highlights current cards with risk signals and shows five rows per page with
canonical LeetCode problem links.

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
