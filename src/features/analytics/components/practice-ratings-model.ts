import type { AnalyticsViews } from '../api/analytics-contracts'
import { trimHistoricalEmptyEdges } from './charts/historical-chart-model'

type PracticeRow = AnalyticsViews['practiceRhythm']['rows'][number]
type RatingsRow = AnalyticsViews['ratingsMix']['rows'][number]

export interface PracticeRatingsRow {
  id: string
  bucketStart: string
  bucketEnd: string
  isPartial: boolean
  practice: PracticeRow | null
  ratings: RatingsRow | null
  completedReviews: number | null
}

export function buildPracticeRatingsRows(
  practiceRows: readonly PracticeRow[],
  ratingsRows: readonly RatingsRow[],
): PracticeRatingsRow[] {
  const intervals = new Map<string, PracticeRatingsRow>()
  const intervalKey = (row: PracticeRow | RatingsRow) =>
    JSON.stringify([row.id, row.bucketStart, row.bucketEnd])
  const getInterval = (source: PracticeRow | RatingsRow) => {
    const id = intervalKey(source)
    let row = intervals.get(id)
    if (!row) {
      row = {
        id,
        bucketStart: source.bucketStart,
        bucketEnd: source.bucketEnd,
        isPartial: source.isPartial,
        practice: null,
        ratings: null,
        completedReviews: null,
      }
      intervals.set(id, row)
    }
    row.isPartial ||= source.isPartial
    return row
  }
  for (const practice of practiceRows) {
    const row = getInterval(practice)
    row.practice = practice
    row.completedReviews = practice.completedReviews
  }
  for (const ratings of ratingsRows) getInterval(ratings).ratings = ratings
  const rows = [...intervals.values()].sort(
    (a, b) =>
      a.bucketStart.localeCompare(b.bucketStart) ||
      a.bucketEnd.localeCompare(b.bucketEnd) ||
      a.id.localeCompare(b.id),
  )
  return trimHistoricalEmptyEdges(
    rows,
    (row) =>
      (row.completedReviews ?? 0) > 0 ||
      (row.practice?.validRatings ?? 0) > 0 ||
      (row.ratings?.validRatings ?? 0) > 0 ||
      (row.practice?.reviewSuccess !== null &&
        row.practice?.reviewSuccess !== undefined &&
        Number.isFinite(row.practice.reviewSuccess)),
  )
}
