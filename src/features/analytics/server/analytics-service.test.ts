import { describe, expect, it } from 'vitest'

import { eq } from 'drizzle-orm'

import {
  createInitialFsrsCard,
  defaultFsrsCardKind,
  scheduleReview,
  serializeFsrsReviewLogSnapshot,
  type ReviewRating,
} from '@/lib/fsrs'

import type { Db } from '@/platform/db'
import { createTestDb } from '@/platform/db/test-db'
import {
  fsrsCards,
  problemPractice,
  problemTopics,
  problems,
  reviewAttempts,
  topics,
} from '@/platform/db/schema'

import { updateSettings } from '@/features/settings/server/settings-service'
import { analyticsSummarySchema } from '../api/analytics-contracts'
import { getAnalyticsSummary } from './analytics-service'

describe('getAnalyticsSummary dashboard views', () => {
  it.each([14, 30, 90] as const)(
    'retains the selected %s-day range in the readiness contract',
    async (range) => {
      const handle = await createTestDb()
      const now = new Date('2026-01-15T12:00:00.000Z')

      const summary = await getAnalyticsSummary(handle.db, { range, now })

      expect(summary.range).toBe(range)
      expect(summary.historicalReadiness.requested.requestedDays).toBe(range)
      expect(summary.observedRatingQuality).toBeNull()
      expect(summary.historicalReadiness.requested.ready).toBe(false)
      expect(
        summary.views.observedRecallVsFsrs.rows.every(
          (row) => row.observedRecall === null && row.fsrsEstimate === null,
        ),
      ).toBe(true)
      expect(summary.views.ratingsMix.selectedValidRatings).toBe(0)
      expect(summary.views.upcomingReviewLoad.rows).toHaveLength(14)
    },
  )

  it('returns truthful chart payloads for an empty database', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-15T12:00:00.000Z')

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(summary.historicalReadiness.requested.ready).toBe(false)
    expect(
      summary.views.observedRecallVsFsrs.rows.every(
        (row) => row.observedRecall === null && row.fsrsEstimate === null,
      ),
    ).toBe(true)
    expect(summary.views.topicPerformance.rows).toEqual([])
    expect(summary.views.topicPerformance.lowEvidenceTopics).toEqual([])
    expect(
      summary.views.memoryStrength.rows.every(
        (row) => row.medianStrengthDays === null,
      ),
    ).toBe(true)
    expect(summary.views.overdueBacklog.knownDays).toBe(0)
    expect(summary.views.upcomingReviewLoad.rows).toHaveLength(14)
    expect(
      summary.views.upcomingReviewLoad.rows.every(
        (point) => point.dueCount === 0,
      ),
    ).toBe(true)
  })

  it('counts same-day pre-review predictions individually in the summary', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-03T12:00:00.000Z')
    const firstReview = new Date('2026-08-02T12:00:00.000Z')
    const secondReview = new Date('2026-08-02T12:05:00.000Z')

    await insertAnalyticsProblem(handle.db, 'same-day-problem', 'Same Day', [])
    await insertAnalyticsHistory(handle.db, 'same-day-problem', {
      id: 'same-day-card:default',
      dates: [firstReview, secondReview],
      ratings: ['good', 'hard'],
      correct: [true, true],
      dueAt: new Date('2026-08-04T12:00:00.000Z'),
      stability: 4,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 14, now })
    const day = summary.views.observedRecallVsFsrs.rows.find(
      (point) => point.bucketStart === '2026-08-02',
    )

    expect(day).toMatchObject({ pairedReviews: 2 })
    expect(day?.fsrsEstimate).not.toBeNull()
    expect(
      summary.views.practiceRhythm.rows.find(
        (row) => row.bucketStart === '2026-08-02',
      ),
    ).toMatchObject({ completedReviews: 2 })
  })

  it('excludes future-dated reviews from observed rating quality', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-31T12:00:00.000Z')
    const inRangeDates = Array.from(
      { length: 10 },
      (_, index) =>
        new Date(
          `2026-01-${String(20 + index).padStart(2, '0')}T12:00:00.000Z`,
        ),
    )

    await insertAnalyticsProblem(
      handle.db,
      'bounded-problem',
      'Bounded Problem',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'bounded-problem', {
      id: 'bounded-card:default',
      dates: inRangeDates,
      ratings: Array<ReviewRating>(10).fill('good'),
      correct: Array<boolean>(10).fill(true),
      dueAt: new Date('2026-02-01T12:00:00.000Z'),
      stability: 8,
      difficulty: 5,
    })
    const futureTimestamp = new Date('2026-02-01T12:00:00.001Z').getTime()
    await handle.db.insert(reviewAttempts).values({
      id: 'future-review',
      problemSlug: 'bounded-problem',
      cardId: 'bounded-card:default',
      rating: 'again',
      reviewMode: 'manual',
      reviewedAt: futureTimestamp,
      isCorrect: false,
      fsrsReviewLog: null,
      createdAt: futureTimestamp,
      updatedAt: futureTimestamp,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 14, now })

    expect(summary.observedRatingQuality).toBe(1)
    expect(summary.observedRatingSampleSize).toBe(10)
  })

  it('excludes same-local-day post-as-of reviews from Ratings Mix, Topic Performance, and its equivalent comparison', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-31T12:00:00.000Z')
    const previousDates = Array.from(
      { length: 14 },
      (_, index) => new Date(Date.UTC(2026, 0, 4 + index, 12)),
    )
    const selectedDates = Array.from(
      { length: 14 },
      (_, index) => new Date(Date.UTC(2026, 0, 18 + index, 12)),
    )
    const dates = [...previousDates, ...selectedDates]

    for (const index of [1, 2, 3]) {
      const slug = `post-as-of-graphs-${index}`
      await insertAnalyticsProblem(
        handle.db,
        slug,
        `Graphs ${index}`,
        index === 1 ? ['Graphs'] : [],
      )
      if (index > 1) {
        await handle.db.insert(problemTopics).values({
          problemSlug: slug,
          topicId: 'post-as-of-graphs-1:graphs',
        })
      }
      await insertAnalyticsHistory(handle.db, slug, {
        id: `${slug}-card:default`,
        dates,
        ratings: [
          ...Array<ReviewRating>(14).fill('again'),
          ...Array<ReviewRating>(14).fill('good'),
        ],
        correct: Array<boolean>(dates.length).fill(true),
        dueAt: new Date('2026-02-01T12:00:00.000Z'),
        stability: 8,
        difficulty: 5,
      })
    }

    const postAsOf = new Date('2026-01-31T13:00:00.000Z')
    await handle.db.insert(reviewAttempts).values({
      id: 'post-as-of-ratings-mix-review',
      problemSlug: 'post-as-of-graphs-1',
      cardId: 'post-as-of-graphs-1-card:default',
      rating: 'again',
      reviewMode: 'manual',
      reviewedAt: postAsOf.getTime(),
      isCorrect: false,
      fsrsReviewLog: null,
      createdAt: postAsOf.getTime(),
      updatedAt: postAsOf.getTime(),
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 14, now })

    expect(summary.views.ratingsMix).toMatchObject({
      selectedHardAgain: 0,
      selectedValidRatings: 42,
      comparison: {
        direction: 'down',
        previousHardAgainShare: 1,
        previousValidRatings: 42,
      },
    })
    expect(summary.views.topicPerformance.rows).toEqual([
      expect.objectContaining({
        topic: 'Graphs',
        reviewSuccess: 1,
        goodEasy: 42,
        validRatings: 42,
        distinctProblems: 3,
      }),
    ])
  })

  it('keeps never-reviewed cards in tracked and workload metrics, not fragile knowledge', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-31T12:00:00.000Z')

    await insertAnalyticsProblem(handle.db, 'new-problem', 'New Problem', [
      'Graphs',
    ])
    await insertNeverReviewedCard(handle.db, 'new-problem', {
      dueAt: new Date('2026-02-01T12:00:00.000Z'),
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 14, now })

    expect(
      summary.views.upcomingReviewLoad.rows.reduce(
        (sum, point) => sum + point.dueCount,
        0,
      ),
    ).toBe(1)
  })

  it('derives chart metrics from full history and current FSRS state', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-31T12:00:00.000Z')
    const selectedDates = Array.from(
      { length: 10 },
      (_, index) =>
        new Date(
          `2026-01-${String(20 + index).padStart(2, '0')}T12:00:00.000Z`,
        ),
    )

    await insertAnalyticsProblem(
      handle.db,
      'graphs-problem',
      'Graphs Problem',
      ['Graphs'],
    )
    await insertAnalyticsProblem(
      handle.db,
      'arrays-problem',
      'Arrays Problem',
      ['Arrays'],
    )
    await insertAnalyticsHistory(handle.db, 'graphs-problem', {
      id: 'graphs-card:default',
      dates: [new Date('2026-01-10T12:00:00.000Z'), ...selectedDates],
      ratings: ['again', 'again', ...Array<ReviewRating>(9).fill('good')],
      correct: [false, ...Array<boolean>(10).fill(true)],
      dueAt: new Date('2026-02-01T12:00:00.000Z'),
      stability: 12,
      difficulty: 8,
    })
    await insertAnalyticsHistory(handle.db, 'arrays-problem', {
      id: 'arrays-card:default',
      dates: [new Date('2026-01-25T12:00:00.000Z')],
      ratings: ['good'],
      correct: [true],
      dueAt: new Date('2026-02-03T12:00:00.000Z'),
      stability: 4,
      difficulty: 4,
    })
    await updateSettings(handle.db, { review: { targetRetention: 0.85 } })

    const summary = await getAnalyticsSummary(handle.db, { range: 14, now })
    const recallPoint = summary.views.observedRecallVsFsrs.rows.find(
      (point) => point.bucketStart === '2026-01-20',
    )

    expect(summary.targetRetention).toBe(0.85)
    expect(
      summary.views.observedRecallVsFsrs.rows.reduce(
        (total, row) => total + row.pairedReviews,
        0,
      ),
    ).toBe(11)
    expect(summary.views.ratingsMix).toMatchObject({
      selectedHardAgain: 1,
      selectedValidRatings: 11,
      comparison: {
        previousHardAgainShare: null,
        previousValidRatings: 1,
        direction: null,
      },
    })
    expect(recallPoint?.fsrsEstimate).not.toBeNull()
    expect(summary.views.topicPerformance.lowEvidenceTopics).toEqual(
      expect.arrayContaining([
        { topic: 'Graphs', validRatings: 10, distinctProblems: 1 },
      ]),
    )
    expect(
      summary.views.memoryStrength.rows.some(
        (point) => point.medianStrengthDays !== null,
      ),
    ).toBe(true)
    expect(
      summary.views.ratingsMix.rows.reduce(
        (sum, point) => sum + point.again,
        0,
      ),
    ).toBe(1)
    expect(summary.views.upcomingReviewLoad.rows[0]?.overdueCount).toBe(0)
    expect(summary.views.upcomingReviewLoad.rows[1]?.dueCount).toBe(1)
    expect(summary.views.retentionMap.rows).toHaveLength(2)
    expect(summary.views.overdueBacklog.rows).toHaveLength(14)
  })

  it.each([30, 90] as const)(
    'marks %s-day overdue backlog readiness when reconstructed daily history is complete',
    async (range) => {
      const handle = await createTestDb({ seed: false })
      const now = new Date('2026-08-13T12:00:00.000Z')
      const dates = Array.from({ length: range }, (_, index) => {
        const date = new Date(now)
        date.setDate(date.getDate() - (range - 1 - index))
        return date
      })

      await insertAnalyticsProblem(
        handle.db,
        `complete-overdue-${range}`,
        `Complete overdue ${range}`,
        [],
      )
      await insertAnalyticsHistory(handle.db, `complete-overdue-${range}`, {
        id: `complete-overdue-${range}:default`,
        dates,
        ratings: Array<ReviewRating>(dates.length).fill('good'),
        correct: Array<boolean>(dates.length).fill(true),
        dueAt: new Date('2026-08-14T12:00:00.000Z'),
        stability: 10,
        difficulty: 5,
      })

      const summary = await getAnalyticsSummary(handle.db, { range, now })

      expect(summary.historicalReadiness.overdueBacklog).toMatchObject({
        ready: true,
        assessments: range,
        activeBuckets:
          summary.historicalReadiness.overdueBacklog.requestedBuckets,
      })
      expect(summary.views.overdueBacklog.knownDays).toBe(range)
    },
  )

  it('keeps sparse reconstructed overdue history unready and preserves null bucket gaps', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 30 }, (_, index) => {
      const date = new Date('2026-07-15T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'sparse-overdue-history',
      'Sparse overdue history',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'sparse-overdue-history', {
      id: 'sparse-overdue-history:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })
    await handle.db
      .update(reviewAttempts)
      .set({ fsrsReviewLog: 'invalid review log' })
      .where(eq(reviewAttempts.id, 'sparse-overdue-history:default:3'))

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(summary.historicalReadiness.overdueBacklog).toMatchObject({
      ready: false,
      assessments: 3,
    })
    expect(
      summary.views.overdueBacklog.rows.some(
        (point) => point.overdueCount === null,
      ),
    ).toBe(true)
  })

  it('keeps recall quality unready when valid ratings have no persisted correctness', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 24 }, (_, index) => {
      const date = new Date('2026-07-21T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'ratings-without-correctness',
      'Ratings without correctness',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'ratings-without-correctness', {
      id: 'ratings-without-correctness:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean | null>(dates.length).fill(null),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(summary.historicalReadiness.requested).toMatchObject({
      ready: true,
      assessments: 24,
    })
    expect(summary.historicalReadiness.recallQuality).toMatchObject({
      ready: false,
      assessments: 0,
      activeBuckets: 0,
    })
    expect(summary.historicalReadiness.recallQuality.failingReasons).toContain(
      'no-evidence',
    )
    expect(
      summary.views.observedRecallVsFsrs.rows.some(
        (row) => row.pairedReviews > 0,
      ),
    ).toBe(true)
    expect(
      summary.views.observedRecallVsFsrs.rows
        .filter((row) => row.pairedReviews > 0)
        .every((row) => row.observedRecall === 1 && row.fsrsEstimate !== null),
    ).toBe(true)
  })

  it('keeps practice rhythm unready when review volume has no persisted correctness', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 24 }, (_, index) => {
      const date = new Date('2026-07-21T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'practice-without-correctness',
      'Practice without correctness',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'practice-without-correctness', {
      id: 'practice-without-correctness:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean | null>(dates.length).fill(null),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    expect(summary.historicalReadiness.requested.ready).toBe(true)
    expect(summary.historicalReadiness.practiceRhythm).toMatchObject({
      ready: false,
      assessments: 0,
      activeBuckets: 0,
    })
    expect(
      summary.views.practiceRhythm.rows.reduce(
        (total, row) => total + row.completedReviews,
        0,
      ),
    ).toBe(24)
    expect(
      summary.views.practiceRhythm.rows
        .filter((row) => row.completedReviews > 0)
        .every((row) => row.reviewSuccess === 1),
    ).toBe(true)
  })

  it('excludes invalid persisted ratings from every historical readiness metric', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 24 }, (_, index) => {
      const date = new Date('2026-07-21T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'invalid-rating-evidence',
      'Invalid rating evidence',
      ['Graphs'],
    )
    await insertAnalyticsHistory(handle.db, 'invalid-rating-evidence', {
      id: 'invalid-rating-evidence:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })
    await handle.db
      .update(reviewAttempts)
      .set({ rating: 'unexpected-rating' })
      .where(eq(reviewAttempts.cardId, 'invalid-rating-evidence:default'))

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })

    for (const readiness of [
      summary.historicalReadiness.requested,
      summary.historicalReadiness.recallQuality,
      summary.historicalReadiness.practiceRhythm,
      summary.historicalReadiness.topics,
      summary.historicalReadiness.stability,
    ]) {
      expect(readiness).toMatchObject({
        ready: false,
        assessments: 0,
        activeBuckets: 0,
        effectiveStart: null,
      })
    }
    expect(
      summary.views.observedRecallVsFsrs.rows.every(
        (row) => row.pairedReviews === 0 && row.observedRecall === null,
      ),
    ).toBe(true)
    expect(
      summary.views.practiceRhythm.rows.every(
        (row) => row.completedReviews === 0 && row.reviewSuccess === null,
      ),
    ).toBe(true)
    expect(summary.views.ratingsMix.selectedValidRatings).toBe(0)
    expect(summary.views.topicPerformance.rows).toEqual([])
    expect(summary.views.topicPerformance.lowEvidenceTopics).toEqual([])
    expect(
      summary.views.memoryStrength.rows.every(
        (row) => row.eligibleReviews === 0,
      ),
    ).toBe(true)
  })

  it('uses only valid persisted ratings for mixed historical readiness evidence', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-07-31T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'mixed-rating-evidence',
      'Mixed rating evidence',
      ['Graphs'],
    )
    await insertAnalyticsHistory(handle.db, 'mixed-rating-evidence', {
      id: 'mixed-rating-evidence:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })
    for (const index of [0, 2, 4, 6, 8, 10, 12]) {
      await handle.db
        .update(reviewAttempts)
        .set({ rating: 'unexpected-rating' })
        .where(eq(reviewAttempts.id, `mixed-rating-evidence:default:${index}`))
    }

    const summary = await getAnalyticsSummary(handle.db, { range: 14, now })

    for (const readiness of [
      summary.historicalReadiness.requested,
      summary.historicalReadiness.recallQuality,
      summary.historicalReadiness.practiceRhythm,
      summary.historicalReadiness.topics,
      summary.historicalReadiness.stability,
    ]) {
      expect(readiness).toMatchObject({ assessments: 7, activeBuckets: 7 })
    }
    expect(
      summary.views.observedRecallVsFsrs.rows.reduce(
        (count, row) => count + row.pairedReviews,
        0,
      ),
    ).toBe(7)
    expect(
      summary.views.practiceRhythm.rows.reduce(
        (count, row) => count + row.completedReviews,
        0,
      ),
    ).toBe(7)
    expect(summary.views.topicPerformance.lowEvidenceTopics).toEqual([
      { topic: 'Graphs', validRatings: 7, distinctProblems: 1 },
    ])
    expect(
      summary.views.memoryStrength.rows.reduce(
        (count, row) => count + row.eligibleReviews,
        0,
      ),
    ).toBe(7)
  })

  it('counts only persisted correctness observations for practice rhythm readiness', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-07-31T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'mixed-practice-correctness',
      'Mixed practice correctness',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'mixed-practice-correctness', {
      id: 'mixed-practice-correctness:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: dates.map((_, index) =>
        index === 0 || index === 7 ? null : true,
      ),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 14, now })

    expect(summary.historicalReadiness.practiceRhythm).toMatchObject({
      ready: true,
      assessments: 12,
      activeBuckets: 12,
    })
  })

  it('counts only persisted correctness observations for recall quality readiness', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-07-31T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'mixed-correctness',
      'Mixed correctness',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'mixed-correctness', {
      id: 'mixed-correctness:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: dates.map((_, index) =>
        index === 0 || index === 7 ? null : true,
      ),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 14, now })

    expect(summary.historicalReadiness.requested).toMatchObject({
      ready: true,
      assessments: 14,
      activeBuckets: 14,
    })
    expect(summary.historicalReadiness.recallQuality).toMatchObject({
      ready: true,
      assessments: 12,
      activeBuckets: 12,
    })
  })

  it('returns non-empty practice rhythm data accepted by the runtime response parser', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-31T12:00:00.000Z')

    await insertAnalyticsProblem(handle.db, 'legacy-consistency', 'Legacy', [])
    await insertAnalyticsHistory(handle.db, 'legacy-consistency', {
      id: 'legacy-consistency-card:default',
      dates: [new Date('2026-01-20T12:00:00.000Z')],
      ratings: ['good'],
      correct: [true],
      dueAt: new Date('2026-02-01T12:00:00.000Z'),
      stability: 4,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 14, now })
    const parsed = analyticsSummarySchema.parse({
      ...summary,
      observedRatingQuality: {
        value: summary.lowSample ? null : summary.observedRatingQuality,
        sampleSize: summary.observedRatingSampleSize,
        lowSample: summary.lowSample,
      },
    })

    expect(parsed.views.practiceRhythm.rows).toHaveLength(14)
    expect(
      parsed.views.practiceRhythm.rows.find(
        (point) => point.completedReviews > 0,
      ),
    ).toEqual({
      id: '2026-01-20',
      bucketStart: '2026-01-20',
      bucketEnd: '2026-01-20',
      isPartial: false,
      completedReviews: 1,
      goodEasy: 1,
      validRatings: 1,
      reviewSuccess: 1,
      evidence: 'measured',
    })
  })

  it('keeps a selected unready 90-day range, recommends a ready shorter range, and preserves current-state analytics', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 24 }, (_, index) => {
      const date = new Date('2026-07-21T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'range-evidence',
      'Range evidence',
      ['Graphs'],
    )
    await insertAnalyticsHistory(handle.db, 'range-evidence', {
      id: 'range-evidence:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 90, now })
    const readiness = summary as typeof summary & {
      historicalReadiness: {
        requested: { requestedDays: number; bucketDays: number; ready: boolean }
        recallQuality: { effectiveBuckets: number }
        recommendedRange: number | null
      }
    }

    expect(readiness.range).toBe(90)
    expect(readiness.historicalReadiness.requested.ready).toBe(false)
    expect(readiness.historicalReadiness.requested).toMatchObject({
      requestedDays: 90,
      bucketDays: 7,
      ready: false,
      effectiveStart: '2026-07-20',
    })
    expect(readiness.historicalReadiness.recommendedRange).toBe(30)
    expect(
      readiness.views.observedRecallVsFsrs.rows.find(
        (row) => row.pairedReviews > 0,
      )?.bucketStart,
    ).toBe(readiness.historicalReadiness.recallQuality.effectiveStart)
    expect(readiness.views.upcomingReviewLoad.rows).toHaveLength(14)
    expect(readiness.views.retentionMap.rows.length).toBeGreaterThan(0)
  })

  it('recommends only a shorter ready range than the selected range', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-07-31T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'shorter-range-evidence',
      'Shorter range evidence',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'shorter-range-evidence', {
      id: 'shorter-range-evidence:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const selected30 = await getAnalyticsSummary(handle.db, {
      range: 30,
      now,
    })
    const selected90 = await getAnalyticsSummary(handle.db, {
      range: 90,
      now,
    })
    const selected14 = await getAnalyticsSummary(handle.db, {
      range: 14,
      now,
    })

    expect(selected30.historicalReadiness.requested.ready).toBe(false)
    expect(selected30.historicalReadiness.recommendedRange).toBe(14)
    expect(selected90.historicalReadiness.requested.ready).toBe(false)
    expect(selected90.historicalReadiness.recommendedRange).toBe(14)
    expect(selected14.historicalReadiness.requested.ready).toBe(true)
    expect(selected14.historicalReadiness.recommendedRange).toBeNull()
  })

  it('never recommends a ready longer range for an unready selected range', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const earlierDates = Array.from({ length: 31 }, (_, index) => {
      const date = new Date('2026-05-16T12:00:00.000Z')
      date.setDate(date.getDate() + index * 2)
      return date
    })
    const recentDates = Array.from({ length: 14 }, (_, index) => {
      const date = new Date('2026-07-31T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })
    const dates = [...earlierDates, ...recentDates]

    await insertAnalyticsProblem(
      handle.db,
      'longer-range-evidence',
      'Longer range evidence',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'longer-range-evidence', {
      id: 'longer-range-evidence:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const selected30 = await getAnalyticsSummary(handle.db, {
      range: 30,
      now,
    })
    const selected90 = await getAnalyticsSummary(handle.db, {
      range: 90,
      now,
    })

    expect(selected30.historicalReadiness.requested.ready).toBe(false)
    expect(selected90.historicalReadiness.requested.ready).toBe(true)
    expect(selected30.historicalReadiness.recommendedRange).toBe(14)
  })

  it('calculates readiness from each metric’s eligible evidence, not a copied range status', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-08-13T12:00:00.000Z')
    const dates = Array.from({ length: 24 }, (_, index) => {
      const date = new Date('2026-07-21T12:00:00.000Z')
      date.setDate(date.getDate() + index)
      return date
    })

    await insertAnalyticsProblem(
      handle.db,
      'topicless-evidence',
      'Topicless',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'topicless-evidence', {
      id: 'topicless-evidence:default',
      dates,
      ratings: Array<ReviewRating>(dates.length).fill('good'),
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-08-14T12:00:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, { range: 30, now })
    const readiness = summary as typeof summary & {
      historicalReadiness: {
        requested: { ready: boolean }
        topics: { ready: boolean; failingReasons: string[] }
        recommendedRange: number | null
      }
    }

    expect(readiness.historicalReadiness.requested.ready).toBe(true)
    expect(readiness.historicalReadiness.requested.ready).toBe(true)
    expect(readiness.historicalReadiness.recommendedRange).toBeNull()
    expect(readiness.historicalReadiness.topics.ready).toBe(false)
    expect(readiness.historicalReadiness.topics.failingReasons).toContain(
      'no-evidence',
    )
  })

  it.each([
    [14, 1],
    [30, 3],
    [90, 7],
  ] as const)(
    'uses %s-day selected history with %s-day presentation buckets',
    async (range, bucketDays) => {
      const handle = await createTestDb({ seed: false })
      const summary = await getAnalyticsSummary(handle.db, {
        range,
        now: new Date('2026-08-13T12:00:00.000Z'),
      })
      const readiness = summary as typeof summary & {
        historicalReadiness: { requested: { bucketDays: number } }
      }

      expect(readiness.historicalReadiness.requested.bucketDays).toBe(
        bucketDays,
      )
    },
  )

  it('keeps the serialized summary deterministic for the same range and time', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-01-15T12:00:00.000Z')

    const first = await getAnalyticsSummary(handle.db, { range: 90, now })
    const second = await getAnalyticsSummary(handle.db, { range: 90, now })

    expect(second).toEqual(first)
  })

  it('uses one requested timezone for bucket rows and forecast grouping', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-03-08T05:30:00.000Z')
    const reviewAt = new Date('2026-03-08T04:30:00.000Z')

    await insertAnalyticsProblem(
      handle.db,
      'timezone-boundary-problem',
      'Timezone Boundary Problem',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'timezone-boundary-problem', {
      id: 'timezone-boundary-card:default',
      dates: [reviewAt],
      ratings: ['good'],
      correct: [true],
      dueAt: new Date('2026-03-09T03:30:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, {
      range: 14,
      now,
      timeZone: 'America/New_York',
    })

    expect(
      summary.views.practiceRhythm.rows.find((row) => row.completedReviews > 0),
    ).toMatchObject({
      bucketStart: '2026-03-07',
      bucketEnd: '2026-03-07',
      completedReviews: 1,
    })
    expect(summary.views.upcomingReviewLoad.rows[0]).toMatchObject({
      date: '2026-03-08',
      dueCount: 1,
    })
  })

  it('uses local frame bounds for quality and Hard + Again comparisons', async () => {
    const handle = await createTestDb({ seed: false })
    const now = new Date('2026-03-08T05:30:00.000Z')
    const previous = Array.from(
      { length: 10 },
      (_, index) => new Date(Date.UTC(2026, 1, 22, 5, index)),
    )
    const previousPartialBoundary = new Date('2026-02-22T06:00:00.000Z')
    const selected = Array.from(
      { length: 10 },
      (_, index) => new Date(Date.UTC(2026, 2, 7, 12, index)),
    )
    const dates = [...previous, previousPartialBoundary, ...selected]

    await insertAnalyticsProblem(
      handle.db,
      'timezone-comparison-problem',
      'Timezone Comparison Problem',
      [],
    )
    await insertAnalyticsHistory(handle.db, 'timezone-comparison-problem', {
      id: 'timezone-comparison-card:default',
      dates,
      ratings: [
        ...Array<ReviewRating>(10).fill('good'),
        'again',
        ...Array<ReviewRating>(10).fill('good'),
      ],
      correct: Array<boolean>(dates.length).fill(true),
      dueAt: new Date('2026-03-09T03:30:00.000Z'),
      stability: 10,
      difficulty: 5,
    })

    const summary = await getAnalyticsSummary(handle.db, {
      range: 14,
      now,
      timeZone: 'America/New_York',
    })

    expect(summary.observedRatingSampleSize).toBe(10)
    expect(summary.observedRatingQuality).toBe(1)
    expect(summary.views.ratingsMix).toMatchObject({
      selectedHardAgain: 0,
      selectedValidRatings: 10,
      comparison: { previousValidRatings: 10 },
    })
  })
})

