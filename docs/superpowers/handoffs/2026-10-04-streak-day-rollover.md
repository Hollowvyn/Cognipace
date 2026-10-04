# fix(practice): preserve streak until a local day fails

## Problem and change

The shared Practice calculation started at today unconditionally, returning 0
before today's goal was met. Domain and service tests explicitly enforced that
incorrect behavior. The calculation now starts at yesterday when today is
unfinished, preserving earned consecutive goal-met days. Completing today's
goal extends the streak; a missed past day still breaks it.

The popup, Overview, and Analytics consume this shared value. No persisted
shape, permissions, runtime contract, scheduling, sync, or cache logic changed.
Patch release impact; rollback is reverting the domain change and tests.

## Validation

Commands below were run with the required `rtk proxy` shell prefix.

- `npm ci`: passed; install reported deprecated packages, dependency audit
  findings (1 low, 6 moderate, 1 high), and unapproved dependency install
  scripts. No dependencies or lockfile were changed.
- `npm run prepare:wxt`: passed. The first focused test invocation could not
  load `.wxt/tsconfig.json`; preparation resolved this fresh-worktree setup issue.
- `npx vitest run src/features/practice/domain/practice-progress.test.ts src/features/practice/server/practice-progress-service.test.ts`:
  before the fix, 7 failures and 19 passes reproduced the faulty rule;
  after the fix, all 26 tests passed.
- `env TZ=America/New_York npx vitest run src/features/practice/domain/practice-progress.test.ts src/features/practice/server/practice-progress-service.test.ts`:
  all 26 tests passed, supplementing the host UTC run.
- `npm run lint`: passed.
- `npm run check`: passed, including DB checks, WXT preparation, TypeScript,
  ESLint, and all 2,177 tests in 195 files. The suite emitted jsdom
  `Window.scrollTo` unimplemented warnings.
- `npm run build`: passed with the bundler's large-chunk warning.
- `npx prettier --write src/features/practice/domain/practice-progress.ts src/features/practice/domain/practice-progress.test.ts src/features/practice/server/practice-progress-service.test.ts docs/product.md docs/testing.md docs/superpowers/specs/2026-10-04-streak-day-rollover-design.md docs/superpowers/plans/2026-10-04-streak-day-rollover.md`:
  passed for maintained files; the repository Prettier ignore excludes planning
  artifacts, formatted separately below.
- `npx prettier --ignore-path /dev/null --write docs/superpowers/specs/2026-10-04-streak-day-rollover-design.md docs/superpowers/plans/2026-10-04-streak-day-rollover.md`:
  passed.
- Final formatting and whitespace verification are recorded in the chat.

No required automated validation command was skipped. `npm run db:generate`
and `npm run zip` are outside this change's validation categories: no schema
or packaging behavior changed.

## Human proof pending

The human engineer must complete `docs/testing.md`'s Streak Day Rollover flow
before review or merge. Confirm zero and partial progress preserve yesterday's
streak, reaching the goal adds one, and empty/partial missed days break the
streak after midnight across popup, Overview, and Analytics. Attach screenshots
or a recording. Automated calculation tests do not establish real-time surface
refresh or installed-extension proof.
