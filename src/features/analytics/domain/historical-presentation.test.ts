import { describe, expect, it } from 'vitest'
import { defaultAnalyticsTargets } from '@/features/settings/domain'

import {
  normalizeFsrsSchedulingOptions,
  replayReviewHistorySequence,
} from '@/lib/fsrs'

import {
  buildHistoricalAnalyticsViews,
  type HistoricalPresentationOptions,
  type HistoricalAnalyticsReviewEvent,
} from './historical-presentation'
import {
  buildAnalyticsTimeFrame,
  shiftAnalyticsCalendarDays,
} from './analytics-time'
import { buildAnalyticsBucketsFromTimeFrame } from './analytics-range-policy'

const options: HistoricalPresentationOptions = {
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
  ],
  end: new Date('2026-08-02T23:59:59.999Z'),
  fsrsOptions: normalizeFsrsSchedulingOptions({ targetRetention: 0.9 }),
  start: new Date('2026-08-01T00:00:00.000Z'),
  timeZone: 'UTC',
  timeFrame: {
    asOf: '2026-08-02T23:59:59.999Z',
    timeZone: 'UTC',
    timeZoneFallback: false,
    requestedDays: 14,
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-08-03T00:00:00.000Z',
    buckets: [],
  },
}

function event(
  overrides: Partial<HistoricalAnalyticsReviewEvent> = {},
): HistoricalAnalyticsReviewEvent {
  return {
    cardId: 'card-1',
    fsrsReviewLog: JSON.stringify({
      rating: 'good',
      state: 'review',
      dueAt: '2026-08-01T12:00:00.000Z',
      stability: 6,
      difficulty: 5,
      elapsedDays: 1,
      lastElapsedDays: 1,
      scheduledDays: 4,
      learningSteps: 0,
      reviewedAt: '2026-08-01T12:00:00.000Z',
    }),
    id: 'one',
    problemSlug: 'problem-1',
    rating: 'good',
    reviewedAt: new Date('2026-08-01T12:00:00.000Z'),
    topicLabels: [],
    ...overrides,
  }
}

