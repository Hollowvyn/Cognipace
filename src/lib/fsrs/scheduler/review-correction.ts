import {
  assertValidFsrsCardSnapshot,
  parseFsrsCardSnapshot,
  type FsrsCardSnapshot,
  type FsrsSerializedCardSnapshot,
} from '../domain/card-snapshot'
import {
  parseFsrsReviewLogSnapshot,
  type FsrsReviewLogSnapshot,
} from '../domain/review-log-snapshot'
import type { FsrsSchedulerProfile } from '../domain/scheduler-profile'
import type { ReviewRating } from '../domain/review-rating'
import { isCanonicalIsoDateString } from '../domain/snapshot-validation'
import {
  rollbackCardReview,
  scheduleCardReviewWithProfile,
} from '../adapter/ts-fsrs-adapter'
import {
  createFsrsSchedulerProfile,
  scheduleReviewWithProfile,
  type FsrsScheduledReview,
} from './review-scheduler'

/** Immutable original inputs for applying or replacing one review. */
export interface FsrsReviewContext {
  readonly preCard: FsrsSerializedCardSnapshot
  readonly reviewedAt: string
  readonly profile: FsrsSchedulerProfile
}

/** Replaces one rating by scheduling once from its captured original inputs. */
export function correctReviewFromEvidence(
  context: FsrsReviewContext,
  replacementRating: ReviewRating,
): FsrsScheduledReview & { readonly context: FsrsReviewContext } {
  if (!isCanonicalIsoDateString(context.reviewedAt)) {
    throw new Error('Invalid FSRS review context time.')
  }

  return scheduleReviewWithProfile(
    parseFsrsCardSnapshot(context.preCard),
    replacementRating,
    new Date(context.reviewedAt),
    context.profile,
  )
}

/** Legacy review evidence in its caller-supplied complete history order. */
export interface FsrsLegacyReviewEntry {
  readonly reviewedAt: Date
  readonly rating: ReviewRating
  readonly log: FsrsReviewLogSnapshot | null
}

/** Replaces a verified latest legacy event using the known correction recipe. */
export function correctLegacyReview(
  card: FsrsCardSnapshot,
  history: readonly FsrsLegacyReviewEntry[],
  replacementRating: ReviewRating,
  capturedTargetRetention: number,
): FsrsScheduledReview & {
  readonly evidence: 'legacy-derived'
  readonly profile: FsrsSchedulerProfile
  readonly originalProfile: null
} {
  assertValidFsrsCardSnapshot(card)
  const latest = history.at(-1)

  if (!latest || card.reps !== history.length) rejectLegacyCorrection()

  const logs = Array.from(history, (entry, index) => {
    if (!entry) rejectLegacyCorrection()
    const log = parseFsrsReviewLogSnapshot(entry.log)
    const previous = history[index - 1]

    if (
      !(entry.reviewedAt instanceof Date) ||
      !Number.isFinite(entry.reviewedAt.getTime()) ||
      log.reviewedAt !== entry.reviewedAt.toISOString() ||
      log.rating !== entry.rating ||
      (index === 0 ? log.state !== 'new' : log.state === 'new') ||
      (previous &&
        (entry.reviewedAt.getTime() <= previous.reviewedAt.getTime() ||
          log.dueAt !== previous.reviewedAt.toISOString()))
    ) {
      rejectLegacyCorrection()
    }

    return log
  })
  const latestLog = logs.at(-1)
  if (!latestLog) rejectLegacyCorrection()

  const observedLapses = logs.filter(
    (log) => log.state === 'review' && log.rating === 'again',
  ).length

  if (
    card.lastReviewAt?.getTime() !== latest.reviewedAt.getTime() ||
    card.elapsedDays !== latestLog.elapsedDays ||
    card.lapses !== observedLapses
  ) {
    rejectLegacyCorrection()
  }

  const profile = createFsrsSchedulerProfile({
    targetRetention: capturedTargetRetention,
    maximumInterval: 36_500,
    enableFuzz: false,
    enableShortTerm: true,
    learningSteps: ['12h', '23h'],
    relearningSteps: ['23h'],
  })
  const preCard = rollbackCardReview(card, latestLog)
  const eventAt = new Date(latest.reviewedAt)
  const diagnostic = scheduleCardReviewWithProfile(
    preCard,
    latest.rating,
    eventAt,
    profile,
  ).card
  // Original retention and prior raw due are unknown; verify memory and counters.
  const invariantFields = [
    'stability',
    'difficulty',
    'elapsedDays',
    'learningSteps',
    'reps',
    'lapses',
    'state',
  ] as const

  if (invariantFields.some((field) => diagnostic[field] !== card[field])) {
    rejectLegacyCorrection()
  }

  const scheduled = scheduleCardReviewWithProfile(
    preCard,
    replacementRating,
    eventAt,
    profile,
  )

  return {
    ...scheduled,
    rating: replacementRating,
    reviewedAt: new Date(latest.reviewedAt),
    evidence: 'legacy-derived',
    profile,
    originalProfile: null,
  }
}

function rejectLegacyCorrection(): never {
  throw new Error('Unsupported or ambiguous legacy FSRS correction evidence.')
}
