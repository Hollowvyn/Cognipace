import {
  resumePendingReplacement,
  validatePendingReplacement,
} from './replacement-resume'
import { verifyBackgroundReplacementAdoption } from './app-db'
import {
  configureMutationQueue,
  runInMutationQueue,
  runConsistentRead,
  runGatedMutationQueue,
} from './mutation-queue'
import { waitForPendingDbSnapshot } from '@/platform/db/instance'
import { createProblem } from '@/features/problems/server/problems-service'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, it, vi } from 'vitest'
import {
  getAppDb,
  resetAppDbForTesting,
  flushDbSnapshot,
} from '@/platform/db/instance'
import { createLocalIdbStore } from '@/platform/db/local-idb'
import {
  replacementCommandKey,
  replacementCommandRecordSchema,
} from '@/platform/db/snapshot-idb'
import { createSnapshotIdbStore } from '@/platform/db/snapshot-idb'
import { createNotesRepository } from '@/features/notes/data/notes-repository'
import { createArchiveGenerationRepository } from '@/features/notes/data/archive-generation-repository'
import { makeNotesArchive } from '@/features/notes/testing/notes-fixtures'
import { preparePracticeStorage } from '@/features/practice/server/practice-storage-service'
import {
  executePracticeReviewCommand,
  getPracticeDetails,
  setPracticeSuspended,
} from '@/features/practice/server/practice-service'
import { exportFullBackup } from '@/features/backup/server/backup-service'
import { prepareProblemDataReplacement } from './problem-data-service'
import { createBackupReplacementCoordinator } from './backup-replacement'

