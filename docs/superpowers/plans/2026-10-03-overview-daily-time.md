# Overview Daily Time Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to
> implement this plan task by task. Steps use checkboxes for tracking.

**Goal:** Display today's recorded assessment time in a fourth Overview card.

**Architecture:** Extend the Practice progress read model and existing app-shell
contract. Keep aggregation in Practice and formatting in the Overview domain;
reuse current cache invalidation and metric components.

**Tech Stack:** TypeScript, React, Zod, Drizzle/SQLite, Vitest/Testing Library.

## Task 1: Practice-Owned Total

Files: `src/features/practice/domain/practice-progress.ts`, its adjacent test,
`src/features/practice/data/practice-repository.ts`, and
`src/features/practice/server/practice-progress-service.test.ts`.

- [x] Add failing domain tests for repeated timed submissions on today's local
      date, absent/invalid times, previous/next dates, and disabled daily goals.
      Assert `recordedSecondsToday` independently of `completedToday`.
- [x] Run `rtk proxy npm run test -- src/features/practice/domain/practice-progress.test.ts`
      and confirm failure because the total is absent.
- [x] Extend `PracticeProgressAttempt` with
      `elapsedSeconds?: number | null | undefined` and the summary with
      `recordedSecondsToday: number`. Select and map `elapsedSeconds` in the
      existing repository query. Add the following calculation to the summary:

```ts
const recordedSecondsToday = attempts.reduce((total, attempt) => {
  const seconds = attempt.elapsedSeconds
  if (
    Number.isNaN(attempt.reviewedAt.getTime()) ||
    toPracticeDateKey(attempt.reviewedAt) !== todayDateKey ||
    typeof seconds !== 'number' ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return total
  }
  return total + Math.round(seconds)
}, 0)
```

- [x] Add service tests proving that repeated and failed saved assessments
      contribute, untimed assessments do not, corrections replace time, and a
      reset removes only the affected problem's retained effort.
- [x] Run
      `rtk proxy npm run test -- src/features/practice/domain/practice-progress.test.ts src/features/practice/server/practice-progress-service.test.ts`.

## Task 2: Overview Contract And Presentation

Files: `src/features/app-shell/api/app-shell-contracts.ts`,
`src/features/app-shell/domain/dashboard-overview.ts` and its test,
`src/features/app-shell/components/overview/overview-panels.tsx`,
`src/features/app-shell/components/overview-screen.test.tsx`,
`src/features/app-shell/server/app-shell-service.test.ts`,
`src/testing/app-shell-fixtures.ts`, and existing literal practice-progress
fixtures/fallbacks identified by `rtk proxy rg -n 'todayDateKey:' src`.

- [x] Add failing Overview tests for the fourth card and formatting for 0, 45,
      60, 3599, 3600, and 5100 seconds. Add a real database app-shell test
      proving the serialized dashboard payload contains today's timed total.
- [x] Run
      `rtk proxy npm run test -- src/features/app-shell/domain/dashboard-overview.test.ts src/features/app-shell/components/overview-screen.test.tsx src/features/app-shell/server/app-shell-service.test.ts`
      and confirm the new card/field is missing.
- [x] Extend the shared progress schema with
      `recordedSecondsToday: z.number().int().min(0)`, and set 0 in existing
      fallback/literal fixtures. Add this metric after Streak:

```ts
{
  label: 'Time Today',
  value: formatRecordedTime(progress.recordedSecondsToday),
  caption: "Recorded time on today's submissions.",
}
```

```ts
function formatRecordedTime(seconds: number) {
  if (seconds === 0) return '0m'
  const totalMinutes = Math.floor(seconds / 60)
  if (totalMinutes === 0) return '<1m'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}
```

- [x] Set the metric grid to `grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4`.
- [x] Rerun the focused Overview tests; inspect the diff for unrelated edits.

## Task 3: Documentation, Review, And Proof

Files: `docs/product.md`, `docs/testing.md`, `docs/superpowers/README.md`, and
`docs/superpowers/handoffs/2026-10-03-overview-daily-time.md`.

- [x] Replace stale Overview-placeholder descriptions with the current home
      behavior and documented Time Today counting semantics.
- [x] Add a human smoke checklist for timed/untimed, repeated/failed,
      corrected/reset assessments, local date rollover, and responsive layout.
- [x] Render the production Overview metric component with fixture data at
      desktop and narrow widths; inspect and save screenshots.
- [x] Review against the approved design, then review code quality and fix any
      findings. Do not create a PR before required human smoke proof.
- [x] Run `rtk proxy npm run lint`, `rtk proxy npm run check`,
      `rtk proxy npm run build`, and
      the exact touched-file Prettier check recorded in the handoff.
      All commands must exit 0; report exact skipped commands with reasons.
- [x] Record exact validation and pending human proof in the handoff. Commit
      the final change with `feat(overview): show daily recorded practice time`.

Done when the fourth card displays the sum through the existing serialized read
path, targeted and full checks pass, visual fixture evidence is inspected, and
the handoff clearly marks human installed-extension smoke as pending.
