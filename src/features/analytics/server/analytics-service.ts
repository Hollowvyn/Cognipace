import {
  getRetrievability,
  getTargetRetentionDuration,
  normalizeFsrsSchedulingOptions,
  parseFsrsCardState,
  parseSerializedFsrsSchedulerProfile,
  type FsrsCardSnapshot,
} from '@/lib/fsrs'

import type { Db } from '@/platform/db'

import { derivePracticeScheduleTiming } from '@/features/practice'
import { getPracticeProgressSummary } from '@/features/practice/server/practice-service'
import { getSettings } from '@/features/settings/server/settings-service'
import type { AnalyticsRange } from '../api/analytics-contracts'

import {
  getReviewDayStats,
  getReviewHistory,
  getCurrentFsrsCards,
  type CurrentFsrsCard,
} from '../data/analytics-repository'

import {
  buildHardAgainSummary,
  buildPracticeRhythmPoints,
  buildRatingsMixPoints,
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
} from '../domain/analytics-readiness'
import {
  buildAnalyticsBucketsFromTimeFrame,
  type AnalyticsBucket,
} from '../domain/analytics-range-policy'
import { buildAnalyticsHistoryTimeFrame } from '../domain/analytics-history-frame'
import { buildAnalyticsBacklogTimeFrame } from '../domain/analytics-history-window'
import type { AnalyticsTimeFrame } from '../domain/analytics-time'
import { buildHistoricalAnalyticsViews } from '../domain/historical-presentation'
import { buildRepeatReviewPairs } from '../domain/review-cohorts'
import { buildCurrentStateAnalyticsViews } from '../domain/current-state-presentation'
import { buildWorkloadAnalyticsViews } from '../domain/workload-presentation'

