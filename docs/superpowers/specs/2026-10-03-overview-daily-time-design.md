# Overview Daily Time

Approved by the user on October 3, 2026.

## Behavior

- Fourth card after Streak: **Time Today**, caption **Recorded time on today's submissions.**
- Sum saved `reviewAttempts.elapsedSeconds` whose `reviewedAt` matches today's
  browser-local date, using Completed Today's date key.
- Include repeated and failed assessments; Completed Today still counts unique problems.
- Ignore missing, null, non-finite, and non-positive times; exclude unsaved timers.
- Sum saved whole seconds before formatting: `0m`, `<1m`, whole minutes below
  an hour, then hours/minutes (`1h 25m`). Truncate displayed minutes.
- Corrections replace the existing attempt's time; reset removes its retained
  effort; suspension preserves it.
- Sessions crossing midnight belong entirely to their saved assessment date.
  Recalculate on existing summary reads/refetches; no live-midnight timer.

## Ownership And Layout

Practice's existing query and domain summary expose `recordedSecondsToday`.
App-shell's shared Zod contract carries the non-negative integer through the
existing payload and invalidation. Overview owns formatting and reuses its
metric component, tokens, accessible label, and tabular numerals.
The grid uses one column, two from `sm`, and four from `lg`.
No persisted shape, migration, endpoint, permission, setting, or sync change.

See the [implementation checklist](../plans/2026-10-03-overview-daily-time.md)
and [required human smoke](../../testing.md#overview-daily-time).
