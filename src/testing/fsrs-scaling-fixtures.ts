import { exportFullBackup } from '@/features/backup/server/backup-service'
import { prepareFullBackupRestore } from '@/features/backup/domain/backup-preflight'
import { statusFromReview } from '@/features/practice/domain/practice'
import { createPracticeGenerationKey } from '@/features/practice/domain/practice-storage'
import { validatePracticeStorage } from '@/features/practice/server/practice-storage-service'
import {
  createFsrsSchedulerProfile,
  createInitialFsrsCard,
  scheduleReviewWithProfile,
  serializeFsrsCardSnapshot,
  serializeFsrsReviewLogSnapshot,
  serializeFsrsSchedulerProfile,
  toSerializableFsrsCardSnapshot,
  type FsrsCardSnapshot,
  type ReviewRating,
} from '@/lib/fsrs'
import type { BackupFile } from '@/features/backup/api/backup-contracts'
import type { DbHandle } from '@/platform/db/client'
import { serializeDb } from '@/platform/db/snapshot'
import {
  fsrsCards,
  fsrsSchedulerProfiles,
  practiceGenerations,
  practiceCommandReceipts,
  practiceReviewEvidence,
  problemPractice,
  problemTopics,
  problems,
  reviewAttempts,
  topics,
  trackGroupProblems,
  trackGroups,
  trackProblemProgress,
  trackSession,
  tracks,
} from '@/platform/db/schema'
import { createTestDb } from '@/platform/db/test-db'

export const fsrsScalingSeed = 20261010
export type FsrsScalingKind = 'standard' | 'stress' | 'single-card'

export interface FsrsScalingFixture {
  kind: FsrsScalingKind
  seed: number
  counts: { problems: number; reviews: number }
  handle: DbHandle
  backup: BackupFile
  snapshot: Uint8Array
}

const workloadCounts: Record<FsrsScalingKind, FsrsScalingFixture['counts']> = {
  standard: { problems: 250, reviews: 5_000 },
  stress: { problems: 2_500, reviews: 50_000 },
  'single-card': { problems: 1, reviews: 10_000 },
}
const fixtureAsOf = Date.UTC(2026, 9, 10, 12)
const hourMs = 3_600_000
const dayMs = 24 * hourMs
const batchSize = 80
const ratings: readonly ReviewRating[] = ['good', 'hard', 'easy', 'again']

/** Fixture preparation is intentionally outside every benchmark operation timer. */
export async function createFsrsScalingFixture(
  kind: FsrsScalingKind,
  seed = fsrsScalingSeed,
): Promise<FsrsScalingFixture> {
  if (!Number.isSafeInteger(seed))
    throw new Error('Fixture seed must be an integer.')
  const counts = workloadCounts[kind]
  const handle = await createTestDb({ seed: false })
  try {
    await populateFixture(handle, kind, seed, counts)
    const foreignKeyErrors = handle.rawDb.exec({
      sql: 'PRAGMA foreign_key_check',
      returnValue: 'resultRows',
    })
    if (foreignKeyErrors.length > 0)
      throw new Error('Fixture has foreign-key errors.')
    await validatePracticeStorage(handle.db)
    const backup = await exportFullBackup(handle.db, {
      exportedAt: new Date(fixtureAsOf),
      appVersion: '2.2.0',
    })
    await prepareFullBackupRestore(backup)
    if (
      backup.data.problems.length !== counts.problems ||
      backup.data.practice.reviewAttempts.length !== counts.reviews
    ) {
      throw new Error('Fixture counts changed during export.')
    }
    return {
      kind,
      seed,
      counts: { ...counts },
      handle,
      backup,
      snapshot: serializeDb(handle),
    }
  } catch (error) {
    handle.rawDb.close()
    throw error
  }
}

