import { and, eq } from 'drizzle-orm'
import { getSettings } from '@/features/settings/server/settings-service'
import {
  practiceCommandReceipts,
  practiceGenerations,
  practiceReviewEvidence,
  reviewAttempts,
} from '@/platform/db/schema'
import { toSerializableFsrsCardSnapshot } from '@/lib/fsrs'
import {
  acceptedPracticeReviewCommandSchema,
  fingerprintPracticeReviewCommand,
  createPracticeGenerationKey,
  practiceReceiptAcknowledgementSchema,
  practiceReceiptCommandSummarySchema,
  ReviewCommandConflictError,
  type AcceptedPracticeReviewCommand,
  type PracticeReceiptAcknowledgement,
} from '../domain'
import { serializePracticeDetails } from '../api/practice-serializers'
import type { PracticeReviewCommandResult } from '../api/practice-contracts'

import type { UserSettings } from '@/features/settings/domain'
import {
  reconcileActiveTrackProblemReviewOverride,
  recordActiveTrackProblemReview,
  resetTrackProblemProgressForProblem,
} from '@/features/tracks/server/tracks-service'
import type { Db } from '@/platform/db'

import { createPracticeRepository } from '../data/practice-repository'
import type {
  OverrideLastReviewResultInput,
  PracticeDetails,
  ResetPracticeScheduleInput,
  ReviewResult,
  SaveReviewResultInput,
} from '../domain'

export async function saveReviewResultWithTrackProgress(
  db: Db,
  input: SaveReviewResultInput,
  settings: UserSettings,
): Promise<ReviewResult> {
  return db.transaction(async (transactionDb) => {
    const tx = transactionDb as unknown as Db
    const result = await createPracticeRepository(
      tx,
    ).saveReviewResultInTransaction(input, tx)

    if (settings.practice.mode === 'studyPlan') {
      await recordActiveTrackProblemReview(tx, {
        problemSlug: result.problemSlug,
        rating: result.rating,
        reviewedAt: result.reviewedAt,
        reviewAttemptId: result.reviewAttemptId,
      })
    }

    return result
  })
}

export async function overrideLastReviewResultWithTrackProgress(
  db: Db,
  input: OverrideLastReviewResultInput,
): Promise<ReviewResult> {
  return db.transaction(async (transactionDb) => {
    const tx = transactionDb as unknown as Db
    const result = await createPracticeRepository(
      tx,
    ).overrideLastReviewResultInTransaction(input, tx)

    await reconcileActiveTrackProblemReviewOverride(tx, {
      problemSlug: result.problemSlug,
      rating: result.rating,
      reviewedAt: result.reviewedAt,
      reviewAttemptId: result.reviewAttemptId,
    })

    return result
  })
}

export async function resetPracticeScheduleWithTrackProgress(
  db: Db,
  input: ResetPracticeScheduleInput,
): Promise<PracticeDetails> {
  return db.transaction(async (transactionDb) => {
    const tx = transactionDb as unknown as Db
    const details = await createPracticeRepository(
      tx,
    ).resetPracticeScheduleInTransaction(input, tx)

    await resetTrackProblemProgressForProblem(tx, input.problemSlug)

    return details
  })
}

