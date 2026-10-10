import { z } from 'zod'

import {
  assessmentLockReasons,
  assessmentReasonCodes,
  assessmentSubmissionIntents,
} from '@/features/assessment/domain'
import {
  assertFsrsReviewLogMatchesPreCard,
  fsrsCardStates,
  parseFsrsCardSnapshot,
  parseSerializedFsrsCardSnapshot,
  parseSerializedFsrsReviewLogSnapshot,
  parseSerializedFsrsSchedulerProfile,
  reviewRatings,
  serializeFsrsCardSnapshot,
  serializeFsrsSchedulerProfile,
  toSerializableFsrsCardSnapshot,
  type FsrsCardSnapshot,
  type FsrsSchedulerProfile,
  type ReviewRating,
} from '@/lib/fsrs'

import { practiceStatuses, statusFromReview } from './practice'

export const practiceSequenceSources = ['legacy-inferred', 'applied'] as const
export const practiceSchedulingEvidenceKinds = [
  'unknown',
  'captured',
  'legacy-derived',
] as const
export const practiceReceiptOperations = ['save', 'update'] as const

const opaqueId = z.string().min(1)
const isoDate = z.string().refine((value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}, 'Expected a canonical ISO date.')
const nonNegativeInteger = z
  .number()
  .int()
  .nonnegative()
  .refine(Number.isSafeInteger)
const positiveInteger = z.number().int().positive().refine(Number.isSafeInteger)
const nonNegativeNumber = z.number().finite().nonnegative()

export interface PracticeGenerationContext {
  readonly localGenerationToken: string
  readonly problemGenerationToken: string | null
}

const generationPairSchema = z.tuple([opaqueId, opaqueId.nullable()])

export function createPracticeGenerationKey(
  context: PracticeGenerationContext,
): string {
  return JSON.stringify(
    generationPairSchema.parse([
      context.localGenerationToken,
      context.problemGenerationToken,
    ]),
  )
}

export function parsePracticeGenerationKey(
  key: string,
): PracticeGenerationContext {
  const pair = generationPairSchema.parse(JSON.parse(key))
  if (JSON.stringify(pair) !== key)
    fail('generation key must be canonical JSON.')
  return { localGenerationToken: pair[0], problemGenerationToken: pair[1] }
}

export const practiceSchedulerProfileRecordSchema = z.strictObject({
  id: opaqueId,
  profileJson: z.string().min(1),
  createdAt: isoDate,
})

export const practiceReviewEvidenceRecordSchema = z.strictObject({
  reviewAttemptId: opaqueId,
  cardId: opaqueId,
  applicationSequence: positiveInteger,
  revision: nonNegativeInteger,
  sequenceSource: z.enum(practiceSequenceSources),
  schedulingEvidenceKind: z.enum(practiceSchedulingEvidenceKinds),
  schedulerProfileId: opaqueId.nullable(),
  preCardJson: z.string().min(1).nullable(),
  assessmentEvidenceJson: z.string().min(1).nullable(),
})

export const practiceGenerationRecordSchema = z
  .strictObject({
    scopeId: opaqueId,
    problemSlug: opaqueId.nullable(),
    generationToken: opaqueId,
    createdAt: isoDate,
  })
  .refine(
    (row) =>
      row.scopeId ===
      (row.problemSlug === null ? 'local' : `problem:${row.problemSlug}`),
    'Invalid Practice generation scope.',
  )

export const practiceReceiptCommandSummarySchema = z.strictObject({
  schemaVersion: z.literal(1),
  rating: z.enum(reviewRatings),
  reviewedAt: isoDate,
  targetAttemptId: opaqueId.nullable(),
  expectedRevision: nonNegativeInteger.nullable(),
})

const serializedCardSchema = z
  .strictObject({
    dueAt: isoDate,
    stability: nonNegativeNumber,
    difficulty: nonNegativeNumber,
    elapsedDays: nonNegativeInteger,
    scheduledDays: nonNegativeInteger,
    learningSteps: nonNegativeInteger,
    reps: nonNegativeInteger,
    lapses: nonNegativeInteger,
    state: z.enum(fsrsCardStates),
    lastReviewAt: isoDate.nullable(),
  })
  .refine((card) => {
    try {
      parseFsrsCardSnapshot(card)
      return true
    } catch {
      return false
    }
  }, 'Invalid FSRS card snapshot.')

const reviewLogSchema = z.strictObject({
  rating: z.enum(reviewRatings),
  state: z.enum(fsrsCardStates),
  dueAt: isoDate,
  stability: nonNegativeNumber,
  difficulty: nonNegativeNumber,
  elapsedDays: nonNegativeInteger,
  lastElapsedDays: nonNegativeInteger,
  scheduledDays: nonNegativeInteger,
  learningSteps: nonNegativeInteger,
  reviewedAt: isoDate,
})

export const practiceReceiptAcknowledgementSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operation: z.enum(practiceReceiptOperations),
  problemSlug: opaqueId,
  cardId: opaqueId,
  reviewAttemptId: opaqueId,
  applicationSequence: positiveInteger,
  revision: nonNegativeInteger,
  rating: z.enum(reviewRatings),
  reviewedAt: isoDate,
  dueAt: isoDate,
  status: z.enum(practiceStatuses),
  card: serializedCardSchema,
  fsrsReviewLog: reviewLogSchema.nullable(),
  schedulingEvidenceKind: z.enum(practiceSchedulingEvidenceKinds),
  schedulerProfileId: opaqueId.nullable(),
})

export const practiceCommandReceiptRecordSchema = z.strictObject({
  generationKey: z.string().refine((key) => {
    try {
      parsePracticeGenerationKey(key)
      return true
    } catch {
      return false
    }
  }, 'Invalid canonical Practice generation key.'),
  commandId: opaqueId,
  payloadFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  operation: z.enum(practiceReceiptOperations),
  problemSlug: opaqueId,
  cardId: opaqueId,
  reviewAttemptId: opaqueId,
  applicationSequence: positiveInteger,
  revision: nonNegativeInteger,
  acceptedAt: isoDate,
  commandSummaryJson: z.string().min(1),
  resultJson: z.string().min(1),
})

export const practiceAssessmentEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.enum(['manual', 'assessment', 'ai']),
  policyVersion: z.string().min(1).nullable(),
  submissionIntent: z.enum(assessmentSubmissionIntents).nullable(),
  reasonCode: z.enum(assessmentReasonCodes).nullable(),
  lockReason: z.enum(assessmentLockReasons).nullable(),
  finalRating: z.enum(reviewRatings),
})

export type PracticeAssessmentEvidence = z.infer<
  typeof practiceAssessmentEvidenceSchema
>

export const practiceStorageDataSchema = z.strictObject({
  schedulerProfiles: z.array(practiceSchedulerProfileRecordSchema),
  reviewEvidence: z.array(practiceReviewEvidenceRecordSchema),
  generations: z.array(practiceGenerationRecordSchema),
  commandReceipts: z.array(practiceCommandReceiptRecordSchema),
})

export type PracticeSchedulerProfileRecord = z.infer<
  typeof practiceSchedulerProfileRecordSchema
>
export type PracticeReviewEvidenceRecord = z.infer<
  typeof practiceReviewEvidenceRecordSchema
>
export type PracticeGenerationRecord = z.infer<
  typeof practiceGenerationRecordSchema
>
export type PracticeReceiptCommandSummary = z.infer<
  typeof practiceReceiptCommandSummarySchema
>
export type PracticeReceiptAcknowledgement = z.infer<
  typeof practiceReceiptAcknowledgementSchema
>
export type PracticeCommandReceiptRecord = z.infer<
  typeof practiceCommandReceiptRecordSchema
>
export type PracticeStorageData = z.infer<typeof practiceStorageDataSchema>

export interface PracticeStorageReferences {
  problemSlugs: readonly string[]
  practiceProblemSlugs: readonly string[]
  cards: readonly { id: string; problemSlug: string; card: FsrsCardSnapshot }[]
  attempts: readonly {
    id: string
    cardId: string
    problemSlug: string
    rating: ReviewRating
    reviewedAt: string
    fsrsReviewLog: string | null
  }[]
}

/** Inference records provenance only; it does not replay or modify scheduling. */
export function normalizeLegacyPracticeStorage(
  attempts: PracticeStorageReferences['attempts'],
): PracticeStorageData {
  const byCard = new Map<
    string,
    PracticeStorageReferences['attempts'][number][]
  >()
  for (const attempt of attempts) {
    const group = byCard.get(attempt.cardId) ?? []
    group.push(attempt)
    byCard.set(attempt.cardId, group)
  }
  const reviewEvidence = [...byCard.entries()]
    .sort(([a], [b]) => compareCodeUnits(a, b))
    .flatMap(([, group]) =>
      group
        .sort(
          (a, b) =>
            new Date(a.reviewedAt).getTime() -
              new Date(b.reviewedAt).getTime() || compareCodeUnits(a.id, b.id),
        )
        .map((attempt, index) => ({
          reviewAttemptId: attempt.id,
          cardId: attempt.cardId,
          applicationSequence: index + 1,
          revision: 0,
          sequenceSource: 'legacy-inferred' as const,
          schedulingEvidenceKind: 'unknown' as const,
          schedulerProfileId: null,
          preCardJson: null,
          assessmentEvidenceJson: null,
        })),
    )
  return {
    schedulerProfiles: [],
    reviewEvidence,
    generations: [],
    commandReceipts: [],
  }
}

