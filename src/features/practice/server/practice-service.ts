import type { Db } from '@/platform/db'

import { createPracticeRepository } from '../data/practice-repository'
import { getSettings } from '@/features/settings/server/settings-service'
import { resetPracticeScheduleWithTrackProgress } from './practice-review-workflow'
import type {
  PracticeDetails,
  OverrideLastReviewResultInput,
  PracticeProgressSummaryInput,
  PracticeReadOptions,
  PracticePreviewInput,
  ResetPracticeScheduleInput,
  SaveReviewResultInput,
  SetPracticeSuspendedInput,
} from '../domain'

/** One consistent read snapshot; the background serializes it with DB writes. */
export function previewPracticeReview(db: Db, input: PracticePreviewInput) {
  return db.transaction(async (transactionDb) => {
    const readDb = transactionDb as unknown as Db
    const settings = await getSettings(readDb)
    return createPracticeRepository(readDb).previewReview(
      input,
      settings.review.targetRetention,
    )
  })
}

export function getPracticeDetails(
  db: Db,
  problemSlug: string,
  options: PracticeReadOptions = {},
): Promise<PracticeDetails> {
  return createPracticeRepository(db).getPracticeDetails(problemSlug, options)
}

export function getPracticeProgressSummary(
  db: Db,
  input: PracticeProgressSummaryInput,
) {
  return createPracticeRepository(db).getPracticeProgressSummary(input)
}

export function saveReviewResult(db: Db, input: SaveReviewResultInput) {
  return createPracticeRepository(db).saveReviewResult(input)
}

export function overrideLastReviewResult(
  db: Db,
  input: OverrideLastReviewResultInput,
) {
  return createPracticeRepository(db).overrideLastReviewResult(input)
}

export function setPracticeSuspended(db: Db, input: SetPracticeSuspendedInput) {
  return createPracticeRepository(db).setPracticeSuspended(input)
}

export function resetPracticeSchedule(
  db: Db,
  input: ResetPracticeScheduleInput,
) {
  return resetPracticeScheduleWithTrackProgress(db, input)
}

export {
  executePracticeReviewCommand,
  overrideLastReviewResultWithTrackProgress,
  resetPracticeScheduleWithTrackProgress,
  saveReviewResultWithTrackProgress,
} from './practice-review-workflow'
