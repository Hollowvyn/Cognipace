# Next Question Group Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement these
> steps and verify each change before handoff.

**Goal:** Show the next question's group in popup/dashboard guidance and default
the reopened workspace to that group.

**Architecture:** Tracks server guidance derives the group from the selected
membership. Tracks component state owns browsing during a visit. Existing
database snapshots and backup payloads remain compatible; the obsolete
group-selection runtime command is retired.

**Tech Stack:** TypeScript, React, SQLite/Drizzle, Vitest, Testing Library.

## Phase: focused bug fix

- [x] Add failing regressions in
      `src/features/tracks/server/tracks-service.test.ts` and
      `src/features/app-shell/server/app-shell-service.test.ts` for a persisted tab
      differing from the next membership, cross-group progress, and exhausted tracks.
- [x] Run `rtk npm run test -- src/features/tracks/server/tracks-service.test.ts
src/features/app-shell/server/app-shell-service.test.ts` and confirm the group
      assertions fail. In `tracks-service.ts`, use
      `activeTrackGroups.find((group) => group.id === nextRow?.membership.groupId)
?? null` as guidance's active group. Re-run those tests.
- [x] Update `src/features/tracks/components/tracks-screen.test.tsx` to assert
      local group switching, no `tracks.setActiveGroup` call, preserved reveal,
      reopen on Next, refetch stability, deleted-group fallback, and track switching.
      Run `rtk npm run test -- src/features/tracks/components/tracks-screen.test.tsx`
      and confirm local selection tests fail before changing production components.
- [x] In `active-track-workspace.tsx`, replace the tab mutation with a local
      `selectedGroupId` initialized from guidance; validate that selection against
      current groups and fall back when it disappears. Pass `onSelectGroup` to the
      group strip. Key the workspace by track ID in `tracks-screen.tsx` to reset
      selection on activation changes. Re-run the component tests.
- [x] Add regressions using the same dashboard QueryClient across reopen,
      including fresh cached data with a 30-second stale time. In
      `src/features/tracks/api/tracks-api.ts`, make workspace queries use
      `refetchOnMount: 'always'`; in `tracks-screen.tsx`, keep the initial loading
      state until `isFetchedAfterMount` so stale cache cannot initialize tabs.
      In `active-track-workspace.tsx`, store a deleted-group fallback as the new
      selection. Verify a later Next change preserves that valid fallback.
      Run the component and Tracks API hook suites before the full check.
- [x] Update `docs/product.md` and `docs/testing.md` with the current chapter
      rule and exact happy-path/edge-case smoke flows.
- [x] Run `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, and
      `rtk npx prettier --check` with all touched files. Review the final diff and
      document exact results and pending human extension proof in a handoff.

Done when automated validation passes and the change is reviewable. Human
extension smoke and screenshot/recording proof must be completed before PR
review or merge; agent tests do not replace that requirement.

## Phase: user-requested Ponytail cleanup

- [x] In the existing repository activation/session tests, assert activation
      stores no group and session reads ignore legacy group selection. Observe
      the regression failure before changing the repository.
- [x] Delete `setActiveGroup` throughout Tracks API/contracts/exports,
      service/repository, extension messaging, handler, policy, and obsolete
      tests. Existing stale-selection tests write legacy fixtures directly.
- [x] Remove group-selection fields from live session/catalog models and
      reads; leave legacy storage null on activation and seeding. Remove the
      unused group-lookup helpers and exhausted-group fallback.
- [x] Mark the retained schema/backup field for compatible removal in the
      architecture cleanup note and a `ponytail:` comment. Keep migrations and
      backup contracts compatible.
- [x] Run focused Tracks, runtime, backup, and database tests, then
      `rtk npm run lint`, `rtk npm run check`, `rtk npm run build`, and touched-file
      Prettier. Record exact results and pending human smoke in the handoff.

## Phase: approved Ponytail review cuts

- [x] Remove unused repository guidance/Next/mapping code, catalog active flag
      and session lookup, and live session timestamp projections.
- [x] Preserve guidance assertions through the live service and repository
      assertions through owning reads; simplify the two component mocks and
      workspace stale-time configuration.
- [x] Run focused suites, lint, check, build, touched-file Prettier, and diff
      checks; obtain a focused review and update the handoff with exact results.
- [x] Commit and push the validated cuts; update draft PR #185 with the final
      scope and validation. Human smoke/visual proof remains pending.
