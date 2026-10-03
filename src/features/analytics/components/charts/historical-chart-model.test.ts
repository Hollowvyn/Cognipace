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

describe('empty historical edges', () => {
  it('trims only the empty prefix and suffix, preserving zero and internal gaps without mutation', () => {
    const original = Object.freeze([
      { ...row('2026-09-03', '2026-09-05'), value: null },
      { ...row('2026-09-06', '2026-09-08'), value: 0 },
      { ...row('2026-09-09', '2026-09-11'), value: null },
      { ...row('2026-09-12', '2026-09-14'), value: 0.75 },
      { ...row('2026-09-15', '2026-09-17'), value: null },
      { ...row('2026-09-18', '2026-09-20'), value: null },
    ])
    const visible = trimHistoricalEmptyEdges(
      original,
      (point) => point.value !== null,
    )
    expect(visible).toEqual(original.slice(1, 4))
    visible.forEach((point, index) => expect(point).toBe(original[index + 1]))
    expect(original).toHaveLength(6)
    const model = buildHistoricalChartModel(visible, timeFrame)
    expect(model.domain).toEqual([
      historicalDayOrdinal('2026-09-06'),
      historicalDayOrdinal('2026-09-15'),
    ])
  })

  it('returns an empty slice for empty or entirely unsupported history', () => {
    expect(trimHistoricalEmptyEdges([], () => true)).toEqual([])
    const original = [row('2026-09-03'), row('2026-09-04')]
    expect(trimHistoricalEmptyEdges(original, () => false)).toEqual([])
    expect(original).toHaveLength(2)
  })

  it('preserves the actual interval for one measured bucket and leaves supported edges intact', () => {
    const original = [
      { ...row('2026-09-01'), value: null },
      { ...row('2026-09-02', '2026-09-06'), value: 0 },
      { ...row('2026-09-07'), value: null },
    ]
    const visible = trimHistoricalEmptyEdges(
      original,
      (point) => point.value !== null,
    )
    expect(visible).toEqual([original[1]])
    expect(buildHistoricalChartModel(visible).domain).toEqual([
      historicalDayOrdinal('2026-09-02'),
      historicalDayOrdinal('2026-09-07'),
    ])
    expect(trimHistoricalEmptyEdges(original, () => true)).toEqual(original)
  })
})

function row(start: string, end = start) {
  return { id: start, bucketStart: start, bucketEnd: end, value: null }
}

