import { describe, expect, it } from 'vitest'

import {
  normalizeFsrsSchedulingOptions,
  serializeFsrsReviewLogSnapshot,
  scheduleReview,
  createInitialFsrsCard,
} from '@/lib/fsrs'

import {
  buildUpcomingLoadPoints,
  getValidStabilitySample,
  hasTopicRecallEvidence,
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
  it('describes persisted correctness without inventing retry exclusion', () => {
    expect(metricDefinitions.observedCorrectness.label).toBe(
      'Observed correctness',
    )
    expect(metricDefinitions.observedCorrectness.explanation).toContain(
      'does not identify retries',
    )
    expect(metricDefinitions).not.toHaveProperty('overdueBacklog')
  })

  it('only counts persisted correctness on valid rated, labeled reviews as topic evidence', () => {
    expect(hasTopicRecallEvidence(event())).toBe(true)
    expect(hasTopicRecallEvidence(event({ rating: 'unexpected-rating' }))).toBe(
      false,
    )
    expect(hasTopicRecallEvidence(event({ isCorrect: null }))).toBe(false)
    expect(hasTopicRecallEvidence(event({ topicLabels: [] }))).toBe(false)
  })

  it('uses only valid stored stability logs as readiness evidence', () => {
    expect(getValidStabilitySample(event({ fsrsReviewLog: validLog(2) }))).toBe(
      2,
    )
    expect(getValidStabilitySample(event({ fsrsReviewLog: 'bad' }))).toBeNull()
    expect(getValidStabilitySample(event({ fsrsReviewLog: null }))).toBeNull()
    expect(
      getValidStabilitySample(event({ rating: 'unexpected-rating' })),
    ).toBeNull()
  })

  it.each([
    { hoursAfterDue: 1, timeZone: 'UTC', expected: 0 },
    { hoursAfterDue: 25, timeZone: 'UTC', expected: 1 },
    { hoursAfterDue: 11, timeZone: 'America/New_York', expected: 0 },
    { hoursAfterDue: 11, timeZone: 'UTC', expected: 1 },
  ])(
    'matches upcoming calendar backlog $hoursAfterDue hours after due in $timeZone',
    ({ hoursAfterDue, timeZone, expected }) => {
      const createdAt = new Date('2026-08-01T13:00:00.000Z')
      const reviewedAt = new Date('2026-08-02T13:00:00.000Z')
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
      const now = new Date(
        scheduled.card.dueAt.getTime() + hoursAfterDue * 60 * 60 * 1000,
      )
      const card: AnalyticsCurrentCard = {
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
      }
      const snapshots = reconstructOverdueBacklogSnapshots(
        [
          event({
            reviewedAt,
            fsrsReviewLog: serializeFsrsReviewLogSnapshot(scheduled.log),
          }),
        ],
        [card],
        {
          ...options,
          start: createdAt,
          end: now,
          timeZone,
          fsrsOptions,
          timeFrame: buildAnalyticsTimeFrame({
            asOf: now,
            requestedDays: 14,
            timeZone,
          }),
        },
      )
      expect(snapshots.at(-1)?.overdueCount).toBe(expected)
      expect(
        buildUpcomingLoadPoints([card.dueAt], now, timeZone)[0]?.overdueCount,
      ).toBe(expected)
    },
  )

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
      ['2026-08-01', 0],
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
      0, 1, 0,
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
    expect(countsByDate.get(toAnalyticsDateKey(firstReview.card.dueAt))).toBe(0)
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
