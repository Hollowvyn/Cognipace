import type {
  NormalizedPracticeState,
  PracticeDetails,
  PracticeLogFields,
  PracticeReviewAttemptSnapshot,
  PracticeStateSnapshot,
  PracticeSummary,
  ReviewResult,
} from '../domain'
import {
  normalizedPracticeStateSchema,
  practiceDetailsSchema,
  practiceReviewResultSchema,
  type SerializedNormalizedPracticeState,
  type SerializedPracticeDetails,
  type SerializedReviewResult,
} from './practice-contracts'

export function serializeNormalizedPracticeState(
  state: NormalizedPracticeState,
): SerializedNormalizedPracticeState {
  return normalizedPracticeStateSchema.parse({
    ...state,
    dueAt: state.dueAt?.toISOString() ?? null,
    lastReviewedAt: state.lastReviewedAt?.toISOString() ?? null,
    reviewHistory: state.reviewHistory.map(serializePracticeAttempt),
    recentAttempts: state.recentAttempts.map(serializePracticeAttempt),
    latestAttempt: state.latestAttempt
      ? serializePracticeAttempt(state.latestAttempt)
      : null,
  })
}

export function serializePracticeDetails(
  details: PracticeDetails,
): SerializedPracticeDetails {
  return practiceDetailsSchema.parse({
    ...serializeNormalizedPracticeState(details),
    practice: details.practice
      ? serializePracticeState(details.practice)
      : null,
    card: details.card
      ? {
          ...details.card,
          dueAt: details.card.dueAt.toISOString(),
          lastReviewAt: details.card.lastReviewAt?.toISOString() ?? null,
        }
      : null,
    currentLog: serializePracticeLog(details.currentLog),
    canOverrideLatestReview: details.canOverrideLatestReview,
    generation: details.generation,
    latestReview: details.latestReview
      ? {
          ...details.latestReview,
          reviewedAt: details.latestReview.reviewedAt.toISOString(),
        }
      : null,
  })
}

export function serializeReviewResult(
  result: ReviewResult,
): SerializedReviewResult {
  return practiceReviewResultSchema.parse({
    problemSlug: result.problemSlug,
    cardId: result.cardId,
    reviewAttemptId: result.reviewAttemptId,
    rating: result.rating,
    status: result.status,
    dueAt: result.dueAt.toISOString(),
    reviewedAt: result.reviewedAt.toISOString(),
    summary: serializePracticeResultSummary(result.summary),
  })
}

function serializePracticeResultSummary(summary: PracticeSummary) {
  return {
    ...summary,
    nextReviewAt: summary.nextReviewAt?.toISOString() ?? null,
    lastReviewedAt: summary.lastReviewedAt?.toISOString() ?? null,
  }
}

function serializePracticeState(practice: PracticeStateSnapshot) {
  return {
    ...practice,
    lastReviewedAt: practice.lastReviewedAt?.toISOString() ?? null,
    log: serializePracticeLog(practice.log),
  }
}

function serializePracticeAttempt(attempt: PracticeReviewAttemptSnapshot) {
  return {
    ...attempt,
    reviewedAt: attempt.reviewedAt.toISOString(),
    log: serializePracticeLog(attempt.log),
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
  }
}

function serializePracticeLog(log: Required<PracticeLogFields>) {
  return {
    interviewPattern: log.interviewPattern ?? null,
    timeComplexity: log.timeComplexity ?? null,
    spaceComplexity: log.spaceComplexity ?? null,
    languages: log.languages ?? null,
    notes: log.notes ?? null,
  }
}
