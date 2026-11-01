import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, expect, it, vi } from 'vitest'
import type { LocalIdbStore } from '@/platform/db/local-store-types'

const runtime = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (message: { data: unknown; sender: unknown }) => unknown
  >(),
  send: vi.fn(async () => {}),
  activeDocument: 'original-document',
}))
vi.mock('@webext-core/messaging', () => ({
  defineExtensionMessaging: () => ({
    onMessage: (
      name: string,
      handler: (message: { data: unknown; sender: unknown }) => unknown,
    ) => {
      runtime.handlers.set(name, handler)
      return () => {}
    },
    sendMessage: runtime.send,
  }),
}))
// Unrelated alarm notification startup is outside the replacement lifecycle.
vi.mock('./due-notification', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./due-notification')>()),
  createDueNotification: () => ({
    registerJobs: () => {},
    handleStartup: async () => {},
    onSettingsChanged: async () => {},
  }),
}))
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      getContexts: (filter: { documentIds: string[] }) =>
        Promise.resolve(
          filter.documentIds.includes(runtime.activeDocument)
            ? [
                {
                  contextId: 'active-dashboard-context',
                  contextType: 'TAB',
                  documentId: runtime.activeDocument,
                  documentOrigin: 'chrome-extension://test',
                  documentUrl: 'chrome-extension://test/dashboard.html',
                  frameId: 0,
                  tabId: 1,
                  windowId: 1,
                  incognito: false,
                },
              ]
            : [],
        ),
    },
    alarms: {
      onAlarm: { addListener: () => {}, removeListener: () => {} },
      create: async () => {},
      clear: () => Promise.resolve(true),
      get: () => Promise.resolve(undefined),
    },
    notifications: { create: async () => {} },
    tabs: { query: () => Promise.resolve([]) },
  },
}))
const sender = {
  url: 'chrome-extension://test/dashboard.html',
  documentId: 'original-document',
}
const message = (
  method: string,
  data: Record<string, unknown> = {},
  actualSender = { ...sender, documentId: runtime.activeDocument },
) =>
  runtime.handlers.get(method)!({
    data: { surface: 'dashboard', ...data },
    sender: actualSender,
  })
let resetDb: (() => void) | undefined

afterEach(() => {
  resetDb?.()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  runtime.handlers.clear()
  vi.resetModules()
})

async function boot() {
  const { registerBackgroundHandlers } = await import('./register-handlers')
  registerBackgroundHandlers()
}
async function fixture() {
  runtime.activeDocument = sender.documentId
  const storage = new Map<string, unknown>()
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: (keys: string[] | string) =>
          Promise.resolve(
            Object.fromEntries(
              (Array.isArray(keys) ? keys : [keys])
                .filter((key) => storage.has(key))
                .map((key) => [key, storage.get(key)]),
            ),
          ),
        set: (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values))
            storage.set(key, value)
          return Promise.resolve()
        },
        remove: (keys: string[]) => {
          for (const key of keys) storage.delete(key)
          return Promise.resolve()
        },
      },
    },
  })
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected HTTP')
    }),
  )
  const instance = await import('@/platform/db/instance')
  resetDb = instance.resetAppDbForTesting
  await (await import('./app-db')).getBackgroundDb()
  const local = (await import('@/platform/db/local-idb')).createLocalIdbStore(
    indexedDB,
  )
  await boot()
  return { local, instance }
}
async function restart() {
  runtime.activeDocument = 'replacement-dashboard-document'
  resetDb?.()
  runtime.handlers.clear()
  vi.resetModules()
  resetDb = (await import('@/platform/db/instance')).resetAppDbForTesting
  await boot()
}
async function acceptedSource() {
  const { createFrozenV6BackupFixture } =
    await import('@/features/backup/testing/backup-v6-fixture')
  const { makeNotesArchive } =
    await import('@/features/notes/testing/notes-fixtures')
  return {
    ...createFrozenV6BackupFixture(),
    schemaVersion: 7,
    notesArchive: await makeNotesArchive(),
  }
}
async function transfer(input: unknown) {
  const { transferDigest, splitUtf8Text } =
    await import('@/features/backup/api/backup-transfer-contracts')
  const session = (await message('backup.beginTransfer', {
    direction: 'import',
    requestId: crypto.randomUUID(),
  })) as { sessionId: string; ownerToken: string }
  const handle = {
    sessionId: session.sessionId,
    ownerToken: session.ownerToken,
  }
  const text = JSON.stringify(input),
    chunks = [...splitUtf8Text(text)]
  for (const [sequence, text] of chunks.entries())
    await message('backup.appendTransferChunk', { ...handle, sequence, text })
  const finish = {
    ...handle,
    chunks: chunks.length,
    digest: await transferDigest(text),
  }
  const preview = (await message('backup.finishTransfer', finish)) as {
    confirmationToken: string
  }
  return { finish, token: preview.confirmationToken }
}

