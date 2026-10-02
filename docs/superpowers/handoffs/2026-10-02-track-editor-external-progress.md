# Track Editor And External Progress Handoff

Suggested PR title: `feat(tracks): improve editor and allow external progress`

Branch: `codex/track-editor-external-progress`, based on `origin/main` at
`f3e6d73`. It began at `94e88d3` and was rebased onto the metadata-only 2.0.0
release commit after main advanced during implementation. Design approved by the
user after the Change button/menu revision.

## Details

The create/edit Track modal now uses full-width group sections with complete
wrapping question titles, explicit rename, and a Library picker directly above
the selected group's questions. Change opens an anchored destination menu with
keyboard navigation and useful focus after moving a question. The existing
modal shell, order, uniqueness, activation, and Library draft flows remain.

Allow external progress defaults off and continuously counts saved successful
reviews from anywhere in CogniPace, including earlier history. Owned completion
takes precedence; external credit is derived without ledger writes. Rows,
totals, and Next share effective completion. Expanded details expose provenance.
Corrections update only existing attempt-linked ledger entries across mode or
active-track switches. Reset clears owned progress and disables the option while
keeping practice history.

Migration 0009 adds the boolean without modifying shipped SQL. Exact populated
v7/v8 baselines upgrade while retaining originals. The v8 Track migration has a
separate recovery slot so an earlier v7 Topics recovery copy survives the normal
upgrade chain. Backup v5 requires the setting, v1-v4 normalize it to false, and
content import v1 preserves existing settings while new tracks default off.

## Issue

No issue: direct user-requested work with an approved design and phase plans.

## Testing

Required combined validation is recorded below. Human realtime smoke is still
pending before PR review or merge; this is implementation evidence, not a
claim that a human exercised the installed extension.

Passed commands:

```sh
rtk npm ci
rtk npm run db:generate
rtk npm run db:check
rtk proxy npx tsc --noEmit
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk git diff --check
```

Focused final checks:

```sh
rtk npm run test -- src/features/tracks/components/track-form.test.tsx src/features/tracks/hooks/use-track-form.test.tsx src/app/dashboard/routes.test.tsx
rtk npm run test -- src/features/tracks/api/tracks-contracts.test.ts src/features/tracks/data/tracks-repository.test.ts src/features/tracks/server/tracks-service.test.ts src/features/practice/practice-core.integration.test.ts src/features/queue/queue-track-independence.integration.test.ts src/extension/background/register-handlers.test.ts
rtk npm run test -- src/features/tracks/components/track-problem-table.test.tsx src/features/tracks/components/track-actions.test.tsx src/features/tracks/data/tracks-repository.test.ts src/extension/background/register-handlers.test.ts
rtk npm run test -- src/features/practice/practice-core.integration.test.ts src/extension/background/register-handlers.test.ts src/features/tracks/api/tracks-api.test.tsx
rtk npm run test -- src/platform/db/snapshot-upgrade.test.ts src/platform/db/instance.test.ts src/platform/db/open-snapshot.test.ts src/testing/db-foundation.test.ts src/features/tracks/data/track-import-repository.test.ts src/features/imports/domain/import-plan.test.ts src/features/imports/server/import-service.test.ts
rtk npm run test -- src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/backup/server/backup-service.test.ts src/features/backup/components/data-management-screen.test.tsx src/features/sync/server/sync-service.test.ts src/features/sync/domain/sync-envelope.test.ts
rtk npm run test -- src/platform/db/instance.test.ts src/platform/db/snapshot-state.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/open-snapshot.test.ts
```

The first combined check passed 187 test files and 1,927 tests. The final combined check passed 187 files and 1,928 tests after the browser
regressions were repaired.
Independent spec and code-quality reviews found no actionable source findings.

Initial TDD runs intentionally failed for missing setting/eligibility,
historical completion, reset policy, correction after mode switch, menu and
rename behavior, backup v5, and supported v8 migration. These were followed by
passing focused runs. Transitional failures during concurrent edits included a
current backup fixture missing its required flag, unused correction settings,
and unformatted touched tests; each was repaired. Test output includes existing
jsdom `Window.scrollTo` notices; the build includes its existing large-chunk
warning. Both commands complete successfully.

