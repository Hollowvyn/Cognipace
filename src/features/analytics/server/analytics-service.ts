import {
  getRetrievability,
  getTargetRetentionDuration,
  normalizeFsrsSchedulingOptions,
  parseFsrsCardState,
  type FsrsCardSnapshot,
} from '@/lib/fsrs'

import type { Db } from '@/platform/db'

import { getPracticeProgressSummary } from '@/features/practice/server/practice-service'
import { getSettings } from '@/features/settings/server/settings-service'
import type { AnalyticsRange } from '../api/analytics-contracts'

import {
  getReviewDayStats,
  getReviewHistory,
  getCurrentFsrsCards,
  getUpcomingCards,
  type CurrentFsrsCard,
} from '../data/analytics-repository'

import {
  buildHardAgainSummary,
  buildPredictedRecallSamples,
  buildPracticeRhythmPoints,
  buildRatingsMixPoints,
  buildRecallQualityPoints,
  buildStabilityPoints,
  buildTopicPoints,
  buildUpcomingLoadPoints,
  getValidStabilitySample,
  hasObservedCorrectnessReview,
  hasTopicRecallEvidence,
  hasValidReviewRating,
  reconstructOverdueBacklogSnapshots,
  type AnalyticsCurrentCard,
  type AnalyticsRangeOptions,
  type AnalyticsReviewEvent,
} from '../domain/chart-data'
import {
  calculateAnalyticsReadiness,
  findRichestReadyRange,
  type AnalyticsReadiness,
} from '../domain/analytics-readiness'
import {
  buildAnalyticsBucketsFromTimeFrame,
  type AnalyticsBucket,
} from '../domain/analytics-range-policy'
import {
  buildAnalyticsTimeFrame,
  buildForecastBounds,
} from '../domain/analytics-time'
import { buildHistoricalAnalyticsViews } from '../domain/historical-presentation'
import { buildCurrentStateAnalyticsViews } from '../domain/current-state-presentation'
import { buildWorkloadAnalyticsViews } from '../domain/workload-presentation'

import {
  buildObservedRatingQuality,
  buildAnalyticsSummary,
  type AnalyticsSummary,
} from '../domain/summary'