afterEach(() => {
  resetAppDbForTesting()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function fixture() {
  resetAppDbForTesting()
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: () => Promise.resolve({}),
        set: async () => {},
        remove: async () => {},
      },
    },
  })
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const handle = await getAppDb({
    beforePublish: ({ db }) => preparePracticeStorage(db),
  })
  const local = createLocalIdbStore(indexedDB)
  const notes = createNotesRepository(local)
  for (const slug of ['two-sum', 'valid-parentheses']) {
    const generation = (await getPracticeDetails(handle.db, slug)).generation!
    await executePracticeReviewCommand(handle.db, {
      operation: 'save',
      commandId: `save-${slug}`,
      problemSlug: slug,
      generation,
      rating: 'good',
      reviewedAt: '2026-10-31T12:00:00.000Z',
      reviewMode: 'manual',
      log: { notes: 'learning log' },
    })
  }
  await setPracticeSuspended(handle.db, {
    problemSlug: 'two-sum',
    suspended: true,
  })
  await flushDbSnapshot()
  const archive = await makeNotesArchive()
  archive.notes[0]!.document.markdown = 'problem note'
  archive.submissions[0]!.reflection.markdown = 'reflection'
  const siblingArchive = structuredClone(archive)
  siblingArchive.notes[0]!.problemSlug = 'valid-parentheses'
  const sub = siblingArchive.submissions[0]!
  Object.assign(sub, {
    id: 'submission-2',
    problemSlug: 'valid-parentheses',
    observedAttemptIds: ['attempt-2'],
    externalSubmissionId: '456',
    codePayloadId: 'code-2',
  })
  Object.assign(siblingArchive.assessments[0]!, {
    id: 'assessment-2',
    problemSlug: 'valid-parentheses',
    submissionId: 'submission-2',
    requestId: 'request-2',
    feedbackPayloadId: 'feedback-2',
    implementationPayloadId: 'implementation-2',
  })
  Object.assign(siblingArchive.savedAiNotes[0]!, {
    problemSlug: 'valid-parentheses',
    assessmentId: 'assessment-2',
  })
  for (const payload of siblingArchive.payloads)
    payload.id = payload.id.replace('-1', '-2')
  archive.notes.push(...siblingArchive.notes)
  archive.submissions.push(...siblingArchive.submissions)
  archive.assessments.push(...siblingArchive.assessments)
  archive.savedAiNotes.push(...siblingArchive.savedAiNotes)
  archive.payloads.push(...siblingArchive.payloads)
  const head = (await local.readHead())!
  await createArchiveGenerationRepository(local).stageImportedArchive({
    nextGeneration: 'fixture-archive',
    archive,
  })
  await local.writeTechnicalRecord('active', {
    ...head,
    archiveGeneration: 'fixture-archive',
  })
  const scope = await notes.acquireScope('two-sum')
  const siblingScope = await notes.acquireScope('valid-parentheses')
  const sibling = await getPracticeDetails(handle.db, 'valid-parentheses')
  const catalog = (await exportFullBackup(handle.db)).data
  return { local, notes, scope, siblingScope, sibling, catalog, siblingArchive }
}
async function replace(
  local: ReturnType<typeof createLocalIdbStore>,
  kind: 'problem-reset' | 'problem-delete' | 'reset',
  slugs: string[],
) {
  const coordinator = createBackupReplacementCoordinator({
    store: createSnapshotIdbStore(indexedDB),
  })
  return coordinator.run({
    kind,
    prepare: () =>
      prepareProblemDataReplacement(local, {
        kind,
        problemSlugs: slugs,
        commandId: crypto.randomUUID(),
      }),
    onDurable: async () => {},
    finishSyncMetadata: async () => {},
  })
}
it('resets one populated problem across both stores, unsuspends it and preserves the sibling and catalog exactly', async () => {
  const f = await fixture()
  expect(await replace(f.local, 'problem-reset', ['two-sum'])).toMatchObject({
    status: 'durable',
  })
  const current = (await getAppDb()).db
  const reset = await getPracticeDetails(current, 'two-sum')
  expect(reset).toMatchObject({
    latestAttempt: null,
    isSuspended: false,
    currentLog: { notes: null },
    reviewCount: 0,
  })
  expect(await getPracticeDetails(current, 'valid-parentheses')).toEqual(
    f.sibling,
  )
  expect(await f.notes.acquireScope('valid-parentheses')).toEqual(
    f.siblingScope,
  )
  const archive = await createArchiveGenerationRepository(
    f.local,
  ).readArchiveGeneration((await f.local.readHead())!.archiveGeneration)
  expect(archive).toEqual(f.siblingArchive)
  expect(
    await f.notes.saveDocument({
      commandId: 'old-note',
      problemSlug: 'two-sum',
      scope: f.scope,
      target: { kind: 'problem' },
      expectedRevision: 0,
      markdown: 'late',
    }),
  ).toEqual({ status: 'stale-scope' })
  const data = (await exportFullBackup(current)).data
  expect(data.problems).toEqual(f.catalog.problems)
  expect(data.tracks.memberships).toEqual(f.catalog.tracks.memberships)
})
it('deletes catalog dependencies together with the archive', async () => {
  const f = await fixture()
  await replace(f.local, 'problem-delete', ['two-sum'])
  const data = (await exportFullBackup((await getAppDb()).db)).data
  expect(data.problems.some((p) => p.slug === 'two-sum')).toBe(false)
  expect(data.tracks.memberships.some((p) => p.problemSlug === 'two-sum')).toBe(
    false,
  )
  expect(
    (await f.notes.readDocument('two-sum', { kind: 'problem' })).markdown,
  ).toBe('')
})
it('clears to fresh-install core and an empty archive with fresh dataset scopes', async () => {
  const f = await fixture()
  const before = (await f.local.readHead())!
  await replace(f.local, 'reset', [])
  expect((await f.local.readHead())!.datasetToken).not.toBe(before.datasetToken)
  const data = (await exportFullBackup((await getAppDb()).db)).data
  expect(data.practice.reviewAttempts).toEqual([])
  expect(data.practice.commandReceipts).toEqual([])
  expect(data.practice.generations.length).toBeGreaterThan(0)
  expect(
    (
      await createArchiveGenerationRepository(f.local).readArchiveGeneration(
        (await f.local.readHead())!.archiveGeneration,
      )
    ).notes,
  ).toEqual([])
})

