# fix(tracks): align chapter guidance with the next question

## Change

Popup group badges and dashboard Current chapter/Next up now use the group of
the next ordered eligible membership. Previously they used the last persisted
workspace tab, so browsing Intervals could mislabel a Binary Search question.
Exhausted or fully suspended tracks have no current-chapter label.

Tracks browsing is local to the current visit. Reopening Tracks or changing
active tracks initializes the view from Next's group, or the first group when
there is no eligible question. Ordinary refetches preserve a valid selection;
deleted groups fall back safely and retain that fallback on later refetches.
Each new visit refreshes guidance before initializing its tab, including when
cached data is still within the dashboard's 30-second freshness window. Tab
reveal and table pagination are preserved.

The user-requested Ponytail cleanup removes the unused group-selection hook,
runtime contract/handler/policy, service, repository mutation, and live
session/catalog group fields. Activation and new seeds store null in the legacy
column. `activeTrackId` still persists the chosen track; Next determines its
current group. The physical column and backup field remain compatible and are
marked for a future preserving migration with readers for older backups.

## Validation

Environment: Node 24.20.0, npm 11.19.0. Locked dependencies installed with
`rtk npm ci --cache /private/tmp/cognipace-next-group-npm-cache`.

Commands run:

- `rtk npm run prepare:wxt`: passed. Initial focused runs could not transform
  tests before WXT generated `.wxt/tsconfig.json`; those runs executed no tests.
- `rtk npm run test -- src/features/tracks/server/tracks-service.test.ts src/features/app-shell/server/app-shell-service.test.ts`:
  reproduced seven expected group assertion failures, then passed 42 tests.
- `rtk npm run test -- src/features/tracks/components/tracks-screen.test.tsx`:
  reproduced four local-browsing failures, then passed after implementation.
  The active-track switch test required waiting for the intermediate track to
  render before switching back.
- `rtk proxy sh -c 'DEBUG_PRINT_LIMIT=1000 npm run test -- src/features/tracks/components/tracks-screen.test.tsx -t "preserves the initial browsing group"'`:
  reproduced initial-selection refetch drift, then covered in the passing suite.
  An initial ambiguous link query was corrected before observing that failure.
- `rtk npm run test -- src/features/tracks/components/tracks-screen.test.tsx src/features/tracks/server/tracks-service.test.ts src/features/app-shell/server/app-shell-service.test.ts`:
  passed all 86 focused tests.
- `rtk npm run test -- src/features/tracks/components/tracks-screen.test.tsx -t 'reopens on the new Next group|preserves the fallback browsing group'`:
  reproduced three navigation/cache assertion failures before the lifecycle fix.
- `rtk npm run test -- src/features/tracks/components/tracks-screen.test.tsx src/features/tracks/api/tracks-api.test.tsx src/features/tracks/server/tracks-service.test.ts src/features/app-shell/server/app-shell-service.test.ts`:
  passed all 95 focused tests after the lifecycle fix.
- `rtk npm run test -- src/features/tracks/data/tracks-repository.test.ts -t 'without restoring legacy group selection|without persisting a browsing group'`:
  reproduced two expected session/activation assertion failures before the
  persistence cleanup; the final focused suite passes those tests.
- `rtk npm run test -- src/features/tracks/data/tracks-repository.test.ts src/features/tracks/server/tracks-service.test.ts src/features/tracks/api/tracks-api.test.tsx src/features/tracks/components/tracks-screen.test.tsx src/features/app-shell/server/app-shell-service.test.ts src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/backup/server/backup-service.test.ts src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/instance.test.ts src/testing/db-foundation.test.ts`:
  276 passed and one failed because the create-and-activate service test still
  expected a persisted first group. Updated that expectation to null.
- `rtk npm run test -- src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.test.ts`:
  passed all 92 runtime tests after deleting the obsolete command.
