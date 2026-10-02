# Tracks Pagination Implementation Plan

**Goal:** Apply Library pagination to every Tracks problem table at 15 rows per page.

**Architecture:** Share the generic footer under `src/components/ui` and retain
pagination state in the owning feature. Key the workspace table by track and
group so navigation resets page and expansion state.

**Tech stack:** React, TanStack Table, TypeScript, Vitest, React Testing Library.

## Implementation

- [x] Add `src/features/tracks/components/track-problem-table.test.tsx` for
      31-row navigation, 15-row boundary, empty rows, expansion, refreshed rows,
      and removal of the only row on the last page. Use ordered fixtures from
      `src/testing/track-fixtures.ts` and user clicks on Previous/Next.
- [x] Add workspace coverage to `track-problem-table.test.tsx` for resetting pagination
      when the selected group or track changes.
- [x] Run `npm run test -- src/features/tracks/components/track-problem-table.test.tsx`
      and confirm new pagination assertions fail before implementation.
- [x] Extract the footer from `problem-library-table.tsx` into
      `src/components/ui/table-pagination.tsx`. Accept a generic TanStack table,
      optional bulk actions and optional page-size choices. Without choices,
      show the fixed page size. Library supplies `[20, 30, 50]`.
- [x] In `track-problem-table.tsx`, add `getPaginationRowModel`, controlled
      `{ pageIndex: 0, pageSize: 15 }`, disable automatic resets on data refresh,
      and clamp the stored page index when row count shrinks. Render the shared
      footer after the horizontally scrollable table.
- [x] In `active-track-workspace.tsx`, key the problem table by track/group ID.
- [x] Update `docs/product.md` and `docs/testing.md` with current behavior and
      the human smoke checklist.
- [x] Run focused Tracks and Library component tests, then `npm run lint`,
      `npm run check`, `npm run build`, and `npx prettier --check` on touched files.
- [x] Review the diff for feature boundaries and preserved Library behavior.
      Record exact checks and remaining human smoke requirements in the handoff.

Done when all Tracks groups show at most 15 problems per page, navigation and
range counts are correct, identity changes reset state, row removal cannot leave
an empty page, and automated validation passes. Human browser proof is pending
until the engineer performs the documented smoke flow.

## Validation Handoff

Automated implementation and diff review are complete on
`codex/tracks-pagination`, based on freshly fetched `origin/main` at `709957e`.

Commands run (the RTK wrapper forwards the commands unchanged):

```sh
rtk proxy npm run test -- src/features/tracks/components/track-problem-table.test.tsx
rtk proxy npm run test -- src/features/tracks/components/track-problem-table.test.tsx src/features/tracks/components/tracks-screen.test.tsx src/features/problems/components/library/problem-library-screen.test.tsx
rtk proxy npm run lint
rtk proxy npm run check
rtk proxy npm run build
rtk proxy npx prettier --check --ignore-path /dev/null src/components/ui/table-pagination.tsx src/features/problems/components/library/problem-library-table.tsx src/features/tracks/components/track-problem-table.tsx src/features/tracks/components/track-problem-table.test.tsx src/features/tracks/components/active-track-workspace.tsx docs/product.md docs/testing.md docs/superpowers/specs/2026-10-02-tracks-pagination-design.md docs/superpowers/plans/2026-10-02-tracks-pagination.md
rtk git diff --check
```

The initial focused run failed as expected before implementation: 31 problems
were rendered instead of 15, and range/navigation controls were absent. After
implementation, the focused component run passed six tests; the expanded Tracks
and Library run passed 68 tests. The full check passed 186 files and 1,892 tests,
including all eight new pagination tests. Lint, type checking, database checks,
build, formatting, and diff whitespace checks passed. The full suite emitted
JSDOM scrollTo notices; the build emitted a chunk-size warning.

Skipped command: `npm run zip`, because package artifact behavior is unchanged.
Database generation is outside this change's validation category: no schema or
persistence changes were made.

Human realtime happy-path and edge-case Tracks/Library smoke and screenshot or
recording proof have not been performed. Follow the Track Table Pagination
checklist in `docs/testing.md`; these remain required before review or merge.
Automated component coverage does not replace that proof.

Risk: UI pagination state and the shared Library footer. Runtime, permissions,
sync, persistence, and track progression are unaffected. No issue was created
because this is a directly requested, bounded UI change. Suggested PR title:
`fix(tracks): paginate problem tables at 15 rows`. Release impact: user-visible
fix; rollback by reverting the pagination changes, with no data migration.

## Follow-up: Single-page Controls

User-approved adjustment: retain page size and row range but show the shared
Previous/Next controls only when the table has more than one page.

- [x] Update existing Tracks boundary tests for hidden controls on 1, 8, and 15
      problems, plus controls disappearing after removal leaves one page.
- [x] Add Library coverage for controls hiding/reappearing as page size changes.
- [x] Confirm focused tests fail, then conditionally render controls using
      `table.getPageCount() > 1` in `TablePagination`.
- [x] Update product/design/smoke docs; rerun focused tests, lint, full check,
      build, formatting, and diff checks. Commit and push the update to PR #176.

Human browser smoke with screenshots/recording remains pending before review or
merge; include single-page Tracks and Library page-size transitions in that proof.

### Follow-up Validation

The shared footer now renders its chevrons only for `table.getPageCount() > 1`.
Tracks keeps “Rows per page: 15” and the visible range on a single page; Library
keeps its selector and range. Existing multiple-page navigation remains intact.

Commands run:

```sh
rtk proxy env DEBUG_PRINT_LIMIT=1000 npm run test -- src/features/tracks/components/track-problem-table.test.tsx src/features/problems/components/library/problem-library-screen.test.tsx
rtk proxy npm run test -- src/features/tracks/components/track-problem-table.test.tsx src/features/tracks/components/tracks-screen.test.tsx src/features/problems/components/library/problem-library-screen.test.tsx
rtk proxy npm run lint
rtk proxy npm run check
rtk proxy npm run build
rtk proxy npx prettier --check --ignore-path /dev/null src/components/ui/table-pagination.tsx src/features/problems/components/library/problem-library-table.tsx src/features/tracks/components/track-problem-table.tsx src/features/tracks/components/track-problem-table.test.tsx src/features/tracks/components/active-track-workspace.tsx docs/product.md docs/testing.md docs/superpowers/specs/2026-10-02-tracks-pagination-design.md docs/superpowers/plans/2026-10-02-tracks-pagination.md src/features/problems/components/library/problem-library-screen.test.tsx
rtk git diff --check
```

Five assertions failed as expected before the conditional was implemented,
because single-page chevrons were still present. After implementation, 70 focused
Tracks/Library tests passed; the full check passed 186 files and 1,894 tests.
Lint, type checking, database checks, build, formatting, and diff checks passed.
An independent read-only review found no concrete issues. Full tests emitted
JSDOM scrollTo notices and the build emitted a chunk-size warning.

Skipped: `npm run zip` because artifact packaging is unchanged. Human realtime
smoke and screenshot/recording proof remain pending before review or merge,
including single-page Tracks counts and Library page-size transitions. The PR
remains a draft until that proof is attached.