it.each(['problem-reset', 'problem-delete', 'reset'] as const)(
  'keeps compact %s command fences across fresh learning and Clear so old IDs cannot erase new data',
  async (kind) => {
    const f = await fixture()
    const coordinator = createBackupReplacementCoordinator({
      store: createSnapshotIdbStore(indexedDB),
    })
    const input = {
      kind,
      problemSlugs: kind === 'reset' ? [] : ['two-sum'],
      commandId: 'old-accepted-reset',
    }
    const run = () =>
      coordinator.run({
        kind: input.kind,
        prepare: () => prepareProblemDataReplacement(f.local, input),
        onDurable: async () => {},
        finishSyncMetadata: async () => {},
      })
    await run()
    const commandRecord = replacementCommandRecordSchema.parse(
      await f.local.readRecord(replacementCommandKey(input.commandId)),
    )
    expect(commandRecord).toEqual({
      commandId: input.commandId,
      kind: input.kind,
      requestFingerprint: JSON.stringify([input.kind, input.problemSlugs]),
      status: 'committed',
    })
    async function learn(commandId: string) {
      const db = (await getAppDb()).db
      await executePracticeReviewCommand(db, {
        operation: 'save',
        commandId,
        problemSlug: 'two-sum',
        generation: (await getPracticeDetails(db, 'two-sum')).generation!,
        rating: 'good',
        reviewedAt: '2026-10-31T14:00:00.000Z',
        reviewMode: 'manual',
      })
      await flushDbSnapshot()
      return getPracticeDetails(db, 'two-sum')
    }
    if (kind === 'problem-delete')
      await createProblem((await getAppDb()).db, {
        surface: 'dashboard',
        slugOrUrl: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
        topicLabels: [],
        companyLabels: [],
      })
    const fresh = await learn('fresh-after-reset')
    await expect(run()).rejects.toThrow('already committed')
    expect(await getPracticeDetails((await getAppDb()).db, 'two-sum')).toEqual(
      fresh,
    )
    await replace(f.local, 'reset', [])
    const afterClear = await learn('fresh-after-clear')
    // Worker restart reconstructs the active pair; global compact fence remains.
    resetAppDbForTesting()
    await getAppDb()
    await expect(prepareProblemDataReplacement(f.local, input)).rejects.toThrow(
      'already committed',
    )
    await expect(
      prepareProblemDataReplacement(f.local, {
        ...input,
        problemSlugs: ['valid-parentheses'],
      }),
    ).rejects.toThrow('identity conflict')
    expect(await getPracticeDetails((await getAppDb()).db, 'two-sum')).toEqual(
      afterClear,
    )
    expect(
      await f.local.readRecord(replacementCommandKey(input.commandId)),
    ).toEqual(commandRecord)
  },
)
it('retains the original pair on staging failure and retries the same prepared bulk work once', async () => {
  const f = await fixture()
  const before = (await f.local.readHead())!
  const coordinator = createBackupReplacementCoordinator({
    store: createSnapshotIdbStore(indexedDB),
  })
  const prepare = vi.fn(() =>
    prepareProblemDataReplacement(f.local, {
      kind: 'problem-reset',
      problemSlugs: ['two-sum', 'valid-parentheses'],
      commandId: 'bulk-reset',
    }),
  )
  const transact = f.local.transact.bind(f.local)
  const fault = vi.spyOn(f.local, 'transact').mockImplementation((...args) => {
    if (args[0].includes('problemScopes') && args[1] === 'readwrite') {
      fault.mockRestore()
      return Promise.reject(new Error('forced staging failure'))
    }
    return transact(...args)
  })
  expect(
    await coordinator.run({
      kind: 'problem-reset',
      prepare,
      onDurable: async () => {},
      finishSyncMetadata: async () => {},
    }),
  ).toMatchObject({ status: 'persistence-pending' })
  expect(await f.local.readHead()).toEqual(before)
  expect(
    await getPracticeDetails((await getAppDb()).db, 'valid-parentheses'),
  ).toEqual(f.sibling)
  expect(await coordinator.retry()).toMatchObject({ status: 'durable' })
  expect(prepare).toHaveBeenCalledTimes(1)
  expect((await f.local.readHead())!.revision).toBe(before.revision + 1)
  expect(
    (await getPracticeDetails((await getAppDb()).db, 'valid-parentheses'))
      .latestAttempt,
  ).toBeNull()
})

