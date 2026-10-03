import { isReviewRating } from '@/lib/fsrs'
import { defaultAnalyticsTargets } from '@/features/settings/domain'

import type { AnalyticsReadiness } from './analytics-readiness'
import {
  aggregateFirstAttemptOutcomes,
  type HistoricalAnalyticsViews,
} from './historical-presentation'
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

export interface AnalyticsMetricSummary {
  value: number | null
  sampleSize: number
  lowSample: boolean
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
  views?: HistoricalAnalyticsViews
  historicalReadiness: HistoricalReadiness
  predictedRecall?: AnalyticsMetricSummary
  recallQuality?: import('./chart-data').RecallQualityPoint[]
  practiceRhythm?: import('./chart-data').PracticeRhythmPoint[]
  ratingsMix?: import('./chart-data').RatingsMixPoint[]
  hardAgain?: import('./chart-data').HardAgainSummary
  topics?: import('./chart-data').TopicPoint[]
  stability?: import('./chart-data').StabilityPoint[]
}

export interface HistoricalReadiness {
  firstAttemptOutcomes: AnalyticsReadiness
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
  predictedRecall: AnalyticsMetricSummary
  recallQuality: import('./chart-data').RecallQualityPoint[]
  practiceRhythm: import('./chart-data').PracticeRhythmPoint[]
  ratingsMix: import('./chart-data').RatingsMixPoint[]
  hardAgain: import('./chart-data').HardAgainSummary
  topics: import('./chart-data').TopicPoint[]
  stability: import('./chart-data').StabilityPoint[]
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
    views: input.views ?? emptyHistoricalViews(input.targetRetention),
    historicalReadiness: input.historicalReadiness,
    predictedRecall: input.predictedRecall ?? {
      value: null,
      sampleSize: 0,
      lowSample: true,
    },
    recallQuality: input.recallQuality ?? [],
    practiceRhythm: input.practiceRhythm ?? [],
    ratingsMix: input.ratingsMix ?? [],
    hardAgain: input.hardAgain ?? {
      selectedShare: null,
      previousShare: null,
      delta: null,
      direction: null,
      sampleSize: 0,
      previousSampleSize: 0,
      lowSample: true,
      previousLowSample: true,
    },
    topics: input.topics ?? [],
    stability: input.stability ?? [],
  }
}

function emptyHistoricalViews(
  targetRetention: number,
): HistoricalAnalyticsViews {
  return {
    firstAttemptOutcomes: {
      rows: [],
      totals: aggregateFirstAttemptOutcomes([]),
      scale: { domain: [0, 1], ticks: [0, 1] },
      targetFirstAttemptSuccess:
        defaultAnalyticsTargets.targetFirstAttemptSuccess,
      targetFirstAttemptGoodEasy:
        defaultAnalyticsTargets.targetFirstAttemptGoodEasy,
    },
    observedRecallVsFsrs: {
      rows: [],
      scale: { domain: [0, 1], ticks: [0, 1] },
      targetRecall: defaultAnalyticsTargets.targetRecall,
    },
    memoryStrength: {
      rows: [],
      scale: { domain: [0, 2], ticks: [0, 1, 2] },
    },
    practiceRhythm: {
      rows: [],
      countScale: { domain: [0, 1], ticks: [0, 1] },
      percentageScale: { domain: [0, 1], ticks: [0, 1] },
      targetReviewSuccess: defaultAnalyticsTargets.targetReviewSuccess,
    },
    ratingsMix: {
      rows: [],
      selectedHardAgain: 0,
      selectedValidRatings: 0,
      comparison: {
        previousHardAgainShare: null,
        previousValidRatings: 0,
        difference: null,
        direction: null,
      },
    },
    topicPerformance: {
      rows: [],
      strongerQualifyingTopics: 0,
      lowEvidenceTopics: [],
      additionalLowEvidenceTopics: 0,
    },
    retentionMap: {
      rows: [],
      totalEligible: 0,
      statusCounts: { onTarget: 0, watch: 0, needsAttention: 0 },
      recallScale: { domain: [0, 1], ticks: [0, 1] },
      durationScale: { domain: [1, 10], ticks: [1, 10] },
      targetRetention,
    },
    memorySignals: { rows: [], totalQualifying: 0 },
    overdueBacklog: {
      rows: [],
      knownDays: 0,
      withinWatchDays: 0,
      aboveWatchDays: 0,
      selectedDays: 0,
      currentBacklog: null,
      peak: null,
      scale: { domain: [0, 5], ticks: [0, 5] },
    },
    upcomingReviewLoad: {
      rows: Array.from({ length: 14 }, (_, index) => ({
        date: `1970-01-${String(index + 1).padStart(2, '0')}`,
        dueCount: 0,
        overdueCount: 0,
        today: index === 0,
      })),
      scale: { domain: [0, 1], ticks: [0, 1] },
    },
  }
}

function subtractDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() - days)
  return result
}