export async function getAnalyticsSummary(
  db: Db,
  nowOrOptions:
    | Date
    | { range: AnalyticsRange; now?: Date; timeZone?: string } = new Date(),
): Promise<AnalyticsSummary> {
  const now =
    nowOrOptions instanceof Date
      ? nowOrOptions
      : (nowOrOptions.now ?? new Date())
  const range = nowOrOptions instanceof Date ? 30 : nowOrOptions.range
  const timeZone =
    nowOrOptions instanceof Date ? 'UTC' : (nowOrOptions.timeZone ?? 'UTC')
  const presentationTimeFrame = buildAnalyticsTimeFrame({
    asOf: now,
    requestedDays: range,
    timeZone,
  })
  const periodEnd = new Date(presentationTimeFrame.asOf)
  const buckets = buildAnalyticsBucketsFromTimeFrame(presentationTimeFrame)
  const periodStart = buckets[0]!.start
  const forecastBounds = buildForecastBounds({
    asOf: now,
    timeZone: presentationTimeFrame.timeZone,
  })
  const fourteenDaysLater = new Date(forecastBounds.end)

  const [dayStats, reviewHistory, currentFsrsCards, upcomingCards, settings] =
    await Promise.all([
      getReviewDayStats(db),
      getReviewHistory(db),
      getCurrentFsrsCards(db),
      getUpcomingCards(db, fourteenDaysLater),
      getSettings(db),
    ])

  const fsrsOptions = normalizeFsrsSchedulingOptions({
    targetRetention: settings.review.targetRetention,
  })
  const recentRatings = reviewHistory.map(({ rating, reviewedAt }) => ({
    rating,
    reviewedAt,
  }))

  const practiceProgress = await getPracticeProgressSummary(db, {
    dailyGoal: settings.practice.dailyGoal,
  })

  // Step 4: build domain objects
  const observedRatingQuality = buildObservedRatingQuality(
    recentRatings,
    now,
    range,
    {
      periodStart: new Date(presentationTimeFrame.periodStart),
      periodEnd: new Date(presentationTimeFrame.periodEnd),
    },
  )
  const chartOptions: AnalyticsRangeOptions = {
    start: periodStart,
    end: now,
    buckets,
    fsrsOptions,
    timeZone: presentationTimeFrame.timeZone,
    timeFrame: presentationTimeFrame,
  }
  const analyticsReviewHistory = reviewHistory satisfies AnalyticsReviewEvent[]
  const analyticsCurrentCards = buildCurrentAnalyticsCards(
    currentFsrsCards,
    now,
    fsrsOptions,
  )
  const historicalViews = buildHistoricalAnalyticsViews(
    analyticsReviewHistory,
    {
      buckets,
      end: new Date(presentationTimeFrame.asOf),
      fsrsOptions,
      start: periodStart,
      timeZone: presentationTimeFrame.timeZone,
      timeFrame: presentationTimeFrame,
      analyticsTargets: settings.analytics,
    },
  )
  const currentStateViews = buildCurrentStateAnalyticsViews(
    analyticsCurrentCards.map((card) => ({
      cardId: card.cardId,
      slug: card.slug,
      title: card.title,
      retrievability: card.retrievability,
      targetDurationDays: card.fsrsCard
        ? getTargetRetentionDuration(
            card.fsrsCard,
            fsrsOptions.targetRetention,
            fsrsOptions,
          )
        : null,
      dueAt: card.dueAt,
      difficulty: card.difficulty,
      lapseCount: card.lapseCount,
      lastReviewAt: card.lastReviewAt,
      suspended: card.suspended ?? false,
    })),
    {
      asOf: now,
      targetRetention: fsrsOptions.targetRetention,
      timeZone: presentationTimeFrame.timeZone,
    },
  )
  const baseViews = { ...historicalViews, ...currentStateViews }
  const baselineEvidenceCounts = buildBucketEvidenceCounts(
    analyticsReviewHistory,
    buckets,
    periodEnd,
    hasValidReviewRating,
  )
  const requestedReadiness = calculateAnalyticsReadiness({
    requestedDays: range,
    evidenceCounts: baselineEvidenceCounts,
    bucketKeys: buckets.map((bucket) => bucket.key),
  })
  const correctnessEvidenceCounts = buildBucketEvidenceCounts(
    analyticsReviewHistory,
    buckets,
    periodEnd,
    hasObservedCorrectnessReview,
  )
  const recallReadiness = calculateAnalyticsReadiness({
    requestedDays: range,
    evidenceCounts: correctnessEvidenceCounts,
    bucketKeys: buckets.map((bucket) => bucket.key),
  })
  const practiceRhythmReadiness = calculateAnalyticsReadiness({
    requestedDays: range,
    evidenceCounts: correctnessEvidenceCounts,
    bucketKeys: buckets.map((bucket) => bucket.key),
  })
  const ratingsMixReadiness = requestedReadiness

  const recallQuality = buildRecallQualityPoints(
    analyticsReviewHistory,
    chartOptions,
  )
  const predictedRecall = buildMetricSummary(
    buildPredictedRecallSamples(analyticsReviewHistory, chartOptions).map(
      (sample) => sample.value,
    ),
  )
  const practiceRhythm = buildPracticeRhythmPoints(
    analyticsReviewHistory,
    chartOptions,
  )
  const ratingsMix = trimHistoricalPoints(
    buildRatingsMixPoints(analyticsReviewHistory, chartOptions),
    ratingsMixReadiness,
  )
  const hardAgain = buildHardAgainSummary(analyticsReviewHistory, chartOptions)
  const topics = buildTopicPoints(analyticsReviewHistory, chartOptions)
  const topicReadiness = calculateAnalyticsReadiness({
    requestedDays: range,
    evidenceCounts: buildBucketEvidenceCounts(
      analyticsReviewHistory,
      buckets,
      periodEnd,
      hasTopicRecallEvidence,
    ),
    bucketKeys: buckets.map((bucket) => bucket.key),
  })
  const stability = buildStabilityPoints(analyticsReviewHistory, chartOptions)
  const stabilityReadiness = calculateAnalyticsReadiness({
    requestedDays: range,
    evidenceCounts: buildBucketEvidenceCounts(
      analyticsReviewHistory,
      buckets,
      periodEnd,
      (event) => getValidStabilitySample(event) !== null,
    ),
    bucketKeys: buckets.map((bucket) => bucket.key),
  })
  const overdueSnapshots = reconstructOverdueBacklogSnapshots(
    analyticsReviewHistory,
    analyticsCurrentCards,
    chartOptions,
  )
  const overdueReadiness = calculateAnalyticsReadiness({
    requestedDays: range,
    evidenceCounts: bucketCountsFromDatedObservations(
      buckets,
      overdueSnapshots,
    ),
    bucketKeys: buckets.map((bucket) => bucket.key),
  })
  const historicalReadiness = {
    requested: requestedReadiness,
    recallQuality: recallReadiness,
    practiceRhythm: practiceRhythmReadiness,
    ratingsMix: ratingsMixReadiness,
    topics: topicReadiness,
    stability: stabilityReadiness,
    overdueBacklog: overdueReadiness,
    recommendedRange: requestedReadiness.ready
      ? null
      : findRecommendedRange(
          analyticsReviewHistory,
          now,
          range,
          presentationTimeFrame.timeZone,
        ),
  }
  const upcomingLoad = buildUpcomingLoadPoints(
    upcomingCards.map((card) => card.dueAt),
    now,
    presentationTimeFrame.timeZone,
  )
  const workloadViews = buildWorkloadAnalyticsViews({
    overdueSnapshots,
    timeFrame: presentationTimeFrame,
    upcomingLoad,
  })
  const views = { ...baseViews, ...workloadViews }
  // Step 5: assemble
  return buildAnalyticsSummary({
    generatedAt: now,
    timeFrame: presentationTimeFrame,
    reviewDays: dayStats.reviewDays,
    totalReviews: dayStats.totalReviews,
    currentStreak: practiceProgress.currentStreak,
    observedRatingQuality,
    range,
    targetRetention: fsrsOptions.targetRetention,
    views,
    historicalReadiness,
    predictedRecall,
    recallQuality,
    practiceRhythm,
    ratingsMix,
    hardAgain,
    topics,
    stability,
  })
}