/** Receipt acceptance and all review effects share one owning transaction. */
export async function executePracticeReviewCommand(
  db: Db,
  input: AcceptedPracticeReviewCommand,
): Promise<PracticeReviewCommandResult> {
  const command = acceptedPracticeReviewCommandSchema.parse(input)
  const payloadFingerprint = await fingerprintPracticeReviewCommand(command)
  const generationKey = createPracticeGenerationKey(command.generation)
  let acknowledgement: PracticeReceiptAcknowledgement
  try {
    acknowledgement = await db.transaction(async (transactionDb) => {
      const tx = transactionDb as unknown as Db
      const [local] = await tx
        .select()
        .from(practiceGenerations)
        .where(eq(practiceGenerations.scopeId, 'local'))
        .limit(1)
      if (local?.generationToken !== command.generation.localGenerationToken)
        throw new ReviewCommandConflictError(
          'stale-generation',
          'Practice storage was replaced. Refresh before reviewing.',
        )
      const [receipt] = await tx
        .select()
        .from(practiceCommandReceipts)
        .where(
          and(
            eq(practiceCommandReceipts.generationKey, generationKey),
            eq(practiceCommandReceipts.commandId, command.commandId),
          ),
        )
        .limit(1)
      if (receipt) {
        if (receipt.payloadFingerprint !== payloadFingerprint)
          throw new ReviewCommandConflictError(
            'command-conflict',
            'This command ID was already accepted with different review details.',
          )
        return practiceReceiptAcknowledgementSchema.parse(
          JSON.parse(receipt.resultJson),
        )
      }
      const [problemGeneration] = await tx
        .select()
        .from(practiceGenerations)
        .where(
          eq(practiceGenerations.scopeId, `problem:${command.problemSlug}`),
        )
        .limit(1)
      if (
        (problemGeneration?.generationToken ?? null) !==
        command.generation.problemGenerationToken
      )
        throw new ReviewCommandConflictError(
          'stale-generation',
          'This Practice schedule changed. Refresh before reviewing.',
        )
      const repository = createPracticeRepository(tx)
      const accepted = { ...command, reviewedAt: new Date(command.reviewedAt) }
      let result: ReviewResult
      if (command.operation === 'save') {
        const settings = await getSettings(tx)
        result = await repository.saveReviewResultInTransaction(
          { ...accepted, targetRetention: settings.review.targetRetention },
          tx,
        )
        if (settings.practice.mode === 'studyPlan')
          await recordActiveTrackProblemReview(tx, {
            problemSlug: result.problemSlug,
            rating: result.rating,
            reviewedAt: result.reviewedAt,
            reviewAttemptId: result.reviewAttemptId,
          })
      } else {
        const settings = await getSettings(tx)
        result = await repository.overrideLastReviewResultInTransaction(
          {
            ...accepted,
            targetRetention: settings.review.targetRetention,
            targetAttemptId: command.targetAttemptId,
            expectedRevision: command.expectedRevision,
          },
          tx,
        )
        await reconcileActiveTrackProblemReviewOverride(tx, {
          problemSlug: result.problemSlug,
          rating: result.rating,
          reviewedAt: result.reviewedAt,
          reviewAttemptId: result.reviewAttemptId,
        })
      }
      const [evidence] = await tx
        .select()
        .from(practiceReviewEvidence)
        .where(
          eq(practiceReviewEvidence.reviewAttemptId, result.reviewAttemptId),
        )
        .limit(1)
      const [attempt] = await tx
        .select()
        .from(reviewAttempts)
        .where(eq(reviewAttempts.id, result.reviewAttemptId))
        .limit(1)
      if (!evidence || !attempt)
        throw new Error('Accepted review is missing its scheduling evidence.')
      const ack = practiceReceiptAcknowledgementSchema.parse({
        schemaVersion: 1,
        operation: command.operation,
        problemSlug: result.problemSlug,
        cardId: result.cardId,
        reviewAttemptId: result.reviewAttemptId,
        applicationSequence: evidence.applicationSequence,
        revision: evidence.revision,
        rating: result.rating,
        reviewedAt: result.reviewedAt.toISOString(),
        dueAt: result.dueAt.toISOString(),
        status: result.status,
        card: toSerializableFsrsCardSnapshot(result.card),
        fsrsReviewLog:
          attempt.fsrsReviewLog === null
            ? null
            : (JSON.parse(attempt.fsrsReviewLog) as unknown),
        schedulingEvidenceKind: evidence.schedulingEvidenceKind,
        schedulerProfileId: evidence.schedulerProfileId,
      })
      const summary = practiceReceiptCommandSummarySchema.parse({
        schemaVersion: 1,
        rating: command.rating,
        reviewedAt: command.reviewedAt,
        targetAttemptId:
          command.operation === 'update' ? command.targetAttemptId : null,
        expectedRevision:
          command.operation === 'update' ? command.expectedRevision : null,
      })
      await tx.insert(practiceCommandReceipts).values({
        generationKey,
        commandId: command.commandId,
        payloadFingerprint,
        operation: command.operation,
        problemSlug: result.problemSlug,
        cardId: result.cardId,
        reviewAttemptId: result.reviewAttemptId,
        applicationSequence: evidence.applicationSequence,
        revision: evidence.revision,
        acceptedAt: Date.now(),
        commandSummaryJson: JSON.stringify(summary),
        resultJson: JSON.stringify(ack),
      })
      return ack
    })
  } catch (error) {
    if (!(error instanceof ReviewCommandConflictError)) throw error
    return {
      status: 'conflict',
      reason: error.reason,
      message: error.message,
      current: serializePracticeDetails(
        await createPracticeRepository(db).getPracticeDetails(
          command.problemSlug,
        ),
      ),
    }
  }
  return {
    status: 'saved',
    acknowledgement,
    current: serializePracticeDetails(
      await createPracticeRepository(db).getPracticeDetails(
        command.problemSlug,
      ),
    ),
  }
}
