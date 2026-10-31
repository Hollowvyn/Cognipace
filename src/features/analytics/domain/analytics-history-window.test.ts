import { describe, expect, it } from 'vitest'

import {
  buildAnalyticsBacklogTimeFrame,
  buildAnalyticsHistoryBounds,
  buildAnalyticsHistoryBucketPlan,
  parseAnalyticsHistorySelection,
  type AnalyticsHistorySelection,
} from './analytics-history-window'
import {
  addAnalyticsCalendarDays,
  getAnalyticsLocalDayStart,
} from './analytics-time'

const asOf = new Date('2026-10-05T17:00:00.123Z')
const history = (...timestamps: string[]) =>
  timestamps.map((timestamp) => ({ reviewedAt: new Date(timestamp) }))

describe('analytics history bounds', () => {
  it.each([
    [30, 30],
    ['30', 30],
    [90, 90],
    ['90', 90],
    ['all', 'all'],
    [14, 30],
    ['14', 30],
    ['ALL', 30],
    ['', 30],
    [undefined, 30],
    [NaN, 30],
    [null, 30],
    [[], 30],
  ] as const)('parses %j as %j', (input, expected) => {
    expect(parseAnalyticsHistorySelection(input)).toBe(expected)
  })

  it('clips young raw history without moving the nominal comparison', () => {
    const result = buildAnalyticsHistoryBounds({
      selection: 30,
      asOf,
      timeZone: 'UTC',
      history: history('2026-09-24T12:00:00Z', '2026-10-02T12:00:00Z'),
    })
    expect(result).toMatchObject({
      selection: 30,
      nominalDays: 30,
      historyStart: '2026-09-24T12:00:00.000Z',
      nominalStart: '2026-09-06T00:00:00.000Z',
      displayStart: '2026-09-24T00:00:00.000Z',
      displayStartKey: '2026-09-24',
      availableDays: 12,
      periodEnd: '2026-10-06T00:00:00.000Z',
      previous: {
        start: '2026-08-07T00:00:00.000Z',
        asOf: '2026-09-05T17:00:00.123Z',
        periodEnd: '2026-09-06T00:00:00.000Z',
      },
    })
  })

  it('preserves old history with a long recent inactive gap', () => {
    const result = buildAnalyticsHistoryBounds({
      selection: 90,
      asOf,
      timeZone: 'UTC',
      history: history('2025-01-01T12:00:00Z', '2026-10-05T12:00:00Z'),
    })
    expect(result.displayStartKey).toBe('2026-07-08')
    expect(result.availableDays).toBe(90)
  })

  it('matches the previous local wall clock across DST with young history', () => {
    const result = buildAnalyticsHistoryBounds({
      selection: 30,
      asOf: new Date('2026-03-10T16:40:00.123Z'),
      timeZone: 'America/New_York',
      history: history('2026-03-08T12:00:00Z'),
    })
    expect(result.availableDays).toBe(3)
    expect(result.previous).toEqual({
      start: '2026-01-10T05:00:00.000Z',
      asOf: '2026-02-08T17:40:00.123Z',
      periodEnd: '2026-02-09T05:00:00.000Z',
    })
  })

  it('matches the previous local wall clock across fall-back', () => {
    const result = buildAnalyticsHistoryBounds({
      selection: 30,
      asOf: new Date('2026-11-03T17:40:00.123Z'),
      timeZone: 'America/New_York',
      history: history('2026-01-01T12:00:00Z'),
    })
    expect(result.previous).toEqual({
      start: '2026-09-05T04:00:00.000Z',
      asOf: '2026-10-04T16:40:00.123Z',
      periodEnd: '2026-10-05T04:00:00.000Z',
    })
  })

  it('uses raw origin independently of rating or cohort eligibility', () => {
    const raw = [
      { reviewedAt: new Date('2026-09-10T12:00:00Z'), rating: 'invalid' },
      { reviewedAt: new Date('2026-10-02T12:00:00Z'), rating: 'good' },
    ]
    const result = buildAnalyticsHistoryBounds({
      selection: 'all',
      asOf,
      timeZone: 'UTC',
      history: raw,
    })
    expect(result.displayStartKey).toBe('2026-09-10')
    expect(result.nominalDays).toBeNull()
    expect(result.previous).toBeNull()
    expect(result.availableDays).toBe(26)
  })

  it('ignores invalid and future timestamps without creating fake history', () => {
    const result = buildAnalyticsHistoryBounds({
      selection: 'all',
      asOf,
      timeZone: 'UTC',
      history: history('invalid', '2026-10-06T00:00:00Z'),
    })
    expect(result.historyStart).toBeNull()
    expect(result.nominalStart).toBeNull()
    expect(result.displayStart).toBeNull()
    expect(result.displayStartKey).toBeNull()
    expect(result.availableDays).toBe(0)
    expect(result.previous).toBeNull()
  })

  it('finds the earliest retained timestamp in unsorted raw history', () => {
    const result = buildAnalyticsHistoryBounds({
      selection: 'all',
      asOf,
      timeZone: 'UTC',
      history: history(
        '2026-10-01T12:00:00Z',
        'invalid',
        '2026-09-24T12:00:00Z',
        '2026-10-05T17:00:00.124Z',
        asOf.toISOString(),
      ),
    })
    expect(result.historyStart).toBe('2026-09-24T12:00:00.000Z')
    expect(result.availableDays).toBe(12)
  })

  it('supports same-day history and visibly resolves an invalid zone to UTC', () => {
    const result = buildAnalyticsHistoryBounds({
      selection: 30,
      asOf,
      timeZone: 'Not/A_Zone',
      history: history('2026-10-05T17:00:00.123Z'),
    })
    expect(result.timeZone).toBe('UTC')
    expect(result.timeZoneFallback).toBe(true)
    expect(result.availableDays).toBe(1)
  })

  it('rejects an invalid report time', () => {
    expect(() =>
      buildAnalyticsHistoryBounds({
        selection: 30,
        asOf: new Date('invalid'),
        timeZone: 'UTC',
        history: [],
      }),
    ).toThrow('Analytics as-of must be a valid date.')
  })

  it.each([14, '30', '90', 'ALL', NaN] as const)(
    'rejects unparsed selection %s',
    (selection) => {
      expect(() =>
        buildAnalyticsHistoryBounds({
          selection: selection as AnalyticsHistorySelection,
          asOf,
          timeZone: 'UTC',
          history: [],
        }),
      ).toThrow('Analytics selection must be 30, 90, or all.')
    },
  )
})