describe('historical calendar chart model', () => {
  it('distinguishes a complete shortened edge from an in-progress interval', () => {
    const weekly = { ...timeFrame, requestedDays: 90 }
    expect(
      historicalIntervalContext(
        { ...row('2026-09-02', '2026-09-06'), isPartial: false },
        weekly,
      ),
    ).toBe('Weekly summaries · 5-day shortened interval · Complete interval')
    expect(
      historicalIntervalContext(
        { ...row('2026-09-07', '2026-09-13'), isPartial: false },
        weekly,
      ),
    ).toBe('Weekly summaries · Complete interval')
    expect(
      historicalIntervalContext(
        { ...row('2026-09-14', '2026-09-15'), isPartial: true },
        weekly,
      ),
    ).toBe('Weekly summaries · In progress')
    expect(
      historicalIntervalContext(
        { ...row('2026-09-01', '2026-09-02'), isPartial: false },
        timeFrame,
      ),
    ).toBe('3-day summaries · 2-day shortened interval · Complete interval')
    expect(
      historicalIntervalContext(
        { ...row('2026-09-01'), isPartial: false },
        { ...timeFrame, requestedDays: 14 },
      ),
    ).toBe('Daily summaries · Complete interval')
  })

  it('anchors aggregates at midpoints and preserves shortened edge widths and fields', () => {
    const original = [
      row('2026-09-02', '2026-09-06'),
      row('2026-09-07', '2026-09-13'),
      row('2026-09-14', '2026-09-15'),
    ]
    const model = buildHistoricalChartModel(original, timeFrame)
    expect(model.domain).toEqual([
      historicalDayOrdinal('2026-09-02'),
      historicalDayOrdinal('2026-09-16'),
    ])
    expect(model.rows.map((point) => point.endX - point.startX)).toEqual([
      5, 7, 2,
    ])
    expect(model.rows[0]!.x).toBe(historicalDayOrdinal('2026-09-02') + 2.5)
    expect(model.rows[2]!.x).toBe(historicalDayOrdinal('2026-09-15'))
    expect(model.rows[0]).toMatchObject(original[0]!)
    expect(original[0]).not.toHaveProperty('x')
  })

  it('keeps equal calendar-day spacing across daylight-saving changes', () => {
    const model = buildHistoricalChartModel(
      [row('2026-03-07'), row('2026-03-08'), row('2026-03-09')],
      timeFrame,
    )
    expect(model.rows[1]!.x - model.rows[0]!.x).toBe(1)
    expect(model.rows[2]!.x - model.rows[1]!.x).toBe(1)
  })

  it('derives the current year from the report instant in the report timezone', () => {
    const frame = { ...timeFrame, asOf: '2026-01-01T01:00:00.000Z' }
    expect(formatHistoricalDate('2025-12-31', frame)).toBe('12/31')
    expect(formatHistoricalDate('2026-01-01', frame)).toBe('01/01/26')
    expect(formatHistoricalBucket(row('2025-12-30', '2026-01-01'), frame)).toBe(
      '12/30/25–01/01/26',
    )
    expect(
      formatHistoricalBucket(row('2026-09-09', '2026-09-11'), timeFrame),
    ).toBe('09/09–09/11')
  })

  it('keeps a one-bucket interval domain and a daily bucket single date', () => {
    const model = buildHistoricalChartModel([row('2026-10-02')], timeFrame)
    expect(model.domain[1] - model.domain[0]).toBe(1)
    expect(model.ticks).toEqual([model.rows[0]!.x])
    expect(formatHistoricalBucket(model.rows[0]!, timeFrame)).toBe('10/02')
  })

  it('uses weekly calendar ticks at wide widths and fewer labels at narrow widths without removing rows', () => {
    const rows = Array.from({ length: 10 }, (_, index) => {
      const start = new Date(Date.UTC(2026, 8, 3 + index * 3))
        .toISOString()
        .slice(0, 10)
      const end = new Date(Date.UTC(2026, 8, 5 + index * 3))
        .toISOString()
        .slice(0, 10)
      return row(start, end)
    })
    const wide = buildHistoricalChartModel(rows, timeFrame, 640)
    const narrow = buildHistoricalChartModel(rows, timeFrame, 210)
    expect(wide.ticks.map(wide.formatTick)).toEqual([
      '09/03',
      '09/10',
      '09/17',
      '09/24',
      '10/02',
    ])
    expect(narrow.ticks.map(narrow.formatTick)).toEqual([
      '09/03',
      '09/17',
      '10/02',
    ])
    expect(narrow.rows).toHaveLength(rows.length)
  })

  it('selects the nearest original row including unknown rows and clamps at either end', () => {
    const model = buildHistoricalChartModel([
      row('2026-09-01'),
      row('2026-09-02'),
      row('2026-09-03'),
    ])
    expect(nearestHistoricalRowIndex(model.rows, model.rows[1]!.x)).toBe(1)
    expect(nearestHistoricalRowIndex(model.rows, -Infinity)).toBe(0)
    expect(nearestHistoricalRowIndex(model.rows, model.rows[2]!.x + 10)).toBe(2)
  })

  it('reserves the full label spacing before the final date on very narrow surviving ranges', () => {
    const model = buildHistoricalChartModel(
      [row('2026-09-09', '2026-09-11'), row('2026-09-30', '2026-10-02')],
      timeFrame,
      156,
    )
    expect(model.ticks.map(model.formatTick)).toEqual(['09/09', '10/02'])
    expect(model.rows).toHaveLength(2)
  })

  it('thins only supplied Y ticks while retaining their endpoints', () => {
    const ticks = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    expect(sparseHistoricalYTicks(ticks, 5)).toEqual([0, 2, 4, 6, 8])
    expect(sparseHistoricalYTicks([0, 0.5, 1])).toEqual([0, 0.5, 1])
  })
})
