# Remove Overlay Structured Log Implementation Plan

> Execute inline using `superpowers:executing-plans`, task by task.

**Goal:** Remove structured-log editing from the overlay and preserve saved data.

**Architecture:** Overlay-session owns the removed UI, state, and handlers.
Practice retains historical log persistence and compatibility contracts. Review
writes omit `log`; rating dirty state compares only the selected and saved rating.

**Tech Stack:** Existing React, TypeScript, Vitest, and WXT.

## Task 1: Regression coverage

- [x] Update `src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx`
      to assert Help remains and all five labels plus Structured Log are absent.
- [x] Update `src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx`
      to assert save and override payloads have no `log`, and collapse/dock never call
      the removed log-editing mutation, including with historical notes.
- [x] Run `npm test -- src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx --run`
      and confirm the new removal assertion fails before implementation.

## Task 2: Remove overlay machinery

- [x] Delete `domain/overlay-draft.ts`, `hooks/use-overlay-draft.ts`, and
      `components/modes/expanded/overlay-log-fields.tsx` in overlay-session.
- [x] Remove draft state/actions and exports in `domain/overlay-session-state.ts`
      and `domain/index.ts`. Use
      `return state.selectedRating !== state.submittedSession.rating` for submitted
      dirty state after the existing no-session guard.
- [x] Remove draft hydration/controller and view props from
      `hooks/use-leetcode-overlay-session.ts`, `components/overlay-shell.tsx`, and
      `components/modes/expanded/expanded-overlay.tsx`.
- [x] Remove draft persistence and `log` entries from
      `hooks/use-overlay-review-actions.ts`. Remove the unused AI draft flag in
      `domain/session-context.ts` and the internal request contract.
- [x] Adapt reducer, context, shell, and session tests to the reduced state.
      Keep navigation-race, assessment, timer, and rating coverage.
- [x] Verify historical logs remain with the practice integration suite.

## Task 3: Documentation and verification

- [x] Update `docs/product.md`, `docs/architecture.md`, and `docs/testing.md`.
- [x] Run `npm test -- src/features/overlay-session src/features/practice/practice-core.integration.test.ts --run`.
- [x] Run `npm run lint`, `npm run check`, and `npm run build`.
- [x] Run `npx prettier --check` on every touched file.
- [x] Record exact results and pending human smoke: submit/fail, rating update,
      collapse/dock/restore, navigation, old notes, and backup restore preservation.

Done when the form and its overlay machinery are gone, automated checks pass,
and human smoke requirements are documented honestly. No migration is needed.

## Handoff

Suggested PR title: `feat(overlay)!: remove structured-log editing`

### Details

Remove all five structured-log fields and their overlay draft state, controller,
hydration, dirty tracking, and persistence handlers. Review save and override
requests omit log patches. Existing saved logs, review history, FSRS scheduling,
track progress, backup contracts, and sync behavior are preserved. The standalone log-editing endpoint and the unused AI draft flag are removed. No schema migration,
permission change, or local data reset is needed.

### Issue

No issue: direct user request and approved scope in this chat.

### Testing

Commands run (through the repository-required `rtk` wrapper):

- `npm test -- src/features/overlay-session/components/modes/expanded/expanded-overlay.test.tsx --run`:
  expected initial regression failure; 1 failed, 9 passed before removal.
- `npm test -- src/features/overlay-session --run`: initially 1 obsolete log
  assertion failed, 120 passed; corrected to assert payload omission.
- `npm test -- src/features/overlay-session src/features/practice/practice-core.integration.test.ts --run`:
  first run exposed an incorrect new test assumption about the repository return
  type; corrected to read practice details after override. Final run: 145 passed.
- `npm run lint`: passed.
- `npm run check`: passed DB checks, WXT type generation, TypeScript, lint,
  and all 1,871 tests across 185 files. JSDOM emitted scrollTo notices.
- `npm run build`: passed; existing large-chunk advisory emitted.
- `npx prettier --ignore-path /dev/null --check src/features/overlay-session src/features/practice/practice-core.integration.test.ts docs/product.md docs/architecture.md docs/testing.md CONTRIBUTING.md docs/superpowers/specs/2026-10-02-remove-overlay-structured-log-design.md docs/superpowers/plans/2026-10-02-remove-overlay-structured-log.md`:
  passed. The explicit ignore override includes planning documents normally
  excluded by the repository Prettier ignore list.
- `git diff --check`: passed.

Skipped commands:

- `npm run db:generate`: no schema change; `db:check` ran inside `npm run check`.
- `npm run zip`: no packaging or artifact configuration change; production
  extension build passed.

Human Chrome smoke remains pending; automated checks do not replace it:

- [ ] Happy path: timer, submit, rating-only Update, next guidance, and
      cross-surface refresh. Verify the form is absent.
- [ ] Edge cases: untimed submit, failed/locked attempt, collapse/dock/restore,
      SPA navigation, historical log preservation, and older backup restore.
- [ ] Existing Help title and slug-fallback flows.