function planFor(start: string, selection: 30 | 90 | 'all' = 'all') {
  return buildAnalyticsHistoryBucketPlan(
    buildAnalyticsHistoryBounds({
      selection,
      asOf,
      timeZone: 'UTC',
      history: history(start),
    }),
  )
}

function expectEveryLocalDateCovered(
  plan: ReturnType<typeof buildAnalyticsHistoryBucketPlan>,
  timeZone = 'UTC',
) {
  // Matching local boundaries and adjacent intervals prove complete, exclusive
  // coverage without formatting every date in decades of retained history.
  for (const [index, bucket] of plan.buckets.entries()) {
    expect(bucket.startKey <= bucket.endKey).toBe(true)
    expect(bucket.start).toBe(
      getAnalyticsLocalDayStart(bucket.startKey, timeZone),
    )
    expect(bucket.end).toBe(
      getAnalyticsLocalDayStart(
        addAnalyticsCalendarDays(bucket.endKey, 1),
        timeZone,
      ),
    )
    const previous = plan.buckets[index - 1]
    if (previous) {
      expect(bucket.startKey).toBe(addAnalyticsCalendarDays(previous.endKey, 1))
      expect(bucket.start).toBe(previous.end)
    }
  }
}

describe('analytics calendar bucket plans', () => {
  it('uses daily dates for twelve days and no buckets for empty history', () => {
    const young = planFor('2026-09-24T12:00:00Z', 30)
    expect(young.grouping).toEqual({ unit: 'day', step: 1 })
    expect(young.buckets).toHaveLength(12)
    expectEveryLocalDateCovered(young)
    const empty = buildAnalyticsHistoryBucketPlan(
      buildAnalyticsHistoryBounds({
        selection: 'all',
        asOf,
        timeZone: 'UTC',
        history: [],
      }),
    )
    expect(empty).toEqual({ grouping: null, buckets: [] })
  })

  it('preserves nominal three-day anchors and clips a young first interval', () => {
    const result = planFor('2026-09-16T12:00:00Z', 30)
    expect(result.grouping).toEqual({ unit: 'day', step: 3 })
    expect(result.buckets[0]).toMatchObject({
      startKey: '2026-09-16',
      endKey: '2026-09-17',
      start: '2026-09-16T00:00:00.000Z',
      end: '2026-09-18T00:00:00.000Z',
      isPartial: false,
    })
    expect(result.buckets.at(-1)).toMatchObject({
      endKey: '2026-10-05',
      isPartial: true,
    })
    expectEveryLocalDateCovered(result)
  })

  it('uses Monday weeks for ninety days and preserves all local dates', () => {
    const result = planFor('2025-01-01T00:00:00Z', 90)
    expect(result.grouping).toEqual({ unit: 'week', step: 1 })
    expect(result.buckets[0]).toMatchObject({
      startKey: '2026-07-08',
      endKey: '2026-07-12',
    })
    expect(result.buckets.at(-1)?.endKey).toBe('2026-10-05')
    for (let index = 1; index < result.buckets.length; index += 1) {
      expect(result.buckets[index]?.start).toBe(result.buckets[index - 1]?.end)
    }
    expectEveryLocalDateCovered(result)
  })

  it.each([
    ['2025-10-06T00:00:00Z', 'week', 1],
    ['2025-10-05T00:00:00Z', 'month', 1],
    ['2021-10-01T00:00:00Z', 'month', 3],
    ['2006-10-01T00:00:00Z', 'year', 1],
    ['1800-01-01T00:00:00Z', 'year', 5],
  ] as const)('bounds All time from %s using %s/%s', (start, unit, step) => {
    const result = planFor(start)
    expect(result.grouping).toEqual({ unit, step })
    expect(result.buckets.length).toBeLessThanOrEqual(60)
    expect(result.buckets[0]?.startKey).toBe(start.slice(0, 10))
    expect(result.buckets.at(-1)?.endKey).toBe('2026-10-05')
    for (let index = 0; index < result.buckets.length; index += 1) {
      const bucket = result.buckets[index]!
      expect(Date.parse(bucket.end)).toBeGreaterThan(Date.parse(bucket.start))
      if (index > 0) expect(bucket.start).toBe(result.buckets[index - 1]?.end)
    }
  })

  it.each([
    ['2021-11-30T12:00:00Z', 'month', 1, 60],
    ['2021-10-31T12:00:00Z', 'month', 3, 21],
    ['2012-03-31T12:00:00Z', 'month', 3, 60],
    ['2011-12-31T12:00:00Z', 'year', 1, 16],
    ['1967-12-31T12:00:00Z', 'year', 1, 60],
    ['1966-12-31T12:00:00Z', 'year', 2, 31],
  ] as const)(
    'counts clipped edge slots from %s when choosing %s/%s',
    (start, unit, step, slots) => {
      const result = planFor(start)
      expect(result.grouping).toEqual({ unit, step })
      expect(result.buckets).toHaveLength(slots)
      expect(result.buckets[0]?.startKey).toBe(start.slice(0, 10))
      expect(result.buckets.at(-1)?.endKey).toBe('2026-10-05')
      expectEveryLocalDateCovered(result)
    },
  )

  it.each([
    ['9999-12-11T12:00:00Z', 'day', 3],
    ['9999-11-01T12:00:00Z', 'week', 1],
    ['9998-12-01T12:00:00Z', 'month', 1],
    ['9978-01-01T12:00:00Z', 'year', 1],
  ] as const)(
    'clips the final %s %s/%s boundary before the four-digit calendar limit',
    (start, unit, step) => {
      const result = buildAnalyticsHistoryBucketPlan(
        buildAnalyticsHistoryBounds({
          selection: 'all',
          asOf: new Date('9999-12-30T17:00:00Z'),
          timeZone: 'UTC',
          history: history(start),
        }),
      )
      expect(result.grouping).toEqual({ unit, step })
      expect(result.buckets.at(-1)).toMatchObject({
        endKey: '9999-12-30',
        end: '9999-12-31T00:00:00.000Z',
        isPartial: true,
      })
      expect(result.buckets.length).toBeLessThanOrEqual(60)
    },
  )

  it('uses real local midnights across spring-forward and fall-back', () => {
    for (const [date, expectedStart, expectedEnd] of [
      ['2026-03-08', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z'],
      ['2026-11-01', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z'],
    ]) {
      const result = buildAnalyticsHistoryBucketPlan(
        buildAnalyticsHistoryBounds({
          selection: 30,
          asOf: new Date(`${date}T17:00:00Z`),
          timeZone: 'America/New_York',
          history: history(`${date}T12:00:00Z`),
        }),
      )
      expect(result.buckets[0]?.start).toBe(expectedStart)
      expect(result.buckets[0]?.end).toBe(expectedEnd)
    }
  })

  it('retains leap day and year boundaries as real local dates', () => {
    for (const [start, end, dates] of [
      ['2024-02-28', '2024-03-01', ['2024-02-28', '2024-02-29', '2024-03-01']],
      ['2025-12-31', '2026-01-02', ['2025-12-31', '2026-01-01', '2026-01-02']],
    ] as const) {
      const result = buildAnalyticsHistoryBucketPlan(
        buildAnalyticsHistoryBounds({
          selection: 'all',
          asOf: new Date(`${end}T17:00:00Z`),
          timeZone: 'UTC',
          history: history(`${start}T12:00:00Z`),
        }),
      )
      expect(result.buckets.map((bucket) => bucket.startKey)).toEqual(dates)
    }
  })

  it('keeps every retained record in one interval when resolution changes', () => {
    const events = history(
      '2025-10-06T12:00:00Z',
      '2026-02-28T12:00:00Z',
      '2026-09-24T12:00:00Z',
      '2026-10-05T17:00:00.123Z',
    )
    const bounds = buildAnalyticsHistoryBounds({
      selection: 'all',
      asOf,
      timeZone: 'UTC',
      history: events,
    })
    for (const report of [
      bounds,
      {
        ...bounds,
        asOf: '2026-10-06T17:00:00.123Z',
        todayKey: '2026-10-06',
        periodEnd: '2026-10-07T00:00:00.000Z',
        availableDays: 366,
      },
    ]) {
      const plan = buildAnalyticsHistoryBucketPlan(report)
      for (const event of events) {
        expect(
          plan.buckets.filter(
            (bucket) =>
              event.reviewedAt.getTime() >= Date.parse(bucket.start) &&
              event.reviewedAt.getTime() < Date.parse(bucket.end),
          ),
        ).toHaveLength(1)
      }
    }
  })

  it('keeps backlog at thirty daily slots independently of history selection', () => {
    const backlog = buildAnalyticsBacklogTimeFrame({ asOf, timeZone: 'UTC' })
    expect(backlog.buckets).toHaveLength(30)
    expect(backlog.periodStart).toBe('2026-09-06T00:00:00.000Z')
    expect(backlog.periodEnd).toBe('2026-10-06T00:00:00.000Z')
    expect(backlog.buckets[0]?.startKey).toBe('2026-09-06')
    expect(backlog.buckets.at(-1)?.endKey).toBe('2026-10-05')
    expect(
      backlog.buckets.every((bucket) => bucket.startKey === bucket.endKey),
    ).toBe(true)
  })

  it('preserves backlog timezone fallback and rejects an invalid report time', () => {
    expect(
      buildAnalyticsBacklogTimeFrame({ asOf, timeZone: 'Not/A_Zone' }),
    ).toMatchObject({
      asOf: asOf.toISOString(),
      timeZone: 'UTC',
      timeZoneFallback: true,
      periodStart: '2026-09-06T00:00:00.000Z',
    })
    expect(() =>
      buildAnalyticsBacklogTimeFrame({
        asOf: new Date('invalid'),
        timeZone: 'UTC',
      }),
    ).toThrow('Analytics as-of must be a valid date.')
  })
})