it.each([
  [7, 'archive'],
  [7, 'scopes'],
  [6, 'scopes'],
] as const)(
  'registered Retry resumes literal v%s restore after worker death during %s from a new dashboard without repeated SQL',
  async (version, cutoff) => {
    const { local } = await fixture()
    const input =
      version === 6
        ? (
            await import('@/features/backup/testing/backup-v6-fixture')
          ).createFrozenV6BackupFixture()
        : await acceptedSource()
    const accepted = await (
      await import('@/features/backup/domain/backup-preflight')
    ).prepareFullBackupRestore(input)
    expect(input.schemaVersion).toBe(version)
    const selected = await transfer(input)
    const backup = await import('@/features/backup/server/backup-service')
    const restore = vi.spyOn(backup, 'restorePreparedFullBackup')
    const archiveModule =
      await import('@/features/notes/data/archive-generation-repository')
    const actual = archiveModule.createArchiveGenerationRepository
    const fault = vi
      .spyOn(archiveModule, 'createArchiveGenerationRepository')
      .mockImplementation((store) => ({
        ...actual(store),
        [cutoff === 'archive' ? 'stageImportedArchive' : 'stageProblemScopes']:
          () => Promise.reject(new Error('worker cutoff')),
      }))
    const before = await local.readHead()
    expect(
      await message('backup.finishTransfer', {
        ...selected.finish,
        confirmationToken: selected.token,
      }),
    ).toMatchObject({ status: 'persistence-pending', kind: 'restore' })
    const { preparedCompositeCandidateSchema } =
      await import('@/platform/db/composite-publication')
    const candidate = preparedCompositeCandidateSchema.parse(
      await local.readRecord(['composite-candidate', selected.token]),
    )
    expect(candidate.resume?.summary).toEqual(accepted.summary)
    expect(candidate.resume?.recipe).toMatchObject({
      inputDigest: accepted.inputDigest,
      sourceSchemaVersion: version,
      sourceIdentity: JSON.stringify([
        'dashboard-transfer',
        sender.documentId,
        selected.finish.sessionId,
      ]),
    })
    expect(candidate.descriptor.commandFingerprint).toBe(
      JSON.stringify(['restore', accepted.inputDigest]),
    )
    expect(
      await local.readRecord(['replacement-source', selected.token]),
    ).toEqual(input)
    const core = await local.readCore(candidate.descriptor.coreSnapshotId)
    expect(restore).toHaveBeenCalledTimes(1)
    expect(await local.readRecord('replacement-prepublication')).toBeDefined()
    expect(await local.readRecord('replacement-continuation')).toBeUndefined()
    fault.mockRestore()
    const transferOwner =
      await import('@/features/backup/server/backup-transfer-service')
    const originalSession = await local.readRecord(
      transferOwner.transferSessionKey(selected.finish.sessionId),
    )
    await restart()
    expect(runtime.activeDocument).not.toBe(sender.documentId)
    const { browser } = await import('wxt/browser')
    const { createTransferOwnerInventory } =
      await import('./scheduler/transfer-owner-inventory')
    const ownerIsAbsent = createTransferOwnerInventory((filter) =>
      browser.runtime.getContexts(filter),
    )
    expect(await ownerIsAbsent(sender.documentId)).toBe(true)
    expect(await ownerIsAbsent(runtime.activeDocument)).toBe(false)
    await (
      await import('@/features/backup/server/backup-transfer-service')
    ).collectBackupTransferTechnicalBatch(local, { ownerIsAbsent })
    const handle = {
      sessionId: selected.finish.sessionId,
      ownerToken: selected.finish.ownerToken,
    }
    const broadcasts = runtime.send.mock.calls.length
    for (const [method, data] of [
      ['backup.readTransferChunk', { ...handle, sequence: 0 }],
      [
        'backup.finishTransfer',
        { ...selected.finish, confirmationToken: selected.token },
      ],
      ['backup.cancelTransfer', handle],
    ] as const)
      await expect(message(method, data)).rejects.toThrow(
        'Transfer owner capability does not match this dashboard document.',
      )
    expect(runtime.send.mock.calls.length).toBe(broadcasts)
    expect(
      await local.readRecord(
        transferOwner.transferSessionKey(selected.finish.sessionId),
      ),
    ).toEqual(originalSession)
    const app = await import('./app-db')
    const opens = vi.spyOn(app, 'getBackgroundDb')
    const get = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'get',
    )!.value as typeof IDBObjectStore.prototype.get
    const bodyReads = vi
      .spyOn(IDBObjectStore.prototype, 'get')
      .mockImplementation(function (this: IDBObjectStore, ...args) {
        if (this.name === 'coreSnapshots' && typeof args[0] === 'string')
          throw new Error('Status hydrated a core body')
        if (
          this.name === 'records' &&
          Array.isArray(args[0]) &&
          args[0][0] === 'replacement-source'
        )
          throw new Error('Status hydrated a source body')
        return get.apply(this, args)
      })
    const pendingStatus = await message('backup.getPendingReplacement')
    expect(pendingStatus).toMatchObject({
      status: 'persistence-pending',
      kind: 'restore',
      summary: accepted.summary,
    })
    expect(JSON.stringify(pendingStatus)).not.toContain(
      selected.finish.ownerToken,
    )
    expect(JSON.stringify(pendingStatus)).not.toContain(sender.documentId)
    expect(opens).not.toHaveBeenCalled()
    bodyReads.mockRestore()
    expect(await local.readHead()).toEqual(before)
    await expect(message('notes.getArchiveUsage')).rejects.toThrow(
      'still needs saving',
    )
    await expect(message('settings.toggleStudyMode')).rejects.toThrow(
      'still needs saving',
    )
    await expect(
      message('backup.beginTransfer', {
        direction: 'export',
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow('still needs saving')
    const resumedBackup =
      await import('@/features/backup/server/backup-service')
    const repeatedSql = vi.spyOn(resumedBackup, 'restorePreparedFullBackup')
    expect(await message('backup.retryPendingReplacement')).toMatchObject({
      status: 'durable',
      kind: 'restore',
      syncMetadataPending: false,
    })
    expect(repeatedSql).not.toHaveBeenCalled()
    expect(await local.readHead()).toMatchObject({
      coreSnapshotId: candidate.descriptor.coreSnapshotId,
      archiveGeneration: candidate.descriptor.archiveGeneration,
      datasetToken: candidate.descriptor.datasetToken,
      revision: before!.revision + 1,
    })
    expect(await local.readCore(candidate.descriptor.coreSnapshotId)).toEqual(
      core,
    )
    expect(await local.readRecord('replacement-prepublication')).toBeUndefined()
    const scopes = await (
      await import('@/features/notes/data/archive-generation-repository')
    )
      .createArchiveGenerationRepository(local)
      .readProblemScopes(candidate.descriptor.archiveGeneration)
    expect(scopes).toEqual(
      candidate.descriptor.initializedProblemScopes!.map((scope) => ({
        ...scope,
        datasetToken: candidate.descriptor.datasetToken,
      })),
    )
    expect(await message('backup.getPendingReplacement')).toEqual({
      status: 'idle',
    })
    expect(
      await local.readRecord(['composite-candidate', selected.token]),
    ).toEqual(candidate)
    expect(
      await local.readRecord(['replacement-source', selected.token]),
    ).toEqual(input)
    expect(
      await local.readRecord(
        transferOwner.transferSessionKey(selected.finish.sessionId),
      ),
    ).toMatchObject({
      documentOwner: sender.documentId,
      ownerToken: selected.finish.ownerToken,
      status: 'complete',
    })
    expect(fetch).not.toHaveBeenCalled()
  },
)

async function interruptRestore(local: LocalIdbStore) {
  const input = await acceptedSource()
  const selected = await transfer(input)
  const owner =
    await import('@/features/notes/data/archive-generation-repository')
  const actual = owner.createArchiveGenerationRepository
  const fault = vi
    .spyOn(owner, 'createArchiveGenerationRepository')
    .mockImplementation((store) => ({
      ...actual(store),
      stageImportedArchive: () => Promise.reject(new Error('cutoff')),
    }))
  expect(
    await message('backup.finishTransfer', {
      ...selected.finish,
      confirmationToken: selected.token,
    }),
  ).toMatchObject({ status: 'persistence-pending' })
  fault.mockRestore()
  const raw = (await local.readRecord([
    'composite-candidate',
    selected.token,
  ])) as {
    descriptor: { coreSnapshotId: string; replacementId: string }
    resume: unknown
  }
  return { input, selected, raw }
}
it.each([
  'missing-source',
  'missing-core',
  'old-base',
  'missing-pointer',
  'malformed',
  'preview-identity',
] as const)(
  'registered status and Retry fail closed for %s after restart',
  async (fault) => {
    const { local } = await fixture()
    const { selected, raw } = await interruptRestore(local)
    const before = await local.readHead()
    await local.transact(
      ['records', 'coreSnapshots'],
      'readwrite',
      (s, done) => {
        if (fault === 'missing-source')
          s.records.delete(['replacement-source', selected.token])
        if (fault === 'missing-core')
          s.coreSnapshots.delete(raw.descriptor.coreSnapshotId)
        if (fault === 'old-base')
          s.records.put({ ...before, revision: before!.revision + 1 }, 'active')
        if (fault === 'missing-pointer')
          s.records.delete('replacement-prepublication')
        if (fault === 'malformed')
          s.records.put({ broken: true }, [
            'composite-candidate',
            selected.token,
          ])
        if (fault === 'preview-identity') {
          const request = s.records.get(['backup-preview', selected.token])
          request.onsuccess = () =>
            s.records.put(
              { ...request.result, sourceIdentity: 'different-owner' },
              ['backup-preview', selected.token],
            )
        }
        done(undefined)
      },
    )
    await restart()
    await expect(message('backup.getPendingReplacement')).rejects.toThrow(
      /Recovery required/,
    )
    await expect(message('backup.retryPendingReplacement')).rejects.toThrow(
      /Recovery required/,
    )
    await expect(message('settings.toggleStudyMode')).rejects.toThrow(
      /Recovery required/,
    )
    expect(await local.readRecord('replacement-continuation')).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  },
)
async function replacementRoots(local: LocalIdbStore) {
  return local.transact<
    { records: unknown[]; coreKeys: IDBValidKey[]; cores: unknown[] },
    'records' | 'coreSnapshots'
  >(['records', 'coreSnapshots'], 'readonly', (stores, done) => {
    const records = stores.records.getAll()
    const coreKeys = stores.coreSnapshots.getAllKeys()
    const cores = stores.coreSnapshots.getAll()
    cores.onsuccess = () =>
      done({
        records: records.result as unknown[],
        coreKeys: coreKeys.result,
        cores: cores.result as unknown[],
      })
  })
}
async function assertRecoveryGatesPreserveRoots(
  local: LocalIdbStore,
  cause: string,
) {
  const before = await replacementRoots(local)
  await restart()
  for (const [method, data] of [
    ['backup.getPendingReplacement', {}],
    ['backup.retryPendingReplacement', {}],
    ['notes.getArchiveUsage', {}],
    ['settings.toggleStudyMode', {}],
    [
      'backup.beginTransfer',
      { direction: 'export', requestId: crypto.randomUUID() },
    ],
  ] as const)
    await expect(message(method, data)).rejects.toMatchObject({
      message:
        'Recovery required: prepared replacement admission cannot be verified.',
      cause: { message: cause },
    })
  expect(await replacementRoots(local)).toEqual(before)
  expect(fetch).not.toHaveBeenCalled()
}
it('literal legacy unresolved candidate without recipe or pointer requires controlled recovery and preserves every root', async () => {
  const { local } = await fixture()
  const { selected, raw } = await interruptRestore(local)
  const { preparedCompositeCandidateSchema } =
    await import('@/platform/db/composite-publication')
  const current = preparedCompositeCandidateSchema.parse(raw)
  const legacy = {
    descriptor: current.descriptor,
    fingerprint: current.fingerprint,
    status: 'prepared' as const,
  }
  expect(preparedCompositeCandidateSchema.parse(legacy)).toEqual(legacy)
  await local.transact(['records'], 'readwrite', (stores, done) => {
    stores.records.put(legacy, ['composite-candidate', selected.token])
    stores.records.delete('replacement-prepublication')
    stores.records.delete(['replacement-source', selected.token])
    done(undefined)
  })
  expect(await local.readRecord('replacement-prepublication')).toBeUndefined()
  expect(
    await local.readRecord(['composite-candidate', selected.token]),
  ).toEqual(legacy)
  await assertRecoveryGatesPreserveRoots(
    local,
    'Recovery required: prepared replacement admission is missing or invalid.',
  )
})
it('two individually valid unresolved candidates reach multiple-candidate recovery and preserve every source and core', async () => {
  const { local } = await fixture()
  const { input, selected, raw } = await interruptRestore(local)
  const {
    preparedCompositeCandidateSchema,
    compositeDigest,
    createCompositePublication,
  } = await import('@/platform/db/composite-publication')
  const first = preparedCompositeCandidateSchema.parse(raw)
  if (!first.resume)
    throw new Error('Expected original candidate resume recipe')
  const secondId = 'second-valid-unresolved'
  const second = preparedCompositeCandidateSchema.parse({
    ...first,
    descriptor: {
      ...first.descriptor,
      replacementId: secondId,
      coreSnapshotId: 'second-valid-core',
      archiveGeneration: 'second-valid-archive',
      datasetToken: 'second-valid-dataset',
      initializedProblemScopes: first.descriptor.initializedProblemScopes?.map(
        (scope, index) => ({
          ...scope,
          problemToken: `second-valid-scope-${index}`,
        }),
      ),
    },
    resume: {
      ...first.resume,
      recipe: {
        ...(first.resume.recipe as Record<string, unknown>),
        commandId: secondId,
      },
    },
    sourceReference: secondId,
  })
  if (!second.resume)
    throw new Error('Expected independent candidate resume recipe')
  second.resumeDigest = await compositeDigest({
    descriptor: second.descriptor,
    resume: second.resume,
    coreDigest: second.coreDigest,
    sourceReference: second.sourceReference,
  })
  const preview = await local.readRecord(['backup-preview', selected.token])
  const bytes = await local.readCore(first.descriptor.coreSnapshotId)
  if (!bytes) throw new Error('Expected original candidate core')
  await local.transact(
    ['records', 'coreSnapshots'],
    'readwrite',
    (stores, done) => {
      stores.records.add(second, ['composite-candidate', secondId])
      stores.records.add(input, ['replacement-source', secondId])
      stores.records.add(preview, ['backup-preview', secondId])
      stores.coreSnapshots.add(bytes, second.descriptor.coreSnapshotId)
      done(undefined)
    },
  )
  const { validatePendingReplacement } = await import('./replacement-resume')
  // Prove each owner recipe, preview/source binding, core bytes and digest is valid
  // independently. The status failure must come from the competing roots.
  for (const candidate of [first, second]) {
    if (!candidate.resume) throw new Error('Expected individually valid recipe')
    await validatePendingReplacement(local, {
      ...candidate,
      resume: candidate.resume,
    })
    expect(candidate.resumeDigest).toBe(
      await compositeDigest({
        descriptor: candidate.descriptor,
        resume: candidate.resume,
        coreDigest: candidate.coreDigest,
        sourceReference: candidate.sourceReference,
      }),
    )
    const source = await local.readRecord([
      'replacement-source',
      candidate.descriptor.replacementId,
    ])
    expect(source).toEqual(input)
    expect(await compositeDigest(source)).toBe(
      (candidate.resume.recipe as { inputDigest: string }).inputDigest,
    )
    const prepared = await createCompositePublication(
      local,
      candidate.fingerprint,
    ).loadPrepared(
      candidate.descriptor.replacementId,
      candidate.descriptor.commandFingerprint!,
    )
    expect(prepared?.bytes).toEqual(new Uint8Array(bytes))
    expect(await compositeDigest(prepared!.bytes)).toBe(candidate.coreDigest)
  }
  await assertRecoveryGatesPreserveRoots(
    local,
    'Recovery required: multiple unresolved prepared replacements.',
  )
})
it.each(['source', 'core'])(
  'changed durable accepted %s cannot repeat SQL, rebase, or release the pending gate',
  async (target) => {
    const { local } = await fixture()
    const { selected, input, raw } = await interruptRestore(local)
    const before = await local.readHead()
    if (target === 'source')
      await local.writeTechnicalRecord(['replacement-source', selected.token], {
        ...input,
        exportedAt: '2026-10-30T00:00:00Z',
      })
    else
      await local.transact(['coreSnapshots'], 'readwrite', (s, done) => {
        s.coreSnapshots.put(
          new Uint8Array([1, 2, 3]),
          raw.descriptor.coreSnapshotId,
        )
        done(undefined)
      })
    await restart()
    const owner = await import('@/features/backup/server/backup-service')
    const sql = vi.spyOn(owner, 'restorePreparedFullBackup')
    expect(await message('backup.getPendingReplacement')).toMatchObject({
      status: 'persistence-pending',
    })
    expect(await message('backup.retryPendingReplacement')).toMatchObject({
      status: 'persistence-pending',
    })
    expect(sql).not.toHaveBeenCalled()
    expect(await local.readHead()).toEqual(before)
    await expect(message('settings.toggleStudyMode')).rejects.toThrow(
      'still needs saving',
    )
    expect(fetch).not.toHaveBeenCalled()
  },
)
it('an aborted admission transaction leaves no source, pointer, or candidate and preserves the old pair', async () => {
  const { local } = await fixture()
  const selected = await transfer(await acceptedSource())
  const before = await local.readHead()
  const original = Object.getOwnPropertyDescriptor(
    IDBObjectStore.prototype,
    'add',
  )!.value as typeof IDBObjectStore.prototype.add
  const fault = vi
    .spyOn(IDBObjectStore.prototype, 'add')
    .mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = original.apply(this, args)
      if (this.name === 'records' && args[1] === 'replacement-prepublication')
        this.transaction.abort()
      return request
    })
  expect(
    await message('backup.finishTransfer', {
      ...selected.finish,
      confirmationToken: selected.token,
    }),
  ).toMatchObject({ status: 'persistence-pending' })
  fault.mockRestore()
  await restart()
  expect(await message('backup.getPendingReplacement')).toEqual({
    status: 'idle',
  })
  expect(await local.readHead()).toEqual(before)
  expect(
    await local.readRecord(['replacement-source', selected.token]),
  ).toBeUndefined()
  expect(
    await local.readRecord(['composite-candidate', selected.token]),
  ).toBeUndefined()
  expect(await local.readRecord('replacement-prepublication')).toBeUndefined()
})

