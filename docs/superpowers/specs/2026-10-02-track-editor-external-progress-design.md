# Track Editor And External Progress Design

Status: approved by the user on 2026-10-02 after the Change button/menu revision.
Implementation follows the three phase plans linked below.

- [Vertical editor plan](../plans/2026-10-02-track-editor-phase-1.md)
- [Persistence and compatibility plan](../plans/2026-10-02-track-editor-phase-2.md)
- [External progress integration plan](../plans/2026-10-02-track-editor-phase-3.md)

## Request And Confirmed Direction

Improve the create/edit Track modal so selected questions remain readable,
groups and questions use a vertical layout, and the Library picker sits directly
above the questions. Replace the repeated group-name dropdown in each question
row with a compact **Change** button that opens a destination-group menu. The
user explicitly refined the design to use a button-triggered menu rather than a
persistent select field.

Add an optional per-track **Allow external progress** setting. The user confirmed
that it must continuously count both past and future successful solves from
anywhere in CogniPace, rather than copy existing progress once.

## Current Defect

`track-form.tsx` uses two equal-width editor panes. Each question row must fit an
order number, its title, a group dropdown up to 144 pixels wide, and three action
buttons inside one half-width pane. The controls consume the title's available
width. The dropdown displaying “Two Pointers” changes group assignment; it does
not edit the problem's taxonomy topics.

Both panes also reserve a fixed 320-pixel height, including for empty groups.
Existing DOM tests confirm title elements exist but cannot prove their rendered
width. Browser inspection at narrow widths is part of validation.

## Approach Choices

1. **Recommended: full-width stacked groups with one expanded group.** Group
   headers show their title and count; expanding a group puts its picker and
   questions immediately below it. This preserves context and gives titles the
   full modal width.
2. **Compact group list above a separate selected-group editor.** This also
   restores question width, but separates a group's header from its questions.
3. **Widen the existing two-pane modal.** This is a smaller layout change but
   still squeezes question titles at smaller widths and retains separate pane
   scrolling.

For external progress, derive completion from saved review evidence rather than
copying synthetic completions into every opted-in track. This supports past and
future solves, reversible opt-out, and review corrections without duplicating
global review history.

## Modal Layout And Interaction

- Keep the existing title, description, target date, and create-only active-track
  option. Place **Allow external progress** alongside these track options in both
  create and edit. New, seeded, imported, and existing tracks default to off.
- Replace the two panes with ordered, full-width group sections. Reuse the
  existing selected-group state so at most one section is expanded at a time.
  User-approved follow-up: clicking the expanded header collapses it, allowing
  all sections to be closed; choosing another section changes the editor context.
  Rename, New Group, and invalid-title Save explicitly open the relevant section.
- Each header shows the entire wrapping group title, count, and the existing
  rename, move-up, move-down, and remove-empty-group actions. Retain the rule that
  the last group and a nonempty group cannot be removed.
- Rename becomes an explicit header action that reveals the current group-title
  field. Invalid group titles reveal that field when Save is attempted.
- Put the searchable **Library problems** picker inside the expanded section,
  directly above its selected questions. Adding a result adds it to that group,
  clears the search, and returns focus to the picker. Questions already present
  anywhere in the track remain excluded.
- Each ordered question row shows its number, full wrapping question title, and
  difficulty when available. The title has priority over controls. At narrow
  widths, controls occupy a second line.
- Replace the repeated group title with a compact **Change** button and subtle
  chevron. Clicking it opens an anchored menu of destination groups. Use an
  accessible label such as “Change group for Two Sum”, `aria-haspopup="menu"`,
  and accurate expanded state. List full wrapping destination group titles,
  exclude the current group, and omit the button when there is only one group.
- Only one Change menu is open at a time. Enter or Space opens it and focuses
  the first destination. Arrow keys, Home, and End navigate destinations; Enter
  or Space moves the question and closes the menu. Moving keeps the source group
  selected and appends the question to the destination, matching the current
  reducer behavior. Return focus to the next available question control or the
  Library picker after moving, since the moved row leaves the selected group.
- Escape dismisses the menu before the modal handles Escape and returns focus
  to its Change button. Clicking outside or tabbing away dismisses the menu
  without moving a question. Do not intercept menu keyboard activation as form
  submission. Use existing button/menu patterns and avoid a new UI dependency.
- Position the menu below the button, aligned to its end edge, with collision
  handling to keep it inside the modal and visible viewport. Flip above when
  necessary. Long destination titles wrap; large destination lists scroll within
  the menu. Opening it overlays content without widening rows or squeezing
  question titles.
