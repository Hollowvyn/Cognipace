# All Tracks Collection And Import Design

Approved by the user on October 2, 2026 after reviewing the Collection rows
prototype and the template-first import flow.

## Outcome

All tracks reads as the complete local study collection. Its heading has a
library icon, a larger bold sans-serif title, a track-count pill, a distinct tonal
header, New Track, and a small accessible Import tracks icon. The collection
starts expanded and can be collapsed whether or not an active track exists.
Adding a track reopens the collection.

The All tracks heading and its separate chevron icon button both control the
collection's expansion. Keep the visible collection chevron beside the
create/import actions, its expansion state, and keyboard support. The user's
chevron-removal request applies to the individual track rows.

After comparing the installed heading with dashboard typography, the user
approved using the existing system sans-serif family and bold weight. Retain
the larger collection title and existing header hierarchy; do not introduce a
fallback serif or load new font assets for this component.

Track rows retain their order, descriptions, progress, target dates, and
management actions. The active row has a primary-colored border and leading
accent, a tinted background, and a filled Active badge with a check icon.
Inactive rows remain legible, show a progress bar and completed/total values,
and offer an explicit Set active button. Empty Tracks also exposes import.
The active workspace and curriculum progression retain their responsibilities.

## Track Card Preview Follow-Up

The user requested this follow-up after trying the implementation, referencing
the group presentation in merged PR #180. Their existing instruction to
implement trusted routine design choices applies to this scoped extension.

Clicking a track card's summary toggles a compact inline preview. A semantic
button covers the summary, supports Enter/Space, and exposes expansion state.
The row has no expansion chevron or visible Preview label. Existing Set active, Clear Active, Edit, Reset Progress, and
Delete controls remain independently usable and do not toggle the preview.

After inspecting the installed extension, the user requested stronger ownership
of the expanded content and removal of the visible Preview label. An expanded
card encloses both its summary and groups in one clear continuous rounded
outline and tonal background, without an extra caption. Only one track preview
can be open: opening another track closes the previous one. Collapsing All
tracks also closes its preview. The native card toggle and its accessible name remain for keyboard/screen-reader
access.

An expanded inactive track uses a neutral outline of uniform thickness around
the summary and groups, plus a subtle surface tint. Reserve the green outline,
thicker leading accent, primary tint, and Active badge for the active track,
whether its preview is open or closed. The card toggle's keyboard focus ring is
neutral, so focus does not resemble activation.

Load the existing Tracks read query only when a preview opens. Display ordered
groups as full-width shaded collapsible headers, with the first group open.
Inside, show ordered full question titles, difficulty, and direct topic labels
as flat divided rows. Keep the preview's content height bounded and scrollable
for long curricula. Empty groups and failed/loading reads have explicit states
and Retry is available. This read-only preview neither activates a track nor
changes its active group, progression, or stored content. All preview toggles
keep keyboard focus on their control.

## Import Interaction

Import tracks opens a dashboard route modal over Tracks. The first step
downloads the existing packaged track-only.json template and explains how to
author track names, ordered groups, and problem slugs or LeetCode URLs. The
second step selects a JSON file and uses the existing content-import workflow
for preview, diagnostics, explicit apply, stale-preview review, and persistence
retry. Accompanying problem metadata remains supported by the existing v1
content contract and all additions are visible in the preview.

Import does not automatically activate a track. Successful imports refresh the
collection through the existing invalidation path. The modal stays open to show
the result and can be closed afterward. Its Close control, Escape, and backdrop
dismissal are disabled during apply, retry, or unresolved snapshot failure.
The user can still dismiss a reading or previewing file without writing data.
Keyboard focus stays inside the modal when apply, retry, or preview controls
change. Writes focus the status, a save failure focuses Retry saving, completion
focuses the result, and Dismiss import returns focus to the file chooser.

## Ownership

Tracks owns collection presentation. Imports owns the reusable file workflow
and track-oriented template presentation. The dashboard app composes the two
public feature surfaces in its route modal. No new database schema, runtime
method, Chrome permission, sync policy, or import format is needed.

## Validation And Human Proof

Focused tests cover default expansion/collapse, activation, management actions,
import reachability in populated and empty Tracks, template links, preview and
apply, safe dismissal, and persistence retry. Existing Settings import tests
remain regression coverage. Run npm run lint, npm run check, npm run build,
and Prettier on touched files. Inspect the actual React UI at desktop and narrow
widths and attach screenshots. Human real-extension happy-path and edge-case
smoke is required before PR review or merge; agent previews do not replace it.
