import { describe, expect, it } from 'vitest'

import { getTodayQueue } from '@/features/queue/server/queue-service'
import { createTracksRepository } from '@/features/tracks/data/tracks-repository'
import { createTestDb } from '@/platform/db/test-db'
import { fsrsCards } from '@/platform/db/schema'

describe('queue track independence', () => {
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
