# Streak Day Rollover Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this
> focused plan in the current chat.

**Goal:** Preserve the earned streak until a local day actually fails.

**Architecture:** Change the Practice domain calculation, shared by the popup,
Overview, and Analytics. Use the existing local-calendar previous-day helper.

**Tech Stack:** TypeScript and Vitest; existing SQLite service integration tests.

## Task 1: Reproduce and correct the calculation

- [x] Update `src/features/practice/domain/practice-progress.test.ts` and
      `src/features/practice/server/practice-progress-service.test.ts` to expect
      the earned streak before today's goal is met. Add local-midnight,
      partial-goal, goal-completion, missed-day, and calendar-boundary cases.
- [x] Run `npx vitest run src/features/practice/domain/practice-progress.test.ts src/features/practice/server/practice-progress-service.test.ts`.
      Confirm preservation cases fail with expected positive streak versus 0.
- [x] In `src/features/practice/domain/practice-progress.ts`, initialize the
      streak cursor with:

      ```ts
      let dateKey = input.todayDateKey
      if (readCompletedCount(input.problemSlugsByDateKey, dateKey) < input.dailyGoal) {
        dateKey = readPreviousDateKey(dateKey)
      }
      ```

      Keep the existing consecutive-day loop and disabled-goal guard.

- [x] Rerun both focused test files. Expect all tests to pass.

## Task 2: Document and validate

- [x] Document the rule in `docs/product.md` and a human smoke checklist in
      `docs/testing.md`: yesterday's earned streak survives a new unfinished
      day, meeting today's goal adds one, and a fully missed day resets it.
      Check popup, Overview, and Analytics and capture screenshots/recording.
- [x] Run `npx prettier --write` on all touched files.
- [x] Run `npm run lint`, `npm run check`, and `npm run build`.
- [x] Inspect `git diff --check` and the final diff. Record exact commands,
      results, remaining human smoke, patch release impact, and rollback in
      `docs/superpowers/handoffs/2026-10-04-streak-day-rollover.md`.

Done when automated checks pass and human smoke is explicitly pending; do not
claim installed-extension verification or merge readiness without human proof.