function buildCurrentAnalyticsCards(
  cards: CurrentFsrsCard[],
  now: Date,
  fsrsOptions: ReturnType<typeof normalizeFsrsSchedulingOptions>,
): AnalyticsCurrentCard[] {
  return cards.map((card) => {
    const fsrsCard = buildCurrentCard(card)
    return {
      fsrsCard,
      cardId: card.cardId,
      slug: card.problemSlug,
      title: card.title,
      topics: card.topics,
      retrievability: getRetrievability(fsrsCard, now, fsrsOptions),
      targetRetention: fsrsOptions.targetRetention,
      stabilityDays: card.stability,
      difficulty: card.difficulty,
      lapseCount: card.lapses,
      dueAt: card.dueAt,
      createdAt: card.createdAt,
      lastReviewAt: card.lastReviewAt,
      suspended: card.isSuspended || card.practiceStatus === 'suspended',
    }
  })
}

function buildCurrentCard(card: CurrentFsrsCard): FsrsCardSnapshot {
  return {
    dueAt: card.dueAt,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: parseFsrsCardState(card.state),
    lastReviewAt: card.lastReviewAt,
  }
}

function buildMetricSummary(
  values: readonly number[],
  lowSampleThreshold = 10,
): { value: number | null; sampleSize: number; lowSample: boolean } {
  const sampleSize = values.length
  if (sampleSize < lowSampleThreshold) {
    return { value: null, sampleSize, lowSample: true }
  }

  return {
    value: values.reduce((sum, value) => sum + value, 0) / sampleSize,
    sampleSize,
    lowSample: false,
  }
}

function buildBucketEvidenceCounts(
  events: readonly AnalyticsReviewEvent[],
  buckets: readonly AnalyticsBucket[],
  periodEnd: Date,
  isEligible: (event: AnalyticsReviewEvent) => boolean,
): number[] {
  return buckets.map(
    (bucket) =>
      events.filter(
        (event) =>
          event.reviewedAt >= bucket.start &&
          event.reviewedAt <= bucket.end &&
          event.reviewedAt <= periodEnd &&
          isEligible(event),
      ).length,
  )
}

function bucketCountsFromDatedObservations<T extends { date: Date }>(
  buckets: readonly AnalyticsBucket[],
  observations: readonly T[],
): number[] {
  return buckets.map(
    (bucket) =>
      observations.filter(
        (observation) =>
          observation.date >= bucket.start && observation.date <= bucket.end,
      ).length,
  )
}

function trimHistoricalPoints<T extends { bucketStart: string }>(
  points: readonly T[],
  readiness: AnalyticsReadiness,
): T[] {
  if (readiness.effectiveStart === null) return []

  const effectiveStartIndex = points.findIndex(
    (point) => point.bucketStart === readiness.effectiveStart,
  )

  return effectiveStartIndex === -1 ? [] : points.slice(effectiveStartIndex)
}

function findRecommendedRange(
  events: readonly AnalyticsReviewEvent[],
  now: Date,
  requestedDays: AnalyticsRange,
  timeZone: string,
): AnalyticsRange | null {
  const ranges = ([14, 30, 90] as const)
    .filter((range) => range < requestedDays)
    .map((range) => {
      const buckets = buildAnalyticsBucketsFromTimeFrame(
        buildAnalyticsTimeFrame({
          asOf: now,
          requestedDays: range,
          timeZone,
        }),
      )
      const readiness = calculateAnalyticsReadiness({
        requestedDays: range,
        evidenceCounts: buildBucketEvidenceCounts(
          events,
          buckets,
          now,
          hasValidReviewRating,
        ),
        bucketKeys: buckets.map((bucket) => bucket.key),
      })

      return { range, ready: readiness.ready }
    })

  const recommendedRange = findRichestReadyRange(ranges)
  return recommendedRange === 14 ||
    recommendedRange === 30 ||
    recommendedRange === 90
    ? recommendedRange
    : null
}