it.each(['reset', 'problem-reset', 'problem-delete'] as const)(
  'registered generic Retry restores original %s command and scopes after restart',
  async (kind) => {
    const { local } = await fixture()
    const selected = await transfer(await acceptedSource())
    expect(
      await message('backup.finishTransfer', {
        ...selected.finish,
        confirmationToken: selected.token,
      }),
    ).toMatchObject({ status: 'durable' })
    const archiveModule =
      await import('@/features/notes/data/archive-generation-repository')
    const actual = archiveModule.createArchiveGenerationRepository
    const fault = vi
      .spyOn(archiveModule, 'createArchiveGenerationRepository')
      .mockImplementation((store) => ({
        ...actual(store),
        stageProblemScopes: () => Promise.reject(new Error('scope cutoff')),
      }))
    const commandId = `registered-${kind}`
    const method =
      kind === 'reset'
        ? 'backup.resetLocalData'
        : kind === 'problem-reset'
          ? 'problems.resetProblemData'
          : 'problems.deleteProblem'
    const data =
      kind === 'reset'
        ? { commandId }
        : kind === 'problem-reset'
          ? { commandId, problemSlugs: ['two-sum'] }
          : { commandId, problemSlug: 'two-sum' }
    const before = await local.readHead()
    expect(await message(method, data)).toMatchObject({
      status: 'persistence-pending',
      kind,
    })
    const original = (await local.readRecord([
      'composite-candidate',
      commandId,
    ])) as {
      descriptor: {
        coreSnapshotId: string
        archiveGeneration: string
        datasetToken: string
        targetProblemScopes: Array<{
          problemSlug: string
          problemToken: string
        }>
        initializedProblemScopes: Array<{
          problemSlug: string
          problemToken: string
        }>
      }
    }
    const bytes = await local.readCore(original.descriptor.coreSnapshotId)
    fault.mockRestore()
    await restart()
    expect(await message('backup.getPendingReplacement')).toMatchObject({
      status: 'persistence-pending',
      kind,
      summary: null,
    })
    expect(await local.readHead()).toEqual(before)
    const problem = await import('@/features/problems/server/problems-service')
    const practice = await import('@/features/practice/server/practice-service')
    const backup = await import('@/features/backup/server/backup-service')
    const repeated = [
      vi.spyOn(problem, 'bulkDeleteProblems'),
      vi.spyOn(practice, 'resetPracticeSchedule'),
      vi.spyOn(backup, 'resetLocalData'),
    ]
    expect(await message('backup.retryPendingReplacement')).toMatchObject({
      status: 'durable',
      syncMetadataPending: false,
      kind,
    })
    repeated.forEach((spy) => expect(spy).not.toHaveBeenCalled())
    const head = (await local.readHead())!
    expect(head).toMatchObject({
      coreSnapshotId: original.descriptor.coreSnapshotId,
      archiveGeneration: original.descriptor.archiveGeneration,
      datasetToken: original.descriptor.datasetToken,
      revision: before!.revision + 1,
    })
    expect(await local.readCore(head.coreSnapshotId)).toEqual(bytes)
    const scopes = await (
      await import('@/features/notes/data/archive-generation-repository')
    )
      .createArchiveGenerationRepository(local)
      .readProblemScopes(head.archiveGeneration)
    for (const scope of [
      ...original.descriptor.targetProblemScopes,
      ...original.descriptor.initializedProblemScopes,
    ])
      expect(scopes).toContainEqual({
        ...scope,
        datasetToken: head.datasetToken,
      })
    expect(fetch).not.toHaveBeenCalled()
  },
)

