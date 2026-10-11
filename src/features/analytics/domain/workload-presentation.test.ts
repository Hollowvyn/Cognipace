import { describe, expect, it } from 'vitest'

import { buildWorkloadAnalyticsViews } from './workload-presentation'

const timeFrame = {
  asOf: '2026-08-22T12:00:00.000Z',
  timeZone: 'America/New_York',
  timeZoneFallback: false,
  requestedDays: 14 as const,
  periodStart: '2026-08-09T04:00:00.000Z',
  periodEnd: '2026-08-23T04:00:00.000Z',
  buckets: [
    {
      key: '2026-08-09',
      start: '2026-08-09T04:00:00.000Z',
      end: '2026-08-23T04:00:00.000Z',
      startKey: '2026-08-09',
      endKey: '2026-08-22',
      isPartial: true,
    },
  ],
}

describe('workload analytics presentation', () => {
  it('preserves scheduling provenance on measured and unavailable backlog days', () => {
    const { overdueBacklog } = buildWorkloadAnalyticsViews({
      overdueSnapshots: [
        {
          date: new Date('2026-08-10T03:59:59.999Z'),
          overdueCount: 1,
          schedulingProvenance: 'captured',
        },
        {
          date: new Date('2026-08-11T03:59:59.999Z'),
          overdueCount: 2,
          schedulingProvenance: 'legacy-derived',
        },
        {
          date: new Date('2026-08-13T03:59:59.999Z'),
          overdueCount: 3,
          schedulingProvenance: 'mixed',
        },
      ],
      timeFrame,
      upcomingLoad: upcomingRows(),
    })
    expect(
      overdueBacklog.rows.slice(0, 5).map((row) => row.schedulingProvenance),
    ).toEqual(['captured', 'legacy-derived', 'unknown', 'mixed', 'unknown'])
    expect(overdueBacklog.rows[2]?.overdueCount).toBeNull()
  })

  it('counts exactly five as at or above watch and never carries through an unknown current day', () => {
    const { overdueBacklog } = buildWorkloadAnalyticsViews({
      overdueSnapshots: [
        { date: new Date('2026-08-10T03:59:59.999Z'), overdueCount: 4 },
        { date: new Date('2026-08-11T03:59:59.999Z'), overdueCount: 5 },
        { date: new Date('2026-08-12T03:59:59.999Z'), overdueCount: 6 },
      ],
      timeFrame,
      upcomingLoad: upcomingRows(),
    })
    expect(overdueBacklog).toMatchObject({
      withinWatchDays: 1,
      aboveWatchDays: 2,
      knownDays: 3,
      currentBacklog: null,
      peak: 6,
    })
  })
  it('keeps every selected local day, preserves unknown reconstruction gaps, and reports known backlog summaries', () => {
    const views = buildWorkloadAnalyticsViews({
      overdueSnapshots: [
        { date: new Date('2026-08-10T03:59:59.999Z'), overdueCount: 0 },
        { date: new Date('2026-08-11T03:59:59.999Z'), overdueCount: 6 },
        { date: new Date('2026-08-22T12:00:00.000Z'), overdueCount: 2 },
      ],
      timeFrame,
      upcomingLoad: upcomingRows(),
    })

    expect(views.overdueBacklog.rows).toHaveLength(14)
    expect(views.overdueBacklog.rows[0]).toMatchObject({
      date: '2026-08-09',
      overdueCount: 0,
      inProgress: false,
    })
    expect(views.overdueBacklog.rows[2]).toMatchObject({
      date: '2026-08-11',
      overdueCount: null,
    })
    expect(views.overdueBacklog.rows.at(-1)).toMatchObject({
      date: '2026-08-22',
      overdueCount: 2,
      inProgress: true,
    })
    expect(views.overdueBacklog).toMatchObject({
      knownDays: 3,
      withinWatchDays: 2,
      aboveWatchDays: 1,
      currentBacklog: 2,
      peak: 6,
      selectedDays: 14,
    })
    expect(views.overdueBacklog.scale.domain[0]).toBe(0)
    expect(views.overdueBacklog.scale.domain[1]).toBeGreaterThanOrEqual(6)
  })

  it('keeps fixed forecast rows and zeroes regardless of the selected historical range', () => {
    const views = buildWorkloadAnalyticsViews({
      overdueSnapshots: [],
      timeFrame,
      upcomingLoad: upcomingRows(),
    })

    expect(
      views.overdueBacklog.rows.every((row) => row.overdueCount === null),
    ).toBe(true)
    expect(views.upcomingReviewLoad.rows).toHaveLength(14)
    expect(views.upcomingReviewLoad.rows[0]).toMatchObject({
      date: '2026-08-22',
      today: true,
      overdueCount: 1,
      dueCount: 2,
    })
    expect(views.upcomingReviewLoad.rows.at(-1)?.date).toBe('2026-09-04')
  })
})

function upcomingRows() {
  return Array.from({ length: 14 }, (_, index) => ({
    date: `2026-${index < 10 ? '08' : '09'}-${String(index < 10 ? 22 + index : index - 9).padStart(2, '0')}`,
    dueCount: index === 0 ? 2 : 0,
    overdueCount: index === 0 ? 1 : 0,
    today: index === 0,
  }))
}
