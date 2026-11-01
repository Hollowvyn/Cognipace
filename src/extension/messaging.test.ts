import { describe, expect, it } from 'vitest'
import { notesRuntimeSchemas, protocolMethodNames } from './messaging'
import {
  makeNotesArchive,
  makeNoteDocument,
  makeNotesFeedback,
  makeNotesImplementation,
} from '@/features/notes/testing/notes-fixtures'

describe('registered Notes protocol schemas', () => {
  it('parses every request and result and rejects unknown keys and spoofed surfaces', async () => {
    const archive = await makeNotesArchive()
    const scope = { datasetToken: 'dataset', problemToken: 'problem' }
    const base = { surface: 'dashboard', problemSlug: 'two-sum' }
    const document = makeNoteDocument()
    const command = {
      commandId: 'command',
      problemSlug: 'two-sum',
      scope,
      target: { kind: 'problem' },
      expectedRevision: 0,
      markdown: '',
    }
    const savedCommand = {
      commandId: 'saved-command',
      problemSlug: 'two-sum',
      scope,
      assessmentId: 'assessment-1',
      expectedCollectionRevision: 0,
      saved: true,
    }
    const row = archive.submissions[0]!
    const metadata = Object.fromEntries(
      Object.entries(row).filter(
        ([key]) =>
          ![
            'reflection',
            'diagnostics',
            'observedAttemptIds',
            'codePayloadId',
          ].includes(key),
      ),
    )
    const samples = {
      'notes.getArchiveUsage': {
        request: { surface: 'dashboard' },
        result: {
          active: {
            notes: 1,
            submissions: 2,
            assessments: 3,
            savedAiNotes: 1,
            payloads: 3,
            logicalPayloadBytes: 120,
          },
          recoveryLogicalPayloadBytes: 40,
          technicalRecords: 6,
          browserStorageEstimate: { usageBytes: 1000, quotaBytes: 2000 },
        },
      },
      'notes.openEditor': {
        request: { ...base, target: { kind: 'problem' } },
        result: { scope, editLeaseId: 'lease', document },
      },
      'notes.saveDocument': {
        request: { surface: 'dashboard', editLeaseId: 'lease', command },
        result: { status: 'saved', commandId: 'command', document },
      },
      'notes.getProblemNotes': {
        request: base,
        result: { scope, document, collectionRevision: 0, savedAiNotes: [] },
      },
      'notes.listSubmissions': {
        request: { ...base, limit: 3 },
        result: {
          items: [metadata],
          nextCursor: {
            problemSlug: 'two-sum',
            scope,
            submittedAt: row.submittedAt,
            id: row.id,
          },
        },
      },
      'notes.getSubmission': {
        request: { ...base, submissionId: 'submission-1' },
        result: { submission: row, code: 'code' },
      },
      'notes.getAssessment': {
        request: { ...base, assessmentId: 'assessment-1' },
        result: {
          assessment: archive.assessments[0],
          feedback: makeNotesFeedback(),
          implementation: makeNotesImplementation(),
        },
      },
      'notes.setSavedAiNote': {
        request: {
          surface: 'dashboard',
          editLeaseId: 'lease',
          command: savedCommand,
        },
        result: {
          status: 'saved',
          commandId: 'saved-command',
          appliedRevision: 1,
          collectionRevision: 1,
          saved: true,
        },
      },
    }
    for (const method of Object.keys(notesRuntimeSchemas) as Array<
      keyof typeof notesRuntimeSchemas
    >) {
      expect(protocolMethodNames).toContain(method)
      const schema = notesRuntimeSchemas[method]
      const sample = samples[method]
      expect(schema.request.safeParse(sample.request).success).toBe(true)
      expect(schema.result.safeParse(sample.result).success).toBe(true)
      expect(
        schema.request.safeParse({ ...sample.request, extra: true }).success,
      ).toBe(false)
      expect(
        schema.result.safeParse({ ...sample.result, extra: true }).success,
      ).toBe(false)
      for (const surface of ['popup', 'background', 'fake'])
        expect(
          schema.request.safeParse({ ...sample.request, surface }).success,
        ).toBe(false)
    }
    expect(
      notesRuntimeSchemas['notes.openEditor'].request.safeParse({
        ...base,
        target: { kind: 'reflection', submissionId: '' },
      }).success,
    ).toBe(false)
    expect(
      notesRuntimeSchemas['notes.getSubmission'].request.safeParse({
        ...base,
        submissionId: '',
      }).success,
    ).toBe(false)
    expect(
      notesRuntimeSchemas['notes.getAssessment'].request.safeParse({
        ...base,
        assessmentId: 1,
      }).success,
    ).toBe(false)
    expect(
      notesRuntimeSchemas['notes.listSubmissions'].request.safeParse({
        ...base,
        limit: 4,
      }).success,
    ).toBe(false)
    expect(
      notesRuntimeSchemas['notes.saveDocument'].request.safeParse({
        surface: 'dashboard',
        editLeaseId: 'lease',
        command: { ...command, scope: undefined },
      }).success,
    ).toBe(false)
    expect(
      notesRuntimeSchemas['notes.saveDocument'].result.safeParse({
        status: 'saved',
        commandId: 'c',
        document: { ...document, formatVersion: 2 },
      }).success,
    ).toBe(false)
    expect(
      notesRuntimeSchemas['notes.getProblemNotes'].result.safeParse({
        scope,
        document,
        collectionRevision: 0,
        savedAiNotes: [
          { ...archive.savedAiNotes[0], feedback: makeNotesFeedback() },
        ],
      }).success,
    ).toBe(false)
  })
})
