import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb'
import { expect, it, vi, afterEach } from 'vitest'
import { createLocalIdbStore } from '@/platform/db/local-idb'
import { createArchiveGenerationRepository } from './archive-generation-repository'
import { makeNotesArchive, makeNotesPayload } from '../testing/notes-fixtures'
import { assertArchiveReferences } from '../domain/archive-validation'
import { createSnapshotIdbStore } from '@/platform/db/snapshot-idb'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('copies metadata in resumable batches, reuses bodies, preserves non-target scopes and collection revisions', async () => {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const local = createLocalIdbStore(new IDBFactory())
  await local.transact(
    ['problemNotes', 'problemScopes', 'payloads'],
    'readwrite',
    (s, done) => {
      for (let n = 0; n < 1001; n++) {
        const slug = `problem-${n}`
        s.problemNotes.put(
          {
            problemSlug: slug,
            savedAiCollectionRevision: n,
            document: { markdown: slug },
          },
          ['old', slug],
        )
        s.problemScopes.put({ datasetToken: 'dataset', problemToken: slug }, [
          'old',
          slug,
        ])
      }
      s.payloads.put({ body: 'immutable code' }, 'code')
      done(undefined)
    },
  )
  await createArchiveGenerationRepository(local).stageArchiveGeneration({
    sourceGeneration: 'old',
    nextGeneration: 'new',
    excludedProblemSlugs: ['problem-0'],
  })
  expect(await local.readRecord(['archive-generation', 'new'])).toMatchObject({
    status: 'ready',
  })
  await local.transact(
    ['problemNotes', 'problemScopes', 'payloads'],
    'readonly',
    (s, done) => {
      const excluded = s.problemNotes.get(['new', 'problem-0'])
      excluded.onsuccess = () => expect(excluded.result).toBeUndefined()
      const note = s.problemNotes.get(['new', 'problem-1'])
      note.onsuccess = () =>
        expect(
          (note.result as { savedAiCollectionRevision: number })
            .savedAiCollectionRevision,
        ).toBe(1)
      const scope = s.problemScopes.get(['new', 'problem-1'])
      scope.onsuccess = () =>
        expect(scope.result).toEqual({
          datasetToken: 'dataset',
          problemToken: 'problem-1',
        })
      const count = s.payloads.count()
      count.onsuccess = () => {
        expect(count.result).toBe(1)
        done(undefined)
      }
    },
  )
})

it('resumes from the last durable cursor after a mid-copy transaction abort', async () => {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const factory = new IDBFactory()
  const local = createLocalIdbStore(factory)
  await local.transact(['problemNotes'], 'readwrite', (s, done) => {
    for (let n = 0; n < 1001; n++)
      s.problemNotes.put(
        { problemSlug: `p-${n}`, document: { markdown: `body-${n}` } },
        ['old', `p-${n}`],
      )
    done(undefined)
  })
  const put = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put')!
    .value as typeof IDBObjectStore.prototype.put
  let writes = 0
  const fault = vi
    .spyOn(IDBObjectStore.prototype, 'put')
    .mockImplementation(function (this: globalThis.IDBObjectStore, ...args) {
      const request = put.apply(this, args)
      if (
        this.name === 'problemNotes' &&
        Array.isArray(args[1]) &&
        args[1][0] === 'new' &&
        ++writes === 501
      )
        this.transaction.abort()
      return request
    })
  const input = {
    sourceGeneration: 'old',
    nextGeneration: 'new',
    excludedProblemSlugs: [],
  }
  await expect(
    createArchiveGenerationRepository(local).stageArchiveGeneration(input),
  ).rejects.toThrow()
  fault.mockRestore()
  const reopened = createLocalIdbStore(factory)
  expect(
    await reopened.readRecord(['archive-generation', 'new']),
  ).toMatchObject({
    status: 'staging',
    storeIndex: 0,
  })
  await createArchiveGenerationRepository(reopened).stageArchiveGeneration(
    input,
  )
  await reopened.transact(['problemNotes'], 'readonly', (s, done) => {
    const count = s.problemNotes.count(IDBKeyRange.bound(['new'], ['new', []]))
    count.onsuccess = () => {
      expect(count.result).toBe(1001)
      done(undefined)
    }
  })
})
it('stages an imported archive without changing active data or duplicating immutable bodies', async () => {
  const local = createLocalIdbStore(new IDBFactory())
  const payload = await makeNotesPayload('submitted-code', 'return 42', 'code')
  const archive = {
    formatVersion: 1 as const,
    notes: [],
    submissions: [],
    assessments: [],
    savedAiNotes: [],
    payloads: [payload],
  }
  const repository = createArchiveGenerationRepository(local)
  await repository.stageImportedArchive({ nextGeneration: 'imported', archive })
  await repository.stageImportedArchive({ nextGeneration: 'imported', archive })
  expect(await local.readHead()).toBeNull()
  await local.transact(['payloads'], 'readonly', (s, done) => {
    const request = s.payloads.get('code')
    request.onsuccess = () => {
      expect((request.result as { body: string }).body).toBe('return 42')
      done(undefined)
    }
  })
  await expect(
    repository.stageImportedArchive({
      nextGeneration: 'another',
      archive: {
        ...archive,
        payloads: [await makeNotesPayload('submitted-code', 'changed', 'code')],
      },
    }),
  ).rejects.toThrow('collision')
  expect(
    await local.readRecord(['archive-generation', 'another']),
  ).toBeUndefined()
})

