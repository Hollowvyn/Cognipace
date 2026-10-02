# Tracks Pagination Design

The user requested Library-style pagination for every Tracks problem table,
with a fixed limit of 15 problems per page, based on the latest main.

Extract Library's existing footer into a generic `TablePagination` component
under `src/components/ui`. Library retains its page-size selector and bulk
actions. Tracks uses the same range and Previous/Next controls with a fixed
“Rows per page: 15” label. In both tables, Previous/Next controls appear only
when there is more than one page; single-page results retain the page size and
range.

Tracks owns its pagination state. Paginate after ordering memberships, keep
expanded details attached to their problem, and retain membership order numbers
across pages. Switching track or group resets the table to its first page.
Updates within a group preserve the page while clamping it to the last available
page when rows are removed. Empty groups retain their existing empty state.

Focused component tests cover boundaries, expansion, refreshed rows, shrinking
data, and workspace identity changes. Run Library regression tests, lint, the
full check, build, and formatting checks. Human realtime happy-path and edge-case
smoke with screenshots or a recording remains required before review or merge.
