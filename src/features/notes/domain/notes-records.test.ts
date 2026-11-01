import { describe, expect, it } from 'vitest'
import {
  noteDocumentSchema,
  notesScopeSchema,
  noteTargetSchema,
  saveNoteCommandSchema,
  saveNoteResultSchema,
  savedAiCommandSchema,
  savedAiResultSchema,
  notesArchiveSchema,
} from './notes-records'

const command = () => ({
  commandId: 'save-1',
  problemSlug: 'two-sum',
  scope: { datasetToken: 'dataset-1', problemToken: 'problem-1' },
  target: { kind: 'problem' },
  expectedRevision: 0,
  markdown: '',
})
const document = () => ({
  formatVersion: 1,
  revision: 0,
  markdown: '',
  updatedAt: null,
})

describe('versioned note contracts', () => {
  it('accepts an empty first save and preserves Markdown verbatim without the AI input cap', () => {
    expect(saveNoteCommandSchema.parse(command())).toEqual(command())
    const markdown = '  # Notes\n' + 'a'.repeat(40_000) + '\n  '
    expect(
      saveNoteCommandSchema.parse({ ...command(), markdown }).markdown,
    ).toBe(markdown)
    expect(noteDocumentSchema.parse(document())).toEqual(document())
  })
  it('rejects negative revisions, invalid dates, unsupported formats and unknown fields', () => {
    expect(
      saveNoteCommandSchema.safeParse({ ...command(), expectedRevision: -1 })
        .success,
    ).toBe(false)
    expect(
      saveNoteCommandSchema.safeParse({
        ...command(),
        providerSecret: 'secret',
      }).success,
    ).toBe(false)
    for (const patch of [
      { revision: -1 },
      { formatVersion: 2 },
      { updatedAt: 'yesterday' },
      { extra: true },
    ]) {
      expect(
        noteDocumentSchema.safeParse({ ...document(), ...patch }).success,
      ).toBe(false)
    }
  })
  it('validates scope and reflection identity without trimming IDs', () => {
    expect(
      notesScopeSchema.safeParse({ datasetToken: ' ', problemToken: 'p' })
        .success,
    ).toBe(false)
    expect(
      notesScopeSchema.safeParse({
        datasetToken: 'd'.repeat(161),
        problemToken: 'p',
      }).success,
    ).toBe(false)
    expect(
      notesScopeSchema.safeParse({ ...command().scope, extra: 1 }).success,
    ).toBe(false)
    expect(
      noteTargetSchema.parse({ kind: 'reflection', submissionId: 's-1' }),
    ).toEqual({ kind: 'reflection', submissionId: 's-1' })
    expect(noteTargetSchema.safeParse({ kind: 'reflection' }).success).toBe(
      false,
    )
    expect(
      noteTargetSchema.safeParse({ kind: 'problem', submissionId: 's-1' })
        .success,
    ).toBe(false)
  })
  it('keeps save results discriminated and strict', () => {
    for (const result of [
      { status: 'saved', commandId: 'save-1', document: document() },
      { status: 'conflict', document: document() },
      { status: 'stale-scope' },
    ])
      expect(saveNoteResultSchema.parse(result)).toEqual(result)
    expect(
      saveNoteResultSchema.safeParse({
        status: 'stale-scope',
        document: document(),
      }).success,
    ).toBe(false)
  })
  it('separates saved AI membership revision from original applied revision on replay', () => {
    const savedCommand = {
      commandId: 'save-ai-1',
      problemSlug: 'two-sum',
      scope: command().scope,
      assessmentId: 'assessment-1',
      expectedCollectionRevision: 0,
      saved: true,
    }
    expect(savedAiCommandSchema.parse(savedCommand)).toEqual(savedCommand)
    expect(
      savedAiCommandSchema.safeParse({
        ...savedCommand,
        expectedCollectionRevision: -1,
      }).success,
    ).toBe(false)
    expect(
      savedAiCommandSchema.safeParse({ ...savedCommand, providerSecret: 'x' })
        .success,
    ).toBe(false)
    for (const result of [
      {
        status: 'saved',
        commandId: 'save-ai-1',
        appliedRevision: 1,
        collectionRevision: 2,
        saved: false,
      },
      { status: 'conflict', collectionRevision: 2 },
      { status: 'stale-scope' },
    ])
      expect(savedAiResultSchema.parse(result)).toEqual(result)
    expect(
      savedAiResultSchema.safeParse({
        status: 'saved',
        commandId: 'c',
        collectionRevision: 1,
        saved: true,
      }).success,
    ).toBe(false)
  })
  it('rejects unsupported archives and operational or credential records', () => {
    const archive = {
      formatVersion: 1,
      notes: [],
      submissions: [],
      assessments: [],
      savedAiNotes: [],
      payloads: [],
    }
    expect(notesArchiveSchema.parse(archive)).toEqual(archive)
    for (const patch of [
      { formatVersion: 2 },
      { credentials: [] },
      { generations: [] },
      { receipts: [] },
      { leases: [] },
    ])
      expect(
        notesArchiveSchema.safeParse({ ...archive, ...patch }).success,
      ).toBe(false)
  })
})
