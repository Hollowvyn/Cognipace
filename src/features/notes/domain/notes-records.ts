import { z } from 'zod'

import { analysisProviderMetadataSchema } from '@/features/leetcode-review-assistant/api/code-analysis-contracts'
import { codeFeedbackSchema } from '@/features/leetcode-review-assistant/domain/code-feedback-schema'
import { codeImplementationSchema } from '@/features/leetcode-review-assistant/domain/code-implementation-schema'
import { problemSlugSchema } from '@/features/problems/api/problems-contracts'

const id = z.string().min(1).max(160).regex(/\S/)
const revision = z.number().int().nonnegative()

export const notesScopeSchema = z.strictObject({
  datasetToken: id,
  problemToken: id,
})
export const noteTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('problem') }),
  z.strictObject({ kind: z.literal('reflection'), submissionId: id }),
])
export const noteDocumentSchema = z.strictObject({
  formatVersion: z.literal(1),
  revision,
  markdown: z.string(),
  updatedAt: z.iso.datetime().nullable(),
})
export const saveNoteCommandSchema = z.strictObject({
  commandId: id,
  problemSlug: z.lazy(() => problemSlugSchema),
  scope: notesScopeSchema,
  target: noteTargetSchema,
  expectedRevision: revision,
  markdown: z.string(),
})
export const saveNoteResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('saved'),
    commandId: id,
    document: noteDocumentSchema,
  }),
  z.strictObject({
    status: z.literal('conflict'),
    document: noteDocumentSchema,
  }),
  z.strictObject({ status: z.literal('stale-scope') }),
])
export const savedAiCommandSchema = z.strictObject({
  commandId: id,
  problemSlug: z.lazy(() => problemSlugSchema),
  scope: notesScopeSchema,
  assessmentId: id,
  expectedCollectionRevision: revision,
  saved: z.boolean(),
})
export const savedAiResultSchema = z.discriminatedUnion('status', [
  // A replay reports the original action revision alongside current membership.
  // Its receipt must never re-apply an inclusion removed by a later command.
  z.strictObject({
    status: z.literal('saved'),
    commandId: id,
    appliedRevision: revision,
    collectionRevision: revision,
    saved: z.boolean(),
  }),
  z.strictObject({
    status: z.literal('conflict'),
    collectionRevision: revision,
  }),
  z.strictObject({ status: z.literal('stale-scope') }),
])

export type NotesScope = z.infer<typeof notesScopeSchema>
export type NoteTarget = z.infer<typeof noteTargetSchema>
export type NoteDocument = z.infer<typeof noteDocumentSchema>
export type SaveNoteCommand = z.infer<typeof saveNoteCommandSchema>
export type SaveNoteResult = z.infer<typeof saveNoteResultSchema>
export type SavedAiCommand = z.infer<typeof savedAiCommandSchema>
export type SavedAiResult = z.infer<typeof savedAiResultSchema>

export const problemNoteRecordSchema = z.strictObject({
  problemSlug: z.lazy(() => problemSlugSchema),
  document: noteDocumentSchema,
  savedAiCollectionRevision: revision,
})
const diagnostic = z.string().max(2000).nullable()
export const submissionDiagnosticsSchema = z.strictObject({
  errorMessage: diagnostic,
  compileError: diagnostic,
  runtimeError: diagnostic,
  failingTestcase: diagnostic,
  lastTestcase: diagnostic,
  codeOutput: diagnostic,
  expectedOutput: diagnostic,
  stdOutput: diagnostic,
})
export const submissionRecordSchema = z.strictObject({
  id,
  problemSlug: z.lazy(() => problemSlugSchema),
  observedAttemptIds: z.array(id),
  externalSubmissionId: id.nullable(),
  host: z.literal('leetcode.com'),
  submittedAt: z.iso.datetime(),
  status: z.enum([
    'accepted',
    'wrong-answer',
    'runtime-error',
    'compile-error',
    'time-limit-exceeded',
    'memory-limit-exceeded',
    'output-limit-exceeded',
    'unknown',
  ]),
  statusText: z.string().max(160),
  language: z.string().max(120).nullable(),
  completeness: z.enum(['complete', 'partial', 'missing']),
  codePayloadId: id.nullable(),
  diagnostics: submissionDiagnosticsSchema,
  omittedDiagnostics: z.array(submissionDiagnosticsSchema.keyof()).max(8),
  reflection: noteDocumentSchema,
})
export const assessmentRecordSchema = z.strictObject({
  id,
  problemSlug: z.lazy(() => problemSlugSchema),
  submissionId: id,
  requestId: id,
  generatedAt: z.iso.datetime(),
  feedbackSchemaVersion: z.literal(1),
  feedbackPayloadId: id,
  providerMetadata: analysisProviderMetadataSchema,
  implementationPayloadId: id.nullable(),
})
export const savedAiNoteRecordSchema = z.strictObject({
  problemSlug: z.lazy(() => problemSlugSchema),
  assessmentId: id,
  savedAt: z.iso.datetime(),
})
const payloadFields = {
  id,
  byteLength: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}
export const notesPayloadSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...payloadFields,
    kind: z.literal('submitted-code'),
    body: z.string(),
  }),
  z.strictObject({
    ...payloadFields,
    kind: z.literal('feedback-v1'),
    body: codeFeedbackSchema,
  }),
  z.strictObject({
    ...payloadFields,
    kind: z.literal('implementation-v1'),
    body: codeImplementationSchema,
  }),
])
export const notesArchiveSchema = z.strictObject({
  formatVersion: z.literal(1),
  notes: z.array(problemNoteRecordSchema),
  submissions: z.array(submissionRecordSchema),
  assessments: z.array(assessmentRecordSchema),
  savedAiNotes: z.array(savedAiNoteRecordSchema),
  // Validate body shape without applying report transforms. Digests bind the
  // original JSON serialization, including property order and string whitespace.
  payloads: z.array(
    z
      .custom<
        z.infer<typeof notesPayloadSchema>
      >((value) => notesPayloadSchema.safeParse(value).success, 'Invalid archive payload.')
      .transform((value) => structuredClone(value)),
  ),
})
export type ProblemNoteRecord = z.infer<typeof problemNoteRecordSchema>
export type SubmissionRecord = z.infer<typeof submissionRecordSchema>
export type AssessmentRecord = z.infer<typeof assessmentRecordSchema>
export type SavedAiNoteRecord = z.infer<typeof savedAiNoteRecordSchema>
export type NotesPayload = z.infer<typeof notesPayloadSchema>
export type NotesArchive = z.infer<typeof notesArchiveSchema>