describe('buildHistoricalAnalyticsViews', () => {
  it('retains invalid-only outer bucket exclusions and uses local-calendar partial intervals', () => {
    const asOf = new Date('2026-03-08T07:30:00Z')
    const localOptions = optionsForComparison(asOf, 'America/New_York')
    const firstBucket = localOptions.buckets[0]!
    const firstOutcomes = buildHistoricalAnalyticsViews(
      [
        event({
          id: 'invalid-first',
          problemSlug: 'invalid',
          rating: 'invalid',
          reviewedAt: new Date(firstBucket.start.getTime() + 1000),
        }),
        event({
          id: 'local-before-midnight',
          problemSlug: 'before',
          rating: 'again',
          reviewedAt: new Date('2026-03-08T04:30:00Z'),
        }),
        event({
          id: 'local-partial',
          problemSlug: 'partial',
          rating: 'good',
          reviewedAt: asOf,
        }),
        event({
          id: 'future',
          problemSlug: 'future',
          rating: 'easy',
          reviewedAt: new Date(asOf.getTime() + 1000),
        }),
      ],
      localOptions,
    ).firstAttemptOutcomes
    expect(firstOutcomes.rows[0]).toMatchObject({
      excludedInvalidRatings: 1,
      validFirstAttempts: 0,
      firstAttemptSuccess: null,
      firstAttemptGoodEasy: null,
      evidence: 'not-measured',
    })
    expect(firstOutcomes.rows.at(-2)).toMatchObject({
      bucketStart: '2026-03-07',
      bucketEnd: '2026-03-07',
      validFirstAttempts: 1,
      firstAttemptSuccess: 0,
      firstAttemptGoodEasy: 0,
      isPartial: false,
    })
    expect(firstOutcomes.rows.at(-1)).toMatchObject({
      bucketStart: '2026-03-08',
      bucketEnd: '2026-03-08',
      validFirstAttempts: 1,
      firstAttemptSuccess: 1,
      firstAttemptGoodEasy: 1,
      isPartial: true,
    })
    expect(firstOutcomes.totals).toMatchObject({
      recordedFirstAttempts: 3,
      excludedInvalidRatings: 1,
      validFirstAttempts: 2,
      firstAttemptSuccess: 0.5,
      firstAttemptGoodEasy: 0.5,
    })
  })
  it('selects raw first records before rating and report filters and weights the valid denominators across buckets', () => {
    const secondDay = new Date('2026-08-02T12:00:00Z')
    const firstOutcomes = buildHistoricalAnalyticsViews(
      [
        ...['again', 'invalid', 'hard', 'good', 'good'].map((rating, index) =>
          event({
            id: `first-${index}`,
            problemSlug: `problem-${index}`,
            rating,
            reviewedAt: index < 2 ? options.start : secondDay,
          }),
        ),
        event({
          id: 'invalid-retry',
          problemSlug: 'problem-1',
          cardId: 'another-mode',
          rating: 'easy',
          reviewedAt: secondDay,
        }),
        event({ id: 'c-later', problemSlug: 'c', rating: 'good' }),
        event({
          id: 'c-earlier',
          problemSlug: 'c',
          rating: 'hard',
          reviewedAt: new Date('2026-07-31T12:00:00Z'),
        }),
      ],
      options,
    ).firstAttemptOutcomes
    expect(firstOutcomes.rows).toMatchObject([
      {
        recordedFirstAttempts: 2,
        excludedInvalidRatings: 1,
        validFirstAttempts: 1,
        again: 1,
        hardGoodEasy: 0,
        goodEasy: 0,
        firstAttemptSuccess: 0,
        firstAttemptGoodEasy: 0,
        evidence: 'measured',
      },
      {
        recordedFirstAttempts: 3,
        excludedInvalidRatings: 0,
        validFirstAttempts: 3,
        hardGoodEasy: 3,
        goodEasy: 2,
        firstAttemptSuccess: 1,
        firstAttemptGoodEasy: 2 / 3,
        evidence: 'measured',
      },
    ])
    expect(firstOutcomes.totals).toMatchObject({
      again: 1,
      hard: 1,
      good: 2,
      easy: 0,
      recordedFirstAttempts: 5,
      excludedInvalidRatings: 1,
      validFirstAttempts: 4,
      hardGoodEasy: 3,
      goodEasy: 2,
      firstAttemptSuccess: 0.75,
      firstAttemptGoodEasy: 0.5,
    })
  })

  it('recomputes first outcomes from corrections, deleted initials, and restored chronology', () => {
    const first = event({ id: 'first', rating: 'again' })
    const later = event({
      id: 'later',
      rating: 'easy',
      reviewedAt: new Date('2026-08-02T12:00:00Z'),
    })
    for (const [history, success, goodEasy] of [
      [[later, { ...first, rating: 'hard' }], 1, 0],
      [[later], 1, 1],
      [[later, first], 0, 0],
    ] as const) {
      expect(
        buildHistoricalAnalyticsViews(history, options).firstAttemptOutcomes
          .totals,
      ).toMatchObject({
        firstAttemptSuccess: success,
        firstAttemptGoodEasy: goodEasy,
      })
    }
  })

  it('emits no repeat pair from initial-only card history', () => {
    const views = buildHistoricalAnalyticsViews(
      [event(), event({ id: 'another', cardId: 'another' })],
      options,
    )
    expect(
      views.observedRecallVsFsrs.rows.every(
        (row) =>
          row.pairedReviews === 0 &&
          row.observedRecall === null &&
          row.fsrsEstimate === null,
      ),
    ).toBe(true)
    expect(views.memoryStrength.rows[0]?.eligibleReviews).toBe(2)
    expect(views.practiceRhythm.rows[0]?.validRatings).toBe(2)
  })

  it('uses a pre-range initial to pair the following repeat without counting the initial', () => {
    const initial = event({
      id: 'initial',
      reviewedAt: new Date('2026-07-31T12:00:00Z'),
    })
    const repeat = event({ id: 'repeat', rating: 'again' })
    const views = buildHistoricalAnalyticsViews([repeat, initial], options)
    expect(views.observedRecallVsFsrs.rows[0]).toMatchObject({
      pairedReviews: 1,
      recalledCount: 0,
      observedRecall: 0,
      evidence: 'measured',
    })
    expect(views.observedRecallVsFsrs.rows[0]?.fsrsEstimate).toBeGreaterThan(0)
  })

  it.each([0, 1])('fits both personal percentage targets at %s', (target) => {
    const views = buildHistoricalAnalyticsViews([event()], {
      ...options,
      analyticsTargets: {
        ...defaultAnalyticsTargets,
        targetRecall: target,
        targetReviewSuccess: target,
      },
    })

    expect(views.observedRecallVsFsrs.targetRecall).toBe(target)
    expect(views.practiceRhythm.targetReviewSuccess).toBe(target)
    for (const scale of [
      views.observedRecallVsFsrs.scale,
      views.practiceRhythm.percentageScale,
    ]) {
      expect(scale.domain[0]).toBeLessThanOrEqual(target)
      expect(scale.domain[1]).toBeGreaterThanOrEqual(target)
      expect(scale.ticks).toContain(target)
    }
  })

  it('keeps personal targets independent of FSRS retention and preserves observations and unrelated views when all four goals change', () => {
    const reviews = [
      event(),
      event({ id: 'again', rating: 'again' }),
      event({ id: 'hard', rating: 'hard' }),
    ]
    const retentionOptions = {
      ...options,
      fsrsOptions: normalizeFsrsSchedulingOptions({ targetRetention: 0.8 }),
    }
    const before = buildHistoricalAnalyticsViews(reviews, retentionOptions)
    expect(before.observedRecallVsFsrs.targetRecall).toBe(0.9)
    expect(before.practiceRhythm.targetReviewSuccess).toBe(0.9)
    expect(before.retentionMap.targetRetention).toBe(0.8)
    expect(before.observedRecallVsFsrs).not.toHaveProperty('targetRetention')
    const after = buildHistoricalAnalyticsViews(reviews, {
      ...retentionOptions,
      analyticsTargets: {
        ...defaultAnalyticsTargets,
        targetRecall: 0.1,
        targetReviewSuccess: 1,
        targetFirstAttemptSuccess: 0,
        targetFirstAttemptGoodEasy: 1,
      },
    })

    expect(after).toEqual({
      ...before,
      observedRecallVsFsrs: {
        ...before.observedRecallVsFsrs,
        targetRecall: 0.1,
        scale: after.observedRecallVsFsrs.scale,
      },
      practiceRhythm: {
        ...before.practiceRhythm,
        targetReviewSuccess: 1,
        percentageScale: after.practiceRhythm.percentageScale,
      },
      firstAttemptOutcomes: {
        ...before.firstAttemptOutcomes,
        targetFirstAttemptSuccess: 0,
        targetFirstAttemptGoodEasy: 1,
        scale: after.firstAttemptOutcomes.scale,
      },
    })
    expect(after.firstAttemptOutcomes.scale.domain).toEqual([0, 1])
  })

  it('pairs rating-derived recalled outcomes with the FSRS estimate from the exact reviews', () => {
    const views = buildHistoricalAnalyticsViews(
      [
        event(),
        event({
          id: 'two',
          rating: 'again',
          reviewedAt: new Date('2026-08-01T13:00:00.000Z'),
        }),
      ],
      options,
    )

    expect(views.observedRecallVsFsrs.rows[0]).toMatchObject({
      recalledCount: 0,
      pairedReviews: 1,
      observedRecall: 0,
      provenance: 'reconstructed',
    })
    expect(views.observedRecallVsFsrs.rows[0]?.fsrsEstimate).not.toBeNull()
    expect(views.observedRecallVsFsrs.rows[0]?.difference).not.toBeNull()
  })

  it('keeps known zero-practice buckets at zero and their Review Success unknown', () => {
    const views = buildHistoricalAnalyticsViews([event()], options)

    expect(views.practiceRhythm.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          completedReviews: 0,
          goodEasy: 0,
          reviewSuccess: null,
          validRatings: 0,
        }),
      ]),
    )
  })

  it('only exposes a memory-strength IQR when a bucket has four eligible reviews', () => {
    const withThree = buildHistoricalAnalyticsViews(
      Array.from({ length: 3 }, (_, index) =>
        event({
          id: `three-${index}`,
          reviewedAt: new Date(
            `2026-08-01T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
          ),
        }),
      ),
      options,
    )
    const withFour = buildHistoricalAnalyticsViews(
      Array.from({ length: 4 }, (_, index) =>
        event({
          id: `four-${index}`,
          reviewedAt: new Date(
            `2026-08-01T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
          ),
        }),
      ),
      options,
    )

    expect(withThree.memoryStrength.rows[0]).toMatchObject({
      q1: null,
      q3: null,
    })
    expect(withFour.memoryStrength.rows[0]).toMatchObject({
      eligibleReviews: 4,
      provenance: 'reconstructed',
    })
    expect(withFour.memoryStrength.rows[0]?.q1).not.toBeNull()
    expect(withFour.memoryStrength.rows[0]?.q3).not.toBeNull()
  })

  it('derives post-review Memory Strength from the replayed post-review card rather than the stored log snapshot', () => {
    const reviewedAt = new Date('2026-08-01T12:00:00.000Z')
    const replayedPostReview = replayReviewHistorySequence(
      [{ rating: 'good', reviewedAt }],
      options.fsrsOptions,
    )[0]!.card.stability
    const views = buildHistoricalAnalyticsViews(
      [
        event({
          fsrsReviewLog: JSON.stringify({
            rating: 'good',
            state: 'review',
            dueAt: '2026-08-01T12:00:00.000Z',
            stability: 999,
            difficulty: 5,
            elapsedDays: 1,
            lastElapsedDays: 1,
            scheduledDays: 4,
            learningSteps: 0,
            reviewedAt: '2026-08-01T12:00:00.000Z',
          }),
          reviewedAt,
        }),
      ],
      options,
    )

    expect(views.memoryStrength.rows[0]?.medianStrengthDays).toBeCloseTo(
      replayedPostReview,
    )
    expect(views.memoryStrength.rows[0]?.medianStrengthDays).not.toBe(999)
  })

  it('builds valid-rating composition rows with zero categories and no invented empty stack', () => {
    const views = buildHistoricalAnalyticsViews(
      [
        event({ id: 'again', rating: 'again' }),
        event({ id: 'good', rating: 'good' }),
        event({ id: 'invalid', rating: 'unknown' }),
      ],
      options,
    )

    expect(views).toMatchObject({
      ratingsMix: {
        rows: [
          {
            again: 1,
            hard: 0,
            good: 1,
            easy: 0,
            validRatings: 2,
            againShare: 0.5,
            hardShare: 0,
            goodShare: 0.5,
            easyShare: 0,
            challengingReviews: 1,
            evidence: 'measured',
          },
          {
            validRatings: 0,
            againShare: null,
            hardShare: null,
            goodShare: null,
            easyShare: null,
            evidence: 'not-measured',
          },
        ],
      },
    })
  })

  it('exposes an equivalent eligible prior-period Hard + Again comparison through the shifted as-of boundary', () => {
    const asOf = new Date('2026-08-22T12:00:00.000Z')
    const comparisonOptions = optionsForComparison(asOf, 'UTC')
    const previousAsOf = shiftAnalyticsCalendarDays(asOf, -14, 'UTC')
    const previousBuckets = buildAnalyticsBucketsFromTimeFrame(
      buildAnalyticsTimeFrame({
        asOf: previousAsOf,
        requestedDays: 14,
        timeZone: 'UTC',
      }),
    )
    const selected = comparisonOptions.buckets.map((bucket, index) =>
      event({
        id: `selected-${index}`,
        rating: index < 3 ? 'again' : 'good',
        reviewedAt:
          index === comparisonOptions.buckets.length - 1
            ? asOf
            : new Date(bucket.start.getTime() + 12 * 60 * 60 * 1000),
      }),
    )
    const previous = previousBuckets.map((bucket, index) =>
      event({
        id: `previous-${index}`,
        rating: index < 7 ? 'again' : 'good',
        reviewedAt:
          index === previousBuckets.length - 1
            ? previousAsOf
            : new Date(bucket.start.getTime() + 12 * 60 * 60 * 1000),
      }),
    )

    const views = buildHistoricalAnalyticsViews(
      [...selected, ...previous],
      comparisonOptions,
    )

    expect(views.ratingsMix.comparison).toMatchObject({
      direction: 'down',
      previousHardAgainShare: 0.5,
      previousValidRatings: 14,
    })
    expect(views.ratingsMix.comparison.difference).toBeCloseTo(-2 / 7)
  })

  it('uses calendar-day shifting for an equivalent prior period across daylight saving time', () => {
    const asOf = new Date('2026-03-10T16:00:00.000Z')
    const timeFrameOptions = optionsForComparison(asOf, 'America/New_York')
    const previousAsOf = shiftAnalyticsCalendarDays(
      asOf,
      -14,
      'America/New_York',
    )
    const previousBuckets = buildAnalyticsBucketsFromTimeFrame(
      buildAnalyticsTimeFrame({
        asOf: previousAsOf,
        requestedDays: 14,
        timeZone: 'America/New_York',
      }),
    )
    const selected = timeFrameOptions.buckets.map((bucket, index) =>
      event({
        id: `selected-dst-${index}`,
        rating: index < 3 ? 'again' : 'good',
        reviewedAt:
          index === timeFrameOptions.buckets.length - 1
            ? asOf
            : new Date(bucket.start.getTime() + 12 * 60 * 60 * 1000),
      }),
    )
    const prior = previousBuckets.map((bucket, index) =>
      event({
        id: `prior-dst-${index}`,
        rating: index < 7 ? 'again' : 'good',
        // The exact prior local-time cutoff stays eligible across the DST shift.
        reviewedAt:
          index === previousBuckets.length - 1
            ? previousAsOf
            : new Date(bucket.start.getTime() + 12 * 60 * 60 * 1000),
      }),
    )

    const views = buildHistoricalAnalyticsViews(
      [...selected, ...prior],
      timeFrameOptions,
    )

    expect(views.ratingsMix.comparison).toMatchObject({
      direction: 'down',
      previousHardAgainShare: 0.5,
      previousValidRatings: 14,
    })
  })

  it('withholds the prior-period direction when either period fails the Ratings Mix span, activity, or gap gate', () => {
    const asOf = new Date('2026-08-22T12:00:00.000Z')
    const comparisonOptions = optionsForComparison(asOf, 'UTC')
    const previousAsOf = shiftAnalyticsCalendarDays(asOf, -14, 'UTC')
    const previousBuckets = buildAnalyticsBucketsFromTimeFrame(
      buildAnalyticsTimeFrame({
        asOf: previousAsOf,
        requestedDays: 14,
        timeZone: 'UTC',
      }),
    )
    const selected = comparisonOptions.buckets
      .slice(0, 10)
      .map((bucket, index) =>
        event({
          id: `selected-gapped-${index}`,
          rating: 'good',
          reviewedAt: new Date(bucket.start.getTime() + 12 * 60 * 60 * 1000),
        }),
      )
    const prior = previousBuckets.slice(0, 10).map((bucket, index) =>
      event({
        id: `prior-gapped-${index}`,
        rating: 'again',
        reviewedAt: new Date(bucket.start.getTime() + 12 * 60 * 60 * 1000),
      }),
    )

    const views = buildHistoricalAnalyticsViews(
      [...selected, ...prior],
      comparisonOptions,
    )

    expect(views.ratingsMix.comparison).toEqual({
      previousHardAgainShare: null,
      previousValidRatings: 10,
      difference: null,
      direction: null,
    })
  })

  it('withholds the prior-period direction when either comparison period has fewer than 10 valid ratings', () => {
    const selected = Array.from({ length: 10 }, (_, index) =>
      event({
        id: `selected-qualified-${index}`,
        rating: 'good',
        reviewedAt: new Date('2026-08-01T12:00:00.000Z'),
      }),
    )
    const prior = Array.from({ length: 9 }, (_, index) =>
      event({
        id: `prior-insufficient-${index}`,
        rating: 'again',
        reviewedAt: new Date('2026-07-18T12:00:00.000Z'),
      }),
    )

    const views = buildHistoricalAnalyticsViews(
      [...selected, ...prior],
      options,
    )

    expect(views.ratingsMix.comparison).toEqual({
      previousHardAgainShare: null,
      previousValidRatings: 9,
      difference: null,
      direction: null,
    })
  })

  it('ranks qualifying normalized topics by Good + Easy Review Success', () => {
    const reviews = Array.from({ length: 10 }, (_, index) =>
      event({
        cardId: `graph-${index % 3}`,
        id: `graph-${index}`,
        problemSlug: `graph-${index % 3}`,
        rating: index < 4 ? 'again' : 'good',
        topicLabels: ['Graphs', 'graphs', ' Graphs '],
      }),
    ).concat(
      Array.from({ length: 10 }, (_, index) =>
        event({
          cardId: `array-${index % 3}`,
          id: `array-${index}`,
          problemSlug: `array-${index % 3}`,
          rating: 'easy',
          topicLabels: ['Arrays'],
        }),
      ),
    )

    const views = buildHistoricalAnalyticsViews(reviews, options)

    expect(views).toMatchObject({
      topicPerformance: {
        rows: [
          {
            topic: 'Graphs',
            reviewSuccess: 0.6,
            goodEasy: 6,
            validRatings: 10,
            distinctProblems: 3,
            evidence: 'Measured',
          },
          {
            topic: 'Arrays',
            reviewSuccess: 1,
            goodEasy: 10,
            validRatings: 10,
            distinctProblems: 3,
            evidence: 'Measured',
          },
        ],
        strongerQualifyingTopics: 0,
      },
    })
  })

  it('retains every qualifying topic in ascending order without an omitted population', () => {
    const reviews = Array.from({ length: 7 }, (_, topicIndex) =>
      Array.from({ length: topicIndex >= 5 ? 20 : 10 }, (_, reviewIndex) =>
        event({
          cardId: `topic-${topicIndex}-${reviewIndex % 3}`,
          id: `topic-${topicIndex}-${reviewIndex}`,
          problemSlug: `topic-${topicIndex}-${reviewIndex % 3}`,
          rating:
            reviewIndex < Math.min(topicIndex, 4) * (topicIndex >= 5 ? 2 : 1)
              ? 'good'
              : 'again',
          topicLabels: [`Topic ${topicIndex}`],
        }),
      ),
    ).flat()

    const views = buildHistoricalAnalyticsViews(reviews, options)

    expect(views.topicPerformance.rows).toHaveLength(7)
    expect(views.topicPerformance.rows.map((row) => row.topic)).toEqual([
      'Topic 0',
      'Topic 1',
      'Topic 2',
      'Topic 3',
      'Topic 5',
      'Topic 6',
      'Topic 4',
    ])
    expect(views.topicPerformance.strongerQualifyingTopics).toBe(0)
  })
})

function optionsForComparison(
  asOf: Date,
  timeZone: string,
): HistoricalPresentationOptions {
  const timeFrame = buildAnalyticsTimeFrame({
    asOf,
    requestedDays: 14,
    timeZone,
  })

  return {
    ...options,
    buckets: buildAnalyticsBucketsFromTimeFrame(timeFrame),
    end: asOf,
    start: new Date(timeFrame.periodStart),
    timeFrame,
    timeZone,
  }
}