import {
  buildObservedRatingQuality,
  buildAnalyticsSummary,
  buildSelectedActivity,
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

  const [dayStats, reviewHistory, currentFsrsCards, settings] =
    await Promise.all([
      getReviewDayStats(db),
      getReviewHistory(db),
      getCurrentFsrsCards(db),
      getSettings(db),
    ])

  const presentationTimeFrame = buildAnalyticsHistoryTimeFrame({
    selection: range,
    asOf: now,
    timeZone,
    history: reviewHistory,
  })
  const periodEnd = new Date(presentationTimeFrame.asOf)
  const buckets = buildAnalyticsBucketsFromTimeFrame(presentationTimeFrame)
  const periodStart = new Date(presentationTimeFrame.periodStart)
  const backlogTimeFrame: AnalyticsTimeFrame = {
    ...buildAnalyticsBacklogTimeFrame({ asOf: now, timeZone }),
    requestedDays: 30,
    grouping: { unit: 'day', step: 1 },
  }
  const backlogBuckets = buildAnalyticsBucketsFromTimeFrame(backlogTimeFrame)
  const fsrsOptions = normalizeFsrsSchedulingOptions({
    targetRetention: settings.review.targetRetention,
  })
  const recentRatings = reviewHistory.map(({ rating, reviewedAt }) => ({
    rating,
    reviewedAt,
  }))

  const practiceProgress = await getPracticeProgressSummary(db, {
    dailyGoal: settings.practice.dailyGoal,
    now,
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
  const activity = buildSelectedActivity(analyticsReviewHistory, {
    start: periodStart,
    asOf: periodEnd,
    timeZone: presentationTimeFrame.timeZone,
  })
  const pairedReviews = buildRepeatReviewPairs(analyticsReviewHistory, {
    start: new Date(presentationTimeFrame.history?.nominalStart ?? periodStart),
    end: periodEnd,
    fsrsOptions,
  })
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
      pairedReviews,
      analyticsTargets: settings.analytics,
      timeTargetsMinutes: settings.assessment.timeTargetsMinutes,
    },
  )
  const currentStateViews = buildCurrentStateAnalyticsViews(
    analyticsCurrentCards.map((card) => ({
      cardId: card.cardId,
      slug: card.slug,
      title: card.title,
      retrievability: card.retrievability,
      ...(card.modelProvenance
        ? { modelProvenance: card.modelProvenance }
        : {}),
      targetDurationDays: card.fsrsCard
        ? getTargetRetentionDuration(
            card.fsrsCard,
            fsrsOptions.targetRetention,
            card.modelOptions ?? fsrsOptions,
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
    requestedDays: presentationTimeFrame.requestedDays,
    grouping: presentationTimeFrame.grouping,
    availableDays: presentationTimeFrame.history?.availableDays,
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
    requestedDays: presentationTimeFrame.requestedDays,
    grouping: presentationTimeFrame.grouping,
    availableDays: presentationTimeFrame.history?.availableDays,
    evidenceCounts: buildBucketEvidenceCounts(
      pairedReviews,
      buckets,
      periodEnd,
      () => true,
    ),
    bucketKeys: buckets.map((bucket) => bucket.key),
  })
  const firstAttemptReadiness = calculateAnalyticsReadiness({
    requestedDays: presentationTimeFrame.requestedDays,
    grouping: presentationTimeFrame.grouping,
    availableDays: presentationTimeFrame.history?.availableDays,
    evidenceCounts: historicalViews.problemSolving.cohorts.newProblems.rows.map(
      (row) =>
        Object.values(row.difficulties).reduce(
          (sum, stats) => sum + stats.validRatings,
          0,
        ),
    ),
    bucketKeys: buckets.map((bucket) => bucket.key),
  })
  const practiceRhythmReadiness = calculateAnalyticsReadiness({
    requestedDays: presentationTimeFrame.requestedDays,
    grouping: presentationTimeFrame.grouping,
    availableDays: presentationTimeFrame.history?.availableDays,
    evidenceCounts: correctnessEvidenceCounts,
    bucketKeys: buckets.map((bucket) => bucket.key),
  })
  const ratingsMixReadiness = requestedReadiness

  const recallQuality = historicalViews.observedRecallVsFsrs.rows.map(
    (row) => ({
      bucketStart: row.bucketStart,
      bucketEnd: row.bucketEnd,
      observedRecall: row.observedRecall,
      predictedRecall: row.fsrsEstimate,
      targetRetention: fsrsOptions.targetRetention,
      reviewCount: row.pairedReviews,
      eligibleSampleSize: row.pairedReviews,
    }),
  )
  const predictedRecall = buildMetricSummary(
    pairedReviews.flatMap((pair) =>
      pair.estimate === null ? [] : [pair.estimate],
    ),
  )
  const practiceRhythm = buildPracticeRhythmPoints(
    analyticsReviewHistory,
    chartOptions,
  )
  const ratingsMix = buildRatingsMixPoints(analyticsReviewHistory, chartOptions)
  const hardAgain = buildHardAgainSummary(analyticsReviewHistory, chartOptions)
  const topics = buildTopicPoints(analyticsReviewHistory, chartOptions)
  const topicReadiness = calculateAnalyticsReadiness({
    requestedDays: presentationTimeFrame.requestedDays,
    grouping: presentationTimeFrame.grouping,
    availableDays: presentationTimeFrame.history?.availableDays,
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
    requestedDays: presentationTimeFrame.requestedDays,
    grouping: presentationTimeFrame.grouping,
    availableDays: presentationTimeFrame.history?.availableDays,
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
    {
      ...chartOptions,
      start: new Date(backlogTimeFrame.periodStart),
      buckets: backlogBuckets,
      timeFrame: backlogTimeFrame,
    },
  )
  const overdueReadiness = calculateAnalyticsReadiness({
    requestedDays: 30,
    grouping: backlogTimeFrame.grouping,
    evidenceCounts: bucketCountsFromDatedObservations(
      backlogBuckets,
      overdueSnapshots,
    ),
    bucketKeys: backlogBuckets.map((bucket) => bucket.key),
  })
  const historicalReadiness = {
    firstAttemptOutcomes: firstAttemptReadiness,
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
    currentFsrsCards.flatMap((card) => {
      if (
        card.isSuspended ||
        card.practiceStatus === 'suspended' ||
        (settings.practice.problemFilters.skipPremium && card.isPremium)
      )
        return []
      const timing = derivePracticeScheduleTiming({
        dueAt: card.dueAt,
        lastReviewedAt: card.lastReviewAt ?? card.practiceLastReviewedAt,
        isStarted:
          card.reps > 0 ||
          card.lastReviewAt !== null ||
          card.practiceLastReviewedAt !== null,
        isSuspended: false,
        now,
        timeZone: presentationTimeFrame.timeZone,
      })
      return timing.eligibleOn ? [timing.eligibleOn] : []
    }),
    now,
    presentationTimeFrame.timeZone,
  )
  const workloadViews = buildWorkloadAnalyticsViews({
    overdueSnapshots,
    timeFrame: backlogTimeFrame,
    upcomingLoad,
  })
  const views = { ...baseViews, ...workloadViews }
  // Step 5: assemble
  return buildAnalyticsSummary({
    generatedAt: now,
    timeFrame: presentationTimeFrame,
    activity,
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
    let cardOptions:
      | ReturnType<typeof normalizeFsrsSchedulingOptions>
      | import('@/lib/fsrs').FsrsEffectiveParameters = fsrsOptions
    let modelProvenance: AnalyticsCurrentCard['modelProvenance'] =
      'compatibility'
    if (
      card.lastSchedulerProfileJson &&
      card.lastSchedulingEvidenceKind !== 'unknown'
    ) {
      try {
        cardOptions = parseSerializedFsrsSchedulerProfile(
          card.lastSchedulerProfileJson,
        ).parameters
        modelProvenance = card.lastSchedulingEvidenceKind
      } catch {
        // Explicit compatibility estimate retains the visible current card.
      }
    }
    return {
      fsrsCard,
      modelOptions: cardOptions,
      modelProvenance,
      cardId: card.cardId,
      slug: card.problemSlug,
      title: card.title,
      topics: card.topics,
      retrievability: getRetrievability(fsrsCard, now, cardOptions),
      targetRetention: fsrsOptions.targetRetention,
      stabilityDays: card.stability,
      difficulty: card.difficulty,
      lapseCount: card.lapses,
      dueAt: card.dueAt,
      createdAt: card.createdAt,
      lastReviewAt: card.lastReviewAt ?? card.practiceLastReviewedAt,
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
    lastReviewAt: card.lastReviewAt ?? card.practiceLastReviewedAt,
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

function buildBucketEvidenceCounts<T extends { reviewedAt: Date }>(
  events: readonly T[],
  buckets: readonly AnalyticsBucket[],
  periodEnd: Date,
  isEligible: (event: T) => boolean,
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

function findRecommendedRange(
  events: readonly AnalyticsReviewEvent[],
  now: Date,
  requestedDays: AnalyticsRange,
  timeZone: string,
): 30 | 90 | null {
  const ranges = ([30, 90] as const)
    .filter((range) => requestedDays === 'all' || range < requestedDays)
    .map((range) => {
      const timeFrame = buildAnalyticsHistoryTimeFrame({
        selection: range,
        asOf: now,
        timeZone,
        history: events,
      })
      const buckets = buildAnalyticsBucketsFromTimeFrame(timeFrame)
      const readiness = calculateAnalyticsReadiness({
        requestedDays: range,
        grouping: timeFrame.grouping,
        availableDays: timeFrame.history?.availableDays,
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
  return recommendedRange === 30 || recommendedRange === 90
    ? recommendedRange
    : null
}