it('registered Gist Retry uses the accepted durable source and frozen metadata patch without a provider call', async () => {
  const { local } = await fixture()
  const secret = await import('@/platform/secrets')
  vi.spyOn(secret, 'readSecret').mockResolvedValue('test-token')
  vi.spyOn(secret, 'getSecretStatus').mockResolvedValue({
    provider: 'github:gist',
    configured: true,
    updatedAt: '2026-10-31T00:00:00Z',
    fingerprint: '123456789abc',
  })
  const metadata = await import('@/features/sync/data/sync-metadata-store')
  await metadata.writeSyncMetadata({
    enabled: true,
    gistId: 'original-gist',
    dirtySinceLastSync: false,
    lastRemoteVersion: 'old',
  })
  const github = await import('@/lib/github')
  const { buildSyncEnvelope } =
    await import('@/features/sync/domain/sync-envelope')
  const { backupFileSchema } =
    await import('@/features/backup/api/backup-contracts')
  const input = backupFileSchema.parse(await acceptedSource())
  const remote = {
    id: 'original-gist',
    htmlUrl: 'https://gist.github.com/original-gist',
    updatedAt: '2026-10-31T01:00:00Z',
    remoteVersion: 'accepted-version',
    content: JSON.stringify(
      buildSyncEnvelope({
        backup: input,
        dataUpdatedAt: '2026-10-31T01:00:00Z',
      }),
    ),
    contentTruncated: false,
    rawUrl: null,
  }
  const client = {
    getGist: vi.fn(() => Promise.resolve(remote)),
    validateToken: vi.fn(),
    createSyncGist: vi.fn(),
    updateSyncGist: vi.fn(),
  }
  vi.spyOn(github, 'createGitHubGistClient').mockReturnValue(client)
  const preview = (await message('sync.pullLatest')) as {
    restorePreview: { confirmationToken: string }
  }
  const owner =
    await import('@/features/notes/data/archive-generation-repository')
  const actual = owner.createArchiveGenerationRepository
  const fault = vi
    .spyOn(owner, 'createArchiveGenerationRepository')
    .mockImplementation((store) => ({
      ...actual(store),
      stageProblemScopes: () => Promise.reject(new Error('cutoff')),
    }))
  await message('sync.pullLatest', {
    confirmationToken: preview.restorePreview.confirmationToken,
    confirmLocalOverwrite: true,
  })
  const commandId = preview.restorePreview.confirmationToken
  const candidate = (await local.readRecord([
    'composite-candidate',
    commandId,
  ])) as {
    resume: { syncMetadataPatch: Record<string, unknown> }
    descriptor: {
      coreSnapshotId: string
      archiveGeneration: string
      datasetToken: string
    }
  }
  expect(candidate.resume.syncMetadataPatch.lastRemoteVersion).toBe(
    'accepted-version',
  )
  expect(
    await local.readRecord(['replacement-source', commandId]),
  ).toBeDefined()
  expect(client.getGist).toHaveBeenCalledTimes(2)
  fault.mockRestore()
  remote.remoteVersion = 'changed-after-acceptance'
  remote.content = '{}'
  await restart()
  const newGithub = await import('@/lib/github')
  const provider = vi
    .spyOn(newGithub, 'createGitHubGistClient')
    .mockImplementation(() => {
      throw new Error('Retry must not contact provider')
    })
  const newBackup = await import('@/features/backup/server/backup-service')
  const sql = vi.spyOn(newBackup, 'restorePreparedFullBackup')
  expect(await message('backup.getPendingReplacement')).toMatchObject({
    status: 'persistence-pending',
    kind: 'gist-pull',
  })
  expect(await message('backup.retryPendingReplacement')).toMatchObject({
    status: 'durable',
    kind: 'gist-pull',
    syncMetadataPending: false,
  })
  expect(
    (await chrome.storage.local.get(['cognipace_sync_metadata_v1']))
      .cognipace_sync_metadata_v1,
  ).toMatchObject(candidate.resume.syncMetadataPatch)
  expect(await local.readHead()).toMatchObject({
    coreSnapshotId: candidate.descriptor.coreSnapshotId,
    archiveGeneration: candidate.descriptor.archiveGeneration,
    datasetToken: candidate.descriptor.datasetToken,
  })
  expect(sql).not.toHaveBeenCalled()
  expect(provider).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('publication abort retains the accepted source and scopes for registered generic Retry after restart', async () => {
  const { local } = await fixture()
  const selected = await transfer(await acceptedSource())
  const before = await local.readHead()
  const put = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put')!
    .value as typeof IDBObjectStore.prototype.put
  const fault = vi
    .spyOn(IDBObjectStore.prototype, 'put')
    .mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = put.apply(this, args)
      if (this.name === 'records' && args[1] === 'active')
        this.transaction.abort()
      return request
    })
  expect(
    await message('backup.finishTransfer', {
      ...selected.finish,
      confirmationToken: selected.token,
    }),
  ).toMatchObject({ status: 'persistence-pending' })
  fault.mockRestore()
  expect(await local.readHead()).toEqual(before)
  const candidate = (await local.readRecord([
    'composite-candidate',
    selected.token,
  ])) as {
    descriptor: {
      coreSnapshotId: string
      archiveGeneration: string
      datasetToken: string
    }
  }
  expect(await local.readRecord('replacement-prepublication')).toBeDefined()
  expect(await local.readRecord('replacement-continuation')).toBeUndefined()
  await restart()
  expect(await message('backup.retryPendingReplacement')).toMatchObject({
    status: 'durable',
    syncMetadataPending: false,
  })
  expect(await local.readHead()).toMatchObject({
    coreSnapshotId: candidate.descriptor.coreSnapshotId,
    archiveGeneration: candidate.descriptor.archiveGeneration,
    datasetToken: candidate.descriptor.datasetToken,
    revision: before!.revision + 1,
  })
})
it('metadata-only maintenance retains pending source and retires it after settlement without reading its body', async () => {
  const { local } = await fixture()
  const { selected } = await interruptRestore(local)
  const { collectBackupTransferTechnicalBatch, transferSessionKey } =
    await import('@/features/backup/server/backup-transfer-service')
  await collectBackupTransferTechnicalBatch(local, {
    ownerIsAbsent: () => Promise.resolve(true),
  })
  expect(
    await local.readRecord(transferSessionKey(selected.finish.sessionId)),
  ).toBeDefined()
  expect(
    await local.readRecord(['replacement-source', selected.token]),
  ).toBeDefined()
  await restart()
  expect(await message('backup.retryPendingReplacement')).toMatchObject({
    status: 'durable',
    syncMetadataPending: false,
  })
  const sourceKey = ['replacement-source', selected.token]
  const get = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'get')!
    .value as typeof IDBObjectStore.prototype.get
  const guard = vi
    .spyOn(IDBObjectStore.prototype, 'get')
    .mockImplementation(function (this: IDBObjectStore, ...args) {
      if (
        this.name === 'records' &&
        JSON.stringify(args[0]) === JSON.stringify(sourceKey)
      )
        throw new Error('Maintenance read a source body')
      return get.apply(this, args)
    })
  const maintenance = (
    await import('@/features/notes/server/notes-maintenance-service')
  ).createNotesMaintenanceService({ local })
  let complete = false
  for (let pass = 0; pass < 80; pass++)
    if (!(await maintenance.collectBatch()).hasMore) {
      complete = true
      break
    }
  expect(complete).toBe(true)
  guard.mockRestore()
  expect(await local.readRecord(sourceKey)).toBeUndefined()
  expect(
    await local.readRecord(['composite-candidate', selected.token]),
  ).toBeUndefined()
})