`rtk npm run typecheck`, `rtk npm run lint`, and `rtk npm run format` each had
an initial failing run during those transitional edits. Final combined check
covers typecheck/lint, and the final formatting run passed.

Skipped commands and flows:

- `rtk npm run zip`: artifact packaging behavior was not changed; production
  build is covered. No release or store upload was requested.
- Human realtime installed-extension smoke, popup/LeetCode review/correction,
  actual historical-profile upgrade, backup restore, and configured Gist sync:
  pending human execution and screenshots/recording, as required by
  `docs/agent-governance.md`. Automated runtime/database tests cover these paths;
  the isolated component harness does not execute extension transport or storage.

### Human Smoke Checklist

Use the **Vertical Track Editor And External Progress** flow in
[`docs/testing.md`](../../testing.md). Reload the unpacked production build at
`dist/chrome-mv3` in a disposable profile for reset/restore cases.

- [ ] Create/edit at desktop and 320px; complete group/question titles, rename,
      Library add, order, group removal, and invalid title reveal. Collapse every
      group, reopen by click/Enter/Space, and save without losing questions.
- [ ] Change menu mouse/keyboard, full destination titles, Escape/Tab/outside,
      source focus, footer flip/scroll, and moving the final source question.
- [ ] Historical solve counts only when enabled; save/reopen and toggle off/on;
      expanded provenance, totals, Next, and popup agree.
- [ ] Future Free Practice and inactive-track solves, later separate Again,
      latest-review corrections, and fallback to earlier successes.
- [ ] Owned correction after changing mode/active track; no resurrection after
      reset; suspension and whole-track ordering.
- [ ] Track reset disables external progress while retaining history;
      re-enable restores it; global reset removes question evidence.
- [ ] v5 backup export/restore and v1-v4 default-off restoration; additive import
      preserves existing true and creates false; configured authorized sync v5.
- [ ] Historical v7/v8 profile upgrade retains data and both recovery copies;
      same-original retry and conflicting-original recovery retention.
- [ ] Attach screenshots or a recording for happy-path and edge-case proof
      before PR review or merge.

## Screenshots

Agent browser evidence uses the implemented TrackForm, RouteModal, and app
styles with runtime data mocked. It is separate from the required human proof.
Local screenshots and exact harness commands are recorded at completion below.

## Risk, Release, And Recovery

This is a feature release change to visible UI, local persisted shape, and
derived Track progress. No permissions, runtime methods, auth, secret handling,
sync envelope, network behavior, or sync orchestration were expanded. Existing
Zod request parsing, sender authorization, practice/track invalidation, and
app-shell refresh paths remain. Sync carries the current backup payload; clients
that only understand v4 reject v5 rather than silently dropping the setting.

Unknown database fingerprints and conflicting originals in the same recovery
slot fail closed. Existing data does not reset automatically. Preserve both
recovery storage keys and export a v5 backup before rollback. An older build
cannot read the new snapshot fingerprint or v5 backup; use a compatible
pre-upgrade original/export with that build, or retain the new build to export
data. Never rewrite shipped SQL or discard recovery copies to force a downgrade.

## Follow-up: Allow All Groups To Collapse

The user requested that clicking the expanded group header collapse it without
requiring another group to open. This refines the original design. Form selection
now permits null, and header toggling is separate from explicit opening for
Rename, New Group, and invalid-title Save. Local collapse does not modify the
payload, question order, membership, or persisted progress.

Five regression expectations failed before the fix. The updated focused command
passes 90 tests across form, hook, and routes:

```sh
rtk npm run test -- src/features/tracks/components/track-form.test.tsx src/features/tracks/hooks/use-track-form.test.tsx src/app/dashboard/routes.test.tsx
```

Read-only review found no issues. The initial follow-up combined check caught a
TypeScript error in the parameterized create/edit test's props; the fixture now
uses the discriminated mode/trackId pair. Production build, standalone lint,
and formatting passed. No database or runtime-contract changes were needed.

Final follow-up `rtk npm run check` passed **187 files / 1,932 tests**, including
database checks, WXT type generation, TypeScript, ESLint, and the full suite.
The production build contains the collapse fix in `dist/chrome-mv3`.

Passed follow-up commands:

```sh
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk proxy npx prettier --check src/features/tracks/components/track-form.tsx src/features/tracks/components/track-form.test.tsx src/features/tracks/hooks/use-track-form.ts src/features/tracks/hooks/use-track-form.test.tsx docs/product.md docs/testing.md docs/superpowers/specs/2026-10-02-track-editor-external-progress-design.md docs/superpowers/plans/2026-10-02-track-editor-phase-1.md docs/superpowers/handoffs/2026-10-02-track-editor-external-progress.md
rtk git diff --check
```

Implemented-component browser verification passed using:

```sh
rtk proxy node /private/tmp/track-editor-implemented-harness/serve.mjs
rtk proxy node /private/tmp/check-track-editor-collapse.cjs
```

The harness uses actual TrackForm, RouteModal, and app styles with extension
messaging and persistence mocked. Create/edit modes at 736px and 320px passed
click/Enter/Space collapse and reopen, header focus retention, all-closed Save
without changing groups/order, Rename reopening, and New Group opening with
title focus. No browser errors or horizontal overflow were recorded. Sandbox
restrictions initially blocked the local server and Chrome; the same commands
succeeded with approved escalation. An ambiguous temporary test locator was
corrected before the passing browser run. The server is stopped.

- [Collapsed desktop groups](/Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0faff-55d2-73b2-8f3c-51d28ee99646/track-editor-collapse-desktop.png)
- [Collapsed narrow groups](/Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0faff-55d2-73b2-8f3c-51d28ee99646/track-editor-collapse-mobile.png)

Human installed-extension smoke with visual proof remains pending before PR
review or merge. `rtk npm run zip` remains skipped because packaging behavior
is unchanged; `rtk npm run db:generate` was not repeated for the collapse fix
because it does not touch schema or persistence. Combined check includes
`rtk npm run db:check`.

## Initial Feature Completion Evidence

Final `rtk npm run check` passed **187 files / 1,928 tests**. It includes database
migration checks, WXT type generation, TypeScript, ESLint, and the full suite.
Final `rtk npm run build` and `rtk npm run format` passed. Production output is in
`dist/chrome-mv3`. The final editor/hook/route check passed 86 tests.

The combined check and production build were repeated after the release-metadata
rebase so the final artifact carries version 2.0.0.

Browser verification passed using:

```sh
rtk proxy node /private/tmp/track-editor-implemented-harness/serve.mjs
rtk proxy node /private/tmp/check-track-editor-implemented.cjs
```

The harness renders actual components and app styles, with runtime data mocked.
It covers create/edit at 736px and 320px, complete title wrapping, click/Enter/
Space menus, destination omission, Arrow/Home/End navigation, selection and
source focus, Escape/outside/Tab dismissal, above/below positioning, 30 scrolling
destinations, viewport shrinking with an offscreen anchor, external checkbox
preview/saved payload, and Library add/final-row fallback focus. No page errors
were recorded. The validation server is stopped.

Browser checks first exposed automatic suggestions obscuring the next group and
menu bounds escaping after viewport shrink. Retained component regressions now
cover both fixes, including intentional click to reopen an already focused
search. Independent quality review of these final changes found no actionable
bugs.

Task-local screenshots:

- [Desktop editor](/Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0faff-55d2-73b2-8f3c-51d28ee99646/track-editor-implemented-desktop.png)
- [Desktop Change menu](/Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0faff-55d2-73b2-8f3c-51d28ee99646/track-editor-implemented-desktop-menu.png)
- [Narrow editor](/Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0faff-55d2-73b2-8f3c-51d28ee99646/track-editor-implemented-mobile.png)
- [Narrow Change menu](/Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0faff-55d2-73b2-8f3c-51d28ee99646/track-editor-implemented-mobile-menu.png)
- [Many destinations](/Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0faff-55d2-73b2-8f3c-51d28ee99646/track-editor-implemented-mobile-many-groups.png)
- [New Track desktop](/Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0faff-55d2-73b2-8f3c-51d28ee99646/track-editor-implemented-create-desktop.png)
- [New Track narrow](/Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0faff-55d2-73b2-8f3c-51d28ee99646/track-editor-implemented-create.png)

These agent screenshots do not satisfy the human installed-extension smoke
requirement. The branch stays local for that smoke; no PR, merge, publication,
or store action was requested.