- Preserve reorder and remove-question actions and unique membership per track.
  Movement between groups preserves track-owned completion identity.
- Remove fixed editor-pane heights. The existing modal body owns vertical
  scrolling and retains the sticky Save/Cancel footer. No modal-shell redesign
  or new UI dependency is required.
- Apply the same editor to normal create, edit, and create-from-Library-selection.
  Preserve the latter's initial selection and grouping controls.

## External Progress Behavior

Checkbox helper: “Count successful solves from anywhere in CogniPace, including
earlier solves.” This uses local CogniPace history; it does not fetch LeetCode
account history.

When the option is off, new completion still comes only from that track's own
Study Plan progress. The linked-attempt correction rule below applies in either
mode so a corrected source cannot leave stale owned completion. When the option
is on, a track membership is complete when either:

1. that track has its own completed progress for the question; or
2. at least one saved global review for the same problem slug is rated `hard`,
   `good`, or `easy`.

External evidence applies to inactive tracks and Free Practice reviews as well
as Study Plan reviews. The successful attempt may predate track creation. A
newly added question immediately receives eligible historical credit. Adding or
removing a question still affects only its track membership.

- `again` alone never completes a question.
- A later, separate `again` review does not erase a previous successful solve.
- Correcting a successful attempt to `again` removes that attempt's external
  evidence. Another successful attempt, or track-owned completion, can still
  keep the question complete.
- Correcting an attempt from `again` to a successful rating grants external
  credit to every opted-in track containing that question.
- Reconcile existing track-owned rows linked to a corrected review attempt by
  attempt ID even if the user has switched to Free Practice or another active
  track. A correction updates only rows already controlled by that attempt; it
  does not create unrelated track progress or recreate progress deleted by
  reset. New owned completion retains its existing Study Plan gating. This
  closes the current mode-dependent correction gap needed for consistent source
  provenance, including in tracks with external progress off.
- Turning the option off removes only derived external credit. Existing
  track-owned progress remains. Turning it on again includes historical credit.
- Global practice reset removes review evidence, so externally credited
  completion disappears where no track-owned completion remains. Preserve the
  existing global-reset treatment of track-owned progress.
- Suspension does not erase historical completion. `Next` still excludes
  suspended questions and follows explicit group/problem order.
- Completed counts, percentages, membership completion, active-track guidance,
  popup guidance, and `Next` must use the same effective completion rule. Due
  review scheduling continues to use existing FSRS rules.
- Prefer track-owned completion as displayed provenance when both sources
  exist. Otherwise show the most recent eligible successful review, ordered by
  review timestamp and then attempt ID descending, as **External progress** in
  completion details.
  External completions are derived; they are not written into
  `track_problem_progress`.
- Place provenance in a small Tracks-owned completion line inside an expanded
  track problem row, before the shared problem details. Show **Completed in this
  track** or **External progress**, with the completion date and rating. Keep the
  existing compact Yes/No badge and generic Library problem-details component.
- The editor shows the count of selected questions eligible for external credit
  when the option is enabled. Eligibility comes from the background read model,
  not the latest Library practice status. Mark eligible question rows
  **Previously solved** while the option is on so the preview identifies them.

### Track Reset

Reset must still produce zero track completion. In the same transaction, delete
the track's own progress and turn **Allow external progress** off. When that
setting is enabled, the existing confirmation states: “This clears progress for
this track and turns off external progress. Your practice history is kept.”

Re-enabling the option intentionally restores historical credit. This avoids a
second persisted history cutoff and keeps reset behavior explicit.

## Ownership And Data Flow

- Tracks owns `allowExternalProgress`, effective completion, group editing, and
  track reset behavior. Add the boolean to the track domain model, runtime
  contracts, serializers, repository, and form draft.
- Practice owns reviews and FSRS scheduling. Read qualifying saved attempts as
  evidence; do not change scheduling or global practice writes.
- Resolve effective completion once through a shared Tracks rule/read helper.
  Use it for membership rows, catalog totals, active-track totals, and ordered
  Next selection, including the repository fallback path.
- Query review evidence in batches for relevant problem slugs; avoid a database
  query for each question or each opted-in track.
- The edit-source response includes validated eligible external-progress slugs
  for its available Library rows, allowing accurate draft preview counts after
  adding or moving questions.
- UI components keep draft state local and call existing feature API hooks.
  They do not import database repositories or calculate competing completion
  rules from practice status.
