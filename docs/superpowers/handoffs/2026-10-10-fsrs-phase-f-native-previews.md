# FSRS Phase F: Native Four-Rating Previews Handoff

Status: implementation and independent SPEC and Ponytail QUALITY reviews are
complete. Automated validation is recorded below. Human installed-extension
happy-path and edge-case smoke with screenshots or a recording remains
**pending** before PR review or merge.

Branch: `codex/fsrs-phase-f-previews`, from `origin/main` at Phase E merge
`21b190ff`. The predecessor [Phase E handoff](./2026-10-10-fsrs-phase-e-daily-scheduling.md)
still records human proof as pending. Phase F follows the
[reviewed plan](../plans/2026-10-10-fsrs-phase-f-native-previews.md).

## Result

- The FSRS facade calls native `repeat()` once for all four ratings using the
  validated card, event time and exact profile. Save/Update continue to call
  native `next()`. Submit uses the current card or the same initial card as
  Save, current saved retention, the active daily profile and captured preview
  time. The configured 180-day maximum remains native; ordered outcomes may
  reach 183 days and are never clamped.
- Update checks the live generation, exact latest attempt and revision, then
  uses its original pre-card, event time and recorded profile. Supported older
  context is labeled `legacy-derived`; ambiguous evidence returns unavailable.
  Current Settings cannot replace a captured historical profile. Past study
  dates remain past. Neither context inserts a card, attempt, profile, receipt,
  generation or track credit.
- Practice returns both raw `dueAt` and the existing study-day eligibility
  date. The day count is the difference in local calendar dates between the
  simulated review and that eligibility date, including midnight and daylight
  saving transitions. A content-script-only Zod-validated runtime read
  serializes its read transaction through the background database gate so it
  cannot overlap a Save/Update transaction on the shared SQLite connection.
  The read does not flush, mark sync dirty or broadcast invalidation.
- Existing Overlay rating buttons show concise dates/day counts and accessible
  descriptions. Loading, unavailable, failed and past-date states are explicit.
  Locked grades retain their existing lock. Query identity covers the problem,
  generation, original Update target and session epoch; Restart, SPA navigation,
  conflicts and Practice/Settings invalidation refresh or retire estimates.
  Preview never changes the selected draft or accepted command, and a failed
  estimate does not block a valid review.
- No schema, migration, permission, backup, sync format, backend, Queue or
  Analytics change was needed. Phase G capacity work and Phase H personalization
  remain separate.

## Independent review and repairs

The independent SPEC review requested full captured Update rating/retention
parity, explicit calendar boundary tests, runtime sender/read-side-effect proof,
and SPA navigation/Retry supersession tests. Those regressions were added. The
Ponytail QUALITY review found that a read transaction outside the shared
background queue could collide with Save/Update. The preview handler now uses
the same database gate without invoking the mutation workflow; a focused test
holds a preview open and verifies Save waits, then checks that only Save causes
flush, dirty sync marking and invalidation. Ambiguous legacy context is also
covered without writes.

## Automated validation

The final `rtk npm run check` passed database verification, TypeScript, ESLint
and 3,819 tests, with nine existing skips across 248 files. The Chrome MV3
production build and whole-repo/touched-Markdown Prettier checks passed. The
build emitted its existing large-chunk warning. Focused tests also
passed for native all-state/cap parity, Practice read purity and Submit/Update
parity, calendar boundaries, runtime sender policy and serialization, and
Overlay async lifecycle and UI. Exact commands run:

```sh
rtk npm run test -- src/lib/fsrs/scheduler/review-scheduler.test.ts
rtk npm run test -- src/extension/background/register-handlers.test.ts src/features/practice/domain/practice-schedule.test.ts
rtk npm run test -- src/features/practice/practice-command.integration.test.ts src/features/overlay-session/hooks/use-overlay-review-preview.test.tsx
rtk npm run test -- src/features/practice/practice-command.integration.test.ts
rtk npm run test -- src/features/practice/practice-command.integration.test.ts src/features/practice/practice-core.integration.test.ts src/features/overlay-session/domain/overlay-session-state.test.ts src/lib/fsrs/index.test.ts
rtk npm run typecheck
rtk npm run db:check
rtk npm run lint
rtk npm run check
rtk npm run build
rtk npm run format
rtk proxy ./node_modules/.bin/prettier --ignore-path /dev/null --check docs/product.md docs/architecture.md docs/testing.md docs/superpowers/plans/2026-10-03-fsrs-remediation.md docs/superpowers/plans/2026-10-10-fsrs-phase-f-native-previews.md docs/superpowers/README.md docs/superpowers/handoffs/2026-10-10-fsrs-phase-f-native-previews.md
rtk git diff --check
```

The first full `rtk npm run check` failed three tests: an all-ratings Practice
parity test exceeded Vitest's five-second per-test limit under full-suite
parallel load, the FSRS public facade export list lacked the new function, and
an Overlay reducer test required an unchanged context refresh to preserve
object identity. The parity test now has a 20-second bound, the export list is
updated, and the reducer returns its prior state when the preview generation
is unchanged or an acknowledged review owns the context. The affected focused
suites passed 72 tests; the subsequent full check passed. The suite emitted
jsdom's existing `Window.scrollTo()` not-implemented notices without failures.

`rtk npm run db:generate` is skipped because the schema and migrations are
unchanged. `rtk npm run zip` is skipped because the extension package format
and release artifact are unchanged. The required human installed-extension
smoke and visual proof are pending; automated checks do not substitute for it.

## Human smoke and rollback

The human engineer must run the installed-extension steps in
[`docs/testing.md`](../../testing.md) under “Phase F Four-Rating Preview Smoke”
and attach redacted screenshots or a recording before PR review or merge. The
steps cover new Submit at 90%/75%, original-profile Update after Settings
change, supported and ambiguous legacy evidence, a past date, midnight/DST,
locked grades, slow/error previews, pending Retry, Restart/navigation, and
proof that preview reads do not create review or sync effects. Phase E's
predecessor smoke evidence must also be verified separately. Keep the PR draft
until the proof is supplied and reviewed.

For rollback, restore the prior extension build. The preview made no storage
schema or data conversion, and existing cards, evidence, due dates and
accepted review commands remain readable.
