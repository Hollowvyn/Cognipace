import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createPracticeRepository } from '@/features/practice/data/practice-repository'
import { getTodayQueue } from '@/features/queue/server/queue-service'
import { createTracksRepository } from '@/features/tracks/data/tracks-repository'
import {
  createFsrsSchedulerProfile,
  getRetrievability,
  serializeFsrsSchedulerProfile,
} from '@/lib/fsrs'
import { createTestDb } from '@/platform/db/test-db'
import {
  fsrsCards,
  fsrsSchedulerProfiles,
  practiceReviewEvidence,
} from '@/platform/db/schema'

describe('queue track independence', () => {
  it('ranks future cards with their captured profile instead of a default-weight tie', async () => {
    const { db } = await createTestDb()
    const practice = createPracticeRepository(db)
    const reviewedAt = new Date('2026-01-01T12:00:00.000Z')
    const now = new Date('2026-01-05T12:00:00.000Z')
    const dueAt = new Date('2026-01-10T12:00:00.000Z')
    const first = await practice.saveReviewResult({
      problemSlug: '3sum',
      rating: 'good',
      reviewedAt,
    })
    const second = await practice.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt,
    })
    const commonCard = {
      ...first.card,
      dueAt,
      stability: 10,
      lastReviewAt: reviewedAt,
    }
    for (const saved of [first, second]) {
      await db
        .update(fsrsCards)
        .set({
          dueAt: dueAt.getTime(),
          stability: commonCard.stability,
          lastReviewAt: reviewedAt.getTime(),
        })
        .where(eq(fsrsCards.id, saved.cardId))
    }

    const defaultQueue = await getTodayQueue(db, now, 'extra-practice')
    expect(defaultQueue.topRecommendation?.problemSlug).toBe('3sum')

    const defaultProfile = createFsrsSchedulerProfile()
    const higherProfile = createFsrsSchedulerProfile({
      weights: defaultProfile.parameters.weights.map((weight, index) =>
        index === 20 ? 0.2 : weight,
      ),
    })
    const lowerProfile = createFsrsSchedulerProfile({
      weights: defaultProfile.parameters.weights.map((weight, index) =>
        index === 20 ? 0.1 : weight,
      ),
    })
    expect(
      getRetrievability(commonCard, now, lowerProfile.parameters),
    ).toBeLessThan(getRetrievability(commonCard, now, higherProfile.parameters))
    for (const [saved, profile, id] of [
      [first, higherProfile, 'queue-higher-retrievability'],
      [second, lowerProfile, 'queue-lower-retrievability'],
    ] as const) {
      await db.insert(fsrsSchedulerProfiles).values({
        id,
        profileJson: serializeFsrsSchedulerProfile(profile),
        createdAt: reviewedAt.getTime(),
      })
      await db
        .update(practiceReviewEvidence)
        .set({ schedulerProfileId: id })
        .where(
          eq(practiceReviewEvidence.reviewAttemptId, saved.reviewAttemptId),
        )
    }

    const queue = await getTodayQueue(db, now, 'extra-practice')
    expect(queue.topRecommendation?.problemSlug).toBe('two-sum')
    expect(queue.topRecommendation?.state.retrievability).toBeCloseTo(
      getRetrievability(commonCard, now, lowerProfile.parameters),
    )
    expect(queue.items.map((item) => item.problemSlug)).toEqual(['two-sum'])
    expect(queue.reinforcementCount).toBe(2)

    await db
      .update(practiceReviewEvidence)
      .set({
        schedulingEvidenceKind: 'legacy-derived',
        schedulerProfileId: null,
      })
      .where(eq(practiceReviewEvidence.reviewAttemptId, first.reviewAttemptId))
    await db
      .update(practiceReviewEvidence)
      .set({ schedulingEvidenceKind: 'unknown', schedulerProfileId: null })
      .where(eq(practiceReviewEvidence.reviewAttemptId, second.reviewAttemptId))
    const fallback = await getTodayQueue(db, now, 'extra-practice')
    expect(fallback.topRecommendation?.problemSlug).toBe('3sum')
    expect(fallback.topRecommendation?.state.retrievability).toBeCloseTo(
      getRetrievability(commonCard, now),
    )
  })

  it('keeps an imported opaque card identity in the unchanged due cohort', async () => {
    const { db } = await createTestDb()
    const now = new Date('2026-01-02T12:00:00.000Z')
    await db.insert(fsrsCards).values({
      id: 'queue/opaque',
      problemSlug: 'two-sum',
      cardKind: 'default',
      dueAt: new Date('2026-01-01T12:00:00Z').getTime(),
      stability: 2,
      difficulty: 4,
      elapsedDays: 0,
      scheduledDays: 1,
      learningSteps: 0,
      reps: 1,
      lapses: 0,
      state: 'review',
      lastReviewAt: new Date('2025-12-31T12:00:00Z').getTime(),
      createdAt: 0,
      updatedAt: 0,
    })
    const queue = await getTodayQueue(db, now)
    expect(
      queue.items.find((item) => item.problemSlug === 'two-sum'),
    ).toMatchObject({
      category: 'due',
      reason: 'overdue',
      state: { cardId: 'queue/opaque' },
    })
  })
  it('returns the same queue counts and items regardless of active track state', async () => {
    const handle = await createTestDb()
    const now = new Date('2026-01-01T12:00:00.000Z')

    // The seeded DB has an active track (ByteByteGo) by default.
    const withTrack = await getTodayQueue(handle.db, now)

    // Deactivate the track — simulates a user with no active track selected.
    await createTracksRepository(handle.db).clearActiveTrack(now)

    const withoutTrack = await getTodayQueue(handle.db, now)

    // Queue counts and order must be identical — track state must not influence them.
    expect(withoutTrack.dueCount).toBe(withTrack.dueCount)
    expect(withoutTrack.newCount).toBe(withTrack.newCount)
    expect(withoutTrack.reinforcementCount).toBe(withTrack.reinforcementCount)
    expect(withoutTrack.excludedCount).toBe(withTrack.excludedCount)
    expect(withoutTrack.items.map((i) => i.problemSlug)).toEqual(
      withTrack.items.map((i) => i.problemSlug),
    )
  })
})
