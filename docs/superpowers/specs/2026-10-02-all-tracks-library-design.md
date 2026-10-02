# All Tracks Collection And Import Design

Approved by the user on October 2, 2026 after reviewing the Collection rows
prototype and the template-first import flow.

## Outcome

All tracks reads as the complete local study collection. Its heading has a
library icon, a larger serif title, a track-count pill, a distinct tonal
header, New Track, and a small accessible Import tracks icon. The collection
starts expanded and can be collapsed when an active track exists; it remains
forced open when there is no active track. Adding a track reopens the collection.

Track rows retain their order, descriptions, progress, target dates, and
management actions. The active row has a primary-colored border and leading
accent, a tinted background, and a filled Active badge with a check icon.
Inactive rows remain legible, show a progress bar and completed/total values,
and offer an explicit Set active button. Empty Tracks also exposes import.
The active workspace and curriculum progression retain their responsibilities.

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
