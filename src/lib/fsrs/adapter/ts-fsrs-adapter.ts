import {
  checkParameters,
  createEmptyCard,
  fsrs,
  FSRSVersion,
  generatorParameters,
  Rating,
  State,
  type Card,
  type CardInput,
  type FSRSParameters,
  type Grade,
  type ReviewLog,
} from 'ts-fsrs'

import {
  assertValidFsrsCardSnapshot,
  type FsrsCardSnapshot,
  type FsrsCardState,
} from '../domain/card-snapshot'
import {
  normalizeFsrsSchedulingOptions,
  type FsrsSchedulingOptions,
} from '../domain/scheduling-options'
import {
  parseFsrsReviewLogSnapshot,
  type FsrsReviewLogSnapshot,
} from '../domain/review-log-snapshot'
import type { ReviewRating } from '../domain/review-rating'
import {
  readFsrsSchedulerProfile,
  type FsrsEffectiveParameters,
  type FsrsSchedulerProfile,
} from '../domain/scheduler-profile'

interface TsFsrsScheduledReview {
  card: FsrsCardSnapshot
  log: FsrsReviewLogSnapshot
}

export function createEmptyCardSnapshot(now: Date): FsrsCardSnapshot {
  return fromTsFsrsCard(createEmptyCard(now))
}

export function scheduleCardReview(
  card: FsrsCardSnapshot,
  rating: ReviewRating,
  reviewedAt: Date,
  options: FsrsSchedulingOptions,
): TsFsrsScheduledReview {
  const scheduler = createScheduler(options)
  const result = scheduler.next(
    toTsFsrsCard(card),
    reviewedAt,
    toTsFsrsRating(rating),
  )

  return {
    card: fromTsFsrsCard(result.card),
    log: fromTsFsrsReviewLog(result.log),
  }
}

export function resolveFsrsSchedulerProfile(
  options: FsrsSchedulingOptions = {},
): FsrsSchedulerProfile {
  if (FSRSVersion !== 'v5.4.0 using FSRS-6.0') {
    throw new Error('Unsupported installed FSRS engine.')
  }

  // New profiles capture a reconstructible final normalization. Existing
  // scheduling deliberately retains direct construction in createScheduler.
  const p = fsrs(
    generatorParameters(nativeSchedulerOptions(options)),
  ).parameters

  return readFsrsSchedulerProfile({
    schemaVersion: 1,
    libraryVersion: '5.4.0',
    modelVersion: 'FSRS-6.0',
    source: options.weights === undefined ? 'default' : 'custom',
    parameters: {
      targetRetention: p.request_retention,
      maximumInterval: p.maximum_interval,
      weights: [...p.w],
      enableFuzz: p.enable_fuzz,
      enableShortTerm: p.enable_short_term,
      learningSteps: [...p.learning_steps],
      relearningSteps: [...p.relearning_steps],
    },
  })
}

export function assertExactFsrsSchedulerProfile(
  profile: FsrsSchedulerProfile,
): void {
  const canonical = readFsrsSchedulerProfile(profile)
  const p = canonical.parameters
  const reconstructed = resolveFsrsSchedulerProfile(p).parameters

  if (
    !Object.is(p.targetRetention, reconstructed.targetRetention) ||
    !Object.is(p.maximumInterval, reconstructed.maximumInterval) ||
    !sameValues(p.weights, reconstructed.weights) ||
    !Object.is(p.enableFuzz, reconstructed.enableFuzz) ||
    !Object.is(p.enableShortTerm, reconstructed.enableShortTerm) ||
    !sameValues(p.learningSteps, reconstructed.learningSteps) ||
    !sameValues(p.relearningSteps, reconstructed.relearningSteps)
  ) {
    throw new Error('FSRS profile does not reconstruct exactly.')
  }

  if (canonical.source === 'default') {
    const defaults = resolveFsrsSchedulerProfile({
      targetRetention: p.targetRetention,
      maximumInterval: p.maximumInterval,
      enableFuzz: p.enableFuzz,
      enableShortTerm: p.enableShortTerm,
      learningSteps: p.learningSteps,
      relearningSteps: p.relearningSteps,
    })

    if (!sameValues(p.weights, defaults.parameters.weights)) {
      throw new Error('FSRS default profile has custom model weights.')
    }
  }
}

export function scheduleCardReviewWithProfile(
  card: FsrsCardSnapshot,
  rating: ReviewRating,
  reviewedAt: Date,
  profile: FsrsSchedulerProfile,
): TsFsrsScheduledReview {
  const canonical = readFsrsSchedulerProfile(profile)
  assertExactFsrsSchedulerProfile(canonical)
  const result = fsrs(nativeProfileParameters(canonical.parameters)).next(
    toTsFsrsCard(card),
    reviewedAt,
    toTsFsrsRating(rating),
  )

  return {
    card: fromTsFsrsCard(result.card),
    log: fromTsFsrsReviewLog(result.log),
  }
}

export function rollbackCardReview(
  card: FsrsCardSnapshot,
  log: FsrsReviewLogSnapshot,
): FsrsCardSnapshot {
  const parsed = parseFsrsReviewLogSnapshot(log)

  return fromTsFsrsCard(
    fsrs().rollback(toTsFsrsCard(card), {
      rating: toTsFsrsRating(parsed.rating),
      state: toTsFsrsState(parsed.state),
      due: new Date(parsed.dueAt),
      stability: parsed.stability,
      difficulty: parsed.difficulty,
      elapsed_days: parsed.elapsedDays,
      last_elapsed_days: parsed.lastElapsedDays,
      scheduled_days: parsed.scheduledDays,
      learning_steps: parsed.learningSteps,
      review: new Date(parsed.reviewedAt),
    }),
  )
}

