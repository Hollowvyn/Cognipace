import { isReviewRating } from '@/lib/fsrs'

import type { AnalyticsReadiness } from './analytics-readiness'
import type { AnalyticsReviewEvent } from './chart-data'
import type { HistoricalAnalyticsViews } from './historical-presentation'
import {
  getAnalyticsDateKey,
  type PublicAnalyticsRange,
  type AnalyticsTimeFrame,
} from './analytics-time'

export interface AnalyticsSelectedActivity {
  assessmentDays: number
  recordedAssessments: number
  knownCorrectnessAssessments: number
  successfulAssessments: number
  distinctSuccessfulProblems: number | null
  observedCorrectness: number | null
  timedSuccessfulAssessments: number
  untimedSuccessfulAssessments: number
  successfulRecordedSeconds: number | null
}

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
  activity: AnalyticsSelectedActivity
  reviewDays: number
  totalReviews: number
  currentStreak: number
  observedRatingQuality: ObservedRatingQualityResult
  range: PublicAnalyticsRange
  targetRetention: number
  views: HistoricalAnalyticsViews
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
  recommendedRange: 30 | 90 | null
}

export interface AnalyticsSummary {
  generatedAt: string
  timeFrame: AnalyticsTimeFrame
  activity: AnalyticsSelectedActivity
  reviewDays: number
  totalReviews: number
  currentStreak: number
  observedRatingQuality: number | null
  observedRatingQualityLabel: string
  range: PublicAnalyticsRange
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

/** Count selected raw assessments without rating or chart eligibility gates. */
export function buildSelectedActivity(
  events: readonly AnalyticsReviewEvent[],
  options: { start: Date; asOf: Date; timeZone: string },
): AnalyticsSelectedActivity {
  const ids = new Set<string>()
  const assessmentDays = new Set<string>()
  const successfulProblems = new Set<string>()
  let recordedAssessments = 0
  let knownCorrectnessAssessments = 0
  let successfulAssessments = 0
  let timedSuccessfulAssessments = 0
  let successfulRecordedSeconds = 0
  const start = options.start.getTime()
  const asOf = options.asOf.getTime()

  for (const event of events) {
    const reviewedAt = event.reviewedAt.getTime()
    if (
      !Number.isFinite(reviewedAt) ||
      reviewedAt < start ||
      reviewedAt > asOf ||
      ids.has(event.id)
    )
      continue
    ids.add(event.id)
    recordedAssessments += 1
    assessmentDays.add(getAnalyticsDateKey(event.reviewedAt, options.timeZone))
    if (event.isCorrect !== true && event.isCorrect !== false) continue
    knownCorrectnessAssessments += 1
    if (!event.isCorrect) continue
    successfulAssessments += 1
    successfulProblems.add(event.problemSlug)
    if (
      typeof event.elapsedSeconds === 'number' &&
      Number.isFinite(event.elapsedSeconds) &&
      event.elapsedSeconds > 0
    ) {
      timedSuccessfulAssessments += 1
      successfulRecordedSeconds += event.elapsedSeconds
    }
  }

  const whollyUnknown =
    recordedAssessments > 0 && knownCorrectnessAssessments === 0
  return {
    assessmentDays: assessmentDays.size,
    recordedAssessments,
    knownCorrectnessAssessments,
    successfulAssessments,
    distinctSuccessfulProblems: whollyUnknown ? null : successfulProblems.size,
    observedCorrectness:
      knownCorrectnessAssessments === 0
        ? null
        : successfulAssessments / knownCorrectnessAssessments,
    timedSuccessfulAssessments,
    untimedSuccessfulAssessments:
      successfulAssessments - timedSuccessfulAssessments,
    successfulRecordedSeconds:
      whollyUnknown ||
      (successfulAssessments > 0 && timedSuccessfulAssessments === 0)
        ? null
        : successfulRecordedSeconds,
  }
}

export function buildObservedRatingQuality(
  attempts: Array<{ rating: string; reviewedAt: Date }>,
  now: Date,
  range: PublicAnalyticsRange | 14,
  period?: ObservedRatingPeriod,
): ObservedRatingQualityResult {
  const since =
    period?.periodStart ?? (range === 'all' ? null : subtractDays(now, range))
  const periodEnd = period?.periodEnd ?? now
  const recent = attempts.filter(
    (a) =>
      (since === null || a.reviewedAt >= since) &&
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
    activity: input.activity,
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

function subtractDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() - days)
  return result
}
