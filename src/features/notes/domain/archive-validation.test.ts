import { describe, expect, it } from 'vitest'
import {
  assertArchiveReferences,
  emptyNotesArchive,
} from './archive-validation'
import { notesArchiveSchema } from './notes-records'
import { makeNotesArchive, makeNotesPayload } from '../testing/notes-fixtures'

describe('retained learning archive validation', () => {
  it('creates fresh empty archives', async () => {
    const first = emptyNotesArchive()
    expect(first).toEqual({
      formatVersion: 1,
      notes: [],
      submissions: [],
      assessments: [],
      savedAiNotes: [],
      payloads: [],
    })
    first.notes.push({
      problemSlug: 'two-sum',
      document: {
        formatVersion: 1,
        revision: 0,
        markdown: '',
        updatedAt: null,
      },
      savedAiCollectionRevision: 0,
    })
    expect(emptyNotesArchive().notes).toEqual([])
    await expect(
      assertArchiveReferences(emptyNotesArchive(), []),
    ).resolves.toBeUndefined()
  })
  it('accepts a complete retained archive with large verbatim submitted code', async () => {
    const archive = await makeNotesArchive()
    const body = '  // 🧠\n' + 'x'.repeat(40_000) + '\n'
    archive.payloads[0] = await makeNotesPayload(
      'submitted-code',
      body,
      'code-1',
    )
    expect(notesArchiveSchema.parse(archive).payloads[0]!.body).toBe(body)
    await expect(
      assertArchiveReferences(archive, ['two-sum']),
    ).resolves.toBeUndefined()
  })
  it('requires collection metadata for saved AI but not unsaved retained history', async () => {
    const archive = await makeNotesArchive()
    archive.notes = []
    await expect(
      assertArchiveReferences(archive, ['two-sum']),
    ).rejects.toThrow()
    archive.savedAiNotes = []
    await expect(
      assertArchiveReferences(archive, ['two-sum']),
    ).resolves.toBeUndefined()
    const membershipOnly = await makeNotesArchive()
    expect(membershipOnly.notes[0]!.document.markdown).toBe('')
    await expect(
      assertArchiveReferences(membershipOnly, ['two-sum']),
    ).resolves.toBeUndefined()
  })
  it('produces fresh deterministic fixture objects', async () => {
    const first = await makeNotesArchive()
    const second = await makeNotesArchive()
    expect(first).toEqual(second)
    first.submissions[0]!.observedAttemptIds.push('changed')
    expect(second.submissions[0]!.observedAttemptIds).toEqual(['attempt-1'])
  })
  it.each([
    'notes',
    'submissions',
    'assessments',
    'savedAiNotes',
    'payloads',
  ] as const)('rejects duplicate %s identities', async (key) => {
    const archive = await makeNotesArchive()
    archive[key].push(structuredClone(archive[key][0]!) as never)
    await expect(
      assertArchiveReferences(archive, ['two-sum']),
    ).rejects.toThrow()
  })
  it('rejects absent problems for every problem-owned record', async () => {
    for (const key of [
      'notes',
      'submissions',
      'assessments',
      'savedAiNotes',
    ] as const) {
      const archive = await makeNotesArchive()
      archive[key][0]!.problemSlug = 'missing'
      await expect(
        assertArchiveReferences(archive, ['two-sum']),
      ).rejects.toThrow()
    }
  })
  it('rejects dangling report, code and saved AI references', async () => {
    for (const key of [
      'codePayloadId',
      'feedbackPayloadId',
      'implementationPayloadId',
      'submissionId',
      'assessmentId',
    ] as const) {
      const archive = await makeNotesArchive()
      if (key === 'codePayloadId') archive.submissions[0]![key] = 'missing'
      else if (key === 'assessmentId') archive.savedAiNotes[0]![key] = 'missing'
      else archive.assessments[0]![key] = 'missing'
      await expect(
        assertArchiveReferences(archive, ['two-sum']),
      ).rejects.toThrow()
    }
  })
  it('rejects cross-problem assessment and saved AI ownership', async () => {
    for (const key of ['assessments', 'savedAiNotes'] as const) {
      const archive = await makeNotesArchive()
      archive[key][0]!.problemSlug = 'three-sum'
      await expect(
        assertArchiveReferences(archive, ['two-sum', 'three-sum']),
      ).rejects.toThrow()
    }
  })
  it('rejects incorrect payload kinds, byte lengths and digests', async () => {
    for (const patch of [
      { codePayloadId: 'feedback-1' },
      { codePayloadId: 'implementation-1' },
    ]) {
      const archive = await makeNotesArchive()
      Object.assign(archive.submissions[0]!, patch)
      await expect(
        assertArchiveReferences(archive, ['two-sum']),
      ).rejects.toThrow()
    }
    for (const patch of [{ byteLength: 1 }, { sha256: '0'.repeat(64) }]) {
      const archive = await makeNotesArchive()
      Object.assign(archive.payloads[0]!, patch)
      await expect(
        assertArchiveReferences(archive, ['two-sum']),
      ).rejects.toThrow()
    }
  })
  it('rejects unsupported report versions and unknown nested secrets', async () => {
    const archive = await makeNotesArchive()
    const invalid = structuredClone(archive) as unknown as {
      payloads: { body: unknown }[]
    }
    invalid.payloads[1]!.body = { version: 'leetcode-code-feedback-v2' }
    expect(notesArchiveSchema.safeParse(invalid).success).toBe(false)
    expect(
      notesArchiveSchema.safeParse({
        ...archive,
        assessments: [
          {
            ...archive.assessments[0]!,
            providerMetadata: {
              ...archive.assessments[0]!.providerMetadata,
              providerSecret: 'secret',
            },
          },
        ],
      }).success,
    ).toBe(false)
    await expect(
      assertArchiveReferences(invalid as never, ['two-sum']),
    ).rejects.toThrow()
  })
  it('bounds diagnostic values and records omitted field names without truncating code', async () => {
    const archive = await makeNotesArchive()
    const submission = archive.submissions[0]!
    expect(
      notesArchiveSchema.safeParse({
        ...archive,
        submissions: [
          {
            ...submission,
            diagnostics: {
              ...submission.diagnostics,
              errorMessage: 'x'.repeat(2001),
            },
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      notesArchiveSchema.safeParse({
        ...archive,
        submissions: [
          { ...submission, omittedDiagnostics: ['providerSecret'] },
        ],
      }).success,
    ).toBe(false)
    expect(
      notesArchiveSchema.safeParse({
        ...archive,
        submissions: [{ ...submission, host: 'https://leetcode.com' }],
      }).success,
    ).toBe(false)
    expect(
      notesArchiveSchema.safeParse({
        ...archive,
        submissions: [{ ...submission, submittedAt: 'invalid' }],
      }).success,
    ).toBe(false)
  })
})
