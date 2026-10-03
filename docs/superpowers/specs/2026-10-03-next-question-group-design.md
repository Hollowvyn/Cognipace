# Next Question Group Design

## Authorized behavior

The user requested that popup topic guidance and dashboard Current chapter/Next
up labels identify the group containing the next track question. The user also
authorized reopening Tracks on that group rather than restoring a browsing tab.

## Cause and approach

`readActiveTrackGuidance` selects the correct ordered next membership, but reads
its `activeGroup` from the persisted workspace tab. App-shell uses that title
for both popup and dashboard guidance.

Resolve guidance's group from the selected next membership. Keep workspace tab
selection in component state for the current visit. Clicking a tab must continue
to reveal its rows and scroll it into view without a persistence mutation.
Reopening the workspace or switching active tracks starts on the guidance group.
An ordinary refetch preserves a valid local browsing selection. If the browsed
group disappears, fall back to the guidance group or first available group.
Store that fallback as the new browsing selection. Each workspace visit reads
fresh guidance before initializing the tab, even when the dashboard query cache
contains a previous visit's response; use the existing loading state during
that initial read and retain the workspace during later background refetches.

When no eligible next question exists, guidance has no current group; the
workspace defaults to its first available group. Empty tracks remain usable.

Fixing only the app-shell projection would leave persisted tab selection coupled
to navigation. Overwriting persisted selection on reads would add write effects
to read operations. Local browsing plus shared membership-derived guidance
addresses both requested surfaces without either tradeoff.

## Validation

Regression tests cover stale persisted selection, progression across groups,
suspended/exhausted tracks, popup/dashboard agreement, local browsing, reopen,
refetch, active-track switches, and deleted groups. Run focused tests, lint,
check, build, and touched-file formatting. Prepare human extension happy-path
and edge-case smoke checks with screenshot/recording proof before review/merge.

## User-requested Ponytail cleanup

Delete the unused `tracks.setActiveGroup` hook, contract, runtime handler,
authorization entry, service, repository method, and obsolete tests. Remove
persisted group selection from live session/catalog models and reads. Track
activation and fresh seeds leave the legacy group column null. Repository
guidance derives its group from Next and returns null when exhausted.

Keep the physical column and existing backup field compatible with stored data.
Add a `ponytail:` debt comment and an architecture cleanup note: remove this
legacy persisted browsing field in a preserving migration with readers that
accept older backups. No new persistence mechanism, abstraction, or backup
version is needed for the current fix.