it.each(['problem-reset', 'reset'] as const)(
  'hydrates persisted %s prepublication work after restart with exact core/archive IDs and all prepared tokens',
  async (kind) => {
    const f = await fixture()
    const input = {
      kind,
      problemSlugs: kind === 'reset' ? [] : ['two-sum'],
      commandId: 'restart-before-publication',
    }
    const work = await prepareProblemDataReplacement(f.local, input)
    const transact = f.local.transact.bind(f.local)
    const fault = vi
      .spyOn(f.local, 'transact')
      .mockImplementation((...args) => {
        if (args[0].includes('problemScopes') && args[1] === 'readwrite') {
          fault.mockRestore()
          return Promise.reject(new Error('crash during staging'))
        }
        return transact(...args)
      })
    await expect(
      work.publish({ kind: input.kind, replacementId: input.commandId }),
    ).rejects.toThrow('crash during staging')
    const prepared = (await f.local.readRecord([
      'composite-candidate',
      input.commandId,
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
    const core = await f.local.readCore(prepared.descriptor.coreSnapshotId)
    resetAppDbForTesting()
    await getAppDb()
    const coordinator = createBackupReplacementCoordinator({
      store: createSnapshotIdbStore(indexedDB),
      validatePrepared: (record) =>
        validatePendingReplacement(f.local, record).then(() => {}),
      resumePrepared: (record) => resumePendingReplacement(f.local, record),
      resume: () => ({
        onDurable: async () => {},
        finishSyncMetadata: async () => {},
      }),
    })
    await coordinator.ready()
    expect(coordinator.getState()).toMatchObject({
      status: 'persistence-pending',
      kind,
    })
    expect(await coordinator.retry()).toMatchObject({ status: 'durable' })
    const head = (await f.local.readHead())!
    expect(head).toMatchObject({
      coreSnapshotId: prepared.descriptor.coreSnapshotId,
      archiveGeneration: prepared.descriptor.archiveGeneration,
      datasetToken: prepared.descriptor.datasetToken,
    })
    expect(await f.local.readCore(head.coreSnapshotId)).toEqual(core)
    for (const scope of [
      ...prepared.descriptor.targetProblemScopes,
      ...prepared.descriptor.initializedProblemScopes,
    ]) {
      expect(await f.notes.readScope(scope.problemSlug)).toEqual({
        datasetToken: prepared.descriptor.datasetToken,
        problemToken: scope.problemToken,
      })
    }
    expect(
      (await getPracticeDetails((await getAppDb()).db, 'two-sum'))
        .latestAttempt,
    ).toBeNull()
  },
)
it('rejects changed-base prepared replay before domain work and keeps newer data active', async () => {
  const f = await fixture()
  const input = {
    kind: 'problem-reset' as const,
    problemSlugs: ['two-sum'],
    commandId: 'changed-base',
  }
  const work = await prepareProblemDataReplacement(f.local, input)
  const transact = f.local.transact.bind(f.local)
  const fault = vi.spyOn(f.local, 'transact').mockImplementation((...args) => {
    if (args[0].includes('problemScopes') && args[1] === 'readwrite') {
      fault.mockRestore()
      return Promise.reject(new Error('crash during staging'))
    }
    return transact(...args)
  })
  await expect(
    work.publish({ kind: input.kind, replacementId: input.commandId }),
  ).rejects.toThrow()
  resetAppDbForTesting()
  const db = (await getAppDb()).db
  await setPracticeSuspended(db, {
    problemSlug: 'valid-parentheses',
    suspended: true,
  })
  await flushDbSnapshot()
  const head = await f.local.readHead()
  const before = await exportFullBackup(db)
  await expect(prepareProblemDataReplacement(f.local, input)).rejects.toThrow(
    'Local data changed before replacement publication',
  )
  expect(await f.local.readHead()).toEqual(head)
  expect((await exportFullBackup(db)).data).toEqual(before.data)
})

it.each([
  'missing-core',
  'bad-fingerprint',
  'missing-scopes',
  'invalid-core',
] as const)(
  'preserves the active pair and reports recovery required for %s prepared work',
  async (failure) => {
    const f = await fixture()
    const input = {
      kind: 'problem-reset' as const,
      problemSlugs: ['two-sum'],
      commandId: 'incomplete-candidate',
    }
    const work = await prepareProblemDataReplacement(f.local, input)
    const transact = f.local.transact.bind(f.local)
    const fault = vi
      .spyOn(f.local, 'transact')
      .mockImplementation((...args) => {
        if (args[0].includes('problemScopes') && args[1] === 'readwrite') {
          fault.mockRestore()
          return Promise.reject(new Error('crash during staging'))
        }
        return transact(...args)
      })
    await expect(
      work.publish({ kind: input.kind, replacementId: input.commandId }),
    ).rejects.toThrow()
    const prepared = (await f.local.readRecord([
      'composite-candidate',
      input.commandId,
    ])) as {
      fingerprint: string
      descriptor: { coreSnapshotId: string; targetProblemScopes?: unknown }
    }
    if (failure === 'bad-fingerprint') {
      prepared.fingerprint = 'incompatible'
      await f.local.writeTechnicalRecord(
        ['composite-candidate', input.commandId],
        prepared,
      )
    }
    if (failure === 'missing-scopes') {
      delete prepared.descriptor.targetProblemScopes
      await f.local.writeTechnicalRecord(
        ['composite-candidate', input.commandId],
        prepared,
      )
    }
    if (failure === 'missing-core' || failure === 'invalid-core')
      await f.local.transact(['coreSnapshots'], 'readwrite', (s, done) => {
        if (failure === 'missing-core')
          s.coreSnapshots.delete(prepared.descriptor.coreSnapshotId)
        else
          s.coreSnapshots.put(
            new Uint8Array([1]),
            prepared.descriptor.coreSnapshotId,
          )
        done(undefined)
      })
    resetAppDbForTesting()
    const db = (await getAppDb()).db
    const head = await f.local.readHead()
    const data = (await exportFullBackup(db)).data
    await expect(prepareProblemDataReplacement(f.local, input)).rejects.toThrow(
      'Recovery required',
    )
    expect(await f.local.readHead()).toEqual(head)
    expect((await exportFullBackup(db)).data).toEqual(data)
  },
)

it.each(['sync-metadata', 'notification-flag'] as const)(
  'allows broadcast-triggered adopted-pair reads while %s settlement is pending, but keeps writes and exports gated',
  async (failure) => {
    const f = await fixture()
    const store = createSnapshotIdbStore(indexedDB)
    const coordinator = createBackupReplacementCoordinator({ store })
    configureMutationQueue({
      ready: coordinator.ready,
      assertIdle: coordinator.assertIdle,
      assertReadable: coordinator.assertReadable,
      flush: flushDbSnapshot,
      waitForPendingCoreSave: waitForPendingDbSnapshot,
    })
    const reads: Array<Promise<{ markdown: string; latestAttempt: unknown }>> =
      []
    const markMetadata = vi.fn().mockResolvedValue(undefined)
    if (failure === 'sync-metadata')
      markMetadata.mockRejectedValueOnce(new Error('metadata unavailable'))
    else
      vi.spyOn(store, 'markInvalidated').mockRejectedValueOnce(
        new Error('notification flag unavailable'),
      )
    const prepare = vi.fn(() =>
      prepareProblemDataReplacement(f.local, {
        kind: 'problem-reset',
        problemSlugs: ['two-sum'],
        commandId: 'notification-read',
      }),
    )
    const result = await runInMutationQueue(() =>
      coordinator.run({
        kind: 'problem-reset',
        prepare,
        onDurable: () => {
          // Runtime invalidation schedules client refetches; it does not await the
          // reads while owning this mutation queue turn.
          reads.push(
            runConsistentRead(async () => ({
              markdown: (
                await f.notes.readDocument('two-sum', { kind: 'problem' })
              ).markdown,
              latestAttempt: (
                await getPracticeDetails((await getAppDb()).db, 'two-sum')
              ).latestAttempt,
            })),
          )
          return Promise.resolve()
        },
        finishSyncMetadata: markMetadata,
      }),
    )
    expect(result).toMatchObject({
      status: 'durable',
      syncMetadataPending: true,
    })
    await expect(reads[0]).resolves.toEqual({
      markdown: '',
      latestAttempt: null,
    })
    const write = vi.fn(() => Promise.resolve())
    await expect(runGatedMutationQueue(write)).rejects.toThrow(
      'still needs saving',
    )
    expect(write).not.toHaveBeenCalled()
    await expect(
      runGatedMutationQueue(async () =>
        exportFullBackup((await getAppDb()).db),
      ),
    ).rejects.toThrow('still needs saving')
    expect(await runInMutationQueue(() => coordinator.retry())).toMatchObject({
      status: 'durable',
      syncMetadataPending: false,
    })
    await expect(Promise.all(reads)).resolves.toEqual(
      reads.map(() => ({ markdown: '', latestAttempt: null })),
    )
    expect(prepare).toHaveBeenCalledTimes(1)
  },
)

it('verifies a reconstructed continuation against the opened active pair before admitting safe reads', async () => {
  const f = await fixture()
  const store = createSnapshotIdbStore(indexedDB)
  const initial = createBackupReplacementCoordinator({ store })
  expect(
    await initial.run({
      kind: 'problem-reset',
      prepare: () =>
        prepareProblemDataReplacement(f.local, {
          kind: 'problem-reset',
          problemSlugs: ['two-sum'],
          commandId: 'reconstructed-read',
        }),
      onDurable: () => Promise.resolve(),
      finishSyncMetadata: () =>
        Promise.reject(new Error('metadata unavailable')),
    }),
  ).toMatchObject({ status: 'durable', syncMetadataPending: true })
  resetAppDbForTesting()
  const verify = vi.fn(verifyBackgroundReplacementAdoption)
  const resumed = createBackupReplacementCoordinator({
    store,
    resumeAdoption: verify,
    resume: () => ({
      onDurable: () => Promise.resolve(),
      finishSyncMetadata: () => Promise.reject(new Error('still unavailable')),
    }),
  })
  configureMutationQueue({
    ready: resumed.ready,
    assertIdle: resumed.assertIdle,
    assertReadable: resumed.assertReadable,
    flush: flushDbSnapshot,
    waitForPendingCoreSave: waitForPendingDbSnapshot,
  })
  await resumed.ready()
  const read = () =>
    runConsistentRead(async () => ({
      markdown: (await f.notes.readDocument('two-sum', { kind: 'problem' }))
        .markdown,
      latestAttempt: (
        await getPracticeDetails((await getAppDb()).db, 'two-sum')
      ).latestAttempt,
    }))
  await expect(read()).rejects.toThrow('still needs saving')
  expect(verify).not.toHaveBeenCalled()
  expect(await runInMutationQueue(() => resumed.retry())).toMatchObject({
    status: 'durable',
    syncMetadataPending: true,
  })
  expect(verify).toHaveBeenCalledTimes(1)
  await expect(read()).resolves.toEqual({ markdown: '', latestAttempt: null })
  await expect(runGatedMutationQueue(() => Promise.resolve())).rejects.toThrow(
    'still needs saving',
  )
})

it.each(['problem-reset', 'reset'] as const)(
  'prepares actual missing catalog scopes for pure %s pending readers without changing head revision on read',
  async (kind) => {
    const f = await fixture()
    const slug = f.catalog.problems.find(
      (problem) => !['two-sum', 'valid-parentheses'].includes(problem.slug),
    )!.slug
    expect(await f.notes.readScope(slug)).toBeNull()
    await replace(f.local, kind, kind === 'reset' ? [] : ['two-sum'])
    const scope = await f.notes.readScope(slug)
    expect(scope).not.toBeNull()
    const head = await f.local.readHead()
    const transact = f.local.transact.bind(f.local)
    const pure = vi.spyOn(f.local, 'transact').mockImplementation((...args) => {
      if (args[1] !== 'readonly')
        throw new Error('Admitted read tried to write')
      return transact(...args)
    })
    await expect(
      f.notes.getProblemNotes(slug, { readOnly: true }),
    ).resolves.toMatchObject({ scope, document: { markdown: '', revision: 0 } })
    pure.mockRestore()
    expect(await f.local.readHead()).toEqual(head)
    if (kind === 'problem-reset')
      expect(await f.notes.acquireScope('valid-parentheses')).toEqual(
        f.siblingScope,
      )
  },
)