export function calculateCardRetrievability(
  card: FsrsCardSnapshot,
  at: Date,
  options: FsrsSchedulingOptions,
): number {
  return createScheduler(options).get_retrievability(
    toTsFsrsCard(card),
    at,
    false,
  )
}

export function calculateCardTargetRetentionDuration(
  card: FsrsCardSnapshot,
  targetRetention: number,
  options: FsrsSchedulingOptions,
): number | null {
  if (
    !card.lastReviewAt ||
    !Number.isFinite(card.stability) ||
    card.stability <= 0 ||
    !Number.isFinite(targetRetention) ||
    targetRetention <= 0 ||
    targetRetention >= 1
  ) {
    return null
  }

  assertValidFsrsCardSnapshot(card)
  const scheduler = createScheduler(options)
  let lowerDays = 0
  let upperDays = 1

  while (
    scheduler.forgetting_curve(upperDays, card.stability) > targetRetention
  ) {
    upperDays *= 2
    if (upperDays > maximumTargetDurationDays) return null
  }

  for (
    let iteration = 0;
    iteration < targetDurationIterations;
    iteration += 1
  ) {
    const midpoint = (lowerDays + upperDays) / 2
    if (
      scheduler.forgetting_curve(midpoint, card.stability) > targetRetention
    ) {
      lowerDays = midpoint
    } else {
      upperDays = midpoint
    }
  }

  const duration = (lowerDays + upperDays) / 2
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

function createScheduler(options: FsrsSchedulingOptions) {
  return fsrs(nativeSchedulerOptions(options))
}

function nativeSchedulerOptions(
  options: FsrsSchedulingOptions,
): Partial<FSRSParameters> {
  const normalized = normalizeFsrsSchedulingOptions(options)

  return {
    request_retention: normalized.targetRetention,
    enable_fuzz: normalized.enableFuzz,
    enable_short_term: normalized.enableShortTerm,
    learning_steps: normalized.learningSteps,
    relearning_steps: normalized.relearningSteps,
    ...(normalized.weights === undefined
      ? {}
      : { w: checkParameters(normalized.weights) }),
    ...(normalized.maximumInterval === undefined
      ? {}
      : { maximum_interval: normalized.maximumInterval }),
  }
}

function nativeProfileParameters(p: FsrsEffectiveParameters): FSRSParameters {
  return {
    request_retention: p.targetRetention,
    maximum_interval: p.maximumInterval,
    w: [...p.weights],
    enable_fuzz: p.enableFuzz,
    enable_short_term: p.enableShortTerm,
    learning_steps: [...p.learningSteps],
    relearning_steps: [...p.relearningSteps],
  }
}

function sameValues(
  left: readonly unknown[],
  right: readonly unknown[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]))
  )
}

const maximumTargetDurationDays = 365_000
const targetDurationIterations = 48

function toTsFsrsCard(snapshot: FsrsCardSnapshot): CardInput {
  assertValidFsrsCardSnapshot(snapshot)

  const card: CardInput = {
    due: snapshot.dueAt,
    stability: snapshot.stability,
    difficulty: snapshot.difficulty,
    elapsed_days: snapshot.elapsedDays,
    scheduled_days: snapshot.scheduledDays,
    learning_steps: snapshot.learningSteps,
    reps: snapshot.reps,
    lapses: snapshot.lapses,
    state: toTsFsrsState(snapshot.state),
  }

  if (snapshot.lastReviewAt) {
    card.last_review = snapshot.lastReviewAt
  }

  return card
}

function fromTsFsrsCard(card: Card): FsrsCardSnapshot {
  return {
    dueAt: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: fromTsFsrsState(card.state),
    lastReviewAt: card.last_review ?? null,
  }
}

function fromTsFsrsReviewLog(log: ReviewLog): FsrsReviewLogSnapshot {
  return {
    rating: fromTsFsrsRating(log.rating),
    state: fromTsFsrsState(log.state),
    dueAt: log.due.toISOString(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsedDays: log.elapsed_days,
    lastElapsedDays: log.last_elapsed_days,
    scheduledDays: log.scheduled_days,
    learningSteps: log.learning_steps,
    reviewedAt: log.review.toISOString(),
  }
}

function toTsFsrsRating(rating: ReviewRating): Grade {
  return tsFsrsRatingByReviewRating[rating]
}

function fromTsFsrsRating(rating: Rating): ReviewRating {
  if (rating === Rating.Manual) {
    throw new Error('Manual ratings are not supported for review logs.')
  }

  return reviewRatingByTsFsrsRating[rating]
}

function toTsFsrsState(state: FsrsCardState): State {
  return tsFsrsStateByCardState[state]
}

function fromTsFsrsState(state: State): FsrsCardState {
  return cardStateByTsFsrsState[state]
}

const tsFsrsRatingByReviewRating = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
} as const satisfies Record<ReviewRating, Grade>

const reviewRatingByTsFsrsRating = {
  [Rating.Again]: 'again',
  [Rating.Hard]: 'hard',
  [Rating.Good]: 'good',
  [Rating.Easy]: 'easy',
} as const satisfies Record<Grade, ReviewRating>

const tsFsrsStateByCardState = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
} as const satisfies Record<FsrsCardState, State>

const cardStateByTsFsrsState = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
} as const satisfies Record<State, FsrsCardState>