it('reads only generation-reachable bodies, excluding prior recovery and orphan payloads', async () => {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const local = createLocalIdbStore(new IDBFactory())
  const { submissionDiagnosticsSchema } =
    await import('../domain/notes-records')
  const diagnostics = submissionDiagnosticsSchema.parse(
    Object.fromEntries(
      Object.keys(submissionDiagnosticsSchema.shape).map((key) => [key, null]),
    ),
  )
  const row = {
    id: 'submission',
    problemSlug: 'two-sum',
    observedAttemptIds: [],
    externalSubmissionId: null,
    host: 'leetcode.com' as const,
    submittedAt: '2026-10-31T12:00:00.000Z',
    status: 'accepted' as const,
    statusText: 'Accepted',
    language: 'TypeScript',
    completeness: 'complete' as const,
    codePayloadId: 'active-code',
    diagnostics,
    omittedDiagnostics: [],
    reflection: {
      formatVersion: 1 as const,
      revision: 0,
      markdown: '',
      updatedAt: null,
    },
  }
  const archive = {
    formatVersion: 1 as const,
    notes: [],
    submissions: [row],
    assessments: [],
    savedAiNotes: [],
    payloads: [
      await makeNotesPayload('submitted-code', 'active body', 'active-code'),
    ],
  }
  const repository = createArchiveGenerationRepository(local)
  await repository.stageImportedArchive({ nextGeneration: 'active', archive })
  const recoveryPayload = await makeNotesPayload(
    'submitted-code',
    'private prior body',
    'recovery-code',
  )
  const orphanPayload = await makeNotesPayload(
    'submitted-code',
    'orphan body',
    'orphan-code',
  )
  await local.transact(['payloads', 'submissions'], 'readwrite', (s, done) => {
    s.payloads.put(recoveryPayload, 'recovery-code')
    s.payloads.put(orphanPayload, 'orphan-code')
    s.submissions.put({ ...row, codePayloadId: 'recovery-code' }, [
      'recovery',
      'submission',
    ])
    done(undefined)
  })
  const exported = await repository.readArchiveGeneration('active')
  expect(exported).toEqual(archive)
  expect(JSON.stringify(exported)).not.toContain('private prior body')
  expect(JSON.stringify(exported)).not.toContain('orphan body')
  expect(
    (await repository.readArchiveGeneration('recovery')).payloads.map(
      (row) => row.body,
    ),
  ).toEqual(['private prior body'])
})

