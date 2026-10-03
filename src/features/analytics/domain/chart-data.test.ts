import { describe, expect, it } from 'vitest'

import {
  getRetrievability,
  normalizeFsrsSchedulingOptions,
  serializeFsrsReviewLogSnapshot,
  scheduleReview,
  createInitialFsrsCard,
} from '@/lib/fsrs'

import {
  buildHardAgainSummary,
  buildPredictedRecallSamples,
  buildPracticeRhythmPoints,
  buildRatingsMixPoints,
  buildRecallQualityPoints,
  buildStabilityPoints,
  buildTopicPoints,
  buildUpcomingLoadPoints,
  reconstructOverdueBacklogSnapshots,
  toAnalyticsDateKey,
  type AnalyticsCurrentCard,
  type AnalyticsReviewEvent,
} from './chart-data'
import { buildAnalyticsTimeFrame } from './analytics-time'
import { metricDefinitions } from './metric-definitions'

const start = new Date('2026-08-01T00:00:00.000Z')
const end = new Date('2026-08-03T23:59:59.999Z')
const options = {
  start,
  end,
  buckets: [
    {
      key: '2026-08-01',
      start: new Date('2026-08-01T00:00:00.000Z'),
      end: new Date('2026-08-01T23:59:59.999Z'),
      label: '2026-08-01',
    },
    {
      key: '2026-08-02',
      start: new Date('2026-08-02T00:00:00.000Z'),
      end: new Date('2026-08-02T23:59:59.999Z'),
      label: '2026-08-02',
    },
    {
      key: '2026-08-03',
      start: new Date('2026-08-03T00:00:00.000Z'),
      end,
      label: '2026-08-03',
    },
  ],
  fsrsOptions: normalizeFsrsSchedulingOptions(),
  lowSampleThreshold: 2,
}

function buildTestBuckets({
  requestedDays,
  periodEnd,
}: {
  requestedDays: number
  periodEnd: Date
}) {
  const bucketDays = requestedDays === 30 ? 3 : 1
  const first = new Date(periodEnd)
  first.setUTCHours(0, 0, 0, 0)
  first.setUTCDate(first.getUTCDate() - (requestedDays - 1))
  const buckets = []

  for (let offset = 0; offset < requestedDays; offset += bucketDays) {
    const start = new Date(first)
    start.setUTCDate(start.getUTCDate() + offset)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + bucketDays - 1)
    end.setUTCHours(23, 59, 59, 999)
    if (end > periodEnd) end.setTime(periodEnd.getTime())
    const key = start.toISOString().slice(0, 10)
    const endKey = end.toISOString().slice(0, 10)
    buckets.push({
      key,
      start,
      end,
      label: key === endKey ? key : `${key} – ${endKey}`,
    })
  }

  return buckets
}
const validLog = (stability: number) =>
  JSON.stringify({
    rating: 'good',
    state: 'review',
    dueAt: '2026-08-01T12:00:00.000Z',
    stability,
    difficulty: 5,
    elapsedDays: 1,
    lastElapsedDays: 1,
    scheduledDays: 4,
    learningSteps: 0,
    reviewedAt: '2026-08-01T12:00:00.000Z',
  })

function event(
  overrides: Partial<AnalyticsReviewEvent> = {},
): AnalyticsReviewEvent {
  return {
    id: '1',
    cardId: 'card-1',
    problemSlug: 'two-sum',
    title: 'Two Sum',
    topicLabels: ['Array'],
    rating: 'good',
    reviewedAt: new Date('2026-08-01T12:00:00.000Z'),
    isCorrect: true,
    fsrsReviewLog: validLog(4),
    ...overrides,
  }
}

