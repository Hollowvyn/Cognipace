import { describe, expect, it } from 'vitest'

import { createPracticeRepository } from '@/features/practice/data/practice-repository'
import { getTodayQueue } from '@/features/queue/server/queue-service'
import { updateSettings } from '@/features/settings/server/settings-service'
import type { Db } from '@/platform/db'
import { createTestDb } from '@/platform/db/test-db'
import {
  fsrsCards,
  problemPractice,
  problems,
  reviewAttempts,
} from '@/platform/db/schema'

import { getAnalyticsSummary } from './server/analytics-service'

describe('Phase E study-day agreement', () => {
  it('keeps Practice, automatic Queue, Extra Practice, Retention Map and forecast on the same local day', async () => {
    const previousTimezone = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
        'America/New_York',
      )
      const now = new Date('2026-03-08T05:30:00.000Z')
      const handle = await createTestDb({ seed: false })
      const db = handle.db
      await updateSettings(db, { practice: { dailyGoal: 3 } })

      await insertReviewedCard(db, {
        slug: 'overdue-card',
        lastReviewAt: '2026-03-01T12:00:00.000Z',
        dueAt: '2026-03-07T12:00:00.000Z',
        stability: 6,
      })
      await insertReviewedCard(db, {
        slug: 'due-today-card',
        lastReviewAt: '2026-03-06T12:00:00.000Z',
        dueAt: '2026-03-08T12:00:00.000Z',
        stability: 3,
      })
      await insertReviewedCard(db, {
        slug: 'just-reviewed-card',
        lastReviewAt: '2026-03-08T05:10:00.000Z',
        dueAt: '2026-03-08T06:00:00.000Z',
        stability: 1,
        state: 'relearning',
        status: 'learning',
        updatedAt: '2026-03-08T05:25:00.000Z',
      })
      await insertProblem(db, 'new-card')
      await insertReviewedCard(db, {
        slug: 'future-low-recall-card',
        lastReviewAt: '2026-02-01T12:00:00.000Z',
        dueAt: '2026-03-12T12:00:00.000Z',
        stability: 1,
      })
      await insertReviewedCard(db, {
        slug: 'suspended-card',
        lastReviewAt: '2026-03-01T12:00:00.000Z',
        dueAt: '2026-03-07T12:00:00.000Z',
        stability: 6,
        status: 'suspended',
        isSuspended: true,
      })

      const practice = createPracticeRepository(db)
      const details = await Promise.all(
        [
          'overdue-card',
          'due-today-card',
          'just-reviewed-card',
          'new-card',
          'future-low-recall-card',
          'suspended-card',
        ].map((slug) => practice.getPracticeDetails(slug, { now })),
      )
      expect(
        details.map((state) => [
          state.problemSlug,
          state.eligibleOn,
          state.isDue,
          state.isOverdue,
        ]),
      ).toEqual([
        ['overdue-card', '2026-03-07', true, true],
        ['due-today-card', '2026-03-08', true, false],
        ['just-reviewed-card', '2026-03-09', false, false],
        ['new-card', null, false, false],
        ['future-low-recall-card', '2026-03-12', false, false],
        ['suspended-card', '2026-03-07', false, false],
      ])
      expect(details[2]?.dueAt).toEqual(new Date('2026-03-08T06:00:00.000Z'))
      expect(details[2]?.latestAttempt).toMatchObject({
        reviewedAt: new Date('2026-03-08T05:10:00.000Z'),
        updatedAt: new Date('2026-03-08T05:25:00.000Z'),
      })

      const automatic = await getTodayQueue(db, now)
      expect(automatic.items.map((item) => item.problemSlug)).toEqual([
        'overdue-card',
        'due-today-card',
        'new-card',
      ])
      expect(automatic.items).toHaveLength(3)
      expect(automatic).toMatchObject({
        dueCount: 2,
        dueToday: 2,
        newCount: 1,
        queueLoad: 3,
      })
      expect(automatic.topRecommendation?.problemSlug).toBe('overdue-card')

      const extra = await getTodayQueue(db, now, 'extra-practice')
      expect(extra.items.map((item) => item.problemSlug)).toEqual([
        'future-low-recall-card',
      ])
      expect(extra.reinforcementCount).toBe(2)
      expect(extra.topRecommendation?.problemSlug).toBe(
        'future-low-recall-card',
      )
      expect(extra.dueToday).toBe(automatic.dueToday)

      const analytics = await getAnalyticsSummary(db, {
        range: 30,
        now,
        timeZone: 'America/New_York',
      })
      const forecast = analytics.views.upcomingReviewLoad.rows
      expect(forecast[0]).toMatchObject({
        date: '2026-03-08',
        dueCount: 1,
        overdueCount: 1,
        today: true,
      })
      expect(forecast[0]!.dueCount + forecast[0]!.overdueCount).toBe(
        automatic.dueToday,
      )
      expect(forecast[1]).toMatchObject({
        date: '2026-03-09',
        dueCount: 1,
      })
      expect(forecast[4]).toMatchObject({
        date: '2026-03-12',
        dueCount: 1,
      })
      const future = analytics.views.retentionMap.rows.find(
        (row) => row.slug === 'future-low-recall-card',
      )
      expect(future).toBeDefined()
      expect(future!.retrievability).toBeLessThan(
        analytics.views.retentionMap.targetRetention,
      )
      expect(
        forecast.reduce((sum, row) => sum + row.dueCount + row.overdueCount, 0),
      ).toBe(4)
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ
      else process.env.TZ = previousTimezone
    }
  })
})

async function insertProblem(db: Db, slug: string) {
  const timestamp = new Date('2026-01-01T12:00:00.000Z').getTime()
  await db.insert(problems).values({
    slug,
    title: slug,
    difficulty: 'medium',
    isPremium: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

async function insertReviewedCard(
  db: Db,
  input: {
    slug: string
    lastReviewAt: string
    dueAt: string
    stability: number
    state?: 'review' | 'relearning'
    status?: 'review' | 'learning' | 'suspended'
    isSuspended?: boolean
    updatedAt?: string
  },
) {
  await insertProblem(db, input.slug)
  const reviewedAt = new Date(input.lastReviewAt).getTime()
  const dueAt = new Date(input.dueAt).getTime()
  const updatedAt = new Date(input.updatedAt ?? input.lastReviewAt).getTime()
  const cardId = `${input.slug}:default`
  await db.insert(problemPractice).values({
    problemSlug: input.slug,
    status: input.status ?? 'review',
    firstSeenAt: reviewedAt,
    lastSeenAt: reviewedAt,
    lastReviewedAt: reviewedAt,
    lastRating: 'good',
    solvedCount: 1,
    attemptCount: 1,
    isSuspended: input.isSuspended ?? false,
    createdAt: reviewedAt,
    updatedAt,
  })
  await db.insert(fsrsCards).values({
    id: cardId,
    problemSlug: input.slug,
    cardKind: 'default',
    dueAt,
    stability: input.stability,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 1,
    lapses: input.state === 'relearning' ? 1 : 0,
    state: input.state ?? 'review',
    lastReviewAt: reviewedAt,
    createdAt: reviewedAt,
    updatedAt,
  })
  await db.insert(reviewAttempts).values({
    id: `${input.slug}:attempt`,
    problemSlug: input.slug,
    cardId,
    rating: 'good',
    reviewMode: 'manual',
    reviewedAt,
    createdAt: reviewedAt,
    updatedAt,
  })
}