it.each([
  'duplicate-notes',
  'duplicate-submissions',
  'duplicate-assessments',
  'duplicate-savedAiNotes',
  'duplicate-payloads',
  'missing-code',
  'missing-report',
  'missing-implementation',
  'missing-submission',
  'missing-saved-assessment',
  'wrong-kind',
  'cross-problem-report',
  'cross-problem-saved',
  'missing-collection',
  'length',
  'digest',
  'external-alias',
  'attempt-alias',
])(
  'rejects %s before any staging write and preserves the active and recovery roots',
  async (fault) => {
    const factory = new IDBFactory()
    const local = createLocalIdbStore(factory)
    const snapshots = createSnapshotIdbStore(factory)
    await snapshots.commitSnapshot(new Uint8Array([1]), 'test', new Date())
    await snapshots.commitReplacement(new Uint8Array([2]), 'test', new Date(), {
      kind: 'restore',
      replacementId: 'baseline',
    })
    const active = await local.readHead()
    const recovery = await local.readRecord('recovery')
    const archive = await makeNotesArchive()
    if (fault.startsWith('duplicate-')) {
      const name = fault.slice('duplicate-'.length) as
        | 'notes'
        | 'submissions'
        | 'assessments'
        | 'savedAiNotes'
        | 'payloads'
      archive[name].push(structuredClone(archive[name][0]!) as never)
    } else if (fault === 'missing-code')
      archive.submissions[0]!.codePayloadId = 'missing'
    else if (fault === 'missing-report')
      archive.assessments[0]!.feedbackPayloadId = 'missing'
    else if (fault === 'missing-implementation')
      archive.assessments[0]!.implementationPayloadId = 'missing'
    else if (fault === 'missing-submission')
      archive.assessments[0]!.submissionId = 'missing'
    else if (fault === 'missing-saved-assessment')
      archive.savedAiNotes[0]!.assessmentId = 'missing'
    else if (fault === 'wrong-kind')
      archive.submissions[0]!.codePayloadId = 'feedback-1'
    else if (fault === 'cross-problem-report')
      archive.assessments[0]!.problemSlug = 'three-sum'
    else if (fault === 'cross-problem-saved')
      archive.savedAiNotes[0]!.problemSlug = 'three-sum'
    else if (fault === 'missing-collection') archive.notes = []
    else if (fault === 'external-alias' || fault === 'attempt-alias') {
      archive.submissions.push({
        ...structuredClone(archive.submissions[0]!),
        id: 'another-submission',
        externalSubmissionId: fault === 'external-alias' ? '123' : null,
      })
      if (fault === 'external-alias')
        archive.submissions[1]!.observedAttemptIds = []
    } else if (fault === 'length') archive.payloads[0]!.byteLength = 999
    else archive.payloads[0]!.sha256 = '0'.repeat(64)
    const transact = vi.spyOn(local, 'transact')
    await expect(
      createArchiveGenerationRepository(local).stageImportedArchive({
        nextGeneration: 'invalid',
        archive,
      }),
    ).rejects.toThrow()
    expect(transact).not.toHaveBeenCalled()
    transact.mockRestore()
    expect(await local.readHead()).toEqual(active)
    expect(await local.readRecord('recovery')).toEqual(recovery)
    expect(
      await local.readRecord(['archive-generation', 'invalid']),
    ).toBeUndefined()
  },
)
it('reuses validated stored payloads regardless of object property order, including report bodies', async () => {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const local = createLocalIdbStore(new IDBFactory())
  const archive = await makeNotesArchive()
  const retainedPayloads = await Promise.all(
    archive.payloads.map((payload) =>
      payload.kind === 'submitted-code'
        ? Promise.resolve(payload)
        : makeNotesPayload(
            payload.kind,
            Object.fromEntries(
              Object.entries(payload.body).reverse(),
            ) as typeof payload.body,
            payload.id,
          ),
    ),
  )
  await local.transact(['payloads'], 'readwrite', (s, done) => {
    for (const payload of retainedPayloads)
      s.payloads.put(
        Object.fromEntries(Object.entries(payload).reverse()),
        payload.id,
      )
    done(undefined)
  })
  const repository = createArchiveGenerationRepository(local)
  await repository.stageImportedArchive({
    nextGeneration: 'canonical',
    archive,
  })
  const exported = await repository.readArchiveGeneration('canonical')
  await expect(
    assertArchiveReferences(exported, ['two-sum']),
  ).resolves.toBeUndefined()
  expect(exported).toEqual({ ...archive, payloads: retainedPayloads })
})
it('preserves valid original report serialization rather than schema-normalizing its digest', async () => {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const local = createLocalIdbStore(new IDBFactory())
  const archive = await makeNotesArchive()
  const report = archive.payloads.find((p) => p.kind === 'feedback-v1')!
  if (report.kind !== 'feedback-v1') throw new Error('missing fixture report')
  const reordered = Object.fromEntries(
    Object.entries(report.body).reverse(),
  ) as typeof report.body
  reordered.summary = ` ${reordered.summary} `
  archive.payloads[archive.payloads.indexOf(report)] = await makeNotesPayload(
    'feedback-v1',
    reordered,
    report.id,
  )
  const repository = createArchiveGenerationRepository(local)
  await repository.stageImportedArchive({ nextGeneration: 'original', archive })
  const exported = await repository.readArchiveGeneration('original')
  await expect(
    assertArchiveReferences(exported, ['two-sum']),
  ).resolves.toBeUndefined()
  expect(
    JSON.stringify(exported.payloads.find((p) => p.id === report.id)!.body),
  ).toBe(JSON.stringify(reordered))
})

it('stages canonical validated metadata while retaining original digest-bound payload bodies', async () => {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const local = createLocalIdbStore(new IDBFactory())
  const archive = await makeNotesArchive()
  archive.notes[0]!.problemSlug = ' two-sum '
  archive.assessments[0]!.problemSlug = '  two-sum '
  archive.assessments[0]!.providerMetadata.model = ' test-model '
  const repository = createArchiveGenerationRepository(local)
  await repository.stageImportedArchive({
    nextGeneration: 'normalized',
    archive,
  })
  const exported = await repository.readArchiveGeneration('normalized')
  expect(exported.notes[0]!.problemSlug).toBe('two-sum')
  expect(exported.assessments[0]!.problemSlug).toBe('two-sum')
  await expect(
    assertArchiveReferences(exported, ['two-sum']),
  ).resolves.toBeUndefined()
})
