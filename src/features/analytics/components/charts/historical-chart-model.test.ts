import { describe, expect, it } from 'vitest'

import {
  buildHistoricalChartModel,
  formatHistoricalBucket,
  formatHistoricalDate,
  historicalDayOrdinal,
  historicalIntervalContext,
  nearestHistoricalRowIndex,
  sparseHistoricalYTicks,
  trimHistoricalEmptyEdges,
} from './historical-chart-model'

const timeFrame = {
  asOf: '2026-10-02T16:00:00.000Z',
  timeZone: 'America/New_York',
  requestedDays: 30,
}

function row(start: string, end = start, value: number | null = null) {
  return { id: start, bucketStart: start, bucketEnd: end, value }
}

function day(dayOfMonth: number) {
  return new Date(Date.UTC(2026, 8, dayOfMonth)).toISOString().slice(0, 10)
}

const intervals = [
  row('2026-09-02', '2026-09-06'),
  row('2026-09-07', '2026-09-13'),
  row('2026-09-14', '2026-09-15'),
]

describe('historical calendar model', () => {
  it('trims empty edges without losing zero, internal gaps, source identity, or singleton intervals', () => {
    const original = Object.freeze(
      [null, 0, null, 0.75, null, null].map((value, index) =>
        row(day(3 + index * 3), day(5 + index * 3), value),
      ),
    )
    original.forEach(Object.freeze)
    const visible = trimHistoricalEmptyEdges(
      original,
      (point) => point.value !== null,
    )
    expect(visible).toEqual(original.slice(1, 4))
    visible.forEach((point, index) => expect(point).toBe(original[index + 1]))
    const single = trimHistoricalEmptyEdges(
      original.slice(0, 3),
      (point) => point.value !== null,
    )
    expect(single).toEqual([original[1]])
    expect(buildHistoricalChartModel(single).domain).toEqual([
      historicalDayOrdinal('2026-09-06'),
      historicalDayOrdinal('2026-09-09'),
    ])
    expect(trimHistoricalEmptyEdges(original, () => true)).toEqual(original)
    expect(trimHistoricalEmptyEdges(original, () => false)).toEqual([])
    expect(trimHistoricalEmptyEdges([], () => true)).toEqual([])
  })

  it.each([1, 2, 3, 7])(
    'starts at the first %i-day midpoint without moving rows or calendar ticks',
    (intervalDays) => {
      const original = [row(day(1), day(intervalDays)), row(day(8), day(14))]
      const full = buildHistoricalChartModel(original, timeFrame, 640)
      const fitted = buildHistoricalChartModel(original, timeFrame, 640, true)
      expect(fitted.domain).toEqual([full.rows[0]!.x, full.domain[1]])
      expect(fitted.rows).toEqual(full.rows)
      expect(fitted.ticks.length).toBeGreaterThan(0)
      for (const tick of fitted.ticks) {
        expect(tick).toBeGreaterThanOrEqual(fitted.domain[0])
        expect(tick).toBeLessThanOrEqual(fitted.domain[1])
        expect(tick % 1).toBe(0.5)
      }
      expect(fitted.formatTick(fitted.ticks[0]!)).toBe(
        formatHistoricalDate(day(1 + Math.floor(intervalDays / 2)), timeFrame),
      )
    },
  )

  it('retains empty and singleton domains when starting at the first point is requested', () => {
    for (const original of [[], [row(day(9), day(11))], [row('2026-10-02')]]) {
      const full = buildHistoricalChartModel(original, timeFrame, 210)
      expect(
        buildHistoricalChartModel(original, timeFrame, 210, true),
      ).toMatchObject({
        domain: full.domain,
        ticks: full.ticks,
        rows: full.rows,
      })
      if (!original.length) expect(full.domain).toEqual([0, 1])
      else {
        expect(full.domain).toEqual([
          historicalDayOrdinal(original[0]!.bucketStart),
          historicalDayOrdinal(original[0]!.bucketEnd) + 1,
        ])
        expect(full.ticks).toContain(full.rows[0]!.x)
      }
    }
    expect(formatHistoricalBucket(row('2026-10-02'), timeFrame)).toBe('10/02')
  })

  it('keeps shortened and in-progress interval context, actual widths and midpoint placement', () => {
    expect(
      intervals.map((bucket, index) =>
        historicalIntervalContext(
          { ...bucket, isPartial: index === 2 },
          { ...timeFrame, requestedDays: 90 },
        ),
      ),
    ).toEqual([
      'Weekly summaries · 5-day shortened interval · Complete interval',
      'Weekly summaries · Complete interval',
      'Weekly summaries · In progress',
    ])
    expect([
      historicalIntervalContext(
        { ...row(day(1), day(2)), isPartial: false },
        timeFrame,
      ),
      historicalIntervalContext(
        { ...row(day(1)), isPartial: false },
        { ...timeFrame, requestedDays: 14 },
      ),
    ]).toEqual([
      '3-day summaries · 2-day shortened interval · Complete interval',
      'Daily summaries · Complete interval',
    ])
    const model = buildHistoricalChartModel(intervals, timeFrame)
    expect(model.domain).toEqual([
      historicalDayOrdinal('2026-09-02'),
      historicalDayOrdinal('2026-09-16'),
    ])
    expect(model.rows.map((point) => point.endX - point.startX)).toEqual([
      5, 7, 2,
    ])
    expect(model.rows[0]!.x).toBe(historicalDayOrdinal('2026-09-02') + 2.5)
    expect(model.rows[2]!.x).toBe(historicalDayOrdinal('2026-09-15'))
    expect(model.rows[0]).toMatchObject(intervals[0]!)
    expect(intervals[0]).not.toHaveProperty('x')
  })

  it('uses calendar-day spacing across DST and selects nearest unknown rows with edge clamping', () => {
    const model = buildHistoricalChartModel(
      [row('2026-03-07'), row('2026-03-08'), row('2026-03-09')],
      timeFrame,
    )
    expect(model.rows[1]!.x - model.rows[0]!.x).toBe(1)
    expect(model.rows[2]!.x - model.rows[1]!.x).toBe(1)
    expect(nearestHistoricalRowIndex(model.rows, model.rows[1]!.x)).toBe(1)
    expect(nearestHistoricalRowIndex(model.rows, -Infinity)).toBe(0)
    expect(nearestHistoricalRowIndex(model.rows, model.rows[2]!.x + 10)).toBe(2)
  })

  it('derives MM/DD year labels from the report instant in the report timezone', () => {
    const frame = { ...timeFrame, asOf: '2026-01-01T01:00:00.000Z' }
    expect(formatHistoricalDate('2025-12-31', frame)).toBe('12/31')
    expect(formatHistoricalDate('2026-01-01', frame)).toBe('01/01/26')
    expect(formatHistoricalBucket(row('2025-12-30', '2026-01-01'), frame)).toBe(
      '12/30/25–01/01/26',
    )
    expect(formatHistoricalBucket(row(day(9), day(11)), timeFrame)).toBe(
      '09/09–09/11',
    )
  })

  it('thins calendar labels for narrow plots without removing rows or crowding the last date', () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      row(day(3 + index * 3), day(5 + index * 3)),
    )
    for (const [width, labels] of [
      [640, ['09/03', '09/10', '09/17', '09/24', '10/02']],
      [210, ['09/03', '09/17', '10/02']],
    ] as const) {
      const model = buildHistoricalChartModel(rows, timeFrame, width)
      expect(model.ticks.map(model.formatTick)).toEqual(labels)
      expect(model.rows).toHaveLength(rows.length)
    }
    const surviving = buildHistoricalChartModel(
      [row(day(9), day(11)), row('2026-09-30', '2026-10-02')],
      timeFrame,
      156,
    )
    expect(surviving.ticks.map(surviving.formatTick)).toEqual([
      '09/09',
      '10/02',
    ])
    expect(surviving.rows).toHaveLength(2)
    expect(sparseHistoricalYTicks([0, 1, 2, 3, 4, 5, 6, 7, 8], 5)).toEqual([
      0, 2, 4, 6, 8,
    ])
    expect(sparseHistoricalYTicks([0, 0.5, 1])).toEqual([0, 0.5, 1])
  })
})
