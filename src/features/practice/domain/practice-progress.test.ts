import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildPracticeProgressSummary,
  toPracticeDateKey,
  type PracticeProgressAttempt,
} from './practice-progress'

const now = new Date('2026-05-25T16:30:00.000Z')

afterEach(() => {
  vi.useRealTimers()
})

describe('buildPracticeProgressSummary', () => {
  it('sums each timed attempt independently of unique completed problems', () => {
    const summary = buildPracticeProgressSummary(
      [
        attempt('two-sum', '2026-05-25T10:00:00.000Z', 60.6),
        attempt('two-sum', '2026-05-25T11:00:00.000Z', 60.6),
        attempt('valid-parentheses', '2026-05-25T12:00:00.000Z', 78),
      ],
      { dailyGoal: 2, now },
    )

    expect(summary).toMatchObject({
      recordedSecondsToday: 200,
      completedToday: 2,
      goalMetToday: true,
      currentStreak: 1,
    })
  })

  it('ignores absent, null, non-finite, and non-positive elapsed time', () => {
    const summary = buildPracticeProgressSummary(
      [
        attempt('two-sum', '2026-05-25T10:00:00.000Z'),
        attempt('two-sum', '2026-05-25T11:00:00.000Z', null),
        attempt('two-sum', '2026-05-25T12:00:00.000Z', Number.NaN),
        attempt(
          'two-sum',
          '2026-05-25T13:00:00.000Z',
          Number.POSITIVE_INFINITY,
        ),
        attempt(
          'two-sum',
          '2026-05-25T14:00:00.000Z',
          Number.NEGATIVE_INFINITY,
        ),
        attempt('two-sum', '2026-05-25T15:00:00.000Z', 0),
        attempt('two-sum', '2026-05-25T16:00:00.000Z', -60),
        attempt('two-sum', '2026-05-25T17:00:00.000Z', 60),
      ],
      { dailyGoal: 2, now },
    )

    expect(summary.recordedSecondsToday).toBe(60)
    expect(summary.completedToday).toBe(1)
  })

  it('includes the full local day from midnight and excludes neighboring days', () => {
    const localNow = new Date(2026, 4, 25, 12)
    const summary = buildPracticeProgressSummary(
      [
        attempt('two-sum', new Date(2026, 4, 24, 23, 59, 59, 999), 3600),
        attempt('two-sum', new Date(2026, 4, 25, 0, 0, 0, 0), 40),
        attempt(
          'valid-parentheses',
          new Date(2026, 4, 25, 23, 59, 59, 999),
          80,
        ),
        attempt('valid-parentheses', new Date(2026, 4, 26, 0, 0, 0, 0), 600),
      ],
      { dailyGoal: 2, now: localNow },
    )

    expect(summary.recordedSecondsToday).toBe(120)
    expect(summary.completedToday).toBe(2)
    expect(summary.todayDateKey).toBe('2026-05-25')
  })

  it('does not manufacture recorded time from an invalid review date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const summary = buildPracticeProgressSummary(
      [
        attempt('two-sum', new Date(Number.NaN), 900),
        attempt('valid-parentheses', '2026-05-25T12:00:00.000Z', 60),
      ],
      { dailyGoal: 2, now },
    )

    expect(summary.recordedSecondsToday).toBe(60)
  })

  it('returns zero recorded time when no attempts are saved', () => {
    const summary = buildPracticeProgressSummary([], { dailyGoal: 4, now })

    expect(summary).toMatchObject({
      recordedSecondsToday: 0,
      completedToday: 0,
      goalMetToday: false,
      currentStreak: 0,
    })
  })

  it.each([0, -1])(
    'retains recorded time with a disabled daily goal of %s',
    (dailyGoal) => {
      const summary = buildPracticeProgressSummary(
        [attempt('two-sum', '2026-05-25T10:00:00.000Z', 120)],
        { dailyGoal, now },
      )

      expect(summary).toMatchObject({
        recordedSecondsToday: 120,
        completedToday: 1,
        dailyGoal: 0,
        goalMetToday: false,
        currentStreak: 0,
      })
    },
  )

  it('counts unique practiced problems for the current local day', () => {
    const summary = buildPracticeProgressSummary(
      [
        attempt('two-sum', '2026-05-25T10:00:00.000Z'),
        attempt('two-sum', '2026-05-25T11:00:00.000Z'),
        attempt('valid-parentheses', '2026-05-25T12:00:00.000Z'),
      ],
      { dailyGoal: 4, now },
    )

    expect(summary).toMatchObject({
      completedToday: 2,
      dailyGoal: 4,
      goalMetToday: false,
      todayDateKey: toPracticeDateKey(now),
    })
  })

  it('counts saved practice attempts because effort matters', () => {
    const summary = buildPracticeProgressSummary(
      [
        attempt('add-binary', '2026-05-25T10:00:00.000Z'),
        attempt('jump-game-iv', '2026-05-25T12:00:00.000Z'),
      ],
      { dailyGoal: 2, now },
    )

    expect(summary.completedToday).toBe(2)
    expect(summary.goalMetToday).toBe(true)
    expect(summary.currentStreak).toBe(1)
  })

  it('rounds fractional daily goals before evaluating progress', () => {
    const summary = buildPracticeProgressSummary(
      [
        attempt('add-binary', '2026-05-25T10:00:00.000Z'),
        attempt('jump-game-iv', '2026-05-25T12:00:00.000Z'),
      ],
      { dailyGoal: 1.6, now },
    )

    expect(summary.dailyGoal).toBe(2)
    expect(summary.goalMetToday).toBe(true)
    expect(summary.currentStreak).toBe(1)
  })

  it('clamps negative daily goals to disabled progress goals', () => {
    const summary = buildPracticeProgressSummary(
      [attempt('two-sum', '2026-05-25T10:00:00.000Z')],
      { dailyGoal: -1, now },
    )

    expect(summary).toMatchObject({
      completedToday: 1,
      dailyGoal: 0,
      goalMetToday: false,
      currentStreak: 0,
    })
  })

  it('counts a streak only across consecutive days that meet the daily goal', () => {
    const summary = buildPracticeProgressSummary(
      [
        attempt('today-a', '2026-05-25T10:00:00.000Z'),
        attempt('today-b', '2026-05-25T11:00:00.000Z'),
        attempt('yesterday-a', '2026-05-24T10:00:00.000Z'),
        attempt('yesterday-b', '2026-05-24T11:00:00.000Z'),
        attempt('old-a', '2026-05-22T10:00:00.000Z'),
        attempt('old-b', '2026-05-22T11:00:00.000Z'),
      ],
      { dailyGoal: 2, now },
    )

    expect(summary.currentStreak).toBe(2)
  })

  it('preserves the current streak while today is partially complete', () => {
    const summary = buildPracticeProgressSummary(
      [
        attempt('today-a', '2026-05-25T10:00:00.000Z'),
        attempt('yesterday-a', '2026-05-24T10:00:00.000Z'),
        attempt('yesterday-b', '2026-05-24T11:00:00.000Z'),
      ],
      { dailyGoal: 2, now },
    )

    expect(summary.completedToday).toBe(1)
    expect(summary.goalMetToday).toBe(false)
    expect(summary.currentStreak).toBe(1)
  })

  it.each([
    [new Date(2026, 4, 25, 23, 59, 59, 999), 2, 2, true],
    [new Date(2026, 4, 26, 0), 2, 0, false],
    [new Date(2026, 4, 26, 23, 59, 59, 999), 2, 0, false],
    [new Date(2026, 4, 27, 0), 0, 0, false],
  ])(
    'reports streak %s through local day rollover',
    (localNow, currentStreak, completedToday, goalMetToday) => {
      const attempts = [24, 25].flatMap((day) =>
        ['two-sum', 'valid-parentheses'].map((slug) =>
          attempt(slug, new Date(2026, 4, day, 12)),
        ),
      )

      expect(
        buildPracticeProgressSummary(attempts, { dailyGoal: 2, now: localNow }),
      ).toMatchObject({ currentStreak, completedToday, goalMetToday })
    },
  )

  it('extends the preserved streak once today meets the goal', () => {
    const attempts = [24, 25].flatMap((day) =>
      ['two-sum', 'valid-parentheses'].map((slug) =>
        attempt(slug, new Date(2026, 4, day, 12)),
      ),
    )
    const localNow = new Date(2026, 4, 26, 12)

    expect(
      buildPracticeProgressSummary(attempts, { dailyGoal: 2, now: localNow })
        .currentStreak,
    ).toBe(2)

    attempts.push(
      attempt('two-sum', localNow),
      attempt('valid-parentheses', localNow),
    )

    expect(
      buildPracticeProgressSummary(attempts, { dailyGoal: 2, now: localNow }),
    ).toMatchObject({ currentStreak: 3, goalMetToday: true })
  })

  it('breaks the streak after a partially completed day ends', () => {
    const attempts = [
      attempt('two-sum', new Date(2026, 4, 24, 12)),
      attempt('valid-parentheses', new Date(2026, 4, 24, 12)),
      attempt('two-sum', new Date(2026, 4, 25, 12)),
      attempt('two-sum', new Date(2026, 4, 25, 13)),
    ]

    expect(
      buildPracticeProgressSummary(attempts, {
        dailyGoal: 2,
        now: new Date(2026, 4, 26, 0),
      }).currentStreak,
    ).toBe(0)

    attempts.push(
      attempt('two-sum', new Date(2026, 4, 26, 12)),
      attempt('valid-parentheses', new Date(2026, 4, 26, 12)),
    )

    expect(
      buildPracticeProgressSummary(attempts, {
        dailyGoal: 2,
        now: new Date(2026, 4, 26, 13),
      }).currentStreak,
    ).toBe(1)
  })

  it.each([new Date(2026, 0, 1, 0), new Date(2026, 2, 1, 0)])(
    'preserves yesterday across a local calendar boundary at %s',
    (localNow) => {
      const yesterday = new Date(localNow)
      yesterday.setDate(yesterday.getDate() - 1)

      expect(
        buildPracticeProgressSummary([attempt('two-sum', yesterday)], {
          dailyGoal: 1,
          now: localNow,
        }).currentStreak,
      ).toBe(1)
    },
  )

  it('handles a disabled daily goal without divide-by-zero behavior', () => {
    const summary = buildPracticeProgressSummary(
      [attempt('two-sum', '2026-05-25T10:00:00.000Z')],
      { dailyGoal: 0, now },
    )

    expect(summary).toMatchObject({
      completedToday: 1,
      dailyGoal: 0,
      goalMetToday: false,
      currentStreak: 0,
    })
  })
})

describe('toPracticeDateKey', () => {
  it('falls back to the current local day when given an invalid date', () => {
    const fallbackNow = new Date('2026-06-02T09:15:00.000Z')

    vi.useFakeTimers()
    vi.setSystemTime(fallbackNow)

    expect(toPracticeDateKey(new Date(Number.NaN))).toBe(
      toPracticeDateKey(fallbackNow),
    )
  })
})

function attempt(
  problemSlug: string,
  reviewedAt: string | Date,
  elapsedSeconds?: number | null,
): PracticeProgressAttempt {
  return {
    problemSlug,
    reviewedAt: new Date(reviewedAt),
    ...(elapsedSeconds !== undefined && { elapsedSeconds }),
  }
}
