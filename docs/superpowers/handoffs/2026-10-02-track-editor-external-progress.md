# Track Editor And External Progress Handoff

PR: https://github.com/Hollowvyn/Cognipace/pull/180 (draft)

Branch: `codex/track-editor-external-progress`, based on `origin/main` at
`f3e6d73`. The user approved the Change button/menu design and Section headers
refinement, then requested independent group collapse and this simplification.

## Details

Create/edit uses full-width group sections, complete wrapping question titles,
explicit rename, and a Library picker above each expanded group's questions.
Shaded bold group headers distinguish topics from flat divided question rows.
Every group can collapse; Rename, New Group, and invalid-title Save explicitly
open the relevant group. Collapse never changes saved groups or questions.
Change opens an anchored destination menu with keyboard navigation, viewport
bounds, dismissal, and useful focus after moving a question.

Allow external progress defaults off and continuously counts saved successful
reviews from anywhere in CogniPace, including past and future history. Owned
completion takes precedence; external credit is derived without ledger writes.
Rows, totals, and Next share effective completion; details show provenance.
Corrections update existing attempt-linked ledger entries across mode and
active-track changes. Reset clears owned progress and disables the option while
retaining practice history.

Migration 0009 appends the boolean without modifying shipped SQL. Exact v7/v8
baselines upgrade while retaining their originals in separate recovery slots.
Backup v5 requires the setting, v1-v4 normalize it to false, and content import
v1 preserves existing settings while new tracks default off.

The simplification removes the question-list forwarding wrapper, unused field
props and summary variants, and an intermediate backup parse. Strict legacy
input parsing and final v5 validation remain. The three repository screenshots
were removed at the user's request. The PR description remains unchanged; its
image links reference the earlier commit.

## Issue

No issue: direct user-requested work with an approved design and phase plans.

## Validation

Final simplification validation passed **187 files / 1,932 tests**, including
migration checks, WXT type generation, TypeScript, and ESLint. Production build,
formatting, 90 editor tests, 117 backup/sync tests, and 12 browser cases passed.

Commands run across the feature and follow-ups:

```sh
rtk npm ci
rtk npm run db:generate
rtk npm run db:check
rtk proxy npx tsc --noEmit
rtk npm run typecheck
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk git diff --check
rtk proxy npx prettier --write src/features/tracks/components/track-form.tsx
rtk proxy npx prettier --write src/features/backup/api/backup-contracts.ts docs/superpowers/handoffs/2026-10-02-track-editor-external-progress.md
rtk npm run test -- src/features/tracks/components/track-form.test.tsx src/features/tracks/hooks/use-track-form.test.tsx src/app/dashboard/routes.test.tsx
rtk npm run test -- src/features/tracks/api/tracks-contracts.test.ts src/features/tracks/data/tracks-repository.test.ts src/features/tracks/server/tracks-service.test.ts src/features/practice/practice-core.integration.test.ts src/features/queue/queue-track-independence.integration.test.ts src/extension/background/register-handlers.test.ts
rtk npm run test -- src/features/tracks/components/track-problem-table.test.tsx src/features/tracks/components/track-actions.test.tsx src/features/tracks/data/tracks-repository.test.ts src/extension/background/register-handlers.test.ts
rtk npm run test -- src/features/practice/practice-core.integration.test.ts src/extension/background/register-handlers.test.ts src/features/tracks/api/tracks-api.test.tsx
rtk npm run test -- src/platform/db/snapshot-upgrade.test.ts src/platform/db/instance.test.ts src/platform/db/open-snapshot.test.ts src/testing/db-foundation.test.ts src/features/tracks/data/track-import-repository.test.ts src/features/imports/domain/import-plan.test.ts src/features/imports/server/import-service.test.ts
rtk npm run test -- src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/backup/server/backup-service.test.ts src/features/backup/components/data-management-screen.test.tsx src/features/sync/server/sync-service.test.ts src/features/sync/domain/sync-envelope.test.ts
rtk npm run test -- src/platform/db/instance.test.ts src/platform/db/snapshot-state.test.ts src/platform/db/snapshot-upgrade.test.ts src/platform/db/open-snapshot.test.ts
rtk proxy npx prettier --check src/features/tracks/components/track-form.tsx src/features/tracks/components/track-form.test.tsx src/features/tracks/hooks/use-track-form.ts src/features/tracks/hooks/use-track-form.test.tsx docs/product.md docs/testing.md docs/superpowers/specs/2026-10-02-track-editor-external-progress-design.md docs/superpowers/plans/2026-10-02-track-editor-phase-1.md docs/superpowers/handoffs/2026-10-02-track-editor-external-progress.md
rtk proxy npx prettier --check src/features/tracks/components/track-form.tsx docs/product.md docs/testing.md docs/superpowers/specs/2026-10-02-track-editor-external-progress-design.md docs/superpowers/plans/2026-10-02-track-editor-phase-1.md docs/superpowers/handoffs/2026-10-02-track-editor-external-progress.md
```

