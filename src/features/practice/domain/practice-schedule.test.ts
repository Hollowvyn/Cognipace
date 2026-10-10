import { describe, expect, it } from 'vitest'

import { derivePracticeScheduleTiming } from './practice-schedule'

describe('derivePracticeScheduleTiming', () => {
  const now = new Date(2026, 8, 13, 2, 11, 31)

  it('marks a prior local date overdue even when less than 24 hours elapsed', () => {
    expect(
      derivePracticeScheduleTiming({
        dueAt: new Date(2026, 8, 12, 23, 30),
        isStarted: true,
        isSuspended: false,
        now,
      }),
    ).toEqual({
      eligibleOn: '2026-09-12',
      isDue: true,
      isOverdue: true,
      overdueDays: 1,
    })
  })

  it('marks every instant on the current local date due today', () => {
    expect(
      derivePracticeScheduleTiming({
        dueAt: new Date(2026, 8, 13, 22),
        isStarted: true,
        isSuspended: false,
        now,
      }),
    ).toEqual({
      eligibleOn: '2026-09-13',
      isDue: true,
      isOverdue: false,
      overdueDays: 0,
    })
  })

  it('keeps a later local date scheduled', () => {
    expect(
      derivePracticeScheduleTiming({
        dueAt: new Date(2026, 8, 14, 0),
        isStarted: true,
        isSuspended: false,
        now,
      }),
    ).toEqual({
      eligibleOn: '2026-09-14',
      isDue: false,
      isOverdue: false,
      overdueDays: 0,
    })
  })

  it('waits until the next local day after a same-day review while retaining raw due', () => {
    const dueAt = new Date(2026, 8, 13, 22)

    expect(
      derivePracticeScheduleTiming({
        dueAt,
        lastReviewedAt: new Date(2026, 8, 13, 1),
        isStarted: true,
        isSuspended: false,
        now,
      }),
    ).toMatchObject({
      eligibleOn: '2026-09-14',
      isDue: false,
      isOverdue: false,
      overdueDays: 0,
    })
    expect(dueAt).toEqual(new Date(2026, 8, 13, 22))
  })

  it('uses the later raw due day when it follows the next review day', () => {
    expect(
      derivePracticeScheduleTiming({
        dueAt: new Date(2026, 8, 16),
        lastReviewedAt: new Date(2026, 8, 13),
        isStarted: true,
        isSuspended: false,
        now,
      }),
    ).toMatchObject({ eligibleOn: '2026-09-16', isDue: false })
  })

  it('keeps an overdue raw date from resurfacing on the day of a correction', () => {
    expect(
      derivePracticeScheduleTiming({
        dueAt: new Date(2026, 8, 12),
        lastReviewedAt: new Date(2026, 8, 13, 0, 1),
        isStarted: true,
        isSuspended: false,
        now,
      }),
    ).toMatchObject({
      eligibleOn: '2026-09-14',
      isDue: false,
      isOverdue: false,
      overdueDays: 0,
    })
  })

  it('uses New York calendar days across the spring clock change', () => {
    withTimezone('America/New_York', () => {
      expect(
        derivePracticeScheduleTiming({
          dueAt: new Date('2026-03-09T04:30:00.000Z'),
          lastReviewedAt: new Date('2026-03-08T04:30:00.000Z'),
          isStarted: true,
          isSuspended: false,
          now: new Date('2026-03-09T03:59:59.000Z'),
        }),
      ).toMatchObject({ eligibleOn: '2026-03-09', isDue: false })
    })
  })

  it('uses the next local day across the autumn clock change', () => {
    withTimezone('America/New_York', () => {
      expect(
        derivePracticeScheduleTiming({
          dueAt: new Date('2026-11-02T04:30:00.000Z'),
          lastReviewedAt: new Date('2026-11-01T04:30:00.000Z'),
          isStarted: true,
          isSuspended: false,
          now: new Date('2026-11-02T04:59:59.000Z'),
        }),
      ).toMatchObject({
        eligibleOn: '2026-11-02',
        isDue: false,
        isOverdue: false,
        overdueDays: 0,
      })
    })
  })

  it('flips due state at local midnight', () => {
    withTimezone('America/New_York', () => {
      const input = {
        dueAt: new Date('2026-09-13T12:00:00.000Z'),
        lastReviewedAt: new Date('2026-09-13T12:00:00.000Z'),
        isStarted: true,
        isSuspended: false,
      }
      expect(
        derivePracticeScheduleTiming({
          ...input,
          now: new Date('2026-09-14T03:59:59.000Z'),
        }).isDue,
      ).toBe(false)
      expect(
        derivePracticeScheduleTiming({
          ...input,
          now: new Date('2026-09-14T04:00:00.000Z'),
        }),
      ).toMatchObject({ eligibleOn: '2026-09-14', isDue: true })
    })
  })

  it('reprojects the same instants when the local timezone changes', () => {
    const input = {
      dueAt: new Date('2026-09-14T06:00:00.000Z'),
      lastReviewedAt: new Date('2026-09-13T03:00:00.000Z'),
      isStarted: true,
      isSuspended: false,
      now: new Date('2026-09-14T05:00:00.000Z'),
    }
    withTimezone('America/New_York', () => {
      expect(derivePracticeScheduleTiming(input).eligibleOn).toBe('2026-09-14')
    })
    withTimezone('America/Los_Angeles', () => {
      expect(derivePracticeScheduleTiming(input).eligibleOn).toBe('2026-09-13')
    })
  })

  it('allows suspension to override presentation without mutating dueAt', () => {
    const dueAt = new Date(2026, 8, 2)

    expect(
      derivePracticeScheduleTiming({
        dueAt,
        isStarted: true,
        isSuspended: true,
        now,
      }),
    ).toEqual({
      eligibleOn: '2026-09-02',
      isDue: false,
      isOverdue: false,
      overdueDays: 0,
    })

    expect(dueAt).toEqual(new Date(2026, 8, 2))
  })

  it.each([
    ['not started', false, new Date(2026, 8, 2)],
    ['missing due date', true, null],
    ['invalid due date', true, new Date(Number.NaN)],
  ])('does not classify %s cards as due', (_name, isStarted, dueAt) => {
    expect(
      derivePracticeScheduleTiming({
        dueAt,
        isStarted,
        isSuspended: false,
        now,
      }),
    ).toEqual({
      eligibleOn: null,
      isDue: false,
      isOverdue: false,
      overdueDays: 0,
    })
  })
})

function withTimezone(timezone: string, assertion: () => void) {
  const previousTimezone = process.env.TZ
  try {
    process.env.TZ = timezone
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(timezone)
    assertion()
  } finally {
    if (previousTimezone === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = previousTimezone
    }
  }
}
