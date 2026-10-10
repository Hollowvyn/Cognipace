import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { createPracticeRepository } from '@/features/practice/data/practice-repository'
import {
  overrideLastReviewResultWithTrackProgress,
  resetPracticeSchedule,
  saveReviewResultWithTrackProgress,
} from '@/features/practice/server/practice-service'
import { getTodayQueue } from '@/features/queue/server/queue-service'
import { createSettingsRepository } from '@/features/settings/data/settings-repository'
import { defaultUserSettings } from '@/features/settings/domain'
import { createTracksRepository } from '@/features/tracks/data/tracks-repository'
import {
  createInitialFsrsCard,
  scheduleReview,
  createFsrsSchedulerProfile,
  scheduleReviewWithProfile,
  serializeFsrsSchedulerProfile,
  serializeFsrsCardSnapshot,
  serializeFsrsReviewLogSnapshot,
} from '@/lib/fsrs'
import { createTestDb } from '@/platform/db/test-db'
import { createDb, createSqliteWasmLocator } from '@/platform/db/client'
import { serializeDb, deserializeDb } from '@/platform/db/snapshot'
import {
  fsrsCards,
  problemPractice,
  reviewAttempts,
  trackGroupProblems,
  trackProblemProgress,
  practiceReviewEvidence,
  practiceGenerations,
  fsrsSchedulerProfiles,
} from '@/platform/db/schema'

import {
  preparePracticeStorage,
  validatePracticeStorage,
} from './server/practice-storage-service'

