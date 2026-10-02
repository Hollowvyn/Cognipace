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
import { createInitialFsrsCard, scheduleReview } from '@/lib/fsrs'
import { createTestDb } from '@/platform/db/test-db'
import {
  fsrsCards,
  problemPractice,
  reviewAttempts,
  trackGroupProblems,
  trackProblemProgress,
} from '@/platform/db/schema'

describe('practice core', () => {
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

    const override = await repository.overrideLastReviewResult({
      problemSlug: 'two-sum',
      rating: 'again',
      elapsedSeconds: 900,
      isCorrect: false,
      log: { notes: 'Missed edge case.' },
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

    const reset = await repository.resetPracticeSchedule({
      problemSlug: 'two-sum',
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

    await overrideLastReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'two-sum',
        rating: 'hard',
      },
      defaultUserSettings,
    )

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

    await overrideLastReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'two-sum',
        rating: 'again',
      },
      defaultUserSettings,
    )

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

    await overrideLastReviewResultWithTrackProgress(
      handle.db,
      {
        problemSlug: 'two-sum',
        rating: 'easy',
      },
      defaultUserSettings,
    )

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
