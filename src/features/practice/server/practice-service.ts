import type { Db } from '@/platform/db'

import { createPracticeRepository } from '../data/practice-repository'
import { resetPracticeScheduleWithTrackProgress } from './practice-review-workflow'
import type {
  PracticeDetails,
  OverrideLastReviewResultInput,
  PracticeProgressSummaryInput,
  PracticeReadOptions,
  ResetPracticeScheduleInput,
  SaveReviewResultInput,
  SetPracticeSuspendedInput,
} from '../domain'

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
  overrideLastReviewResultWithTrackProgress,
  resetPracticeScheduleWithTrackProgress,
  saveReviewResultWithTrackProgress,
} from './practice-review-workflow'