- `rtk npm run test -- src/features/tracks/data/tracks-repository.test.ts src/features/tracks/server/tracks-service.test.ts src/features/tracks/api/tracks-api.test.tsx src/features/tracks/components/tracks-screen.test.tsx src/features/app-shell/server/app-shell-service.test.ts src/extension/background/register-handlers.test.ts src/extension/background/runtime-policy.test.ts src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/backup/server/backup-service.test.ts src/platform/db/snapshot-state.test.ts src/platform/db/open-snapshot.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/instance.test.ts src/testing/db-foundation.test.ts`:
  passed all 369 tests across 15 suites after cleanup, including old backup and
  snapshot compatibility.
- `rtk npm run lint`: passed again after cleanup.
- `rtk npm run check`: passed, including Drizzle checks, WXT/TypeScript, ESLint,
  and all 2,109 tests across 195 files after cleanup. The suite emitted 82 non-fatal JSDOM
  `Window.scrollTo` warnings.
- `rtk npm run build`: passed; production output is `dist/chrome-mv3`. The build
  emitted a non-fatal warning about chunks larger than 500 kB.
- `rtk proxy npx prettier --check --ignore-path /dev/null docs/architecture.md docs/product.md docs/superpowers/README.md docs/testing.md src/extension/background/register-handlers.test.ts src/extension/background/register-handlers.ts src/extension/background/runtime-policy.test.ts src/extension/background/runtime-policy.ts src/extension/messaging.ts src/features/app-shell/server/app-shell-service.test.ts src/features/tracks/api/tracks-api.test.tsx src/features/tracks/api/tracks-api.ts src/features/tracks/api/tracks-contracts.ts src/features/tracks/components/active-track-workspace.tsx src/features/tracks/components/tracks-screen.test.tsx src/features/tracks/components/tracks-screen.tsx src/features/tracks/data/tracks-repository.test.ts src/features/tracks/data/tracks-repository.ts src/features/tracks/domain/track.ts src/features/tracks/index.ts src/features/tracks/server/tracks-service.test.ts src/features/tracks/server/tracks-service.ts src/platform/db/schema/track-session.ts src/platform/db/seed.ts docs/superpowers/handoffs/2026-10-03-next-question-group.md docs/superpowers/plans/2026-10-03-next-question-group.md docs/superpowers/specs/2026-10-03-next-question-group-design.md`:
  passed. Planning directories are normally ignored, so this check explicitly
  includes them.
- `rtk proxy git diff --check`: passed.

No required automated commands were skipped. Human extension smoke and visual
proof remain pending; automated tests do not establish installed-extension proof.

## Human smoke and visual proof: pending

Required before PR review or merge; agent tests do not replace these checks.
Use the Popup and Tracks flows in `docs/testing.md`, including:

- Happy path: browse Intervals while Next belongs to Binary Search. Popup
  badge, Overview Current chapter, and Next up badge all show Binary Search.
  Return to Tracks and confirm Binary Search starts selected and revealed.
- Browse another tab and verify rows/pagination work; refetch and confirm the
  view stays selected. Switch tracks and back; verify it reopens on Next. Leave
  Tracks, advance Next elsewhere, then return within 30 seconds and confirm the
  fresh Next group is selected.
- Remove the browsed group; verify fallback. Advance or suspend the final
  eligible question in a group; verify question and chapter advance together.
  After a deleted-group fallback, advance Next and confirm the fallback tab
  remains selected during the visit.
- Check exhausted, fully suspended, empty, and Free Practice states.
- Attach screenshot or recording proof of the happy path and edge cases.

## Scope, compatibility, and recovery

Risk areas are shared Tracks guidance and dashboard browsing state. The unused
`tracks.setActiveGroup` command is retired; remaining commands retain their
sender authorization and Zod parsing. The physical database schema, backup
shape, progress, FSRS scheduling, and extension permissions are unchanged.
Existing persisted session-group values remain compatible and are ignored by
live session reads; tab browsing no longer dirties persistence or triggers sync
writes.

Release impact: patch-level bug fix. Rollback: revert this change; no data
migration or recovery operation is needed. Issue exception: this is a direct
user-reported bug with supplied reproduction screenshots; no issue was created.
Final independent specification and code-quality reviews passed after correcting
initial-tab refetch stability, cached reopening, and deleted-group fallback;
both approved the final persistence cleanup. Production source changes total
29 added and 203 removed lines, a net reduction of 174 lines across 13 files.