/** Strict detached preflight shared by initialization, current opens and backup. */
export function validatePracticeStorageData(
  input: unknown,
  references: PracticeStorageReferences,
  options: { requireActiveGenerations?: boolean } = {},
): PracticeStorageData {
  const storage = practiceStorageDataSchema.parse(input)
  const problems = uniqueSet(references.problemSlugs, 'problem')
  uniqueSet(references.practiceProblemSlugs, 'Practice problem')
  const cards = uniqueMap(references.cards, (row) => row.id, 'card')
  const attempts = uniqueMap(references.attempts, (row) => row.id, 'attempt')
  const evidence = uniqueMap(
    storage.reviewEvidence,
    (row) => row.reviewAttemptId,
    'evidence attempt',
  )
  uniqueSet(
    storage.reviewEvidence.map((row) =>
      JSON.stringify([row.cardId, row.applicationSequence]),
    ),
    'card application sequence',
  )
  const profiles = uniqueMap(
    storage.schedulerProfiles,
    (row) => row.id,
    'profile',
  )
  uniqueSet(
    storage.schedulerProfiles.map((row) => row.profileJson),
    'canonical profile',
  )
  const parsedProfiles = new Map<string, FsrsSchedulerProfile>()
  for (const row of profiles.values()) {
    const profile = parseSerializedFsrsSchedulerProfile(row.profileJson)
    if (serializeFsrsSchedulerProfile(profile) !== row.profileJson)
      fail('profile JSON must be canonical.')
    parsedProfiles.set(row.id, profile)
  }
  for (const card of cards.values()) {
    if (!problems.has(card.problemSlug)) fail('card problem does not exist.')
    toSerializableFsrsCardSnapshot(card.card)
  }
  for (const slug of references.practiceProblemSlugs) {
    if (!problems.has(slug)) fail('Practice problem does not exist.')
  }
  for (const attempt of attempts.values()) {
    const card = cards.get(attempt.cardId)
    if (
      !card ||
      card.problemSlug !== attempt.problemSlug ||
      !problems.has(attempt.problemSlug)
    )
      fail('attempt card/problem ownership does not match.')
    z.enum(reviewRatings).parse(attempt.rating)
    isoDate.parse(attempt.reviewedAt)
    const row = evidence.get(attempt.id)
    if (!row || row.cardId !== attempt.cardId)
      fail('every attempt requires matching card evidence.')
    const log =
      attempt.fsrsReviewLog === null
        ? null
        : parseSerializedFsrsReviewLogSnapshot(attempt.fsrsReviewLog)
    if (
      log &&
      (log.rating !== attempt.rating || log.reviewedAt !== attempt.reviewedAt)
    )
      fail('attempt log rating/time does not match.')
    if (row.assessmentEvidenceJson !== null) {
      const assessment = practiceAssessmentEvidenceSchema.parse(
        JSON.parse(row.assessmentEvidenceJson),
      )
      if (assessment.finalRating !== attempt.rating)
        fail('assessment final rating does not match.')
    }
    if (row.schedulingEvidenceKind === 'unknown') {
      if (row.schedulerProfileId !== null || row.preCardJson !== null)
        fail('unknown scheduling evidence cannot claim context.')
    } else {
      const profile =
        row.schedulerProfileId === null
          ? null
          : parsedProfiles.get(row.schedulerProfileId)
      if (!profile || row.preCardJson === null || log === null)
        fail('trusted scheduling evidence requires profile, pre-card and log.')
      const preCard = parseSerializedFsrsCardSnapshot(row.preCardJson)
      if (serializeFsrsCardSnapshot(preCard) !== row.preCardJson)
        fail('pre-card JSON must be canonical.')
      if (
        preCard.lastReviewAt &&
        preCard.lastReviewAt.getTime() > new Date(attempt.reviewedAt).getTime()
      )
        fail('pre-card last review is after the event.')
      assertFsrsReviewLogMatchesPreCard(log, preCard, profile)
    }
  }
  for (const row of evidence.values()) {
    if (!attempts.has(row.reviewAttemptId)) fail('orphan review evidence.')
  }
  const generations = uniqueMap(
    storage.generations,
    (row) => row.scopeId,
    'generation scope',
  )
  uniqueSet(
    storage.generations
      .filter((row) => row.problemSlug !== null)
      .map((row) => row.problemSlug!),
    'problem generation',
  )
  if (
    (generations.size > 0 || options.requireActiveGenerations) &&
    !generations.has('local')
  )
    fail('local generation is required.')
  for (const row of generations.values()) {
    if (row.problemSlug !== null && !problems.has(row.problemSlug))
      fail('generation problem does not exist.')
  }
  if (options.requireActiveGenerations) {
    const required = new Set([
      ...references.practiceProblemSlugs,
      ...references.cards.map((row) => row.problemSlug),
      ...references.attempts.map((row) => row.problemSlug),
    ])
    for (const slug of required) {
      if (!generations.has(`problem:${slug}`))
        fail(`generation for ${slug} is required.`)
    }
  }
  uniqueSet(
    storage.commandReceipts.map((row) =>
      JSON.stringify([row.generationKey, row.commandId]),
    ),
    'receipt key',
  )
  for (const row of storage.commandReceipts) {
    const attempt = attempts.get(row.reviewAttemptId)
    const event = evidence.get(row.reviewAttemptId)
    if (
      !attempt ||
      !event ||
      row.cardId !== attempt.cardId ||
      row.problemSlug !== attempt.problemSlug ||
      row.applicationSequence !== event.applicationSequence ||
      row.revision > event.revision
    )
      fail('receipt does not match its retained event.')
    const summary = practiceReceiptCommandSummarySchema.parse(
      JSON.parse(row.commandSummaryJson),
    )
    const acknowledgement = practiceReceiptAcknowledgementSchema.parse(
      JSON.parse(row.resultJson),
    )
    if (
      acknowledgement.operation !== row.operation ||
      acknowledgement.problemSlug !== row.problemSlug ||
      acknowledgement.cardId !== row.cardId ||
      acknowledgement.reviewAttemptId !== row.reviewAttemptId ||
      acknowledgement.applicationSequence !== row.applicationSequence ||
      acknowledgement.revision !== row.revision
    )
      fail('receipt acknowledgement identity does not match.')
    if (
      summary.rating !== acknowledgement.rating ||
      summary.reviewedAt !== acknowledgement.reviewedAt ||
      acknowledgement.reviewedAt !== attempt.reviewedAt
    )
      fail('receipt rating/time association does not match.')
    if (row.operation === 'save') {
      if (
        summary.targetAttemptId !== null ||
        summary.expectedRevision !== null ||
        acknowledgement.revision !== 0
      )
        fail('save receipt target/revision is invalid.')
    } else {
      const target =
        summary.targetAttemptId === null
          ? null
          : attempts.get(summary.targetAttemptId)
      if (
        !target ||
        target.problemSlug !== row.problemSlug ||
        target.id !== row.reviewAttemptId ||
        summary.expectedRevision === null ||
        summary.expectedRevision >= Number.MAX_SAFE_INTEGER ||
        acknowledgement.revision !== summary.expectedRevision + 1
      )
        fail('update receipt target/revision is invalid.')
    }
    const card = parseFsrsCardSnapshot(acknowledgement.card)
    if (
      card.state === 'new' ||
      card.reps < 1 ||
      acknowledgement.dueAt !== acknowledgement.card.dueAt ||
      acknowledgement.card.lastReviewAt !== acknowledgement.reviewedAt
    )
      fail('receipt must contain its own post-review card.')
    if (
      acknowledgement.status !== 'suspended' &&
      acknowledgement.status !== statusFromReview(acknowledgement.rating, card)
    )
      fail('receipt status is inconsistent with its card/rating.')
    const log = acknowledgement.fsrsReviewLog
    if (
      log &&
      (log.rating !== acknowledgement.rating ||
        log.reviewedAt !== acknowledgement.reviewedAt)
    )
      fail('receipt log rating/time does not match.')
    if (acknowledgement.schedulingEvidenceKind === 'unknown') {
      if (acknowledgement.schedulerProfileId !== null)
        fail('unknown receipt cannot claim a profile.')
    } else if (
      acknowledgement.schedulerProfileId === null ||
      !profiles.has(acknowledgement.schedulerProfileId) ||
      log === null
    ) {
      fail('trusted receipt requires a retained profile and log.')
    }
  }
  return storage
}

function compareCodeUnits(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}
function fail(message: string): never {
  throw new Error(`Invalid Practice storage: ${message}`)
}
function uniqueSet(values: readonly string[], label: string): Set<string> {
  const result = new Set<string>()
  for (const value of values) {
    opaqueId.parse(value)
    if (result.has(value)) fail(`duplicate ${label}.`)
    result.add(value)
  }
  return result
}
function uniqueMap<T>(
  rows: readonly T[],
  key: (row: T) => string,
  label: string,
): Map<string, T> {
  uniqueSet(rows.map(key), label)
  return new Map(rows.map((row) => [key(row), row]))
}
