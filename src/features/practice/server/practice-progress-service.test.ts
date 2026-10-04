import { describe, expect, it } from 'vitest'

import { createTestDb } from '@/platform/db/test-db'

import { createPracticeRepository } from '../data/practice-repository'
import { getPracticeProgressSummary } from './practice-service'

describe('getPracticeProgressSummary', () => {
  it('sums repeated and failed saved reviews independently of unique problems', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)
    const now = new Date('2026-05-25T16:30:00.000Z')

    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'again',
      reviewedAt: new Date('2026-05-25T10:00:00.000Z'),
      reviewMode: 'manual',
      elapsedSeconds: 120,
      isCorrect: false,
    })
    await repository.saveReviewResult({
      problemSlug: 'valid-parentheses',
      rating: 'hard',
      reviewedAt: new Date('2026-05-25T11:00:00.000Z'),
      reviewMode: 'manual',
      elapsedSeconds: 180,
    })
    await repository.saveReviewResult({
      problemSlug: 'reverse-linked-list',
      rating: 'good',
      reviewedAt: new Date('2026-05-25T12:00:00.000Z'),
      reviewMode: 'manual',
      elapsedSeconds: 240,
    })
    await repository.saveReviewResult({
      problemSlug: 'lru-cache',
      rating: 'easy',
      reviewedAt: new Date('2026-05-25T13:00:00.000Z'),
      reviewMode: 'manual',
      elapsedSeconds: 300,
    })
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'again',
      reviewedAt: new Date('2026-05-25T14:00:00.000Z'),
      reviewMode: 'manual',
      elapsedSeconds: 60,
      isCorrect: false,
    })
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-05-25T15:00:00.000Z'),
      reviewMode: 'manual',
    })

    await expect(
      getPracticeProgressSummary(handle.db, {
        dailyGoal: 4,
        now,
      }),
    ).resolves.toMatchObject({
      completedToday: 4,
      currentStreak: 1,
      dailyGoal: 4,
      goalMetToday: true,
      recordedSecondsToday: 900,
    })
  })

  it('uses saved whole-second time for the current local date only', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)
    const now = new Date(2026, 4, 25, 12)

    for (const [reviewedAt, elapsedSeconds] of [
      [new Date(2026, 4, 24, 23, 59, 59, 999), 600],
      [new Date(2026, 4, 25, 0, 0, 0, 0), 60.6],
      [new Date(2026, 4, 25, 23, 59, 59, 999), 60.6],
      [new Date(2026, 4, 26, 0, 0, 0, 0), 600],
    ] as const) {
      await repository.saveReviewResult({
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt,
        elapsedSeconds,
        reviewMode: 'manual',
      })
    }

    await expect(
      getPracticeProgressSummary(handle.db, { dailyGoal: 0, now }),
    ).resolves.toMatchObject({
      recordedSecondsToday: 122,
      completedToday: 1,
      dailyGoal: 0,
      goalMetToday: false,
      currentStreak: 0,
    })
  })

  it('preserves the earned streak before today meets the daily goal', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)
    const now = new Date('2026-05-25T16:30:00.000Z')

    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-05-24T10:00:00.000Z'),
      reviewMode: 'manual',
    })
    await repository.saveReviewResult({
      problemSlug: 'valid-parentheses',
      rating: 'easy',
      reviewedAt: new Date('2026-05-24T11:00:00.000Z'),
      reviewMode: 'manual',
    })
    await expect(
      getPracticeProgressSummary(handle.db, { dailyGoal: 2, now }),
    ).resolves.toMatchObject({
      completedToday: 0,
      currentStreak: 1,
      goalMetToday: false,
    })

    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'again',
      reviewedAt: new Date('2026-05-25T12:00:00.000Z'),
      reviewMode: 'manual',
    })

    await expect(
      getPracticeProgressSummary(handle.db, {
        dailyGoal: 2,
        now,
      }),
    ).resolves.toMatchObject({
      completedToday: 1,
      currentStreak: 1,
      dailyGoal: 2,
      goalMetToday: false,
      recordedSecondsToday: 0,
    })

    await expect(
      getPracticeProgressSummary(handle.db, {
        dailyGoal: 2,
        now: new Date('2026-05-26T16:30:00.000Z'),
      }),
    ).resolves.toMatchObject({ currentStreak: 0, goalMetToday: false })
  })
})