### Screenshots

Pending human screenshot or recording proof for the happy path and edge cases
above, required before PR review or merge by `docs/agent-governance.md`.

### Release and recovery

The feature removal is a user-visible breaking change; the suggested PR title
marks that explicitly. Stored data and backup formats remain compatible.
Rollback restores the overlay UI/state code; no database recovery is required.
The remaining risk is real-browser layout and workflow behavior until the human
smoke checklist in `docs/testing.md` is completed. Open as a draft PR until that
proof is attached; no merge is authorized.

## Approved ponytail cleanup follow-up

Apply inline to the same PR. Approved in chat on 2026-10-02.

- [x] Remove the standalone current-log editing API and mutation hook from
      `src/features/practice/api/practice-api.ts`; remove its request schema/type
      from `api/practice-contracts.ts`, exports from `index.ts`, input type from
      `domain/practice.ts` and `domain/index.ts`, service from
      `server/practice-service.ts`, and public/private log-only writers from
      `data/practice-repository.ts`.
- [x] Remove the endpoint from `src/extension/messaging.ts`,
      `background/register-handlers.ts`, `background/runtime-policy.ts`, and
      its old policy allow-test. Keep generic policy coverage tests.
- [x] Delete the two standalone-editor integration tests. In the preservation
      test and `src/features/app-shell/server/app-shell-service.test.ts`, insert
      legacy `problemPractice` rows directly with status `new`, historical notes,
      and required timestamps; keep save/override/read preservation assertions.
- [x] Remove the unused AI draft flag from overlay session types/derivation,
      the assistant runtime schema, fixtures, and tests. Delete its dedicated test.
- [x] Remove the old mutation mock/setup/assertion in overlay session tests;
      assert `sendMessage` has no calls when collapsing or docking instead.
- [x] Update architecture and this approved spec/plan to describe the final state.
- [x] Run `npm test -- src/features/overlay-session src/features/practice/practice-core.integration.test.ts src/features/app-shell/server/app-shell-service.test.ts src/features/leetcode-review-assistant src/extension/background/runtime-policy.test.ts src/extension/background/register-handlers.test.ts --run`.
- [x] Run `npm run lint`, `npm run check`, `npm run build`, and Prettier on
      touched files. Search active code for removed symbols and review the diff.
- [x] Commit, push, and update draft PR #175 with exact results; human smoke and
      screenshots remain pending. Preserve schema, backups, sync, and historical
      log read/preservation coverage.

### Follow-up validation and review

- `npm test -- src/features/overlay-session src/features/practice/practice-core.integration.test.ts src/features/app-shell/server/app-shell-service.test.ts src/features/leetcode-review-assistant src/extension/background/runtime-policy.test.ts src/extension/background/register-handlers.test.ts --run`: 321 tests passed across 23 files.
- `npm run lint`: passed.
- `npm run check`: passed database check, TypeScript, lint, and 1,868 tests
  across 185 files. Three tests for deleted behavior were removed.
- `npm run build`: passed, with the existing large-chunk advisory.
- `npx prettier --ignore-path /dev/null --check docs/architecture.md docs/superpowers/plans/2026-10-02-remove-overlay-structured-log.md docs/superpowers/specs/2026-10-02-remove-overlay-structured-log-design.md src/extension/background/register-handlers.test.ts src/extension/background/register-handlers.ts src/extension/background/runtime-policy.test.ts src/extension/background/runtime-policy.ts src/extension/messaging.ts src/features/app-shell/server/app-shell-service.test.ts src/features/leetcode-review-assistant/api/runtime-contracts.test.ts src/features/leetcode-review-assistant/api/runtime-contracts.ts src/features/leetcode-review-assistant/testing/recommendation-fixtures.ts src/features/overlay-session/domain/session-context.test.ts src/features/overlay-session/domain/session-context.ts src/features/overlay-session/hooks/use-leetcode-overlay-session.test.tsx src/features/practice/api/practice-api.ts src/features/practice/api/practice-contracts.ts src/features/practice/data/practice-repository.ts src/features/practice/domain/index.ts src/features/practice/domain/practice.ts src/features/practice/index.ts src/features/practice/practice-core.integration.test.ts src/features/practice/server/practice-service.ts`: passed.
- `git diff --check`: passed.
- `rg -n 'updateCurrentLog|UpdateCurrentLog|UpdatePracticeLog|updateCurrentPracticeLog|useUpdateCurrentPracticeLog|currentDraftHasChanges|updatePracticeLog\(' src docs/architecture.md docs/product.md docs/testing.md`:
  no matches (exit 1, expected).

The follow-up removes a net 245 lines from source/tests. Persisted schema and
backup contracts are unchanged; legacy log fixtures and preservation coverage
remain. Historical dated planning artifacts are intentionally retained.

Skipped `npm run db:generate` because no schema changed, and `npm run zip`
because no packaging configuration changed. Human Chrome smoke and screenshots
remain pending as listed above. The PR stays draft until that proof is attached.