- Existing dashboard-only create/update/reset authorization remains. Parse the
  new boolean and response provenance through Zod at runtime boundaries.
- Save, review correction, practice reset, restore, and track mutation flows
  retain snapshot-flush-before-invalidation. Confirm `tracks` and `app-shell`
  refresh after any review evidence change, including while the track is
  inactive. Preserve the existing mutation queue and sync side effects.

## Persistence And Compatibility

Add `tracks.allow_external_progress` as a non-null boolean defaulting to false,
through an appended generated migration. Do not edit previously shipped SQL.

The current upgrade allowlist recognizes only the migration prefix through
`0007`. Before shipping the new migration, also recognize the exact currently
shipped prefix through `0008_topics_typed_relations.sql`. Validate each supported
snapshot against its exact original schema before applying only missing SQL.
Preserve the existing supported `0007` upgrade path, topic reconciliation,
integrity checks, staged publication, and recovery behavior. Failed or
unsupported upgrades must leave original storage available and must not seed a
replacement database. Preserve an existing recovery record.

Export full backups as version 5 with the track flag. Normalize versions 1–4
with the flag off and continue rejecting unknown future versions. Restore writes
the flag alongside tracks. Review attempts already carry external evidence;
derived completion needs no new backup table.

The existing sync envelope carries the versioned full backup. Preserve its
protocol, authorization, dirty-local checks, and overwrite rules. Older clients
that cannot read backup v5 reject the payload instead of silently discarding the
new setting. Content import keeps its v1 format: new imported tracks default
off, and re-importing an existing track preserves its setting.

## Phase Boundaries

After design approval, write phase-sized execution plans with the following
boundaries. Do not ship intermediate phases as a completed feature.

### Phase 1: Vertical Editor

Primary files: `src/features/tracks/components/track-form.tsx`, its component
tests, `src/features/tracks/hooks/use-track-form.test.tsx`, and
`src/app/dashboard/routes.test.tsx`.

Done when create/edit/Library-selection flows use full-width groups, the picker
sits immediately above questions, titles wrap visibly, Change/reorder/remove
work, and keyboard/save/error behavior remains usable.

### Phase 2: Persisted Setting And Preserving Upgrades

Primary files: `src/platform/db/schema/tracks.ts`, generated migration and
metadata, `src/platform/db/snapshot-upgrade.ts`, `src/platform/db/instance.ts`,
their persistence tests, `src/features/tracks/domain/track.ts`, Tracks
contracts/serializers/repository, and Backup contracts/repository/tests. Review
`src/platform/db/seed.ts`,
`src/features/tracks/data/track-import-repository.ts`, and
`src/features/imports/domain/plan-import-tracks.ts` for default and preservation
behavior. Include a backup-v5 round-trip regression in
`src/features/sync/server/sync-service.test.ts`.

Done when fresh installs and populated currently shipped snapshots preserve all
existing data, flags default off, create/update/restore persist the option,
backup v5 round-trips it, v1–v4 compatibility works, and unsupported snapshots
remain recoverable.

### Phase 3: Effective Progress And Editor Option

Primary files: `src/features/tracks/data/tracks-repository.ts`,
`src/features/tracks/server/tracks-service.ts`,
`src/features/tracks/api/tracks-contracts.ts`,
`src/features/tracks/hooks/use-track-form.ts`,
`src/features/tracks/components/track-form.tsx`,
`src/features/tracks/components/track-actions.tsx`, and
`src/features/tracks/components/track-problem-table.tsx`, with focused tests.
Review Practice workflow, background invalidation, app-shell guidance, and
queue/track integration tests for cross-surface effects. The correction change
belongs in `src/features/practice/server/practice-review-workflow.ts`, with
integration coverage in
`src/features/practice/practice-core.integration.test.ts`.

Done when opted-in tracks count past/future successful reviews consistently,
default-off tracks remain independent, corrections/disable/reset are predictable,
preview and provenance are accurate, and automated checks plus human smoke
proof cover the completed feature. Update current product, architecture, and
testing documentation in this phase.

## Validation Plan

Run focused editor, hook, and route tests before full checks:

```sh
npm run test -- src/features/tracks/components/track-form.test.tsx src/features/tracks/hooks/use-track-form.test.tsx src/app/dashboard/routes.test.tsx
```

Run focused persistence, contract, repository, service, and integration tests
as their phases land, including new tests for effective completion:

```sh
npm run test -- src/features/tracks/data/tracks-repository.test.ts src/features/tracks/server/tracks-service.test.ts src/features/tracks/api/tracks-contracts.test.ts src/features/practice/server/practice-progress-service.test.ts src/features/practice/practice-core.integration.test.ts src/features/queue/queue-track-independence.integration.test.ts
npm run test -- src/platform/db/snapshot-upgrade.test.ts src/platform/db/instance.test.ts src/platform/db/open-snapshot.test.ts src/testing/db-foundation.test.ts src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/tracks/data/track-import-repository.test.ts
npm run test -- src/features/sync/server/sync-service.test.ts src/extension/background/register-handlers.test.ts
```

Required combined matrix:

```sh
npm run db:generate
npm run db:check
npm run lint
npm run check
npm run build
npm run format
```

Meaningful test cases include multiple opted-in/off tracks sharing a question,
past success, future Free Practice success, later failure, correction of the
only success versus one of several successes, flag toggling, track reset,
global reset, group moves, remove/re-add, inactive tracks, suspension, ordered
Next, data-preserving upgrade, rejected upgrade, backup round trips, old backups,
and content-import preservation.

Human realtime smoke and screenshot/recording proof remain required before PR
review or merge. Cover populated and empty create/edit modals, many groups, long
titles, narrow windows and 200% zoom, keyboard search/Change controls, menu
placement and Escape/outside dismissal, adding and moving questions,
validation/pending/error states, past/future external credit,
corrections, toggle/reset behavior, popup/dashboard/overlay refresh, and reload
persistence. The mockup is design evidence, not implemented-application proof.

## Review And Release

Suggested implementation PR title:
`feat(tracks): improve editor and allow external progress`.

No issue has been created; this work originates from the user's direct request.
Record exact commands run and skipped, remaining validation risks, human smoke
status, and upgrade/backup compatibility in the implementation handoff. The
schema and backup change means rollback must retain recovery data and must not
claim automatic downgrade support.

## Proposal Validation Status

Run successfully for this design-only change:

```sh
rtk proxy npx prettier --write docs/superpowers/specs/2026-10-02-track-editor-external-progress-design.md
rtk proxy npx prettier --check docs/superpowers/specs/2026-10-02-track-editor-external-progress-design.md
```

The separate interactive design mockup passed browser checks at 736px and 320px:
no horizontal overflow, readable wrapping titles, create/edit states, external
credit preview, Library search/add, question move/reorder/remove, group
select/rename/reorder/add, empty-group removal, disabled nonempty/last-group
removal, keyboard controls, Save, and Close/reopen. No browser errors were
observed. These checks ran against the mockup, not the extension:

The button-triggered Change menu refinement also passed focused checks for
opening with click/Enter/Space, current-group omission, first-item focus,
Arrow/Home/End navigation, selecting a destination and moving focus to the next
source row, Escape/outside/Tab dismissal, upward placement near the viewport
edge, bounded scrolling for long destination lists, and menu bounds at both
736px and 320px without row reflow. The same preview-render and browser-check
commands below were used.

```sh
rtk proxy python3 /Users/tobiolutimehin/.codex/plugins/cache/openai-bundled/visualize/1.0.45/skills/visualize/scripts/render.py /Users/tobiolutimehin/.codex/visualizations/2026/10/02/01a0faff-55d2-73b2-8f3c-51d28ee99646/track-editor.html /private/tmp/track-editor-preview.html --force
rtk proxy node /private/tmp/check-track-editor.cjs
```

Not run because application implementation awaits design approval:

```sh
npm run test -- src/features/tracks/components/track-form.test.tsx src/features/tracks/hooks/use-track-form.test.tsx src/app/dashboard/routes.test.tsx
npm run test -- src/features/tracks/data/tracks-repository.test.ts src/features/tracks/server/tracks-service.test.ts src/features/tracks/api/tracks-contracts.test.ts src/features/practice/server/practice-progress-service.test.ts src/features/practice/practice-core.integration.test.ts src/features/queue/queue-track-independence.integration.test.ts
npm run test -- src/platform/db/snapshot-upgrade.test.ts src/platform/db/instance.test.ts src/platform/db/open-snapshot.test.ts src/testing/db-foundation.test.ts src/features/backup/api/backup-contracts.test.ts src/features/backup/data/backup-repository.test.ts src/features/tracks/data/track-import-repository.test.ts
npm run test -- src/features/sync/server/sync-service.test.ts src/extension/background/register-handlers.test.ts
npm run db:generate
npm run db:check
npm run lint
npm run check
npm run build
npm run format
```

Human application smoke and visual proof are pending implementation. No runtime,
persistence, or implemented-UI correctness is claimed by this proposal.
