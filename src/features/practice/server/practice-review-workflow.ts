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
