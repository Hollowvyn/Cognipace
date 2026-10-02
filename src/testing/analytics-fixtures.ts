import type { SerializedAnalyticsSummary } from '@/features/analytics/api/analytics-contracts'

function createUnreadyReadiness(): SerializedAnalyticsSummary['historicalReadiness']['requested'] {
  return {
    ready: false,
    requestedDays: 30,
    bucketDays: 3,
    requestedBuckets: 10,
    effectiveBuckets: 0,
    effectiveStart: null,
    assessments: 0,
    minimumAssessments: 24,
    activeBuckets: 0,
    minimumActiveBuckets: 0,
    longestGap: 0,
    maximumGap: 2,
    gapRuns: 0,
    maximumGapRuns: 1,
    failingReasons: [
      'no-evidence',
      'insufficient-span',
      'insufficient-assessments',
      'insufficient-active-buckets',
    ],
  }
}

function createHistoricalReadiness(): SerializedAnalyticsSummary['historicalReadiness'] {
  const readiness = createUnreadyReadiness()

  return {
    requested: readiness,
    recallQuality: { ...readiness },
    practiceRhythm: { ...readiness },
    ratingsMix: { ...readiness },
    topics: { ...readiness },
    stability: { ...readiness },
    overdueBacklog: { ...readiness },
    recommendedRange: null,
  }
}

export function createSerializedAnalyticsSummary(
  overrides?: Partial<SerializedAnalyticsSummary>,
): SerializedAnalyticsSummary {
  return {
    range: 30,
    generatedAt: '2026-05-30T00:00:00.000Z',
    timeFrame: {
      asOf: '2026-05-30T00:00:00.000Z',
      timeZone: 'UTC',
      timeZoneFallback: false,
      requestedDays: 30,
      periodStart: '2026-05-01T00:00:00.000Z',
      periodEnd: '2026-05-31T00:00:00.000Z',
      buckets: [
        {
          key: '2026-05-01',
          start: '2026-05-01T00:00:00.000Z',
          end: '2026-05-04T00:00:00.000Z',
          startKey: '2026-05-01',
          endKey: '2026-05-03',
          isPartial: false,
        },
      ],
    },
    reviewDays: 30,
    totalReviews: 150,
    currentStreak: 7,
    observedRatingQuality: { value: 0.85, sampleSize: 50, lowSample: false },
    observedRatingSampleSize: 50,
    lowSample: false,
    targetRetention: 0.9,
    views: {
      observedRecallVsFsrs: {
        rows: [],
        scale: { domain: [0, 1], ticks: [0, 1] },
        targetRetention: 0.9,
      },
      memoryStrength: {
        rows: [],
        scale: { domain: [0, 2], ticks: [0, 1, 2] },
      },
      practiceRhythm: {
        rows: [],
        countScale: { domain: [0, 1], ticks: [0, 1] },
        percentageScale: { domain: [0, 1], ticks: [0, 1] },
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
        targetRetention: 0.9,
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
    },
    historicalReadiness: createHistoricalReadiness(),
    ...overrides,
  }
}
