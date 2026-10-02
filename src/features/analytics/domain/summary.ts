import { isReviewRating } from '@/lib/fsrs'

import type { AnalyticsReadiness } from './analytics-readiness'
import type { HistoricalAnalyticsViews } from './historical-presentation'
import type { AnalyticsTimeFrame } from './analytics-time'

export interface ObservedRatingQualityResult {
  value: number | null
  label: string
  sampleSize: number
  lowSample: boolean
}

export interface ObservedRatingPeriod {
  periodStart: Date
  periodEnd: Date
}

export interface AnalyticsSummaryInput {
  generatedAt: Date
  timeFrame: AnalyticsTimeFrame
  reviewDays: number
  totalReviews: number
  currentStreak: number
  observedRatingQuality: ObservedRatingQualityResult
  range: 14 | 30 | 90
  targetRetention: number
  views: HistoricalAnalyticsViews
  historicalReadiness: HistoricalReadiness
}

export interface HistoricalReadiness {
  requested: AnalyticsReadiness
  recallQuality: AnalyticsReadiness
  practiceRhythm: AnalyticsReadiness
  ratingsMix: AnalyticsReadiness
  topics: AnalyticsReadiness
  stability: AnalyticsReadiness
  overdueBacklog: AnalyticsReadiness
  recommendedRange: 14 | 30 | 90 | null
}

export interface AnalyticsSummary {
  generatedAt: string
  timeFrame: AnalyticsTimeFrame
  reviewDays: number
  totalReviews: number
  currentStreak: number
  observedRatingQuality: number | null
  observedRatingQualityLabel: string
  range: 14 | 30 | 90
  observedRatingSampleSize: number
  lowSample: boolean
  targetRetention: number
  views: HistoricalAnalyticsViews
  historicalReadiness: HistoricalReadiness
}

export function buildObservedRatingQuality(
  attempts: Array<{ rating: string; reviewedAt: Date }>,
  now: Date,
  range: 14 | 30 | 90,
  period?: ObservedRatingPeriod,
): ObservedRatingQualityResult {
  const since = period?.periodStart ?? subtractDays(now, range)
  const periodEnd = period?.periodEnd ?? now
  const recent = attempts.filter(
    (a) =>
      a.reviewedAt >= since &&
      a.reviewedAt <= periodEnd &&
      a.reviewedAt <= now &&
      isReviewRating(a.rating),
  )
  const sampleSize = recent.length

  if (sampleSize < 10) {
    return { value: null, label: '—', sampleSize, lowSample: true }
  }

  const positive = recent.filter(
    (a) => a.rating === 'good' || a.rating === 'easy',
  ).length
  const value = positive / sampleSize
  const label = `${Math.round(value * 100)}%`

  return { value, label, sampleSize, lowSample: false }
}

export function buildAnalyticsSummary(
  input: AnalyticsSummaryInput,
): AnalyticsSummary {
  return {
    generatedAt: input.generatedAt.toISOString(),
    timeFrame: input.timeFrame,
    reviewDays: input.reviewDays,
    totalReviews: input.totalReviews,
    currentStreak: input.currentStreak,
    observedRatingQuality: input.observedRatingQuality.value,
    observedRatingQualityLabel: input.observedRatingQuality.label,
    observedRatingSampleSize: input.observedRatingQuality.sampleSize,
    lowSample: input.observedRatingQuality.lowSample,
    range: input.range,
    targetRetention: input.targetRetention,
    views: input.views,
    historicalReadiness: input.historicalReadiness,
  }
}

function subtractDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() - days)
  return result
}