async function insertAnalyticsProblem(
  db: Db,
  slug: string,
  title: string,
  topicLabels: string[],
) {
  const timestamp = new Date('2026-01-01T00:00:00.000Z').getTime()
  await db.insert(problems).values({
    slug,
    title,
    difficulty: 'medium',
    isPremium: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(problemPractice).values({
    problemSlug: slug,
    status: 'review',
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    lastReviewedAt: timestamp,
    solvedCount: 1,
    attemptCount: 1,
    isSuspended: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  for (const label of topicLabels) {
    const topicId = `${slug}:${label.toLowerCase()}`
    await db.insert(topics).values({
      id: topicId,
      label,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await db.insert(problemTopics).values({ problemSlug: slug, topicId })
  }
}

async function insertAnalyticsHistory(
  db: Db,
  slug: string,
  input: {
    id: string
    dates: Date[]
    ratings: ReviewRating[]
    correct: Array<boolean | null>
    dueAt: Date
    stability: number
    difficulty: number
  },
) {
  const initialCard = createInitialFsrsCard(input.dates[0])
  let card = initialCard
  const rows = []

  for (const [index, reviewedAt] of input.dates.entries()) {
    const scheduled = scheduleReview(card, input.ratings[index]!, reviewedAt, {
      targetRetention: 0.85,
    })
    rows.push({
      id: `${input.id}:${index}`,
      problemSlug: slug,
      cardId: input.id,
      rating: input.ratings[index]!,
      reviewMode: 'manual',
      reviewedAt: reviewedAt.getTime(),
      isCorrect: input.correct[index]!,
      fsrsReviewLog: serializeFsrsReviewLogSnapshot(scheduled.log),
      createdAt: reviewedAt.getTime(),
      updatedAt: reviewedAt.getTime(),
    })
    card = scheduled.card
  }

  await db.insert(fsrsCards).values({
    id: input.id,
    problemSlug: slug,
    cardKind: defaultFsrsCardKind,
    dueAt: input.dueAt.getTime(),
    stability: input.stability,
    difficulty: input.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReviewAt: card.lastReviewAt?.getTime() ?? null,
    createdAt: input.dates[0]!.getTime(),
    updatedAt: input.dates.at(-1)!.getTime(),
  })
  await db.insert(reviewAttempts).values(rows)
}

async function insertNeverReviewedCard(
  db: Db,
  slug: string,
  input: { dueAt: Date },
) {
  const now = new Date('2026-01-01T00:00:00.000Z').getTime()
  await db.insert(fsrsCards).values({
    id: `${slug}:default`,
    problemSlug: slug,
    cardKind: defaultFsrsCardKind,
    dueAt: input.dueAt.getTime(),
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    lastReviewAt: null,
    createdAt: now,
    updatedAt: now,
  })
}