async function populateFixture(
  handle: DbHandle,
  kind: FsrsScalingKind,
  seed: number,
  counts: FsrsScalingFixture['counts'],
) {
  const { db } = handle
  const stamp =
    (kind === 'single-card'
      ? Date.UTC(2026, 3, 1, 12)
      : Date.UTC(2026, 6, 25, 12)) +
    (seed % 1000) * hourMs
  const profiles = [
    createFsrsSchedulerProfile({ targetRetention: 0.9, maximumInterval: 180 }),
    createFsrsSchedulerProfile({ targetRetention: 0.75, maximumInterval: 180 }),
  ]
  const profileIds = [
    `fixture-profile-90-${seed}`,
    `fixture-profile-75-${seed}`,
  ]
  await db.insert(fsrsSchedulerProfiles).values(
    profiles.map((profile, index) => ({
      id: profileIds[index]!,
      profileJson: serializeFsrsSchedulerProfile(profile),
      createdAt: stamp,
    })),
  )
  await db.insert(topics).values([
    {
      id: `fixture-topic-a-${seed}`,
      label: `Fixture Arrays ${seed}`,
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: `fixture-topic-b-${seed}`,
      label: `Fixture Graphs ${seed}`,
      createdAt: stamp,
      updatedAt: stamp,
    },
  ])

  const problemRows: (typeof problems.$inferInsert)[] = []
  const practiceRows: (typeof problemPractice.$inferInsert)[] = []
  const cardRows: (typeof fsrsCards.$inferInsert)[] = []
  const attemptRows: (typeof reviewAttempts.$inferInsert)[] = []
  const evidenceRows: (typeof practiceReviewEvidence.$inferInsert)[] = []
  const receiptRows: (typeof practiceCommandReceipts.$inferInsert)[] = []
  const generationRows: (typeof practiceGenerations.$inferInsert)[] = [
    {
      scopeId: 'local',
      problemSlug: null,
      generationToken: `fixture-local-${seed}`,
      createdAt: stamp,
    },
  ]
  const topicRows: (typeof problemTopics.$inferInsert)[] = []
  const progressRows: (typeof trackProblemProgress.$inferInsert)[] = []
  const trackMemberRows: (typeof trackGroupProblems.$inferInsert)[] = []
  const trackId = `fixture-track-${seed}`
  const groupId = `fixture-group-${seed}`
  await db.insert(tracks).values({
    id: trackId,
    slug: `fixture-track-${seed}`,
    title: 'Scaling track',
    description: 'Synthetic track association',
    dueAt: stamp + 30 * dayMs,
    allowExternalProgress: true,
    createdAt: stamp,
    updatedAt: stamp,
  })
  await db.insert(trackGroups).values({
    id: groupId,
    trackId,
    title: 'Practice group',
    position: 1,
    createdAt: stamp,
    updatedAt: stamp,
  })

  const perCard = counts.reviews / counts.problems
  for (let cardIndex = 0; cardIndex < counts.problems; cardIndex += 1) {
    const slug = `fixture-${kind}-${seed}-${cardIndex.toString().padStart(5, '0')}`
    const cardId = `${slug}:default`
    const isSuspended = cardIndex > 0 && cardIndex % 29 === 0
    const firstAt =
      kind === 'single-card'
        ? stamp
        : stamp +
          (cardIndex % 30) * dayMs -
          (cardIndex % 4 === 0 ? 120 * dayMs : 0)
    problemRows.push({
      slug,
      title: `Synthetic problem ${cardIndex}`,
      difficulty: (['easy', 'medium', 'hard', 'unknown'] as const)[
        cardIndex % 4
      ]!,
      isPremium: cardIndex > 0 && cardIndex % 19 === 0,
      createdAt: firstAt,
      updatedAt: firstAt,
    })
    topicRows.push({
      problemSlug: slug,
      topicId: `fixture-topic-${cardIndex % 2 === 0 ? 'a' : 'b'}-${seed}`,
    })
    generationRows.push({
      scopeId: `problem:${slug}`,
      problemSlug: slug,
      generationToken: `fixture-generation-${seed}-${cardIndex}`,
      createdAt: firstAt,
    })

    let currentCard: FsrsCardSnapshot = createInitialFsrsCard(new Date(firstAt))
    let reviewedAt = firstAt
    let solvedCount = 0
    let bestElapsedSeconds = Number.POSITIVE_INFINITY
    let lastRating: ReviewRating = 'good'
    let lastElapsedSeconds = 0
    let creditedAttempt: {
      id: string
      reviewedAt: number
      rating: 'hard' | 'good' | 'easy'
    } | null = null
    for (let eventIndex = 0; eventIndex < perCard; eventIndex += 1) {
      if (eventIndex > 0) {
        reviewedAt +=
          eventIndex % 11 === 0
            ? 0
            : kind === 'single-card'
              ? eventIndex % 233 === 0
                ? dayMs
                : 20 * 60_000
              : eventIndex % 5 === 0
                ? 7 * dayMs
                : eventIndex % 3 === 0
                  ? 2 * dayMs
                  : dayMs
      }
      const profileIndex = (cardIndex + Math.floor(eventIndex / 7)) % 2
      const profile = profiles[profileIndex]!
      const rating =
        ratings[
          (cardIndex +
            eventIndex +
            (eventIndex === perCard - 1 && cardIndex % 7 === 0 ? 1 : 0)) %
            ratings.length
        ]!
      const scheduled = scheduleReviewWithProfile(
        currentCard,
        rating,
        new Date(reviewedAt),
        profile,
      )
      const attemptId = `${cardId}:attempt-${eventIndex.toString().padStart(5, '0')}`
      if (creditedAttempt === null && rating !== 'again') {
        creditedAttempt = { id: attemptId, reviewedAt, rating }
      }
      const elapsedSeconds = 300 + ((cardIndex * 17 + eventIndex * 37) % 2_100)
      const isCorrect = rating !== 'again' && eventIndex % 5 !== 0
      if (isCorrect) solvedCount += 1
      bestElapsedSeconds = Math.min(bestElapsedSeconds, elapsedSeconds)
      const evidenceKind =
        cardIndex === 0 && eventIndex === perCard - 1
          ? 'captured'
          : eventIndex % 17 === 0
            ? 'unknown'
            : eventIndex % 19 === 0
              ? 'legacy-derived'
              : 'captured'
      const isCorrection = eventIndex === perCard - 1 && cardIndex % 7 === 0
      const longNote = `Synthetic note ${cardIndex}/${eventIndex}. ${'Repeatable evidence and interview notes. '.repeat(eventIndex % 4 === 0 ? 5 : 1)}`
      attemptRows.push({
        id: attemptId,
        problemSlug: slug,
        cardId,
        rating,
        reviewMode: eventIndex % 3 === 0 ? 'leetcode' : 'manual',
        reviewedAt,
        elapsedSeconds,
        isCorrect,
        interviewPattern:
          eventIndex % 2 === 0 ? 'sliding window' : 'graph traversal',
        timeComplexity: 'O(n)',
        spaceComplexity: 'O(n)',
        languages: 'TypeScript',
        notes: longNote,
        fsrsReviewLog: serializeFsrsReviewLogSnapshot(scheduled.log),
        createdAt: reviewedAt,
        updatedAt: reviewedAt + (isCorrection ? hourMs : 0),
      })
      evidenceRows.push({
        reviewAttemptId: attemptId,
        cardId,
        applicationSequence: eventIndex + 1,
        revision: isCorrection ? 1 : 0,
        sequenceSource:
          evidenceKind === 'legacy-derived' ? 'legacy-inferred' : 'applied',
        schedulingEvidenceKind: evidenceKind,
        schedulerProfileId:
          evidenceKind === 'unknown' ? null : profileIds[profileIndex]!,
        preCardJson:
          evidenceKind === 'unknown'
            ? null
            : serializeFsrsCardSnapshot(currentCard),
        assessmentEvidenceJson:
          eventIndex % 3 === 0
            ? JSON.stringify({
                schemaVersion: 1,
                source: 'manual',
                policyVersion: null,
                submissionIntent: null,
                reasonCode: null,
                lockReason: null,
                finalRating: rating,
              })
            : null,
      })
      if (cardIndex === 0 && eventIndex === 1) {
        const reviewedAtIso = new Date(reviewedAt).toISOString()
        receiptRows.push({
          generationKey: createPracticeGenerationKey({
            localGenerationToken: `fixture-local-${seed}`,
            problemGenerationToken: `fixture-generation-${seed}-${cardIndex}`,
          }),
          commandId: `fixture-command-${seed}`,
          payloadFingerprint: 'a'.repeat(64),
          operation: 'save',
          problemSlug: slug,
          cardId,
          reviewAttemptId: attemptId,
          applicationSequence: eventIndex + 1,
          revision: 0,
          acceptedAt: reviewedAt,
          commandSummaryJson: JSON.stringify({
            schemaVersion: 1,
            rating,
            reviewedAt: reviewedAtIso,
            targetAttemptId: null,
            expectedRevision: null,
          }),
          resultJson: JSON.stringify({
            schemaVersion: 1,
            operation: 'save',
            problemSlug: slug,
            cardId,
            reviewAttemptId: attemptId,
            applicationSequence: eventIndex + 1,
            revision: 0,
            rating,
            reviewedAt: reviewedAtIso,
            dueAt: scheduled.card.dueAt.toISOString(),
            status: statusFromReview(rating, scheduled.card),
            card: toSerializableFsrsCardSnapshot(scheduled.card),
            fsrsReviewLog: scheduled.log,
            schedulingEvidenceKind: 'captured',
            schedulerProfileId: profileIds[profileIndex]!,
          }),
        })
      }
      currentCard = scheduled.card
      lastRating = rating
      lastElapsedSeconds = elapsedSeconds
    }
    const lastAt = reviewedAt
    cardRows.push({
      id: cardId,
      problemSlug: slug,
      cardKind: 'default',
      dueAt: currentCard.dueAt.getTime(),
      stability: currentCard.stability,
      difficulty: currentCard.difficulty,
      elapsedDays: currentCard.elapsedDays,
      scheduledDays: currentCard.scheduledDays,
      learningSteps: currentCard.learningSteps,
      reps: currentCard.reps,
      lapses: currentCard.lapses,
      state: currentCard.state,
      lastReviewAt: currentCard.lastReviewAt?.getTime() ?? null,
      createdAt: firstAt,
      updatedAt: lastAt,
    })
    practiceRows.push({
      problemSlug: slug,
      status: isSuspended
        ? 'suspended'
        : statusFromReview(lastRating, currentCard),
      firstSeenAt: firstAt,
      lastSeenAt: lastAt,
      lastReviewedAt: lastAt,
      lastRating,
      lastElapsedSeconds,
      bestElapsedSeconds,
      interviewPattern: 'graph traversal',
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(n)',
      languages: 'TypeScript',
      notes: `Current log for ${slug}`,
      solvedCount,
      attemptCount: perCard,
      isSuspended,
      createdAt: firstAt,
      updatedAt: lastAt,
    })
    if (cardIndex < Math.min(20, counts.problems)) {
      if (creditedAttempt === null) {
        throw new Error('Fixture track card has no credited review.')
      }
      trackMemberRows.push({
        trackGroupId: groupId,
        trackId,
        problemSlug: slug,
        position: cardIndex + 1,
      })
      progressRows.push({
        trackId,
        problemSlug: slug,
        reviewAttemptId: creditedAttempt.id,
        completedAt: creditedAttempt.reviewedAt,
        completedRating: creditedAttempt.rating,
        createdAt: firstAt,
        updatedAt: firstAt,
      })
    }
  }

  await insertBatches(problemRows, (rows) => db.insert(problems).values(rows))
  await insertBatches(topicRows, (rows) =>
    db.insert(problemTopics).values(rows),
  )
  await insertBatches(practiceRows, (rows) =>
    db.insert(problemPractice).values(rows),
  )
  await insertBatches(cardRows, (rows) => db.insert(fsrsCards).values(rows))
  await insertBatches(attemptRows, (rows) =>
    db.insert(reviewAttempts).values(rows),
  )
  await insertBatches(evidenceRows, (rows) =>
    db.insert(practiceReviewEvidence).values(rows),
  )
  await insertBatches(generationRows, (rows) =>
    db.insert(practiceGenerations).values(rows),
  )
  await insertBatches(receiptRows, (rows) =>
    db.insert(practiceCommandReceipts).values(rows),
  )
  await insertBatches(trackMemberRows, (rows) =>
    db.insert(trackGroupProblems).values(rows),
  )
  await insertBatches(progressRows, (rows) =>
    db.insert(trackProblemProgress).values(rows),
  )
  await db.insert(trackSession).values({
    id: 'active',
    activeTrackId: trackId,
    activeGroupId: groupId,
    startedAt: stamp,
    updatedAt: stamp,
  })
}

async function insertBatches<Row>(
  rows: Row[],
  insert: (batch: Row[]) => Promise<unknown>,
) {
  for (let start = 0; start < rows.length; start += batchSize) {
    await insert(rows.slice(start, start + batchSize))
  }
}