describe('analytics chart-data builders', () => {
  it('uses the same repeat rating cohort for both legacy recall rates despite nullable or conflicting correctness', () => {
    const reviews = [
      event({ id: 'initial', reviewedAt: new Date('2026-07-31T12:00:00Z') }),
      event({ id: 'repeat-again', rating: 'again', isCorrect: true }),
      event({
        id: 'repeat-hard',
        rating: 'hard',
        isCorrect: null,
        reviewedAt: new Date('2026-08-01T13:00:00Z'),
      }),
      event({ id: 'new-card', cardId: 'new-card', rating: 'easy' }),
    ]
    const points = buildRecallQualityPoints(reviews, options)
    expect(points[0]).toMatchObject({
      reviewCount: 2,
      eligibleSampleSize: 2,
      observedRecall: 0.5,
    })
    expect(buildPredictedRecallSamples(reviews, options)).toHaveLength(2)
    expect(
      buildRecallQualityPoints([event({ isCorrect: null })], options),
    ).toEqual([])
  })
  it('describes persisted correctness without inventing retry exclusion', () => {
    expect(metricDefinitions.observedCorrectness.label).toBe(
      'Observed correctness',
    )
    expect(metricDefinitions.observedCorrectness.explanation).toContain(
      'does not identify retries',
    )
    expect(metricDefinitions).not.toHaveProperty('overdueBacklog')
  })

  it('defines practice rhythm by review volume in adaptive buckets', () => {
    expect(metricDefinitions).not.toHaveProperty('consistency')
    expect(metricDefinitions.practiceRhythm).toMatchObject({
      label: 'Practice rhythm',
      unit: 'reviews per adaptive bucket',
    })
    expect(metricDefinitions.practiceRhythm.explanation).toContain(
      'Review volume per selected adaptive time bucket',
    )
    expect(metricDefinitions.practiceRhythm.explanation).toContain(
      'does not establish causation',
    )
    expect(metricDefinitions.practiceRhythm.lowSampleOrEmptyState).not.toMatch(
      /week|practice days/i,
    )
  })

  it('describes ratings mix with selected time buckets', () => {
    expect(metricDefinitions.ratingsMix.explanation).toContain(
      'selected time buckets',
    )
    expect(metricDefinitions.ratingsMix.explanation).not.toMatch(/daily|week/i)
  })

  it('builds daily observed and pre-review predicted recall with null empty samples', () => {
    const points = buildRecallQualityPoints(
      [
        event({
          id: 'prior-one',
          reviewedAt: new Date('2026-07-31T12:00:00Z'),
        }),
        event({
          id: 'prior-two',
          cardId: 'card-2',
          reviewedAt: new Date('2026-07-31T12:00:00Z'),
        }),
        event(),
        event({
          id: '2',
          cardId: 'card-2',
          isCorrect: false,
          rating: 'again',
          reviewedAt: new Date('2026-08-02T12:00:00.000Z'),
        }),
      ],
      options,
    )
    expect(
      points.map(
        ({ bucketStart, reviewCount, eligibleSampleSize, observedRecall }) => ({
          bucketStart,
          reviewCount,
          eligibleSampleSize,
          observedRecall,
        }),
      ),
    ).toEqual([
      {
        bucketStart: '2026-08-01',
        reviewCount: 1,
        eligibleSampleSize: 1,
        observedRecall: 1,
      },
      {
        bucketStart: '2026-08-02',
        reviewCount: 1,
        eligibleSampleSize: 1,
        observedRecall: 0,
      },
      {
        bucketStart: '2026-08-03',
        reviewCount: 0,
        eligibleSampleSize: 0,
        observedRecall: null,
      },
    ])
    expect(points[0]!.predictedRecall).not.toBeNull()
  })

  it('does not create observed metric points from invalid rated reviews', () => {
    const invalidRating = event({
      rating: 'unexpected-rating',
      isCorrect: false,
      topicLabels: ['Graph'],
      fsrsReviewLog: validLog(99),
    })

    expect(buildRecallQualityPoints([invalidRating], options)).toEqual([])
    expect(buildPracticeRhythmPoints([invalidRating], options)).toEqual([])
    expect(buildTopicPoints([invalidRating], options)).toEqual([])
    expect(buildStabilityPoints([invalidRating], options)).toEqual([])
  })

  it('excludes invalid ratings from mixed observed metric aggregations', () => {
    const validReview = event({ fsrsReviewLog: validLog(4) })
    const invalidRating = event({
      id: 'invalid-rating',
      cardId: 'invalid-rating-card',
      rating: 'unexpected-rating',
      isCorrect: false,
      topicLabels: ['Graph'],
      fsrsReviewLog: validLog(99),
    })

    expect(
      buildRecallQualityPoints(
        [
          event({ id: 'prior', reviewedAt: new Date('2026-07-31T12:00:00Z') }),
          validReview,
          invalidRating,
        ],
        options,
      )[0],
    ).toMatchObject({
      reviewCount: 1,
      eligibleSampleSize: 1,
      observedRecall: 1,
    })
    expect(
      buildPracticeRhythmPoints([validReview, invalidRating], options)[0],
    ).toMatchObject({
      reviewCount: 1,
      sampleSize: 1,
      observedCorrectness: 1,
    })
    expect(buildTopicPoints([validReview, invalidRating], options)).toEqual([
      {
        topic: 'Array',
        recallQuality: 1,
        sampleSize: 1,
        lowSample: true,
      },
    ])
    expect(
      buildStabilityPoints([validReview, invalidRating], options)[0],
    ).toMatchObject({
      medianStabilityDays: 4,
      sampleSize: 1,
    })
  })

  it('keeps no eligible assessments unknown and handles zero-review days', () => {
    const points = buildRecallQualityPoints(
      [event({ isCorrect: null })],
      options,
    )
    expect(points).toEqual([])
  })

  it('keeps every post-start practice bucket and reports no-practice buckets as zero', () => {
    const points = buildPracticeRhythmPoints(
      [event({ reviewedAt: new Date('2026-08-01T12:00:00.000Z') })],
      options,
    )

    expect(points).toHaveLength(options.buckets.length)
    expect(points.map((point) => point.reviewCount)).toEqual([1, 0, 0])
    expect(points.map((point) => point.observedCorrectness)).toEqual([
      1,
      null,
      null,
    ])
  })

  it('changes predicted recall when pre-range history is included', () => {
    const inRangeEvents = [
      event({
        reviewedAt: new Date('2026-08-02T12:00:00.000Z'),
        rating: 'good',
      }),
      event({
        id: '2',
        reviewedAt: new Date('2026-08-03T12:00:00.000Z'),
        rating: 'good',
      }),
    ]
    const withPreRangeHistory = [
      event({
        id: '0',
        reviewedAt: new Date('2026-07-01T12:00:00.000Z'),
        rating: 'again',
      }),
      ...inRangeEvents,
    ]

    const inRangeOnly = buildRecallQualityPoints(inRangeEvents, options)
    const replayed = buildRecallQualityPoints(withPreRangeHistory, options)

    expect(
      replayed.find((point) => point.bucketStart === '2026-08-03')
        ?.predictedRecall,
    ).not.toBe(
      inRangeOnly.find((point) => point.bucketStart === '2026-08-03')
        ?.predictedRecall,
    )
  })

  it('replays multiple cards with the configured normalized FSRS options', () => {
    const fsrsOptions = normalizeFsrsSchedulingOptions({
      targetRetention: 0.75,
      enableShortTerm: false,
      learningSteps: ['1d'],
      relearningSteps: ['2d'],
    })
    const configuredOptions = { ...options, fsrsOptions }
    const firstReview = event({
      reviewedAt: new Date('2026-08-01T12:00:00.000Z'),
    })
    const secondCardReview = event({
      id: '2',
      cardId: 'card-2',
      reviewedAt: new Date('2026-08-02T12:00:00.000Z'),
      rating: 'easy',
    })
    const repeatReview = event({
      id: '3',
      cardId: 'card-1',
      reviewedAt: new Date('2026-08-03T12:00:00.000Z'),
      rating: 'again',
    })
    const points = buildRecallQualityPoints(
      [firstReview, secondCardReview, repeatReview],
      configuredOptions,
    )
    let card = createInitialFsrsCard(firstReview.reviewedAt)
    card = scheduleReview(
      card,
      'good',
      firstReview.reviewedAt,
      fsrsOptions,
    ).card
    const expectedBeforeRepeat = getRetrievability(
      card,
      repeatReview.reviewedAt,
      fsrsOptions,
    )
    expect(points[0]!.predictedRecall).toBeCloseTo(expectedBeforeRepeat)
    expect(points[0]).toMatchObject({
      bucketStart: '2026-08-03',
      reviewCount: 1,
      observedRecall: 0,
    })
  })

  it('returns one predicted-recall sample for every same-day repeat review', () => {
    const firstReview = event({
      id: 'same-day-1',
      reviewedAt: new Date('2026-08-02T12:00:00.000Z'),
      rating: 'good',
    })
    const secondReview = event({
      id: 'same-day-2',
      reviewedAt: new Date('2026-08-02T12:05:00.000Z'),
      rating: 'hard',
    })

    const samples = buildPredictedRecallSamples(
      [firstReview, secondReview],
      options,
    )
    const points = buildRecallQualityPoints(
      [firstReview, secondReview],
      options,
    )

    expect(samples).toHaveLength(1)
    expect(samples.every((sample) => sample.date === '2026-08-02')).toBe(true)
    expect(
      points.find((point) => point.bucketStart === '2026-08-02'),
    ).toMatchObject({
      bucketStart: '2026-08-02',
      reviewCount: 1,
    })
    expect(
      points.find((point) => point.bucketStart === '2026-08-02')
        ?.predictedRecall,
    ).not.toBeNull()
  })

  it('builds practice rhythm by bucket as association-only', () => {
    const points = buildPracticeRhythmPoints(
      [
        event(),
        event({
          id: '2',
          reviewedAt: new Date('2026-08-01T12:05:00.000Z'),
          isCorrect: false,
        }),
      ],
      options,
    )
    expect(points[0]).toMatchObject({
      bucketStart: '2026-08-01',
      bucketEnd: '2026-08-01',
      reviewCount: 2,
      observedCorrectness: 0.5,
      sampleSize: 2,
      associationOnly: true,
    })
  })

  it('aggregates adaptive buckets from raw review evidence', () => {
    const adaptiveEnd = new Date('2026-08-30T23:59:59.999Z')
    const adaptiveOptions = {
      start: new Date('2026-08-01T00:00:00.000Z'),
      end: adaptiveEnd,
      buckets: buildTestBuckets({
        requestedDays: 30,
        periodEnd: adaptiveEnd,
      }).slice(0, 3),
      fsrsOptions: normalizeFsrsSchedulingOptions(),
      lowSampleThreshold: 2,
    }
    const events = [
      event({ id: 'again', rating: 'again', isCorrect: false }),
      event({ id: 'hard', rating: 'hard' }),
      event({ id: 'good-1' }),
      event({ id: 'good-2' }),
      event({ id: 'good-3' }),
      event({ id: 'easy', rating: 'easy' }),
      ...Array.from({ length: 4 }, (_, index) =>
        event({
          id: `second-${index}`,
          cardId: `second-card-${index}`,
          reviewedAt: new Date('2026-08-04T12:00:00.000Z'),
        }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        event({
          id: `third-${index}`,
          cardId: `third-card-${index}`,
          reviewedAt: new Date('2026-08-07T12:00:00.000Z'),
        }),
      ),
    ]

    expect(
      buildRecallQualityPoints(events, adaptiveOptions).map(
        (point) => point.reviewCount,
      ),
    ).toEqual([5, 0, 0])
    expect(buildRatingsMixPoints(events, adaptiveOptions)[0]).toMatchObject({
      again: 1,
      hard: 1,
      good: 3,
      easy: 1,
      total: 6,
    })
    expect(buildPracticeRhythmPoints(events, adaptiveOptions)[0]).toMatchObject(
      {
        reviewCount: 6,
        observedCorrectness: 5 / 6,
        sampleSize: 6,
      },
    )
  })

  it('keeps post-start practice buckets while other metrics trim unsupported leading buckets', () => {
    const periodEnd = new Date('2026-08-30T23:59:59.999Z')
    const buckets = buildTestBuckets({
      requestedDays: 30,
      periodEnd,
    }).slice(0, 3)
    const bucketOptions = {
      ...options,
      start: buckets[0]!.start,
      end: buckets[2]!.end,
      buckets,
    }
    const events = [
      event({
        id: 'unrated-review',
        rating: 'unknown',
        isCorrect: null,
        fsrsReviewLog: null,
      }),
      event({
        id: 'eligible-review',
        cardId: 'eligible-card',
        reviewedAt: new Date('2026-08-04T12:00:00.000Z'),
      }),
    ]

    expect(
      buildRecallQualityPoints(
        [
          event({
            id: 'eligible-prior',
            cardId: 'eligible-card',
            reviewedAt: new Date('2026-07-31T12:00:00Z'),
          }),
          ...events,
        ],
        bucketOptions,
      ),
    ).toMatchObject([
      { bucketStart: '2026-08-04', reviewCount: 1 },
      {
        bucketStart: '2026-08-07',
        reviewCount: 0,
        observedRecall: null,
        predictedRecall: null,
      },
    ])
    expect(buildPracticeRhythmPoints(events, bucketOptions)).toMatchObject([
      { bucketStart: '2026-08-04', reviewCount: 1, sampleSize: 1 },
      { bucketStart: '2026-08-07', reviewCount: 0, sampleSize: 0 },
    ])
    expect(buildRatingsMixPoints(events, bucketOptions)).toMatchObject([
      { bucketStart: '2026-08-04', total: 1 },
      { bucketStart: '2026-08-07', total: 0 },
    ])
    expect(buildStabilityPoints(events, bucketOptions)).toMatchObject([
      { bucketStart: '2026-08-04', sampleSize: 1 },
      { bucketStart: '2026-08-07', sampleSize: 0 },
    ])
  })

  it('preserves internal and trailing historical gaps after the first evidence bucket', () => {
    const periodEnd = new Date('2026-08-30T23:59:59.999Z')
    const buckets = buildTestBuckets({
      requestedDays: 30,
      periodEnd,
    }).slice(0, 4)
    const bucketOptions = {
      ...options,
      start: buckets[0]!.start,
      end: buckets[3]!.end,
      buckets,
    }
    const events = [
      event({ id: 'first', cardId: 'first-card' }),
      event({
        id: 'third',
        cardId: 'third-card',
        reviewedAt: new Date('2026-08-07T12:00:00.000Z'),
      }),
    ]

    expect(
      buildRecallQualityPoints(
        [
          event({
            id: 'first-prior',
            cardId: 'first-card',
            reviewedAt: new Date('2026-07-31T12:00:00Z'),
          }),
          event({
            id: 'third-prior',
            cardId: 'third-card',
            reviewedAt: new Date('2026-07-31T12:00:00Z'),
          }),
          ...events,
        ],
        bucketOptions,
      ),
    ).toMatchObject([
      { bucketStart: '2026-08-01', reviewCount: 1 },
      { bucketStart: '2026-08-04', reviewCount: 0, observedRecall: null },
      { bucketStart: '2026-08-07', reviewCount: 1 },
      { bucketStart: '2026-08-10', reviewCount: 0, observedRecall: null },
    ])
    expect(buildPracticeRhythmPoints(events, bucketOptions)).toMatchObject([
      { bucketStart: '2026-08-01', reviewCount: 1 },
      { bucketStart: '2026-08-04', reviewCount: 0 },
      { bucketStart: '2026-08-07', reviewCount: 1 },
      { bucketStart: '2026-08-10', reviewCount: 0 },
    ])
    expect(
      buildRatingsMixPoints(events, bucketOptions).map((point) => point.total),
    ).toEqual([1, 0, 1, 0])
    expect(
      buildStabilityPoints(events, bucketOptions).map(
        (point) => point.sampleSize,
      ),
    ).toEqual([1, 0, 1, 0])
  })

  it('builds rating mix, including null Hard + Again on empty days', () => {
    const points = buildRatingsMixPoints(
      [event({ rating: 'hard' }), event({ id: '2', rating: 'again' })],
      options,
    )
    expect(points[0]).toMatchObject({
      hard: 1,
      again: 1,
      total: 2,
      hardAgainShare: 1,
    })
    expect(points[2]!.hardAgainShare).toBeNull()
  })

  it('compares Hard + Again across exact comparable periods', () => {
    const periodOptions = {
      ...options,
      start: new Date('2026-08-03T00:00:00.000Z'),
      end: new Date('2026-08-05T00:00:00.000Z'),
    }
    const previous = Array.from({ length: 10 }, (_, index) =>
      event({
        id: `previous-${index}`,
        reviewedAt: new Date(`2026-08-01T0${index}:00:00.000Z`),
        rating: 'good',
      }),
    )
    const selected = Array.from({ length: 10 }, (_, index) =>
      event({
        id: `selected-${index}`,
        reviewedAt: new Date(`2026-08-03T0${index}:00:00.000Z`),
        rating: index < 5 ? 'hard' : 'good',
      }),
    )
    const boundary = event({
      id: 'selected-boundary',
      reviewedAt: periodOptions.start,
      rating: 'again',
    })

    expect(
      buildHardAgainSummary(
        [...previous, ...selected, boundary],
        periodOptions,
      ),
    ).toEqual({
      selectedShare: 6 / 11,
      previousShare: 0,
      delta: 6 / 11,
      direction: 'up',
      sampleSize: 11,
      previousSampleSize: 10,
      lowSample: false,
      previousLowSample: false,
    })
  })

  it('compares a partial local period with the matching local wall-clock window', () => {
    const asOf = new Date('2026-03-08T05:30:00.000Z')
    const timeFrame = buildAnalyticsTimeFrame({
      asOf,
      requestedDays: 14,
      timeZone: 'America/New_York',
    })
    const periodOptions = {
      ...options,
      start: new Date(timeFrame.periodStart),
      end: asOf,
      timeFrame,
    }
    const previous = Array.from({ length: 10 }, (_, index) =>
      event({
        id: `local-previous-${index}`,
        reviewedAt: new Date(
          `2026-02-22T05:${String(index).padStart(2, '0')}:00.000Z`,
        ),
        rating: 'good',
      }),
    )
    const partialDayAfterPrevious = event({
      id: 'partial-day-after-previous',
      reviewedAt: new Date('2026-02-22T06:00:00.000Z'),
      rating: 'again',
    })

    expect(
      buildHardAgainSummary(
        [...previous, partialDayAfterPrevious],
        periodOptions,
      ),
    ).toMatchObject({
      previousShare: 0,
      previousSampleSize: 10,
      previousLowSample: false,
    })
  })

  it('filters rating mix by exact start and end timestamps', () => {
    const points = buildRatingsMixPoints(
      [
        event({ id: 'before', reviewedAt: new Date(start.getTime() - 1) }),
        event({ id: 'start', reviewedAt: start, rating: 'hard' }),
        event({ id: 'end', reviewedAt: end, rating: 'again' }),
        event({ id: 'after', reviewedAt: new Date(end.getTime() + 1) }),
      ],
      options,
    )

    expect(points[0]).toMatchObject({ hard: 1, total: 1 })
    expect(points[2]).toMatchObject({ again: 1, total: 1 })
  })

  it('excludes future reviews from a bucket that extends past the current time', () => {
    const currentTime = new Date('2026-08-01T12:00:00.000Z')
    const currentOptions = {
      ...options,
      start: new Date('2026-08-01T00:00:00.000Z'),
      end: currentTime,
      buckets: buildTestBuckets({
        requestedDays: 1,
        periodEnd: currentTime,
      }),
    }
    const futureReview = event({
      reviewedAt: new Date('2026-08-01T12:00:00.001Z'),
      rating: 'again',
    })

    expect(buildRecallQualityPoints([futureReview], currentOptions)).toEqual([])
    expect(buildPracticeRhythmPoints([futureReview], currentOptions)).toEqual(
      [],
    )
    expect(buildRatingsMixPoints([futureReview], currentOptions)).toEqual([])
  })

  it('groups weakest topics, skips missing topics, and marks low samples', () => {
    const points = buildTopicPoints(
      [
        event(),
        event({ id: '2', topicLabels: ['Graph'], isCorrect: false }),
        event({ id: '3', topicLabels: ['Array'], isCorrect: false }),
      ],
      options,
    )
    expect(points.map((point) => point.topic)).toEqual(['Graph', 'Array'])
    expect(points.find((point) => point.topic === 'Graph')).toMatchObject({
      sampleSize: 1,
      lowSample: true,
    })
    expect(points.find((point) => point.topic === 'Array')).toMatchObject({
      sampleSize: 2,
      lowSample: false,
    })
  })

  it('uses only valid stored stability logs in every generated bucket', () => {
    const points = buildStabilityPoints(
      [
        event({ fsrsReviewLog: validLog(2) }),
        event({ id: '2', fsrsReviewLog: 'bad' }),
        event({
          id: '3',
          reviewedAt: new Date('2026-08-03T12:00:00.000Z'),
          fsrsReviewLog: validLog(6),
        }),
      ],
      options,
    )
    expect(points).toEqual([
      {
        bucketStart: '2026-08-01',
        bucketEnd: '2026-08-01',
        medianStabilityDays: 2,
        sampleSize: 1,
      },
      {
        bucketStart: '2026-08-02',
        bucketEnd: '2026-08-02',
        medianStabilityDays: null,
        sampleSize: 0,
      },
      {
        bucketStart: '2026-08-03',
        bucketEnd: '2026-08-03',
        medianStabilityDays: 6,
        sampleSize: 1,
      },
    ])
  })

  it('reconstructs only daily overdue counts proven by FSRS due dates', () => {
    const reviewAt = new Date('2026-08-03T12:00:00.000Z')
    const card: AnalyticsCurrentCard = {
      cardId: 'card-1',
      slug: 'two-sum',
      title: 'Two Sum',
      topics: ['Array'],
      retrievability: 0.8,
      targetRetention: 0.9,
      stabilityDays: 4,
      difficulty: 5,
      lapseCount: 0,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      dueAt: new Date('2026-08-05T12:00:00.000Z'),
      lastReviewAt: reviewAt,
    }
    const snapshots = reconstructOverdueBacklogSnapshots(
      [
        event({
          cardId: 'card-1',
          reviewedAt: reviewAt,
          fsrsReviewLog: serializeFsrsReviewLogSnapshot(
            scheduleReview(
              createInitialFsrsCard(new Date('2026-08-01T00:00:00.000Z')),
              'good',
              reviewAt,
            ).log,
          ),
        }),
      ],
      [card],
      options,
    )

    expect(
      snapshots.map((snapshot) => [
        toAnalyticsDateKey(snapshot.date),
        snapshot.overdueCount,
      ]),
    ).toEqual([
      ['2026-08-01', 1],
      ['2026-08-02', 1],
      ['2026-08-03', 0],
    ])
  })

  it('uses the initial card due date for the interval before its first review', () => {
    const createdAt = new Date('2026-08-01T12:00:00.000Z')
    const reviewedAt = new Date('2026-08-03T12:00:00.000Z')
    const fsrsOptions = normalizeFsrsSchedulingOptions({
      enableShortTerm: false,
      learningSteps: ['1d'],
      relearningSteps: ['1d'],
    })
    const scheduled = scheduleReview(
      createInitialFsrsCard(createdAt),
      'good',
      reviewedAt,
      fsrsOptions,
    )
    const snapshots = reconstructOverdueBacklogSnapshots(
      [
        event({
          id: 'first-review',
          reviewedAt,
          fsrsReviewLog: serializeFsrsReviewLogSnapshot(scheduled.log),
        }),
      ],
      [
        {
          cardId: 'card-1',
          slug: 'two-sum',
          title: 'Two Sum',
          topics: ['Array'],
          retrievability: 0.8,
          targetRetention: 0.9,
          stabilityDays: scheduled.card.stability,
          difficulty: scheduled.card.difficulty,
          lapseCount: scheduled.card.lapses,
          dueAt: scheduled.card.dueAt,
          createdAt,
          lastReviewAt: reviewedAt,
        },
      ],
      {
        ...options,
        start: new Date('2026-08-01T00:00:00.000Z'),
        end: new Date('2026-08-03T23:59:59.999Z'),
        fsrsOptions,
      },
    )

    expect(snapshots.map((snapshot) => snapshot.overdueCount)).toEqual([
      1, 1, 0,
    ])
  })

  it('uses a review card due date for the interval after that review', () => {
    const createdAt = new Date('2026-08-01T12:00:00.000Z')
    const firstReviewedAt = new Date('2026-08-02T12:00:00.000Z')
    const secondReviewedAt = new Date('2026-08-06T12:00:00.000Z')
    const fsrsOptions = normalizeFsrsSchedulingOptions({
      enableShortTerm: false,
      learningSteps: ['1d'],
      relearningSteps: ['1d'],
    })
    const firstReview = scheduleReview(
      createInitialFsrsCard(createdAt),
      'good',
      firstReviewedAt,
      fsrsOptions,
    )
    const secondReview = scheduleReview(
      firstReview.card,
      'again',
      secondReviewedAt,
      fsrsOptions,
    )
    const snapshots = reconstructOverdueBacklogSnapshots(
      [
        event({
          id: 'first-review',
          reviewedAt: firstReviewedAt,
          fsrsReviewLog: serializeFsrsReviewLogSnapshot(firstReview.log),
        }),
        event({
          id: 'second-review',
          reviewedAt: secondReviewedAt,
          rating: 'again',
          fsrsReviewLog: serializeFsrsReviewLogSnapshot(secondReview.log),
        }),
      ],
      [
        {
          cardId: 'card-1',
          slug: 'two-sum',
          title: 'Two Sum',
          topics: ['Array'],
          retrievability: 0.8,
          targetRetention: 0.9,
          stabilityDays: secondReview.card.stability,
          difficulty: secondReview.card.difficulty,
          lapseCount: secondReview.card.lapses,
          dueAt: secondReview.card.dueAt,
          createdAt,
          lastReviewAt: secondReviewedAt,
        },
      ],
      {
        ...options,
        start: new Date('2026-08-01T00:00:00.000Z'),
        end: new Date('2026-08-06T23:59:59.999Z'),
        fsrsOptions,
      },
    )
    const countsByDate = new Map(
      snapshots.map((snapshot) => [
        toAnalyticsDateKey(snapshot.date),
        snapshot.overdueCount,
      ]),
    )

    expect(toAnalyticsDateKey(firstReview.card.dueAt)).toBe('2026-08-05')
    expect(secondReview.log.dueAt).toBe(firstReviewedAt.toISOString())
    expect(countsByDate.get('2026-08-02')).toBe(0)
    expect(countsByDate.get('2026-08-04')).toBe(0)
    expect(countsByDate.get(toAnalyticsDateKey(firstReview.card.dueAt))).toBe(1)
  })

  it('leaves the backlog unknown after an invalid review log', () => {
    const createdAt = new Date('2026-08-01T12:00:00.000Z')
    const firstReviewedAt = new Date('2026-08-02T12:00:00.000Z')
    const invalidReviewedAt = new Date('2026-08-05T12:00:00.000Z')
    const fsrsOptions = normalizeFsrsSchedulingOptions({
      enableShortTerm: false,
      learningSteps: ['1d'],
      relearningSteps: ['1d'],
    })
    const firstReview = scheduleReview(
      createInitialFsrsCard(createdAt),
      'good',
      firstReviewedAt,
      fsrsOptions,
    )
    const snapshots = reconstructOverdueBacklogSnapshots(
      [
        event({
          id: 'first-review',
          reviewedAt: firstReviewedAt,
          fsrsReviewLog: serializeFsrsReviewLogSnapshot(firstReview.log),
        }),
        event({
          id: 'invalid-review',
          reviewedAt: invalidReviewedAt,
          fsrsReviewLog: null,
        }),
      ],
      [
        {
          cardId: 'card-1',
          slug: 'two-sum',
          title: 'Two Sum',
          topics: ['Array'],
          retrievability: 0.8,
          targetRetention: 0.9,
          stabilityDays: firstReview.card.stability,
          difficulty: firstReview.card.difficulty,
          lapseCount: firstReview.card.lapses,
          dueAt: firstReview.card.dueAt,
          createdAt,
          lastReviewAt: invalidReviewedAt,
        },
      ],
      {
        ...options,
        start: new Date('2026-08-01T00:00:00.000Z'),
        end: new Date('2026-08-06T23:59:59.999Z'),
        fsrsOptions,
      },
    )

    expect(
      snapshots.map((snapshot) => toAnalyticsDateKey(snapshot.date)),
    ).toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'])
  })

  it('separates overdue and upcoming due load across the 14-day range', () => {
    const points = buildUpcomingLoadPoints(
      [
        new Date('2026-08-12T00:00:00.000Z'),
        new Date('2026-08-20T00:00:00.000Z'),
      ],
      new Date('2026-08-13T12:00:00.000Z'),
    )
    expect(points[0]).toMatchObject({
      overdueCount: 1,
      dueCount: 0,
      today: true,
    })
    expect(points[7]).toMatchObject({ dueCount: 1 })
  })

  it('keeps a card due exactly at as-of in today due rather than overdue', () => {
    const now = new Date('2026-08-13T12:00:00.000Z')

    expect(buildUpcomingLoadPoints([now], now)[0]).toMatchObject({
      dueCount: 1,
      overdueCount: 0,
      today: true,
    })
  })

  it('counts an earlier due time today as due today in the selected timezone', () => {
    const now = new Date('2026-08-22T16:00:00.000Z')
    const points = buildUpcomingLoadPoints(
      [new Date('2026-08-22T14:00:00.000Z')],
      now,
      'America/New_York',
    )

    expect(points[0]).toMatchObject({ dueCount: 1, overdueCount: 0 })
  })

  it('counts a prior local date as overdue across a sub-24-hour boundary', () => {
    const now = new Date('2026-08-22T16:00:00.000Z')
    const points = buildUpcomingLoadPoints(
      [new Date('2026-08-22T03:30:00.000Z')],
      now,
      'America/New_York',
    )

    expect(points[0]).toMatchObject({ dueCount: 0, overdueCount: 1 })
  })
})
