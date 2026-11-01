import { z } from 'zod'
import { problemSlugSchema } from '@/features/problems/api/problems-contracts'
import { codeFeedbackSchema } from '@/features/leetcode-review-assistant/domain/code-feedback-schema'
import { codeImplementationSchema } from '@/features/leetcode-review-assistant/domain/code-implementation-schema'
import {
  notesScopeSchema,
  noteTargetSchema,
  noteDocumentSchema,
  saveNoteCommandSchema,
  saveNoteResultSchema,
  savedAiCommandSchema,
  savedAiResultSchema,
  submissionRecordSchema,
  assessmentRecordSchema,
  savedAiNoteRecordSchema,
} from '../domain/notes-records'

const id = z.string().min(1).max(160).regex(/\S/)
const base = {
  surface: z.enum(['dashboard', 'content-script']),
  problemSlug: problemSlugSchema,
}
export const notesCursorSchema = z.strictObject({
  problemSlug: problemSlugSchema,
  scope: notesScopeSchema,
  submittedAt: z.iso.datetime(),
  id,
})
export const submissionMetadataSchema = submissionRecordSchema.omit({
  reflection: true,
  diagnostics: true,
  observedAttemptIds: true,
  codePayloadId: true,
})
export const notesRuntimeSchemas = {
  'notes.openEditor': {
    request: z.strictObject({ ...base, target: noteTargetSchema }),
    result: z.strictObject({
      scope: notesScopeSchema,
      editLeaseId: id,
      document: noteDocumentSchema,
    }),
  },
  'notes.saveDocument': {
    request: z.strictObject({
      surface: base.surface,
      editLeaseId: id,
      command: saveNoteCommandSchema,
    }),
    result: saveNoteResultSchema,
  },
  'notes.getProblemNotes': {
    request: z.strictObject(base),
    result: z.strictObject({
      document: noteDocumentSchema,
      scope: notesScopeSchema,
      collectionRevision: z.number().int().nonnegative(),
      savedAiNotes: z.array(savedAiNoteRecordSchema),
    }),
  },
  'notes.listSubmissions': {
    request: z.strictObject({
      ...base,
      limit: z.union([z.literal(3), z.literal(50)]).default(3),
      cursor: notesCursorSchema.optional(),
    }),
    result: z.strictObject({
      items: z.array(submissionMetadataSchema),
      nextCursor: notesCursorSchema.nullable(),
    }),
  },
  'notes.getSubmission': {
    request: z.strictObject({ ...base, submissionId: id }),
    result: z
      .strictObject({
        submission: submissionRecordSchema,
        code: z.string().nullable(),
      })
      .nullable(),
  },
  'notes.getAssessment': {
    request: z.strictObject({ ...base, assessmentId: id }),
    result: z
      .strictObject({
        assessment: assessmentRecordSchema,
        feedback: codeFeedbackSchema,
        implementation: codeImplementationSchema.nullable(),
      })
      .nullable(),
  },
  'notes.setSavedAiNote': {
    request: z.strictObject({
      surface: base.surface,
      editLeaseId: id,
      command: savedAiCommandSchema,
    }),
    result: savedAiResultSchema,
  },
} as const
export type NotesMethod = keyof typeof notesRuntimeSchemas
export type NotesRequest<M extends NotesMethod> = z.input<
  (typeof notesRuntimeSchemas)[M]['request']
>
export type NotesResult<M extends NotesMethod> = z.infer<
  (typeof notesRuntimeSchemas)[M]['result']
>