describe('practice core', () => {
  it('allocates a fresh card identity when the canonical ID belongs to an imported sibling, and rejects UUID collisions atomically', async () => {
    const handle = await createTestDb()
    const { db } = handle
    const reviewedAt = new Date('2026-01-01T00:00:00Z')
    const scheduled = scheduleReview(
      createInitialFsrsCard(reviewedAt),
      'good',
      reviewedAt,
    )
    const card = scheduled.card
    await db.insert(fsrsCards).values({
      id: 'two-sum:default',
      problemSlug: '3sum',
      cardKind: 'default',
      dueAt: card.dueAt.getTime(),
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      learningSteps: card.learningSteps,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      lastReviewAt: card.lastReviewAt!.getTime(),
      createdAt: reviewedAt.getTime(),
      updatedAt: reviewedAt.getTime(),
    })
    await db.insert(reviewAttempts).values({
      id: 'sibling-imported',
      problemSlug: '3sum',
      cardId: 'two-sum:default',
      rating: 'good',
      reviewMode: 'manual',
      reviewedAt: reviewedAt.getTime(),
      fsrsReviewLog: serializeFsrsReviewLogSnapshot(scheduled.log),
      createdAt: reviewedAt.getTime(),
      updatedAt: reviewedAt.getTime(),
    })
    await preparePracticeStorage(db)
    await validatePracticeStorage(db)
    const siblingRows = () =>
      [
        "SELECT * FROM fsrs_cards WHERE problem_slug = '3sum'",
        "SELECT * FROM review_attempts WHERE problem_slug = '3sum'",
        "SELECT * FROM practice_review_evidence WHERE review_attempt_id = 'sibling-imported'",
        "SELECT * FROM practice_generations WHERE scope_id IN ('local', 'problem:3sum') ORDER BY scope_id",
      ].map((sql) => handle.rawDb.exec({ sql, returnValue: 'resultRows' }))
    const beforeSibling = siblingRows()
    const allRows = () =>
      [
        'fsrs_cards',
        'review_attempts',
        'problem_practice',
        'practice_review_evidence',
        'practice_generations',
      ].map((table) =>
        handle.rawDb.exec({
          sql: `SELECT * FROM ${table} ORDER BY 1`,
          returnValue: 'resultRows',
        }),
      )
    const beforeFailure = allRows()
    const repository = createPracticeRepository(db)
    const collision = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValue(
        'two-sum:default' as ReturnType<typeof crypto.randomUUID>,
      )
    try {
      await expect(
        repository.saveReviewResult({
          problemSlug: 'two-sum',
          rating: 'hard',
          reviewedAt: new Date('2026-01-02T00:00:00Z'),
          reviewAttemptId: 'collision-rejected',
        }),
      ).rejects.toThrow()
      expect(allRows()).toEqual(beforeFailure)
    } finally {
      collision.mockRestore()
    }
    const saved = await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewedAt: new Date('2026-01-02T00:00:00Z'),
      reviewAttemptId: 'safe-new-card',
    })
    expect(saved.cardId).not.toBe('two-sum:default')
    expect(siblingRows()).toEqual(beforeSibling)
    await validatePracticeStorage(db)
    expect(
      (
        await repository.overrideLastReviewResult({
          problemSlug: 'two-sum',
          rating: 'easy',
        })
      ).cardId,
    ).toBe(saved.cardId)
    expect(siblingRows()).toEqual(beforeSibling)
    await validatePracticeStorage(db)
    const reopened = await createDb({ locateWasm: createSqliteWasmLocator() })
    try {
      deserializeDb(reopened, serializeDb(handle))
      const reloadedRepository = createPracticeRepository(reopened.db)
      expect(
        (await reloadedRepository.getPracticeDetails('two-sum')).cardId,
      ).toBe(saved.cardId)
      expect((await reloadedRepository.getPracticeDetails('3sum')).cardId).toBe(
        'two-sum:default',
      )
      await validatePracticeStorage(reopened.db)
    } finally {
      reopened.rawDb.close()
    }
  })
  it('uses an imported opaque card ID for details, Save and Update and retains application sequence', async () => {
    const { db } = await createTestDb()
    const repository = createPracticeRepository(db)
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewAttemptId: 'opaque-first',
      reviewedAt: new Date('2026-01-02T00:00:00Z'),
    })
    // Import base rows with opaque identity and then initialize their sidecars.
    await db.delete(reviewAttempts)
    await db.delete(fsrsCards)
    const card = scheduleReview(
      createInitialFsrsCard(new Date('2026-01-02T00:00:00Z')),
      'good',
      new Date('2026-01-02T00:00:00Z'),
    ).card
    await db.insert(fsrsCards).values({
      id: 'imported/opaque',
      problemSlug: 'two-sum',
      cardKind: 'default',
      dueAt: card.dueAt.getTime(),
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      learningSteps: card.learningSteps,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      lastReviewAt: card.lastReviewAt!.getTime(),
      createdAt: 1,
      updatedAt: 2,
    })
    await db.insert(reviewAttempts).values({
      id: 'legacy-later-created',
      problemSlug: 'two-sum',
      cardId: 'imported/opaque',
      rating: 'good',
      reviewMode: 'manual',
      reviewedAt: new Date('2026-01-02T00:00:00Z').getTime(),
      createdAt: 20,
      updatedAt: 20,
    })
    await preparePracticeStorage(db)
    expect((await repository.getPracticeDetails('two-sum')).cardId).toBe(
      'imported/opaque',
    )
    const saved = await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewAttemptId: 'opaque-next',
      reviewedAt: new Date('2026-01-03T00:00:00Z'),
    })
    expect(saved.cardId).toBe('imported/opaque')
    expect(
      (
        await repository.overrideLastReviewResult({
          problemSlug: 'two-sum',
          rating: 'easy',
        })
      ).cardId,
    ).toBe('imported/opaque')
    expect(await db.select().from(fsrsCards)).toHaveLength(1)
    expect(await db.select().from(practiceReviewEvidence)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reviewAttemptId: 'legacy-later-created',
          applicationSequence: 1,
          revision: 0,
          sequenceSource: 'legacy-inferred',
        }),
        expect.objectContaining({
          reviewAttemptId: 'opaque-next',
          applicationSequence: 2,
          revision: 1,
          sequenceSource: 'applied',
        }),
      ]),
    )
  })

  it('initializes scopes when suspending untouched Practice and rejects sequence/revision overflow atomically', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)
    await repository.setPracticeSuspended({
      problemSlug: 'two-sum',
      suspended: true,
    })
    expect(await handle.db.select().from(practiceGenerations)).toHaveLength(2)
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewAttemptId: 'overflow',
    })
    await handle.db
      .update(practiceReviewEvidence)
      .set({ applicationSequence: Number.MAX_SAFE_INTEGER })
      .where(eq(practiceReviewEvidence.reviewAttemptId, 'overflow'))
    const rows = () =>
      [
        'fsrs_cards',
        'review_attempts',
        'problem_practice',
        'practice_review_evidence',
        'practice_generations',
      ].map((table) =>
        handle.rawDb.exec({
          sql: `SELECT * FROM ${table}`,
          returnValue: 'resultRows',
        }),
      )
    const beforeSave = rows()
    await expect(
      repository.saveReviewResult({
        problemSlug: 'two-sum',
        rating: 'easy',
        reviewAttemptId: 'overflow-save',
      }),
    ).rejects.toThrow(/sequence/i)
    expect(rows()).toEqual(beforeSave)
    await handle.db
      .update(practiceReviewEvidence)
      .set({ applicationSequence: 1, revision: Number.MAX_SAFE_INTEGER })
      .where(eq(practiceReviewEvidence.reviewAttemptId, 'overflow'))
    const beforeUpdate = rows()
    await expect(
      repository.overrideLastReviewResult({
        problemSlug: 'two-sum',
        rating: 'easy',
      }),
    ).rejects.toThrow(/revision/i)
    expect(rows()).toEqual(beforeUpdate)
  })

  it.each([false, true])(
    'preserves inferred sequences and target log when created order differs from replay (ties=%s)',
    async (ties) => {
      const { db } = await createTestDb()
      const repository = createPracticeRepository(db)
      await db.insert(fsrsCards).values({
        id: 'selection/opaque',
        problemSlug: 'two-sum',
        cardKind: 'default',
        dueAt: 0,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        learningSteps: 0,
        reps: 0,
        lapses: 0,
        state: 'new',
        lastReviewAt: null,
        createdAt: 0,
        updatedAt: 0,
      })
      await db.insert(reviewAttempts).values([
        {
          id: 'later-reviewed',
          problemSlug: 'two-sum',
          cardId: 'selection/opaque',
          rating: 'good',
          reviewMode: 'manual',
          reviewedAt: new Date('2026-01-03T00:00:00Z').getTime(),
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'latest-created',
          problemSlug: 'two-sum',
          cardId: 'selection/opaque',
          rating: 'hard',
          reviewMode: 'manual',
          reviewedAt: new Date('2026-01-01T00:00:00Z').getTime(),
          createdAt: 2,
          updatedAt: 2,
        },
      ])
      if (ties)
        await db.insert(reviewAttempts).values({
          id: 'earlier-tied',
          problemSlug: 'two-sum',
          cardId: 'selection/opaque',
          rating: 'again',
          reviewMode: 'manual',
          reviewedAt: new Date('2026-01-01T00:00:00Z').getTime(),
          createdAt: 0,
          updatedAt: 0,
        })
      await preparePracticeStorage(db)
      const corrected = await repository.overrideLastReviewResult({
        problemSlug: 'two-sum',
        rating: 'easy',
      })
      expect(corrected.reviewAttemptId).toBe('latest-created')
      expect(corrected.card.lastReviewAt?.toISOString()).toBe(
        '2026-01-03T00:00:00.000Z',
      )
      const [target] = await db
        .select()
        .from(reviewAttempts)
        .where(eq(reviewAttempts.id, 'latest-created'))
      expect(JSON.parse(target!.fsrsReviewLog!)).toMatchObject({
        rating: 'easy',
        reviewedAt: '2026-01-01T00:00:00.000Z',
      })
      await validatePracticeStorage(db)
      expect(await db.select().from(practiceReviewEvidence)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reviewAttemptId: 'latest-created',
            applicationSequence: ties ? 2 : 1,
            revision: 1,
          }),
          expect.objectContaining({
            reviewAttemptId: 'later-reviewed',
            applicationSequence: ties ? 3 : 2,
            revision: 0,
          }),
        ]),
      )
    },
  )

  it('rejects correction of any protected history even after a later unknown Save without changing any rows', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)
    const reviewedAt = new Date('2026-01-01T00:00:00Z')
    const preCard = createInitialFsrsCard(reviewedAt)
    const defaults = createFsrsSchedulerProfile().parameters.weights
    const profile = createFsrsSchedulerProfile({
      weights: defaults.map((weight, index) =>
        index === 0 ? weight + 0.1 : weight,
      ),
      targetRetention: 0.75,
    })
    const captured = scheduleReviewWithProfile(
      preCard,
      'good',
      reviewedAt,
      profile,
    )
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt,
      reviewAttemptId: 'captured-import',
    })
    await handle.db.insert(fsrsSchedulerProfiles).values({
      id: 'custom-captured',
      profileJson: serializeFsrsSchedulerProfile(profile),
      createdAt: reviewedAt.getTime(),
    })
    await handle.db
      .update(practiceReviewEvidence)
      .set({
        schedulingEvidenceKind: 'captured',
        schedulerProfileId: 'custom-captured',
        preCardJson: serializeFsrsCardSnapshot(preCard),
      })
      .where(eq(practiceReviewEvidence.reviewAttemptId, 'captured-import'))
    await handle.db
      .update(reviewAttempts)
      .set({ fsrsReviewLog: serializeFsrsReviewLogSnapshot(captured.log) })
      .where(eq(reviewAttempts.id, 'captured-import'))
    const card = captured.card
    await handle.db
      .update(fsrsCards)
      .set({
        dueAt: card.dueAt.getTime(),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsedDays: card.elapsedDays,
        scheduledDays: card.scheduledDays,
        learningSteps: card.learningSteps,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        lastReviewAt: card.lastReviewAt!.getTime(),
      })
      .where(eq(fsrsCards.id, 'two-sum:default'))
    await preparePracticeStorage(handle.db)
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewedAt: new Date('2026-01-02T00:00:00Z'),
      reviewAttemptId: 'unknown-after-captured',
    })
    const tableRows = () =>
      [
        'fsrs_cards',
        'review_attempts',
        'problem_practice',
        'fsrs_scheduler_profiles',
        'practice_review_evidence',
        'practice_generations',
        'track_problem_progress',
      ].map((table) =>
        handle.rawDb.exec({
          sql: `SELECT * FROM ${table}`,
          returnValue: 'resultRows',
        }),
      )
    const before = tableRows()
    expect(
      (await repository.getPracticeDetails('two-sum')).canOverrideLatestReview,
    ).toBe(false)
    await expect(
      overrideLastReviewResultWithTrackProgress(handle.db, {
        problemSlug: 'two-sum',
        rating: 'easy',
      }),
    ).rejects.toThrow(/protected scheduling evidence/)
    expect(tableRows()).toEqual(before)
  })
  it('reconciles only existing linked track progress after switching mode or active track, without resurrecting reset progress', async () => {
    const { db } = await createTestDb()
    const tracks = createTracksRepository(db)
    await tracks.setActiveTrack('leetcode-75')
    await saveReviewResultWithTrackProgress(
      db,
      {
        problemSlug: 'two-sum',
        rating: 'easy',
        reviewedAt: new Date('2026-01-01T10:00:00Z'),
        reviewAttemptId: 'linked-before-mode',
      },
      defaultUserSettings,
    )
    await tracks.setActiveTrack('grind-75')
    await createSettingsRepository(db).updateSettings({
      practice: { mode: 'freePractice' },
    })
    await overrideLastReviewResultWithTrackProgress(db, {
      problemSlug: 'two-sum',
      rating: 'again',
    })
    expect(
      (await tracks.getProgressByTrack(['leetcode-75'])).get('leetcode-75')
        ?.completedCount,
    ).toBe(0)
    await overrideLastReviewResultWithTrackProgress(db, {
      problemSlug: 'two-sum',
      rating: 'hard',
    })
    expect(
      (await tracks.getProgressByTrack(['leetcode-75'])).get('leetcode-75')
        ?.completedCount,
    ).toBe(1)
    expect(await db.select().from(trackProblemProgress)).toHaveLength(1)
    await tracks.resetTrackProgress('leetcode-75')
    await overrideLastReviewResultWithTrackProgress(db, {
      problemSlug: 'two-sum',
      rating: 'easy',
    })
    expect(await db.select().from(trackProblemProgress)).toEqual([])
  })

  it('continuously credits inactive opted-in tracks from Free Practice and removes derived credit on global reset', async () => {
    const { db } = await createTestDb()
    const tracks = createTracksRepository(db)
    const track = await tracks.createTrack({
      title: 'Inactive external',
      description: null,
      dueAt: null,
      allowExternalProgress: true,
      groups: [{ title: 'Main', problemSlugs: ['two-sum'] }],
    })
    const freeSettings = {
      ...defaultUserSettings,
      practice: {
        ...defaultUserSettings.practice,
        mode: 'freePractice' as const,
      },
    }
    await saveReviewResultWithTrackProgress(
      db,
      {
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt: new Date('2026-01-01T10:00:00Z'),
        reviewAttemptId: 'inactive-external-review',
      },
      freeSettings,
    )
    expect(
      (await tracks.getMemberships(track.id))[0]?.completion,
    ).toMatchObject({ status: 'completed', source: 'external' })
    expect(await db.select().from(trackProblemProgress)).toEqual([])
    await resetPracticeSchedule(db, { problemSlug: 'two-sum' })
    expect((await tracks.getMemberships(track.id))[0]?.completion.status).toBe(
      'incomplete',
    )
    expect((await tracks.getTrackById(track.id))?.allowExternalProgress).toBe(
      true,
    )
  })

  it('keeps existing FSRS cards unchanged when target retention changes', async () => {
    const handle = await createTestDb()
    const practiceRepository = createPracticeRepository(handle.db)
    const settingsRepository = createSettingsRepository(handle.db)
    const firstReviewedAt = new Date('2026-01-01T10:00:00.000Z')
    const secondReviewedAt = new Date('2026-01-02T10:00:00.000Z')
    const firstCard = scheduleReview(
      createInitialFsrsCard(firstReviewedAt),
      'good',
      firstReviewedAt,
      { targetRetention: 0.9 },
    ).card

    await practiceRepository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: firstReviewedAt,
      targetRetention: 0.9,
      reviewAttemptId: 'retention-review-1',
    })

    const persistedBeforeSettingsChange = await handle.db
      .select()
      .from(fsrsCards)
      .where(eq(fsrsCards.problemSlug, 'two-sum'))
    expect(persistedBeforeSettingsChange[0]?.dueAt).toBe(
      firstCard.dueAt.getTime(),
    )

    const updatedSettings = await settingsRepository.updateSettings(
      { review: { targetRetention: 0.85 } },
      new Date('2026-01-01T10:01:00.000Z'),
    )
    const persistedAfterSettingsChange = await handle.db
      .select()
      .from(fsrsCards)
      .where(eq(fsrsCards.problemSlug, 'two-sum'))

    expect(updatedSettings.review.targetRetention).toBe(0.85)
    expect(persistedAfterSettingsChange).toEqual(persistedBeforeSettingsChange)

    const secondReview = await practiceRepository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: secondReviewedAt,
      targetRetention: updatedSettings.review.targetRetention,
      reviewAttemptId: 'retention-review-2',
    })
    const expectedSecondCard = scheduleReview(
      firstCard,
      'good',
      secondReviewedAt,
      { targetRetention: 0.85 },
    ).card

    expect(secondReview.card).toEqual(expectedSecondCard)
    expect(secondReview.dueAt).toEqual(expectedSecondCard.dueAt)
  })

  it('saves a review with a practice log snapshot and latest aggregate log', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)
    const reviewedAt = new Date('2026-01-01T10:00:00.000Z')

    const result = await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt,
      elapsedSeconds: 725,
      isCorrect: true,
      log: {
        interviewPattern: 'Hash map',
        timeComplexity: 'O(n)',
        spaceComplexity: 'O(n)',
        languages: 'TypeScript',
        notes: 'Track complements while scanning.',
      },
      reviewAttemptId: 'review-1',
    })

    const [practice] = await handle.db
      .select()
      .from(problemPractice)
      .where(eq(problemPractice.problemSlug, 'two-sum'))
    const [attempt] = await handle.db
      .select()
      .from(reviewAttempts)
      .where(eq(reviewAttempts.id, 'review-1'))

    expect(result.summary).toMatchObject({
      isStarted: true,
      reviewCount: 1,
      suspended: false,
    })
    expect(result.reviewAttemptId).toBe('review-1')
    expect(practice).toMatchObject({
      lastRating: 'good',
      lastElapsedSeconds: 725,
      bestElapsedSeconds: 725,
      interviewPattern: 'Hash map',
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(n)',
      languages: 'TypeScript',
      notes: 'Track complements while scanning.',
      isSuspended: false,
    })
    expect(attempt).toMatchObject({
      rating: 'good',
      elapsedSeconds: 725,
      interviewPattern: 'Hash map',
      notes: 'Track complements while scanning.',
    })
    expect(JSON.parse(attempt?.fsrsReviewLog ?? '{}')).toMatchObject({
      rating: 'good',
      state: 'new',
      reviewedAt: reviewedAt.toISOString(),
    })
  })

  it('returns the generated review attempt id when one is not provided', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)

    const result = await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
    })
    const [attempt] = await handle.db
      .select()
      .from(reviewAttempts)
      .where(eq(reviewAttempts.problemSlug, 'two-sum'))

    expect(result.reviewAttemptId).toEqual(expect.any(String))
    expect(result.reviewAttemptId).toBe(attempt?.id)
  })

  it('reads a complete practice details model with the latest five attempts', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)

    for (const index of [1, 2, 3, 4, 5, 6]) {
      await repository.saveReviewResult({
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt: new Date(`2026-01-0${index}T10:00:00.000Z`),
        elapsedSeconds: 600 + index,
        isCorrect: true,
        log: { notes: `Attempt ${index}` },
        reviewAttemptId: `review-${index}`,
      })
    }

    const details = await repository.getPracticeDetails('two-sum', {
      now: new Date('2026-01-06T10:01:00.000Z'),
    })

    expect(details).toMatchObject({
      problemSlug: 'two-sum',
      cardId: 'two-sum:default',
      canOverrideLatestReview: true,
      currentLog: { notes: 'Attempt 6' },
      isStarted: true,
      reviewCount: 6,
    })
    expect(details.card?.reps).toBe(6)
    expect(details.latestAttempt?.id).toBe('review-6')
    expect(details.recentAttempts.map((attempt) => attempt.id)).toEqual([
      'review-6',
      'review-5',
      'review-4',
      'review-3',
      'review-2',
    ])
  })

  it('reads a log-only practice row as unstarted details', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)
    const timestamp = new Date('2026-01-01T10:00:00.000Z').getTime()

    await handle.db.insert(problemPractice).values({
      problemSlug: 'two-sum',
      status: 'new',
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      lastReviewedAt: null,
      solvedCount: 0,
      attemptCount: 0,
      isSuspended: false,
      notes: 'Read the two-pointer variant.',
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    const details = await repository.getPracticeDetails('two-sum')

    expect(details).toMatchObject({
      card: null,
      latestAttempt: null,
      canOverrideLatestReview: false,
      currentLog: {
        notes: 'Read the two-pointer variant.',
      },
      phase: 'new',
      isStarted: false,
      reviewCount: 0,
    })
    expect(details.recentAttempts).toEqual([])
  })

  it('carries the current aggregate log snapshot when a quick save has no log draft', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)

    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
      log: { notes: 'Keep this note.' },
      reviewAttemptId: 'review-1',
    })
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewedAt: new Date('2026-01-02T10:00:00.000Z'),
      reviewAttemptId: 'review-2',
    })

    const [practice] = await handle.db
      .select()
      .from(problemPractice)
      .where(eq(problemPractice.problemSlug, 'two-sum'))
    const [quickAttempt] = await handle.db
      .select()
      .from(reviewAttempts)
      .where(eq(reviewAttempts.id, 'review-2'))

    expect(practice?.notes).toBe('Keep this note.')
    expect(quickAttempt?.notes).toBe('Keep this note.')
  })

  it('merges partial log updates into the latest aggregate snapshot', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)

    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
      log: {
        interviewPattern: 'Hash map',
        timeComplexity: 'O(n)',
        spaceComplexity: 'O(n)',
        languages: 'TypeScript',
        notes: 'Initial note.',
      },
      reviewAttemptId: 'review-1',
    })
    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'hard',
      reviewedAt: new Date('2026-01-02T10:00:00.000Z'),
      log: { notes: 'Updated note.' },
      reviewAttemptId: 'review-2',
    })

    const [practice] = await handle.db
      .select()
      .from(problemPractice)
      .where(eq(problemPractice.problemSlug, 'two-sum'))
    const [attempt] = await handle.db
      .select()
      .from(reviewAttempts)
      .where(eq(reviewAttempts.id, 'review-2'))

    expect(practice).toMatchObject({
      interviewPattern: 'Hash map',
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(n)',
      languages: 'TypeScript',
      notes: 'Updated note.',
    })
    expect(attempt).toMatchObject({
      interviewPattern: 'Hash map',
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(n)',
      languages: 'TypeScript',
      notes: 'Updated note.',
    })
  })

  it('overrides the latest review without appending a duplicate attempt', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)

    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
      elapsedSeconds: 800,
      isCorrect: true,
      reviewAttemptId: 'review-1',
    })
    const beforeOverride = await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'easy',
      reviewedAt: new Date('2026-01-03T10:00:00.000Z'),
      elapsedSeconds: 600,
      isCorrect: true,
      log: {
        interviewPattern: 'Hash map',
        timeComplexity: 'O(n)',
        spaceComplexity: 'O(n)',
        languages: 'TypeScript',
        notes: 'Original note.',
      },
      reviewAttemptId: 'review-2',
    })

    const progressInput = {
      dailyGoal: 1,
      now: new Date('2026-01-03T10:01:00.000Z'),
    }
    await expect(
      repository.getPracticeProgressSummary(progressInput),
    ).resolves.toMatchObject({
      recordedSecondsToday: 600,
      completedToday: 1,
    })

    const override = await repository.overrideLastReviewResult({
      problemSlug: 'two-sum',
      rating: 'again',
      elapsedSeconds: 900,
      isCorrect: false,
      log: { notes: 'Missed edge case.' },
    })
    await expect(
      repository.getPracticeProgressSummary(progressInput),
    ).resolves.toMatchObject({
      recordedSecondsToday: 900,
      completedToday: 1,
    })
    const attempts = await handle.db
      .select()
      .from(reviewAttempts)
      .where(eq(reviewAttempts.problemSlug, 'two-sum'))
    const [practice] = await handle.db
      .select()
      .from(problemPractice)
      .where(eq(problemPractice.problemSlug, 'two-sum'))
    const [card] = await handle.db
      .select()
      .from(fsrsCards)
      .where(eq(fsrsCards.problemSlug, 'two-sum'))

    expect(attempts).toHaveLength(2)
    expect(attempts.find((attempt) => attempt.id === 'review-2')).toMatchObject(
      {
        rating: 'again',
        elapsedSeconds: 900,
        isCorrect: false,
        interviewPattern: 'Hash map',
        timeComplexity: 'O(n)',
        spaceComplexity: 'O(n)',
        languages: 'TypeScript',
        notes: 'Missed edge case.',
      },
    )
    expect(
      JSON.parse(
        attempts.find((attempt) => attempt.id === 'review-2')?.fsrsReviewLog ??
          '{}',
      ),
    ).toMatchObject({
      rating: 'again',
      state: 'learning',
    })
    expect(practice).toMatchObject({
      attemptCount: 2,
      solvedCount: 1,
      lastRating: 'again',
      lastElapsedSeconds: 900,
      bestElapsedSeconds: 800,
      interviewPattern: 'Hash map',
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(n)',
      languages: 'TypeScript',
      notes: 'Missed edge case.',
      isSuspended: false,
    })
    expect(card?.reps).toBe(2)
    expect(card?.dueAt).not.toBe(beforeOverride.dueAt.getTime())
    expect(override.reviewAttemptId).toBe('review-2')
    expect(override.summary.reviewCount).toBe(2)
  })

  it('overrides the latest saved review when review times match', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)
    const reviewedAt = new Date('2026-01-01T10:00:00.000Z')

    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T10:01:00.000Z'))
      await repository.saveReviewResult({
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt,
        reviewAttemptId: 'review-1',
      })

      vi.setSystemTime(new Date('2026-01-01T10:02:00.000Z'))
      await repository.saveReviewResult({
        problemSlug: 'two-sum',
        rating: 'easy',
        reviewedAt,
        reviewAttemptId: 'review-2',
      })

      vi.setSystemTime(new Date('2026-01-01T10:03:00.000Z'))
      await repository.overrideLastReviewResult({
        problemSlug: 'two-sum',
        rating: 'again',
      })
    } finally {
      vi.useRealTimers()
    }

    const attempts = await handle.db
      .select()
      .from(reviewAttempts)
      .where(eq(reviewAttempts.problemSlug, 'two-sum'))
    const details = await repository.getPracticeDetails('two-sum')

    expect(attempts.find((attempt) => attempt.id === 'review-1')).toMatchObject(
      {
        rating: 'good',
      },
    )
    expect(attempts.find((attempt) => attempt.id === 'review-2')).toMatchObject(
      {
        rating: 'again',
        reviewedAt: reviewedAt.getTime(),
      },
    )
    expect(details.latestAttempt?.id).toBe('review-2')
    expect(details.reviewCount).toBe(2)
  })

  it('suspends and resumes practice without deleting review history', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)

    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'easy',
      reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
      elapsedSeconds: 120,
      log: { notes: 'Keep the hash-map invariant.' },
      reviewAttemptId: 'review-1',
    })

    const suspended = await repository.setPracticeSuspended({
      problemSlug: 'two-sum',
      suspended: true,
    })
    const queueWhileSuspended = await getTodayQueue(
      handle.db,
      new Date('2026-01-01T10:01:00.000Z'),
    )
    await expect(
      repository.getPracticeProgressSummary({
        dailyGoal: 1,
        now: new Date('2026-01-01T10:01:00.000Z'),
      }),
    ).resolves.toMatchObject({
      recordedSecondsToday: 120,
      completedToday: 1,
      goalMetToday: true,
    })
    const resumed = await repository.setPracticeSuspended({
      problemSlug: 'two-sum',
      suspended: false,
    })

    expect(suspended).toMatchObject({
      canOverrideLatestReview: true,
      currentLog: { notes: 'Keep the hash-map invariant.' },
      practice: {
        attemptCount: 1,
        isSuspended: true,
        status: 'review',
      },
      phase: 'suspended',
      isSuspended: true,
      isDue: false,
    })
    expect(suspended.card?.reps).toBe(1)
    expect(suspended.latestAttempt?.id).toBe('review-1')
    expect(
      queueWhileSuspended.items.some((item) => item.problemSlug === 'two-sum'),
    ).toBe(false)
    expect(resumed).toMatchObject({
      practice: {
        attemptCount: 1,
        isSuspended: false,
        status: 'review',
      },
      phase: 'review',
      isSuspended: false,
    })
    expect(resumed.card?.reps).toBe(1)
  })

  it('keeps suspension explicit when a suspended problem is reviewed', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)

    await repository.setPracticeSuspended({
      problemSlug: 'two-sum',
      suspended: true,
    })

    const result = await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
      reviewAttemptId: 'review-1',
    })
    const details = await repository.getPracticeDetails('two-sum')

    expect(result.summary).toMatchObject({
      phase: 'suspended',
      suspended: true,
    })
    expect(details).toMatchObject({
      canOverrideLatestReview: true,
      practice: {
        attemptCount: 1,
        isSuspended: true,
        status: 'learning',
      },
      phase: 'suspended',
      isSuspended: true,
    })
  })

  it('snapshots the current log when a review is saved without a log draft', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)

    await handle.db.insert(problemPractice).values({
      problemSlug: 'two-sum',
      status: 'new',
      interviewPattern: 'Hash map',
      notes: 'Saved before solving.',
      firstSeenAt: 0,
      createdAt: 0,
      updatedAt: 0,
    })

    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
      reviewAttemptId: 'review-1',
    })

    const [attempt] = await handle.db
      .select()
      .from(reviewAttempts)
      .where(eq(reviewAttempts.id, 'review-1'))

    expect(attempt).toMatchObject({
      interviewPattern: 'Hash map',
      notes: 'Saved before solving.',
    })

    await repository.overrideLastReviewResult({
      problemSlug: 'two-sum',
      rating: 'hard',
    })
    const updated = await repository.getPracticeDetails('two-sum')

    expect(updated.currentLog).toMatchObject({
      interviewPattern: 'Hash map',
      notes: 'Saved before solving.',
    })
    expect(updated.latestAttempt?.log).toMatchObject({
      interviewPattern: 'Hash map',
      notes: 'Saved before solving.',
    })
    expect(updated.latestAttempt?.rating).toBe('hard')
    expect(updated.reviewCount).toBe(1)
  })

  it('reset clears schedule history while preserving log and suspension by default', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)

    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
      elapsedSeconds: 180,
      log: {
        interviewPattern: 'Hash map',
        notes: 'Carry this through reset.',
      },
      reviewAttemptId: 'review-1',
    })
    await repository.setPracticeSuspended({
      problemSlug: 'two-sum',
      suspended: true,
    })

    await repository.saveReviewResult({
      problemSlug: 'valid-parentheses',
      rating: 'hard',
      reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
      elapsedSeconds: 240,
      reviewAttemptId: 'reset-control',
    })
    const progressInput = {
      dailyGoal: 2,
      now: new Date('2026-01-01T10:01:00.000Z'),
    }
    await expect(
      repository.getPracticeProgressSummary(progressInput),
    ).resolves.toMatchObject({
      recordedSecondsToday: 420,
      completedToday: 2,
    })

    const reset = await repository.resetPracticeSchedule({
      problemSlug: 'two-sum',
    })
    await expect(
      repository.getPracticeProgressSummary(progressInput),
    ).resolves.toMatchObject({
      recordedSecondsToday: 240,
      completedToday: 1,
      goalMetToday: false,
    })
    const attempts = await handle.db
      .select()
      .from(reviewAttempts)
      .where(eq(reviewAttempts.problemSlug, 'two-sum'))
    const cards = await handle.db
      .select()
      .from(fsrsCards)
      .where(eq(fsrsCards.problemSlug, 'two-sum'))

    expect(attempts).toEqual([])
    expect(cards).toEqual([])
    expect(reset).toMatchObject({
      card: null,
      latestAttempt: null,
      canOverrideLatestReview: false,
      currentLog: {
        interviewPattern: 'Hash map',
        notes: 'Carry this through reset.',
      },
      practice: {
        status: 'new',
        attemptCount: 0,
        solvedCount: 0,
        lastRating: null,
        lastElapsedSeconds: null,
        bestElapsedSeconds: null,
        isSuspended: true,
      },
      phase: 'suspended',
      isStarted: false,
      reviewCount: 0,
      isSuspended: true,
    })
  })

  it('reset can clear the current practice log', async () => {
    const handle = await createTestDb()
    const repository = createPracticeRepository(handle.db)

    await repository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
      log: { notes: 'Clear me.' },
      reviewAttemptId: 'review-1',
    })

    const reset = await repository.resetPracticeSchedule({
      problemSlug: 'two-sum',
      keepLog: false,
    })

    expect(reset.currentLog).toEqual({
      interviewPattern: null,
      timeComplexity: null,
      spaceComplexity: null,
      languages: null,
      notes: null,
    })
  })

  it('study plan review completes only the active track for good and easy ratings', async () => {
    const handle = await createTestDb()
    const tracksRepository = createTracksRepository(handle.db)

    await tracksRepository.setActiveTrack('leetcode-75')
    await handle.db.insert(trackGroupProblems).values({
      trackGroupId: 'grind-75:stack',
      trackId: 'grind-75',
      problemSlug: 'two-sum',
      position: 2,
    })

    await saveReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
        reviewAttemptId: 'workflow-good-1',
      },
      defaultUserSettings,
    )

    const catalogAfterGood = await tracksRepository.getTrackCatalog()
    expect(
      readTrackProgress(catalogAfterGood, 'leetcode-75').completedCount,
    ).toBe(1)
    expect(readTrackProgress(catalogAfterGood, 'grind-75').completedCount).toBe(
      0,
    )

    await tracksRepository.resetTrackProgress('leetcode-75')
    await saveReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'two-sum',
        rating: 'easy',
        reviewedAt: new Date('2026-01-02T10:00:00.000Z'),
        reviewAttemptId: 'workflow-easy-1',
      },
      defaultUserSettings,
    )

    const catalogAfterEasy = await tracksRepository.getTrackCatalog()
    expect(
      readTrackProgress(catalogAfterEasy, 'leetcode-75').completedCount,
    ).toBe(1)
    expect(readTrackProgress(catalogAfterEasy, 'grind-75').completedCount).toBe(
      0,
    )
  })

  it('reset schedule clears track-owned progress for the problem', async () => {
    const handle = await createTestDb()
    const tracksRepository = createTracksRepository(handle.db)

    await tracksRepository.setActiveTrack('leetcode-75')
    await saveReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
        reviewAttemptId: 'workflow-good-reset-1',
      },
      defaultUserSettings,
    )

    const catalogAfterReview = await tracksRepository.getTrackCatalog()
    expect(
      readTrackProgress(catalogAfterReview, 'leetcode-75').completedCount,
    ).toBe(1)

    await resetPracticeSchedule(handle.db, {
      problemSlug: 'two-sum',
    })

    const catalogAfterReset = await tracksRepository.getTrackCatalog()
    const progressRows = await handle.db.select().from(trackProblemProgress)

    expect(
      readTrackProgress(catalogAfterReset, 'leetcode-75').completedCount,
    ).toBe(0)
    expect(progressRows).toEqual([])
  })

  it('completes hard recall while again stays incomplete and preserves completion', async () => {
    const handle = await createTestDb()
    const tracksRepository = createTracksRepository(handle.db)

    await tracksRepository.setActiveTrack('leetcode-75')
    await handle.db.insert(trackGroupProblems).values({
      trackGroupId: 'leetcode-75:arrays-hashing',
      trackId: 'leetcode-75',
      problemSlug: 'valid-parentheses',
      position: 2,
    })
    await saveReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'two-sum',
        rating: 'hard',
        reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
        reviewAttemptId: 'workflow-hard-1',
      },
      defaultUserSettings,
    )

    const catalogAfterHard = await tracksRepository.getTrackCatalog()
    expect(
      readTrackProgress(catalogAfterHard, 'leetcode-75').completedCount,
    ).toBe(1)

    await saveReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'valid-parentheses',
        rating: 'again',
        reviewedAt: new Date('2026-01-02T10:00:00.000Z'),
        reviewAttemptId: 'workflow-again-1',
      },
      defaultUserSettings,
    )

    await saveReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'two-sum',
        rating: 'again',
        reviewedAt: new Date('2026-01-03T10:00:00.000Z'),
        reviewAttemptId: 'workflow-again-after-hard-1',
      },
      defaultUserSettings,
    )

    const catalogAfterAgain = await tracksRepository.getTrackCatalog()
    expect(
      readTrackProgress(catalogAfterAgain, 'leetcode-75').completedCount,
    ).toBe(1)

    const progressRows = await handle.db.select().from(trackProblemProgress)
    expect(progressRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trackId: 'leetcode-75',
          problemSlug: 'two-sum',
          reviewAttemptId: 'workflow-hard-1',
          completedAt: new Date('2026-01-01T10:00:00.000Z').getTime(),
          completedRating: 'hard',
        }),
        expect.objectContaining({
          trackId: 'leetcode-75',
          problemSlug: 'valid-parentheses',
          reviewAttemptId: 'workflow-again-1',
          completedAt: null,
          completedRating: null,
        }),
      ]),
    )
  })

  it('study plan override from good to hard keeps active-track completion', async () => {
    const handle = await createTestDb()
    const tracksRepository = createTracksRepository(handle.db)

    await tracksRepository.setActiveTrack('leetcode-75')
    await saveReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
        reviewAttemptId: 'workflow-good-to-hard-1',
      },
      defaultUserSettings,
    )

    await overrideLastReviewResultWithTrackProgress(handle.db, {
      problemSlug: 'two-sum',
      rating: 'hard',
    })

    const catalog = await tracksRepository.getTrackCatalog()
    const [progress] = await handle.db.select().from(trackProblemProgress)

    expect(readTrackProgress(catalog, 'leetcode-75').completedCount).toBe(1)
    expect(progress).toMatchObject({
      reviewAttemptId: 'workflow-good-to-hard-1',
      completedRating: 'hard',
    })
  })

  it('study plan override from easy to again clears active-track completion for the sourced attempt', async () => {
    const handle = await createTestDb()
    const tracksRepository = createTracksRepository(handle.db)
    const reviewedAt = new Date('2026-01-01T10:00:00.000Z')

    await tracksRepository.setActiveTrack('leetcode-75')
    await saveReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'two-sum',
        rating: 'easy',
        reviewedAt,
        reviewAttemptId: 'workflow-easy-to-again-1',
      },
      defaultUserSettings,
    )

    await overrideLastReviewResultWithTrackProgress(handle.db, {
      problemSlug: 'two-sum',
      rating: 'again',
    })

    const catalog = await tracksRepository.getTrackCatalog()
    const [progress] = await handle.db.select().from(trackProblemProgress)

    expect(readTrackProgress(catalog, 'leetcode-75').completedCount).toBe(0)
    expect(progress).toMatchObject({
      trackId: 'leetcode-75',
      problemSlug: 'two-sum',
      reviewAttemptId: 'workflow-easy-to-again-1',
      completedAt: null,
      completedRating: null,
    })
  })

  it('study plan override from again to easy restores active-track completion for the sourced attempt', async () => {
    const handle = await createTestDb()
    const tracksRepository = createTracksRepository(handle.db)
    const reviewedAt = new Date('2026-01-01T10:00:00.000Z')

    await tracksRepository.setActiveTrack('leetcode-75')
    await saveReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'two-sum',
        rating: 'again',
        reviewedAt,
        reviewAttemptId: 'workflow-again-to-easy-1',
      },
      defaultUserSettings,
    )

    await overrideLastReviewResultWithTrackProgress(handle.db, {
      problemSlug: 'two-sum',
      rating: 'easy',
    })

    const catalog = await tracksRepository.getTrackCatalog()
    const [progress] = await handle.db.select().from(trackProblemProgress)

    expect(readTrackProgress(catalog, 'leetcode-75').completedCount).toBe(1)
    expect(progress).toMatchObject({
      trackId: 'leetcode-75',
      problemSlug: 'two-sum',
      reviewAttemptId: 'workflow-again-to-easy-1',
      completedAt: reviewedAt.getTime(),
      completedRating: 'easy',
    })
  })

  it('free practice saves do not write track progress', async () => {
    const handle = await createTestDb()
    const tracksRepository = createTracksRepository(handle.db)

    await tracksRepository.setActiveTrack('leetcode-75')
    await saveReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'two-sum',
        rating: 'good',
        reviewedAt: new Date('2026-01-01T10:00:00.000Z'),
        reviewAttemptId: 'workflow-free-practice-1',
      },
      {
        ...defaultUserSettings,
        practice: {
          ...defaultUserSettings.practice,
          mode: 'freePractice',
        },
      },
    )

    const catalog = await tracksRepository.getTrackCatalog()
    expect(readTrackProgress(catalog, 'leetcode-75').completedCount).toBe(0)

    await expect(
      handle.db.select().from(trackProblemProgress),
    ).resolves.toEqual([])
  })
})

function readTrackProgress(
  catalog: Awaited<
    ReturnType<ReturnType<typeof createTracksRepository>['getTrackCatalog']>
  >,
  trackId: string,
) {
  const item = catalog.find(({ track }) => track.id === trackId)

  if (!item) {
    throw new Error(`Track "${trackId}" was not found.`)
  }

  return item.progress
}
