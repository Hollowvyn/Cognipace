import { asc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
  fsrsCards,
  problems,
  problemPractice,
  reviewAttempts,
  trackGroupProblems,
  trackGroups,
  trackProblemProgress,
  trackSession,
  tracks,
} from '@/platform/db/schema'
import { createTestDb } from '@/platform/db/test-db'
import type { Db } from '@/platform/db'

import { createTracksRepository } from './tracks-repository'

describe('TracksRepository', () => {
  it('derives opted-in completion from historical reviews without writing the track ledger', async () => {
    const { db } = await createTestDb()
    const repository = createTracksRepository(db)
    await insertReviewAttempt(db, {
      id: 'historical',
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewedAt: new Date(1000),
    })
    await insertReviewAttempt(db, {
      id: 'later-again',
      problemSlug: 'two-sum',
      rating: 'again',
      reviewedAt: new Date(2000),
    })
    const input = {
      description: null,
      dueAt: null,
      groups: [
        { title: 'Main', problemSlugs: ['two-sum', 'valid-parentheses'] },
      ],
    }
    const external = await repository.createTrack({
      ...input,
      title: 'External history',
      allowExternalProgress: true,
    })
    const independent = await repository.createTrack({
      ...input,
      title: 'Independent history',
    })
    expect(external.allowExternalProgress).toBe(true)
    expect(independent.allowExternalProgress).toBe(false)
    expect(
      (await repository.getMemberships(external.id))[0]?.completion,
    ).toEqual({
      status: 'completed',
      source: 'external',
      completedAt: new Date(1000),
      completedRating: 'hard',
      reviewAttemptId: 'historical',
    })
    const progress = await repository.getProgressByTrack([
      external.id,
      independent.id,
    ])
    expect(progress.get(external.id)).toEqual({
      completedCount: 1,
      totalCount: 2,
      percent: 50,
    })
    expect(progress.get(independent.id)?.completedCount).toBe(0)
    expect(await db.select().from(trackProblemProgress)).toEqual([])
    await repository.setActiveTrack(external.id)
    expect((await repository.getActiveTrack())?.nextProblem?.slug).toBe(
      'valid-parentheses',
    )
  })

  it('uses the latest remaining success with deterministic provenance and prefers owned completion', async () => {
    const { db } = await createTestDb()
    const repository = createTracksRepository(db)
    const track = await repository.createTrack({
      title: 'Review corrections',
      description: null,
      dueAt: null,
      allowExternalProgress: true,
      groups: [{ title: 'Main', problemSlugs: ['two-sum'] }],
    })
    for (const [id, time] of [
      ['old-success', 1000],
      ['same-a', 2000],
      ['same-z', 2000],
    ] as const) {
      await insertReviewAttempt(db, {
        id,
        reviewedAt: new Date(time),
        problemSlug: 'two-sum',
        rating: 'good',
      })
    }
    expect(
      (await repository.getMemberships(track.id))[0]?.completion
        .reviewAttemptId,
    ).toBe('same-z')
    await db
      .update(reviewAttempts)
      .set({ rating: 'again' })
      .where(eq(reviewAttempts.id, 'same-z'))
    expect(
      (await repository.getMemberships(track.id))[0]?.completion
        .reviewAttemptId,
    ).toBe('same-a')
    await repository.setActiveTrack(track.id)
    await repository.recordActiveTrackProblemReview({
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewedAt: new Date(3000),
      reviewAttemptId: 'same-a',
    })
    expect((await repository.getMemberships(track.id))[0]?.completion).toEqual({
      status: 'completed',
      completedAt: new Date(3000),
      completedRating: 'hard',
      reviewAttemptId: 'same-a',
    })
    await repository.reconcileActiveTrackProblemReviewOverride({
      problemSlug: 'two-sum',
      rating: 'again',
      reviewedAt: new Date(3000),
      reviewAttemptId: 'same-a',
    })
    await db
      .update(reviewAttempts)
      .set({ rating: 'again' })
      .where(eq(reviewAttempts.id, 'same-a'))
    expect(
      (await repository.getMemberships(track.id))[0]?.completion,
    ).toMatchObject({ source: 'external', reviewAttemptId: 'old-success' })
    await db
      .update(reviewAttempts)
      .set({ rating: 'again' })
      .where(eq(reviewAttempts.id, 'old-success'))
    expect(
      (await repository.getMemberships(track.id))[0]?.completion.status,
    ).toBe('incomplete')
    await db
      .update(reviewAttempts)
      .set({ rating: 'easy' })
      .where(eq(reviewAttempts.id, 'same-z'))
    expect(
      (await repository.getMemberships(track.id))[0]?.completion,
    ).toMatchObject({
      source: 'external',
      completedRating: 'easy',
      reviewAttemptId: 'same-z',
    })
  })

  it('reset disables external credit atomically while retaining review history and can be re-enabled', async () => {
    const { db } = await createTestDb()
    const repository = createTracksRepository(db)
    const track = await repository.createTrack({
      title: 'External reset',
      description: null,
      dueAt: null,
      allowExternalProgress: true,
      groups: [{ title: 'Main', problemSlugs: ['two-sum'] }],
    })
    await insertReviewAttempt(db, {
      id: 'reset-history',
      problemSlug: 'two-sum',
      rating: 'easy',
      reviewedAt: new Date(1000),
    })
    await repository.setActiveTrack(track.id)
    await repository.recordActiveTrackProblemReview({
      problemSlug: 'two-sum',
      rating: 'easy',
      reviewedAt: new Date(1000),
      reviewAttemptId: 'reset-history',
    })
    await repository.resetTrackProgress(track.id)
    expect(
      (await repository.getTrackById(track.id))?.allowExternalProgress,
    ).toBe(false)
    expect(
      (await repository.getProgressByTrack([track.id])).get(track.id)
        ?.completedCount,
    ).toBe(0)
    expect(await db.select().from(trackProblemProgress)).toEqual([])
    expect(await db.select().from(reviewAttempts)).toHaveLength(1)
    const groups = await repository.getGroups(track.id)
    await repository.updateTrack({
      ...track,
      trackId: track.id,
      allowExternalProgress: true,
      groups: groups.map((group) => ({ ...group, problemSlugs: ['two-sum'] })),
    })
    expect(
      (await repository.getMemberships(track.id))[0]?.completion,
    ).toMatchObject({ source: 'external' })
    await repository.updateTrack({
      ...track,
      trackId: track.id,
      allowExternalProgress: false,
      groups: groups.map((group) => ({ ...group, problemSlugs: ['two-sum'] })),
    })
    expect(
      (await repository.getMemberships(track.id))[0]?.completion.status,
    ).toBe('incomplete')
  })

  it('keeps Next in whole-track order and skips suspended questions without erasing completion', async () => {
    const { db } = await createTestDb()
    const repository = createTracksRepository(db)
    const track = await repository.createTrack({
      title: 'Ordered external',
      description: null,
      dueAt: null,
      allowExternalProgress: true,
      groups: [
        { title: 'First', problemSlugs: ['two-sum', 'valid-parentheses'] },
        { title: 'Last', problemSlugs: ['two-sum-ii-input-array-is-sorted'] },
      ],
    })
    await db.insert(problemPractice).values({
      problemSlug: 'two-sum',
      status: 'mastered',
      firstSeenAt: 0,
      solvedCount: 9,
      attemptCount: 9,
      lastRating: 'easy',
      isSuspended: true,
      createdAt: 0,
      updatedAt: 0,
    })
    await repository.setActiveTrack(track.id)
    const groups = await repository.getGroups(track.id)
    await repository.setActiveGroup(groups[1]!.id)
    expect((await repository.getActiveTrack())?.nextProblem?.slug).toBe(
      'valid-parentheses',
    )
    expect(
      (await repository.getProgressByTrack([track.id])).get(track.id)
        ?.completedCount,
    ).toBe(0)
    await insertReviewAttempt(db, {
      id: 'suspended-success',
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date(1000),
    })
    expect(
      (await repository.getMemberships(track.id))[0]?.completion.status,
    ).toBe('completed')
  })

  it('removes only the requested membership and compacts its group order', async () => {
    const { db } = await createTestDb()
    const repository = createTracksRepository(db)
    const track = await repository.createTrack({
      title: 'Removal test',
      description: null,
      dueAt: null,
      groups: [
        {
          title: 'Main',
          problemSlugs: [
            'two-sum',
            'two-sum-ii-input-array-is-sorted',
            'valid-parentheses',
          ],
        },
      ],
    })
    const other = await repository.createTrack({
      title: 'Other removal test',
      description: null,
      dueAt: null,
      groups: [
        { title: 'Main', problemSlugs: ['two-sum-ii-input-array-is-sorted'] },
      ],
    })
    await insertReviewAttempt(db, {
      id: 'removal-review',
      problemSlug: 'two-sum-ii-input-array-is-sorted',
      rating: 'good',
      reviewedAt: new Date(1000),
    })
    await db.insert(problemPractice).values({
      problemSlug: 'two-sum-ii-input-array-is-sorted',
      status: 'mastered',
      firstSeenAt: 1000,
      lastSeenAt: 1000,
      lastReviewedAt: 1000,
      lastRating: 'good',
      solvedCount: 1,
      attemptCount: 1,
      isSuspended: false,
      createdAt: 1000,
      updatedAt: 1000,
    })
    await db.insert(trackProblemProgress).values(
      [track.id, other.id].map((trackId) => ({
        trackId,
        problemSlug: 'two-sum-ii-input-array-is-sorted',
        reviewAttemptId: 'removal-review',
        completedAt: 1000,
        completedRating: 'good',
        createdAt: 1000,
        updatedAt: 1000,
      })),
    )
    const practiceBefore = await db.select().from(problemPractice)
    const reviewsBefore = await db.select().from(reviewAttempts)
    const cardsBefore = await db.select().from(fsrsCards)
    await repository.removeProblem(track.id, 'two-sum-ii-input-array-is-sorted')
    expect(
      (await repository.getMemberships(track.id)).map((row) => [
        row.problemSlug,
        row.problemPosition,
      ]),
    ).toEqual([
      ['two-sum', 1],
      ['valid-parentheses', 2],
    ])
    expect(await repository.getMemberships(other.id)).toHaveLength(1)
    expect(
      await db
        .select()
        .from(trackProblemProgress)
        .where(eq(trackProblemProgress.trackId, track.id)),
    ).toEqual([])
    expect(
      await db
        .select()
        .from(trackProblemProgress)
        .where(eq(trackProblemProgress.trackId, other.id)),
    ).toHaveLength(1)

    expect(
      await db
        .select()
        .from(problems)
        .where(eq(problems.slug, 'two-sum-ii-input-array-is-sorted')),
    ).toHaveLength(1)
    expect(await db.select().from(problemPractice)).toEqual(practiceBefore)
    expect(await db.select().from(reviewAttempts)).toEqual(reviewsBefore)
    expect(await db.select().from(fsrsCards)).toEqual(cardsBefore)
    await repository.removeProblem(track.id, 'two-sum-ii-input-array-is-sorted')
    expect(await repository.getMemberships(track.id)).toHaveLength(2)
  })

  it('keeps the final empty group and rejects a missing track', async () => {
    const { db } = await createTestDb()
    const repository = createTracksRepository(db)
    const track = await repository.createTrack({
      title: 'Empty removal test',
      description: null,
      dueAt: null,
      groups: [{ title: 'Main', problemSlugs: ['two-sum'] }],
    })
    await repository.setActiveTrack(track.id)
    await repository.removeProblem(track.id, 'two-sum')
    expect(await repository.getGroups(track.id)).toHaveLength(1)
    expect(await repository.getMemberships(track.id)).toEqual([])
    expect(await repository.getActiveTrack()).toMatchObject({
      track: { id: track.id },
      nextProblem: null,
      progress: { completedCount: 0, totalCount: 0, percent: 0 },
    })
    await expect(
      repository.removeProblem('missing', 'two-sum'),
    ).rejects.toThrow(/missing track/)
  })

  it('reads active track context with nullable due date', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const repository = createTracksRepository(handle.db)

    const activeTrack = await repository.getActiveTrack()

    expect(activeTrack).toMatchObject({
      track: {
        id: 'bytebytego-coding-patterns-101',
        title: 'ByteByteGo Coding Patterns 101',
        dueAt: null,
      },
      activeGroup: {
        title: 'Two Pointers',
      },
      progress: {
        completedCount: 0,
        totalCount: 101,
        percent: 0,
      },
      nextProblem: {
        slug: 'two-sum-ii-input-array-is-sorted',
      },
    })
  })

  it('returns null when the active session has no active track', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    await handle.db
      .update(trackSession)
      .set({
        activeTrackId: null,
        activeGroupId: null,
      })
      .where(eq(trackSession.id, 'active'))

    const activeTrack = await createTracksRepository(handle.db).getActiveTrack()

    expect(activeTrack).toBeNull()
  })

  it('does not expose legacy track active flags', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    const activeTrack = await createTracksRepository(handle.db).getActiveTrack()

    expect(activeTrack?.track).not.toHaveProperty('isActive')
  })

  it('maps track due date from storage', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const dueAt = new Date('2026-03-01T00:00:00.000Z')

    await handle.db
      .update(tracks)
      .set({ dueAt: dueAt.getTime() })
      .where(eq(tracks.id, 'bytebytego-coding-patterns-101'))

    const activeTrack = await createTracksRepository(handle.db).getActiveTrack()

    expect(activeTrack?.track.dueAt).toEqual(dueAt)
  })

  it('summarizes catalog progress without reading practice state', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const timestamp = new Date('2026-01-01T08:00:00.000Z').getTime()

    await makeLeetCodeActive(handle.db)
    await handle.db.insert(trackGroups).values({
      id: 'leetcode-75:stack',
      trackId: 'leetcode-75',
      title: 'Stack',
      position: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await handle.db.insert(trackGroupProblems).values({
      trackGroupId: 'leetcode-75:stack',
      trackId: 'leetcode-75',
      problemSlug: 'valid-parentheses',
      position: 1,
    })
    await handle.db.insert(problemPractice).values({
      problemSlug: 'two-sum',
      status: 'mastered',
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      lastReviewedAt: timestamp,
      lastRating: 'easy',
      solvedCount: 1,
      attemptCount: 1,
      isSuspended: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const activeTrack = await createTracksRepository(handle.db).getActiveTrack()

    expect(activeTrack?.progress).toEqual({
      completedCount: 0,
      totalCount: 2,
      percent: 0,
    })
    expect(activeTrack?.activeGroup).toMatchObject({
      id: 'leetcode-75:arrays-hashing',
      title: 'Arrays and Hashing',
    })
    expect(activeTrack?.nextProblem).toMatchObject({
      slug: 'two-sum',
    })
  })

  it('counts completed track progress from the track ledger only', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const timestamp = new Date('2026-01-01T08:00:00.000Z').getTime()

    await makeLeetCodeActive(handle.db)
    await handle.db.insert(trackGroups).values({
      id: 'leetcode-75:stack',
      trackId: 'leetcode-75',
      title: 'Stack',
      position: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await handle.db.insert(trackGroupProblems).values({
      trackGroupId: 'leetcode-75:stack',
      trackId: 'leetcode-75',
      problemSlug: 'valid-parentheses',
      position: 1,
    })
    await handle.db.insert(problemPractice).values({
      problemSlug: 'valid-parentheses',
      status: 'mastered',
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      lastReviewedAt: timestamp,
      lastRating: 'easy',
      solvedCount: 1,
      attemptCount: 1,
      isSuspended: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await handle.db.insert(trackProblemProgress).values({
      trackId: 'leetcode-75',
      problemSlug: 'two-sum',
      completedAt: timestamp,
      completedRating: 'good',
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const activeTrack = await createTracksRepository(handle.db).getActiveTrack()

    expect(activeTrack?.progress).toEqual({
      completedCount: 1,
      totalCount: 2,
      percent: 50,
    })
  })

  it('deletes progress when deleting a track problem membership', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const timestamp = new Date('2026-01-01T08:00:00.000Z').getTime()

    await handle.db.insert(trackProblemProgress).values({
      trackId: 'leetcode-75',
      problemSlug: 'two-sum',
      completedAt: timestamp,
      completedRating: 'easy',
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await handle.db
      .delete(trackGroupProblems)
      .where(eq(trackGroupProblems.trackGroupId, 'leetcode-75:arrays-hashing'))

    const rows = await handle.db
      .select()
      .from(trackProblemProgress)
      .orderBy(
        asc(trackProblemProgress.trackId),
        asc(trackProblemProgress.problemSlug),
      )

    expect(rows).toEqual([])
  })

  it('restores the persisted active track and active group', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    await handle.db
      .update(trackSession)
      .set({
        activeTrackId: 'grind-75',
        activeGroupId: 'grind-75:stack',
      })
      .where(eq(trackSession.id, 'active'))

    const activeTrack = await createTracksRepository(handle.db).getActiveTrack()

    expect(activeTrack).toMatchObject({
      track: {
        id: 'grind-75',
        title: 'Grind 75',
      },
      activeGroup: {
        id: 'grind-75:stack',
        title: 'Stack',
      },
      nextProblem: {
        slug: 'valid-parentheses',
      },
    })
  })

  it('keeps suspended questions in the catalog total while excluding them from Next', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const timestamp = new Date('2026-01-01T08:00:00.000Z').getTime()

    await makeLeetCodeActive(handle.db)
    await handle.db.insert(problemPractice).values({
      problemSlug: 'two-sum',
      status: 'suspended',
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      lastReviewedAt: null,
      lastRating: null,
      solvedCount: 0,
      attemptCount: 0,
      isSuspended: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const activeTrack = await createTracksRepository(handle.db).getActiveTrack()

    expect(activeTrack?.nextProblem).toBeNull()
    expect(activeTrack?.progress).toEqual({
      completedCount: 0,
      totalCount: 1,
      percent: 0,
    })
  })

  it('reads catalog rows ordered by created date then title with active summary', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const repository = createTracksRepository(handle.db)

    const catalog = await repository.getTrackCatalog()

    expect(catalog.map((item) => item.track.id)).toEqual([
      'bytebytego-coding-patterns-101',
      'grind-75',
      'leetcode-75',
    ])
    expect(catalog.map((item) => item.isActive)).toEqual([true, false, false])
    expect(catalog.find((item) => item.isActive)).toMatchObject({
      activeGroupId: 'bytebytego-coding-patterns-101:two-pointers',
      progress: {
        completedCount: 0,
        totalCount: 101,
        percent: 0,
      },
      track: {
        id: 'bytebytego-coding-patterns-101',
      },
    })
  })

  it('reads the selected active track and group from the session', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    const session = await createTracksRepository(handle.db).getSession()

    expect(session).toMatchObject({
      activeTrack: {
        id: 'bytebytego-coding-patterns-101',
        title: 'ByteByteGo Coding Patterns 101',
      },
      activeGroup: {
        id: 'bytebytego-coding-patterns-101:two-pointers',
        title: 'Two Pointers',
      },
    })
  })

  it('does not fall back to a track row when the session has no active track', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    await handle.db
      .update(trackSession)
      .set({
        activeTrackId: null,
        activeGroupId: null,
      })
      .where(eq(trackSession.id, 'active'))

    const repository = createTracksRepository(handle.db)

    await expect(repository.getSession()).resolves.toMatchObject({
      activeTrack: null,
      activeGroup: null,
    })
    await expect(repository.getActiveTrack()).resolves.toBeNull()
  })

  it('orders groups by their persisted position', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const timestamp = new Date('2026-01-01T08:00:00.000Z').getTime()

    await handle.db.insert(trackGroups).values({
      id: 'leetcode-75:zero',
      trackId: 'leetcode-75',
      title: 'Zero',
      position: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const groups = await createTracksRepository(handle.db).getGroups(
      'leetcode-75',
    )

    expect(groups.map((group) => group.id)).toEqual([
      'leetcode-75:zero',
      'leetcode-75:arrays-hashing',
    ])
  })

  it('orders memberships by their persisted problem position', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    await handle.db.insert(trackGroupProblems).values({
      trackGroupId: 'leetcode-75:arrays-hashing',
      trackId: 'leetcode-75',
      problemSlug: 'valid-parentheses',
      position: 0,
    })

    const memberships = await createTracksRepository(handle.db).getMemberships(
      'leetcode-75',
    )

    expect(memberships.map((membership) => membership.problemSlug)).toEqual([
      'valid-parentheses',
      'two-sum',
    ])
    expect(memberships[0]).not.toHaveProperty('completedAt')
    expect(memberships[0]).not.toHaveProperty('completedRating')
    expect(memberships[0]?.completion).toEqual({
      status: 'incomplete',
      reviewAttemptId: null,
    })
  })

  it('sets the active track to its first group and writes both session ids', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const repository = createTracksRepository(handle.db)
    const timestamp = new Date('2026-01-01T08:00:00.000Z').getTime()

    await handle.db.insert(trackGroups).values({
      id: 'grind-75:arrays',
      trackId: 'grind-75',
      title: 'Arrays',
      position: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const session = await repository.setActiveTrack(
      'grind-75',
      new Date('2026-01-02T00:00:00.000Z'),
    )
    const rows = await handle.db.select().from(trackSession)

    expect(session).toMatchObject({
      activeTrack: {
        id: 'grind-75',
      },
      activeGroup: {
        id: 'grind-75:arrays',
      },
    })
    expect(rows).toMatchObject([
      {
        activeTrackId: 'grind-75',
        activeGroupId: 'grind-75:arrays',
      },
    ])
  })

  it('clears active track and group session ids', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const repository = createTracksRepository(handle.db)

    await repository.setActiveTrack('leetcode-75')

    const session = await repository.clearActiveTrack(
      new Date('2026-01-02T00:00:00.000Z'),
    )
    const rows = await handle.db.select().from(trackSession)

    expect(session).toMatchObject({
      activeTrack: null,
      activeGroup: null,
    })
    expect(rows).toMatchObject([
      {
        activeTrackId: null,
        activeGroupId: null,
      },
    ])
  })

  it('rejects setting an active group outside the current active track', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const repository = createTracksRepository(handle.db)

    await expect(repository.setActiveGroup('grind-75:stack')).rejects.toThrow(
      /active track/i,
    )

    await expect(repository.getSession()).resolves.toMatchObject({
      activeTrack: {
        id: 'bytebytego-coding-patterns-101',
      },
      activeGroup: {
        id: 'bytebytego-coding-patterns-101:two-pointers',
      },
    })
  })

  it('creates a Main group when creating a track with no groups', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const repository = createTracksRepository(handle.db)

    const created = await repository.createTrack(
      {
        title: 'Dynamic Plan',
        description: null,
        dueAt: null,
        groups: [],
      },
      new Date('2026-01-02T00:00:00.000Z'),
    )
    const groups = await repository.getGroups(created.id)

    expect(created).toMatchObject({
      id: 'dynamic-plan',
      slug: 'dynamic-plan',
      title: 'Dynamic Plan',
      description: null,
      dueAt: null,
    })
    expect(groups).toEqual([
      {
        id: 'dynamic-plan:main',
        trackId: 'dynamic-plan',
        title: 'Main',
        position: 1,
      },
    ])
  })

  it('updates a track with normalized group and problem positions', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const repository = createTracksRepository(handle.db)
    const timestamp = new Date('2026-01-01T08:00:00.000Z').getTime()

    await handle.db.insert(trackGroups).values({
      id: 'leetcode-75:stack',
      trackId: 'leetcode-75',
      title: 'Stack',
      position: 10,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const updated = await repository.updateTrack(
      {
        trackId: 'leetcode-75',
        title: 'LeetCode 75 Updated',
        description: 'Updated description',
        dueAt: '2026-04-01T00:00:00.000Z',
        groups: [
          {
            id: 'leetcode-75:stack',
            title: 'Stack',
            problemSlugs: [],
          },
          {
            id: 'leetcode-75:arrays-hashing',
            title: 'Arrays',
            problemSlugs: ['Valid Parentheses', 'Two Sum'],
          },
        ],
      },
      new Date('2026-01-02T00:00:00.000Z'),
    )

    const groups = await repository.getGroups('leetcode-75')
    const memberships = await repository.getMemberships('leetcode-75')

    expect(updated).toMatchObject({
      id: 'leetcode-75',
      title: 'LeetCode 75 Updated',
      description: 'Updated description',
      dueAt: new Date('2026-04-01T00:00:00.000Z'),
    })
    expect(groups.map((group) => [group.id, group.position])).toEqual([
      ['leetcode-75:stack', 1],
      ['leetcode-75:arrays-hashing', 2],
    ])
    expect(
      memberships.map((membership) => [
        membership.groupId,
        membership.problemSlug,
        membership.problemPosition,
      ]),
    ).toEqual([
      ['leetcode-75:arrays-hashing', 'valid-parentheses', 1],
      ['leetcode-75:arrays-hashing', 'two-sum', 2],
    ])
  })

  it('rejects duplicate problem slugs across groups when saving a track', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const repository = createTracksRepository(handle.db)

    await expect(
      repository.createTrack({
        title: 'Duplicate Plan',
        description: null,
        dueAt: null,
        groups: [
          {
            title: 'Arrays',
            problemSlugs: ['two-sum'],
          },
          {
            title: 'Hash Maps',
            problemSlugs: ['Two Sum'],
          },
        ],
      }),
    ).rejects.toThrow('Problem "two-sum" can only appear once in a track.')
    await expect(
      repository.updateTrack({
        trackId: 'leetcode-75',
        title: 'LeetCode 75',
        description: null,
        dueAt: null,
        groups: [
          {
            id: 'leetcode-75:arrays-hashing',
            title: 'Arrays and Hashing',
            problemSlugs: ['two-sum'],
          },
          {
            title: 'Hash Maps',
            problemSlugs: ['two-sum'],
          },
        ],
      }),
    ).rejects.toThrow('Problem "two-sum" can only appear once in a track.')
  })

  it('keeps completed progress when moving a problem out of an omitted group', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const timestamp = new Date('2026-01-01T08:00:00.000Z').getTime()
    const repository = createTracksRepository(handle.db)

    await handle.db.insert(trackGroups).values({
      id: 'leetcode-75:stack',
      trackId: 'leetcode-75',
      title: 'Stack',
      position: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await handle.db.insert(trackGroupProblems).values({
      trackGroupId: 'leetcode-75:stack',
      trackId: 'leetcode-75',
      problemSlug: 'valid-parentheses',
      position: 1,
    })
    await handle.db.insert(trackProblemProgress).values({
      trackId: 'leetcode-75',
      problemSlug: 'valid-parentheses',
      completedAt: timestamp,
      completedRating: 'easy',
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await repository.updateTrack({
      trackId: 'leetcode-75',
      title: 'LeetCode 75',
      description: null,
      dueAt: null,
      groups: [
        {
          id: 'leetcode-75:arrays-hashing',
          title: 'Arrays and Hashing',
          problemSlugs: ['two-sum', 'valid-parentheses'],
        },
      ],
    })

    const memberships = await repository.getMemberships('leetcode-75')
    const progressRows = await handle.db
      .select()
      .from(trackProblemProgress)
      .orderBy(
        asc(trackProblemProgress.trackId),
        asc(trackProblemProgress.problemSlug),
      )

    expect(memberships.map((membership) => membership.groupId)).toEqual([
      'leetcode-75:arrays-hashing',
      'leetcode-75:arrays-hashing',
    ])
    expect(progressRows).toMatchObject([
      {
        trackId: 'leetcode-75',
        problemSlug: 'valid-parentheses',
        completedAt: timestamp,
        completedRating: 'easy',
      },
    ])
  })

  it('allows moving an incomplete problem out of an omitted group and normalizes positions', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const timestamp = new Date('2026-01-01T08:00:00.000Z').getTime()
    const repository = createTracksRepository(handle.db)

    await handle.db.insert(trackGroups).values({
      id: 'leetcode-75:stack',
      trackId: 'leetcode-75',
      title: 'Stack',
      position: 10,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await handle.db.insert(trackGroupProblems).values({
      trackGroupId: 'leetcode-75:stack',
      trackId: 'leetcode-75',
      problemSlug: 'valid-parentheses',
      position: 8,
    })

    await repository.updateTrack({
      trackId: 'leetcode-75',
      title: 'LeetCode 75',
      description: null,
      dueAt: null,
      groups: [
        {
          id: 'leetcode-75:arrays-hashing',
          title: 'Arrays and Hashing',
          problemSlugs: ['valid-parentheses', 'two-sum'],
        },
      ],
    })

    const groups = await repository.getGroups('leetcode-75')
    const memberships = await repository.getMemberships('leetcode-75')
    const progressRows = await handle.db
      .select()
      .from(trackProblemProgress)
      .orderBy(
        asc(trackProblemProgress.trackId),
        asc(trackProblemProgress.problemSlug),
      )

    expect(groups).toEqual([
      {
        id: 'leetcode-75:arrays-hashing',
        trackId: 'leetcode-75',
        title: 'Arrays and Hashing',
        position: 1,
      },
    ])
    expect(
      memberships.map((membership) => [
        membership.groupId,
        membership.problemSlug,
        membership.problemPosition,
      ]),
    ).toEqual([
      ['leetcode-75:arrays-hashing', 'valid-parentheses', 1],
      ['leetcode-75:arrays-hashing', 'two-sum', 2],
    ])
    expect(progressRows).toEqual([])
  })

  it('rejects omitting a non-empty group when its memberships are not moved', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    await expect(
      createTracksRepository(handle.db).updateTrack({
        trackId: 'leetcode-75',
        title: 'LeetCode 75',
        description: null,
        dueAt: null,
        groups: [
          {
            title: 'Replacement',
            problemSlugs: [],
          },
        ],
      }),
    ).rejects.toThrow(/non-empty group/i)
  })

  it('clears both session ids when deleting the active track', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    await makeLeetCodeActive(handle.db)
    await createTracksRepository(handle.db).deleteTrack(
      'leetcode-75',
      new Date('2026-01-02T00:00:00.000Z'),
    )

    const sessionRows = await handle.db.select().from(trackSession)
    const trackRows = await handle.db
      .select()
      .from(tracks)
      .orderBy(asc(tracks.id))

    expect(sessionRows).toMatchObject([
      {
        activeTrackId: null,
        activeGroupId: null,
      },
    ])
    expect(trackRows.map((track) => track.id)).toEqual([
      'bytebytego-coding-patterns-101',
      'grind-75',
    ])
  })

  it('resets only progress rows for the target track', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const timestamp = new Date('2026-01-01T08:00:00.000Z').getTime()

    await handle.db.insert(trackProblemProgress).values([
      {
        trackId: 'leetcode-75',
        problemSlug: 'two-sum',
        completedAt: timestamp,
        completedRating: 'good',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        trackId: 'grind-75',
        problemSlug: 'valid-parentheses',
        completedAt: timestamp,
        completedRating: 'easy',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ])

    await createTracksRepository(handle.db).resetTrackProgress('leetcode-75')

    const progressRows = await handle.db
      .select()
      .from(trackProblemProgress)
      .orderBy(
        asc(trackProblemProgress.trackId),
        asc(trackProblemProgress.problemSlug),
      )

    expect(progressRows).toMatchObject([
      {
        trackId: 'grind-75',
        problemSlug: 'valid-parentheses',
      },
    ])
  })

  it('keeps progress when a completed problem moves between groups in the same track', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const timestamp = new Date('2026-01-02T00:00:00.000Z')
    const repository = createTracksRepository(handle.db)

    await makeLeetCodeActive(handle.db)
    await insertReviewAttempt(handle.db, {
      id: 'review-two-sum-1',
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: timestamp,
    })
    await handle.db.insert(trackProblemProgress).values({
      trackId: 'leetcode-75',
      problemSlug: 'two-sum',
      reviewAttemptId: 'review-two-sum-1',
      completedAt: timestamp.getTime(),
      completedRating: 'good',
      createdAt: timestamp.getTime(),
      updatedAt: timestamp.getTime(),
    })

    await repository.updateTrack({
      trackId: 'leetcode-75',
      title: 'LeetCode 75',
      description: 'Focused starter track for high-signal interview patterns.',
      dueAt: null,
      groups: [
        {
          id: 'leetcode-75:arrays-hashing',
          title: 'Arrays and Hashing',
          problemSlugs: [],
        },
        {
          id: 'leetcode-75:stack',
          title: 'Stack',
          problemSlugs: ['valid-parentheses', 'two-sum'],
        },
      ],
    })

    const progressRows = await handle.db
      .select()
      .from(trackProblemProgress)
      .orderBy(
        asc(trackProblemProgress.trackId),
        asc(trackProblemProgress.problemSlug),
      )

    expect(progressRows).toMatchObject([
      {
        trackId: 'leetcode-75',
        problemSlug: 'two-sum',
        reviewAttemptId: 'review-two-sum-1',
        completedRating: 'good',
      },
    ])
  })

  it('completes active-track progress for hard review attempts', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const reviewedAt = new Date('2026-01-02T00:00:00.000Z')
    const repository = createTracksRepository(handle.db)

    await makeLeetCodeActive(handle.db)
    await insertReviewAttempt(handle.db, {
      id: 'review-hard-1',
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewedAt,
    })

    await expect(
      repository.recordActiveTrackProblemReview({
        problemSlug: 'two-sum',
        rating: 'hard',
        reviewedAt,
        reviewAttemptId: 'review-hard-1',
      }),
    ).resolves.toBe(true)

    await expect(
      handle.db.select().from(trackProblemProgress),
    ).resolves.toMatchObject([
      {
        trackId: 'leetcode-75',
        problemSlug: 'two-sum',
        reviewAttemptId: 'review-hard-1',
        completedAt: reviewedAt.getTime(),
        completedRating: 'hard',
      },
    ])
  })

  it('reconciles overrides only for the controlling active-track attempt', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const timestamp = new Date('2026-01-02T00:00:00.000Z')
    const repository = createTracksRepository(handle.db)

    await makeLeetCodeActive(handle.db)
    await insertReviewAttempt(handle.db, {
      id: 'review-newer',
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: timestamp,
    })
    await handle.db.insert(trackProblemProgress).values({
      trackId: 'leetcode-75',
      problemSlug: 'two-sum',
      reviewAttemptId: 'review-newer',
      completedAt: timestamp.getTime(),
      completedRating: 'good',
      createdAt: timestamp.getTime(),
      updatedAt: timestamp.getTime(),
    })

    await expect(
      repository.reconcileActiveTrackProblemReviewOverride({
        problemSlug: 'two-sum',
        rating: 'hard',
        reviewedAt: timestamp,
        reviewAttemptId: 'review-older',
      }),
    ).resolves.toBe(false)

    await expect(
      handle.db.select().from(trackProblemProgress),
    ).resolves.toMatchObject([
      {
        reviewAttemptId: 'review-newer',
        completedRating: 'good',
      },
    ])
  })

  it('reset deletes track progress by track id only', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const timestamp = new Date('2026-01-02T00:00:00.000Z')

    await insertReviewAttempt(handle.db, {
      id: 'review-two-sum-1',
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: timestamp,
    })
    await insertReviewAttempt(handle.db, {
      id: 'review-valid-parentheses-1',
      problemSlug: 'valid-parentheses',
      rating: 'easy',
      reviewedAt: timestamp,
    })
    await handle.db.insert(trackProblemProgress).values([
      {
        trackId: 'leetcode-75',
        problemSlug: 'two-sum',
        reviewAttemptId: 'review-two-sum-1',
        completedAt: timestamp.getTime(),
        completedRating: 'good',
        createdAt: timestamp.getTime(),
        updatedAt: timestamp.getTime(),
      },
      {
        trackId: 'grind-75',
        problemSlug: 'valid-parentheses',
        reviewAttemptId: 'review-valid-parentheses-1',
        completedAt: timestamp.getTime(),
        completedRating: 'easy',
        createdAt: timestamp.getTime(),
        updatedAt: timestamp.getTime(),
      },
    ])

    await createTracksRepository(handle.db).resetTrackProgress('leetcode-75')

    const progressRows = await handle.db
      .select()
      .from(trackProblemProgress)
      .orderBy(
        asc(trackProblemProgress.trackId),
        asc(trackProblemProgress.problemSlug),
      )

    expect(progressRows).toMatchObject([
      {
        trackId: 'grind-75',
        problemSlug: 'valid-parentheses',
        reviewAttemptId: 'review-valid-parentheses-1',
        completedRating: 'easy',
      },
    ])
  })

  it('records active-track reviews by track and problem', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const hardReviewedAt = new Date('2026-01-02T00:00:00.000Z')
    const goodReviewedAt = new Date('2026-01-03T00:00:00.000Z')
    const repository = createTracksRepository(handle.db)

    await makeLeetCodeActive(handle.db)
    await insertReviewAttempt(handle.db, {
      id: 'review-hard-2',
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewedAt: hardReviewedAt,
    })
    await insertReviewAttempt(handle.db, {
      id: 'review-good-2',
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: goodReviewedAt,
    })

    await expect(
      repository.recordActiveTrackProblemReview({
        problemSlug: 'two-sum',
        rating: 'hard',
        reviewedAt: hardReviewedAt,
        reviewAttemptId: 'review-hard-2',
      }),
    ).resolves.toBe(true)
    await expect(
      repository.recordActiveTrackProblemReview({
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt: goodReviewedAt,
        reviewAttemptId: 'review-good-2',
      }),
    ).resolves.toBe(true)

    const progressRows = await handle.db
      .select()
      .from(trackProblemProgress)
      .orderBy(
        asc(trackProblemProgress.trackId),
        asc(trackProblemProgress.problemSlug),
      )

    expect(progressRows).toMatchObject([
      {
        trackId: 'leetcode-75',
        problemSlug: 'two-sum',
        reviewAttemptId: 'review-good-2',
        completedAt: goodReviewedAt.getTime(),
        completedRating: 'good',
      },
    ])
  })

  it('keeps completed active-track progress when a later hard review is saved', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const goodReviewedAt = new Date('2026-01-02T00:00:00.000Z')
    const hardReviewedAt = new Date('2026-01-03T00:00:00.000Z')
    const repository = createTracksRepository(handle.db)

    await makeLeetCodeActive(handle.db)
    await insertReviewAttempt(handle.db, {
      id: 'review-good-before-hard',
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: goodReviewedAt,
    })
    await insertReviewAttempt(handle.db, {
      id: 'review-hard-after-good',
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewedAt: hardReviewedAt,
    })

    await expect(
      repository.recordActiveTrackProblemReview({
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt: goodReviewedAt,
        reviewAttemptId: 'review-good-before-hard',
      }),
    ).resolves.toBe(true)
    await expect(
      repository.recordActiveTrackProblemReview({
        problemSlug: 'two-sum',
        rating: 'hard',
        reviewedAt: hardReviewedAt,
        reviewAttemptId: 'review-hard-after-good',
      }),
    ).resolves.toBe(true)

    const progressRows = await handle.db.select().from(trackProblemProgress)

    expect(progressRows).toMatchObject([
      {
        trackId: 'leetcode-75',
        problemSlug: 'two-sum',
        reviewAttemptId: 'review-hard-after-good',
        completedAt: hardReviewedAt.getTime(),
        completedRating: 'hard',
      },
    ])
  })

  it('does not record review progress for inactive tracks with the same problem', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const reviewedAt = new Date('2026-01-02T00:00:00.000Z')
    const repository = createTracksRepository(handle.db)

    await makeLeetCodeActive(handle.db)
    await handle.db.insert(trackGroupProblems).values({
      trackGroupId: 'grind-75:stack',
      trackId: 'grind-75',
      problemSlug: 'two-sum',
      position: 2,
    })
    await insertReviewAttempt(handle.db, {
      id: 'review-active-only',
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt,
    })

    await expect(
      repository.recordActiveTrackProblemReview({
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt,
        reviewAttemptId: 'review-active-only',
      }),
    ).resolves.toBe(true)

    const progressRows = await handle.db
      .select()
      .from(trackProblemProgress)
      .orderBy(
        asc(trackProblemProgress.trackId),
        asc(trackProblemProgress.problemSlug),
      )

    expect(progressRows).toMatchObject([
      {
        trackId: 'leetcode-75',
        problemSlug: 'two-sum',
      },
    ])
  })
})

async function makeLeetCodeActive(db: Db) {
  await db
    .update(trackSession)
    .set({
      activeTrackId: 'leetcode-75',
      activeGroupId: 'leetcode-75:arrays-hashing',
    })
    .where(eq(trackSession.id, 'active'))
}

async function insertReviewAttempt(
  db: Db,
  input: {
    id: string
    problemSlug: string
    rating: 'again' | 'hard' | 'good' | 'easy'
    reviewedAt: Date
  },
) {
  const timestamp = input.reviewedAt.getTime()
  const cardId = `${input.problemSlug}:default`

  await db
    .insert(fsrsCards)
    .values({
      id: cardId,
      problemSlug: input.problemSlug,
      cardKind: 'default',
      dueAt: timestamp,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
      reps: 0,
      lapses: 0,
      state: 'new',
      lastReviewAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing()

  await db.insert(reviewAttempts).values({
    id: input.id,
    problemSlug: input.problemSlug,
    cardId,
    rating: input.rating,
    reviewMode: 'manual',
    reviewedAt: timestamp,
    elapsedSeconds: null,
    isCorrect: null,
    interviewPattern: null,
    timeComplexity: null,
    spaceComplexity: null,
    languages: null,
    notes: null,
    fsrsReviewLog: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}