Initial TDD runs failed for the new setting, history, correction/reset policy,
menu/rename, backup, migration, and collapse cases before implementation. During
concurrent edits, typecheck, lint, format, and backup fixtures had transitional
failures; all were repaired before the final passing commands. Existing jsdom
`Window.scrollTo` notices and the build's large-chunk warning remain nonfatal.
Independent spec, source-quality, and simplification reviews found no issues.

### Browser Proof

The actual TrackForm, RouteModal, and app styles were exercised with extension
messaging and persistence mocked. Final hierarchy proof covered 12 cases:
create/edit in light/dark at 736px/320px modal widths, plus edit in both themes
and widths at 200% root text scaling. It checked complete titles, typography,
header/row distinction, control bounds, Change positioning/focus, Library
suggestions, collapse by click/Enter/Space, Rename/New Group, and closed Save
payloads. No browser errors or corrective CSS were present.

Earlier menu proof also covered destination omission, Arrow/Home/End selection,
Escape/outside/Tab dismissal, source focus, above/below positioning, 30 scrolling
destinations, viewport shrink with an offscreen anchor, external-progress
preview/payload, and Library add/final-row fallback focus. Browser regressions
for obscuring suggestions and escaped menu bounds are retained in component
tests. Large-text fixes constrain the form column, wrap the group header, and
bound title width. At 200% text scaling, 800px/384px viewports preserve
736px/320px modals after outer rem padding doubles; browser zoom was not tested.

```sh
rtk proxy node /private/tmp/track-editor-implemented-harness/serve.mjs
rtk proxy node /private/tmp/check-track-editor-implemented.cjs
rtk proxy node /private/tmp/check-track-editor-collapse.cjs
rtk proxy node /private/tmp/diagnose-track-editor-hierarchy-scaling.cjs
rtk proxy node /private/tmp/check-track-editor-hierarchy.cjs
```

Sandbox restrictions initially blocked the local server and Chrome; the same
commands succeeded with approved escalation. A temporary ambiguous locator was
corrected before passing. The server is stopped. Agent component proof does not
replace human installed-extension smoke.

### Skipped Validation And Human Smoke

- `rtk npm run zip`: packaging is unchanged; production build is covered. No
  release or store upload was requested.
- `rtk npm run db:generate` was not repeated for collapse, styling, or
  simplification: no schema changes. `rtk npm run check` includes `db:check`.
- Human realtime installed-extension happy-path and edge-case smoke with
  screenshots/recording remains pending before PR review or merge, as required
  by `docs/agent-governance.md`.

Use the **Vertical Track Editor And External Progress** flow in
[`docs/testing.md`](../../testing.md). Reload `dist/chrome-mv3` in a disposable
profile for reset/restore cases.

- [ ] Create/edit at desktop and 320px; full titles, rename, Library add, order,
      group removal, invalid title reveal, independent collapse by click/Enter/
      Space, and closed Save without losing questions.
- [ ] Distinct headers/questions in light/dark at 200% text scaling; controls,
      Library suggestions, and Change menus fit.
- [ ] Change by mouse/keyboard; full destinations, Escape/Tab/outside dismissal,
      source focus, footer flip/scroll, and final-source-question focus.
- [ ] Past and future solves count when enabled; save/reopen, toggle off/on,
      provenance, totals, Next, and popup agree. Check inactive tracks, Free
      Practice, later separate Again, and corrections falling back to history.
- [ ] Owned correction after mode/active-track changes, no resurrection after
      reset, suspension, and whole-track ordering.
- [ ] Track reset retains history and disables external credit; re-enable
      restores credit. Global reset removes question evidence.
- [ ] v5 export/restore, v1-v4 default-off restore, additive import preserving
      existing true/new false, and configured authorized Gist sync v5.
- [ ] Historical v7/v8 upgrade retains data and both recovery copies;
      same-original retry and conflicting-original retention.
- [ ] Attach human happy-path and edge-case proof before PR review or merge.

## Risk, Release, And Recovery

Feature release impact: visible UI, local persisted shape, and derived Track
progress. No permissions, runtime methods, auth, secret handling, sync envelope,
network behavior, or sync orchestration were expanded. Zod parsing, sender
checks, practice/track invalidation, and app-shell refresh remain. Sync carries
v5 backups; clients that only understand v4 reject v5.

Unknown fingerprints and conflicting originals fail closed. Existing data does
not reset automatically. Preserve both recovery keys and export v5 before
rollback. Older builds cannot read the new fingerprint or v5 backup; use a
compatible pre-upgrade original/export or retain the new build to export data.
Never rewrite shipped SQL or discard recovery copies to force a downgrade.
No merge, release publication, or store action was requested.
