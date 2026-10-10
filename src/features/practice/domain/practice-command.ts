import { z } from 'zod'
import { reviewRatings } from '@/lib/fsrs'
import { reviewModes } from './practice'
import { practiceAssessmentEvidenceSchema } from './practice-storage'

export const practiceGenerationContextSchema = z.strictObject({
  localGenerationToken: z.string().min(1),
  problemGenerationToken: z.string().min(1).nullable(),
})
export const canonicalPracticeReviewedAtSchema = z.string().refine((value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}, 'Expected a canonical ISO date.')
const logSchema = z.strictObject({
  interviewPattern: z.string().nullable().optional(),
  timeComplexity: z.string().nullable().optional(),
  spaceComplexity: z.string().nullable().optional(),
  languages: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})
const acceptedFields = {
  commandId: z.string().min(1),
  problemSlug: z.string().min(1),
  generation: practiceGenerationContextSchema,
  rating: z.enum(reviewRatings),
  reviewedAt: canonicalPracticeReviewedAtSchema,
  elapsedSeconds: z.number().int().positive().nullable().optional(),
  isCorrect: z.boolean().nullable().optional(),
  log: logSchema.optional(),
  assessmentEvidence: practiceAssessmentEvidenceSchema.optional(),
}
export const acceptedPracticeSaveCommandSchema = z.strictObject({
  operation: z.literal('save'),
  ...acceptedFields,
  reviewMode: z.enum(reviewModes),
})
export const acceptedPracticeUpdateCommandSchema = z.strictObject({
  operation: z.literal('update'),
  ...acceptedFields,
  targetAttemptId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative().refine(Number.isSafeInteger),
})
export const acceptedPracticeReviewCommandSchema = z.discriminatedUnion(
  'operation',
  [acceptedPracticeSaveCommandSchema, acceptedPracticeUpdateCommandSchema],
)
export type AcceptedPracticeReviewCommand = z.infer<
  typeof acceptedPracticeReviewCommandSchema
>

/** Fixed positional representation preserves omitted patches separately from null. */
export async function fingerprintPracticeReviewCommand(
  command: AcceptedPracticeReviewCommand,
): Promise<string> {
  const optional = (value: unknown) => (value === undefined ? [0] : [1, value])
  const assessment = command.assessmentEvidence
  const payload = [
    command.operation,
    command.problemSlug,
    command.generation.localGenerationToken,
    command.generation.problemGenerationToken,
    command.operation === 'update' ? command.targetAttemptId : null,
    command.operation === 'update' ? command.expectedRevision : null,
    command.rating,
    command.reviewedAt,
    command.operation === 'save' ? command.reviewMode : null,
    optional(command.elapsedSeconds),
    optional(command.isCorrect),
    command.log === undefined
      ? [0]
      : [
          1,
          ...(
            [
              'interviewPattern',
              'timeComplexity',
              'spaceComplexity',
              'languages',
              'notes',
            ] as const
          ).map((key) => optional(command.log?.[key])),
        ],
    assessment === undefined
      ? [0]
      : [
          1,
          assessment.schemaVersion,
          assessment.source,
          assessment.policyVersion,
          assessment.submissionIntent,
          assessment.reasonCode,
          assessment.lockReason,
          assessment.finalRating,
        ],
  ]
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export type ReviewCommandConflictReason =
  | 'stale-review'
  | 'backdated'
  | 'unsupported-legacy'
  | 'stale-generation'
  | 'command-conflict'

/** Expected rejection that lets a caller retain its draft and refresh context. */
export class ReviewCommandConflictError extends Error {
  constructor(
    readonly reason: ReviewCommandConflictReason,
    message: string,
  ) {
    super(message)
    this.name = 'ReviewCommandConflictError'
  }
}
