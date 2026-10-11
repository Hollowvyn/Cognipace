import type { AnalyticsOverdueSnapshot, UpcomingLoadPoint } from './chart-data'
import type { HistoricalSchedulingProvenance } from './historical-scheduling-evidence'
import { buildMagnitudeScale, type AnalyticsScale } from './analytics-scales'
import {
  addAnalyticsCalendarDays,
  getAnalyticsDateKey,
  type AnalyticsTimeFrame,
} from './analytics-time'

export interface WorkloadAnalyticsViews {
  overdueBacklog: {
    timeFrame: AnalyticsTimeFrame
    rows: OverdueBacklogRow[]
    knownDays: number
    withinWatchDays: number
    aboveWatchDays: number
    selectedDays: number
    currentBacklog: number | null
    peak: number | null
    scale: AnalyticsScale
  }
  upcomingReviewLoad: {
    rows: UpcomingReviewLoadRow[]
    scale: AnalyticsScale
  }
}

export interface OverdueBacklogRow {
  date: string
  overdueCount: number | null
  schedulingProvenance?: HistoricalSchedulingProvenance | undefined
  inProgress: boolean
}

export interface UpcomingReviewLoadRow {
  date: string
  dueCount: number
  overdueCount: number
  today: boolean
}

export function buildWorkloadAnalyticsViews({
  overdueSnapshots,
  timeFrame,
  upcomingLoad,
}: {
  overdueSnapshots: readonly AnalyticsOverdueSnapshot[]
  timeFrame: AnalyticsTimeFrame
  upcomingLoad: readonly UpcomingLoadPoint[]
}): WorkloadAnalyticsViews {
  const overdueRows = buildOverdueBacklogRows(overdueSnapshots, timeFrame)
  const knownCounts = overdueRows.flatMap((row) =>
    row.overdueCount === null ? [] : [row.overdueCount],
  )
  const currentRow = overdueRows.at(-1)
  const upcomingRows = upcomingLoad.map((row) => ({ ...row }))

  return {
    overdueBacklog: {
      timeFrame,
      rows: overdueRows,
      knownDays: knownCounts.length,
      withinWatchDays: knownCounts.filter((count) => count < 5).length,
      aboveWatchDays: knownCounts.filter((count) => count >= 5).length,
      selectedDays: overdueRows.length,
      currentBacklog: currentRow?.overdueCount ?? null,
      peak: knownCounts.length === 0 ? null : Math.max(...knownCounts),
      scale: buildMagnitudeScale(knownCounts, 5),
    },
    upcomingReviewLoad: {
      rows: upcomingRows,
      scale: buildMagnitudeScale(
        upcomingRows.map((row) => row.dueCount + row.overdueCount),
      ),
    },
  }
}

function buildOverdueBacklogRows(
  snapshots: readonly AnalyticsOverdueSnapshot[],
  timeFrame: AnalyticsTimeFrame,
): OverdueBacklogRow[] {
  const firstKey = timeFrame.buckets[0]?.startKey
  const lastKey = timeFrame.buckets.at(-1)?.endKey
  if (!firstKey || !lastKey) return []

  const snapshotsByDate = new Map(
    snapshots.map((snapshot) => [
      getAnalyticsDateKey(snapshot.date, timeFrame.timeZone),
      snapshot,
    ]),
  )
  const rows: OverdueBacklogRow[] = []
  for (
    let date = firstKey;
    date <= lastKey;
    date = addAnalyticsCalendarDays(date, 1)
  ) {
    const snapshot = snapshotsByDate.get(date)
    rows.push({
      date,
      overdueCount: snapshot?.overdueCount ?? null,
      schedulingProvenance: snapshot?.schedulingProvenance ?? 'unknown',
      inProgress: date === lastKey,
    })
  }
  return rows
}
