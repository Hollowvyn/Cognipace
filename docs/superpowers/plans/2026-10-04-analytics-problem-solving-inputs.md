# Problem Solving Analytics Inputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task by task. Track execution with the checkboxes below.

**Goal:** Supply current problem difficulty and recorded elapsed time to
Analytics, and select complementary raw first/later assessment populations.

**Architecture:** Extend the existing repository projection and generic domain
event shape. Reuse the existing first-record selector to derive later records;
preserve the FSRS-paired Recall calculation. This phase prepares inputs without
changing the serialized summary or visible page.

**Tech stack:** TypeScript, existing Drizzle/SQLite projection, Vitest.

Design: `../specs/2026-10-04-analytics-problem-solving-design.md`.

## Task 1: Preserve Stored Difficulty And Timing

Files:

- Modify `src/features/analytics/data/analytics-repository.ts` and its existing
  `analytics-repository.test.ts`.
- Modify `src/features/analytics/domain/chart-data.ts`.
- Reuse `ProblemDifficulty` from `src/features/problems/domain`.

- [ ] Extend an existing review-history repository test with two topics on one
      problem and a saved timed attempt. Read history and assert one event,
      both topic labels, current catalog difficulty, and exact saved seconds.
      Also retain an untimed record with null elapsed time. Use the existing
      test database/factories; do not create another bulk fixture.

  ```ts
  expect(history).toHaveLength(2)
  expect(history[0]).toMatchObject({
    problemDifficulty: 'medium',
    elapsedSeconds: 600,
    topicLabels: ['Arrays', 'Binary Search'],
  })
  expect(history[1]).toMatchObject({
    problemDifficulty: 'unknown',
    elapsedSeconds: null,
  })
  ```

- [ ] Run the focused test and confirm the new metadata assertion fails before
      the projection changes:

  ```sh
  rtk proxy npm test -- src/features/analytics/data/analytics-repository.test.ts
  ```

- [ ] Add the required fields to repository `ReviewEvent`, the SQL selection,
      and the deduplicated event mapping:

  ```ts
  // ReviewEvent
  problemDifficulty: ProblemDifficulty
  elapsedSeconds: number | null

  // getReviewEvents select()
  problemDifficulty: problems.difficulty,
  elapsedSeconds: reviewAttempts.elapsedSeconds,

  // events.set(...)
  problemDifficulty: row.problemDifficulty,
  elapsedSeconds: row.elapsedSeconds,
  ```

  Import `ProblemDifficulty` through the existing problems domain boundary.
  Keep `CurrentFsrsCard.difficulty` numeric and unchanged. Do not alter sorting,
  report filtering, or topic-join deduplication.

- [ ] Add optional metadata to the generic `AnalyticsReviewEvent` to preserve
      older callers and existing compact fixtures:

  ```ts
  problemDifficulty?: ProblemDifficulty | undefined
  elapsedSeconds?: number | null | undefined
  ```

  Production repository events always supply both fields. Future aggregation
  must interpret an absent difficulty as Unknown and absent time as unavailable.
  Do not backfill dummy zero durations across unrelated tests.

- [ ] Rerun the focused command; require the metadata and dedup assertions to
      pass, along with existing repository behavior.

## Task 2: Select Later Raw Records

Files:

- Modify `src/features/analytics/domain/review-cohorts.ts` and its existing
  `review-cohorts.test.ts`.

- [ ] Extend existing cohort coverage with a complementary later-record
      assertion using the existing `event()` helper. Include an invalid first,
      a later valid assessment on a different card, and a same-time lexical-ID
      tie. Confirm input order and object references are preserved.

  ```ts
  const first = event({ id: 'a', rating: 'invalid' })
  const later = event({
    id: 'b',
    cardId: 'another-card',
    rating: 'good',
  })
  const other = event({ id: 'c', problemSlug: 'other' })
  const input = [later, other, first]
  expect(selectLaterRecordedAttempts(input)).toEqual([later])
  expect(selectFirstRecordedAttempts(input)).toEqual([first, other])
  expect(input).toEqual([later, other, first])
  ```

- [ ] Run the focused command and confirm the new later selector expectation
      fails before implementation:

  ```sh
  rtk proxy npm test -- src/features/analytics/domain/review-cohorts.test.ts
  ```

- [ ] Export this narrow helper alongside `selectFirstRecordedAttempts`:

  ```ts
  /** Select raw retained later records before report or eligibility filters. */
  export function selectLaterRecordedAttempts<T extends ReviewCohortEvent>(
    events: readonly T[],
  ): T[] {
    const firstIds = new Set(
      selectFirstRecordedAttempts(events).map((event) => event.id),
    )
    return events
      .filter((event) => !firstIds.has(event.id))
      .sort(compareReviewEvents)
  }
  ```

  Callers pass complete retained raw history; period, validity, time, and
  difficulty filters happen after cohort selection. Existing DB attempt IDs
  are unique. Do not use per-card FSRS pairing or correctness flags here.

- [ ] Rerun the cohort test, including existing FSRS reconstruction tests;
      require both populations to pass without changing repeat-pair behavior.

## Task 3: Validate And Hand Off The Inputs

- [ ] Run the two focused files together, then the required full normal-code
      validation in the pinned repository toolchain:

  ```sh
  rtk proxy npm test -- src/features/analytics/data/analytics-repository.test.ts src/features/analytics/domain/review-cohorts.test.ts
  rtk proxy npm run lint
  rtk proxy npm run check
  ```

- [ ] Inspect the diff and run formatting on touched source/test files. Require
      added test/fixture lines to stay at or below added production source
      lines; extend existing useful cases rather than duplicate them.
- [ ] Commit the completed phase with
      `feat(analytics): expose difficulty and timing inputs`.
- [ ] Record exact commands/results. No app behavior changes in this phase;
      production UI proof belongs to the later visible phase. Do not claim the
      approved graphs are implemented by this input-only commit.

Done when deduplicated repository events carry current problem difficulty and
saved elapsed time, raw later-record selection excludes every raw earliest
record, and existing Analytics/FSRS behavior still passes its tests.

The next phase implements typed bucket/period/prior aggregation and Zod summary
contracts in the existing historical presentation/service flow. Its concrete
plan must cover raw Mix/all-time counts, valid outcome denominators,
successful-only time eligibility, Unknown accounting, quartile gates, timezone
boundaries, and current settings targets. The UI phase expands New Problem
Success using the approved paired plots and shared legend; it must reuse
existing chart primitives and prepare installed-extension smoke proof.
