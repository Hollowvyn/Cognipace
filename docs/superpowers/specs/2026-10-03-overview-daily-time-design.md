# Overview Daily Time

Approved by the user on October 3, 2026: add and implement a fourth Overview
metric card showing recorded time from today's saved assessments.

## Behavior

- Label: **Time Today**. Caption: **Recorded time on today's submissions.**
- Sum `reviewAttempts.elapsedSeconds` for attempts whose `reviewedAt` falls on
  today's browser-local calendar date, using the same date key as Completed Today.
- Include repeat attempts and all ratings, including failed attempts. Completed
  Today continues counting unique problems independently of the time total.
- Ignore missing, null, non-finite, and non-positive time values. Use saved
  elapsed time rather than a running or unsaved timer.
- Show `0m` for no recorded time, `<1m` for positive totals below a minute,
  whole minutes below an hour, and hours/minutes for longer totals (`1h 25m`).
  Sum seconds first, then truncate to whole minutes for presentation.
- A correction uses the current saved time for the existing attempt; it does
  not count that attempt twice. Resetting practice removes its retained time.
- Assign a session crossing midnight entirely to its saved assessment date.
- Use the existing refetch/invalidation behavior; calculate the day on each
  summary read. A new live-midnight clock is outside this change.

## Ownership And Layout

Practice's existing progress repository query will select elapsed seconds and
its pure domain summary will expose `recordedSecondsToday`. App-shell's shared
Zod practice-progress contract will carry the integer total to Overview through
the existing payload. Existing practice invalidation already refreshes app-shell.

Overview adds the fourth card after Streak using its existing metric component,
tokens, accessible label, and tabular numerals. The grid uses one column on
small screens, two from `sm`, and four from `lg`.

No persisted shape, migration, new runtime method, permission, setting, or sync
behavior is needed.

## Alternatives

The selected fourth card keeps today's effort alongside today's completion.
A separate time panel would increase vertical space; an average-per-problem
metric would not answer how much time has been recorded today.

## Validation

Cover totals across repeated problems, absent/invalid values, local midnight,
and disabled daily goals in domain tests. Cover saved failures, corrections,
and resets through the practice service/repository. Cover the serialized
dashboard total and formatted metric, including zero, sub-minute, and hour
values. Run focused tests, `npm run lint`, `npm run check`, `npm run build`, and
Prettier for touched files.

Prepare human installed-extension smoke for timed and untimed saves, repeated
and failed assessments, correction, reset, local-date rollover, and responsive
layout. Attach component-rendered screenshots as automated visual evidence;
human real-time smoke with screenshot or recording remains required before
PR review or merge under `docs/agent-governance.md`.
