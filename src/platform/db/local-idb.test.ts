import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, expect, it, vi } from 'vitest'
import { createLocalIdbStore } from './local-idb'
import { archiveStoreNames, localDatabaseVersion } from './local-idb-schema'
import { createSnapshotIdbStore } from './snapshot-idb'
const original = {
  key: 'active',
  bytes: new Uint8Array([0, 255, 8]),
  fingerprint: 'schema',
  revision: 8,
  lastVerifiedRevision: 6,
  savedAt: '2026-10-31',
  replacementId: 'restore',
}
const recovery = {
  key: 'replacement',
  bytes: new Uint8Array([7, 3]),
  fingerprint: 'old',
  revision: 7,
  savedAt: '2026-10-30',
  replacementId: 'restore',
}
const continuation = {
  key: 'replacement-continuation',
  replacementId: 'restore',
  kind: 'restore',
  committedRevision: 8,
  needsInvalidation: true,
  needsSyncMetadata: false,
}
async function seed(factory: IDBFactory, version = 1) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('test', version)
    request.onupgradeneeded = () => {
      const records = request.result.createObjectStore('records')
      records.put(original, 'active')
      for (const key of ['active', 'replacement'])
        records.put(
          {
            key,
            formatVersion: 2,
            coreSnapshotId: 'historical-label',
            snapshot: 'base64',
          },
          `recovery:lookalike-${key}`,
        )
      records.put(recovery, 'recovery')
      records.put(original, 'recovery:binary')
      records.put(
        { snapshot: 'base64', fingerprint: 'legacy' },
        'recovery:legacy',
      )
      records.put(continuation, 'replacement-continuation')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Open failed.'))
  })
}
afterEach(() => vi.restoreAllMocks())
it('preserves every binary root and continuation during the v2 upgrade', async () => {
  const factory = new IDBFactory()
  ;(await seed(factory)).close()
  const local = createLocalIdbStore(factory, 'test'),
    snapshots = createSnapshotIdbStore(factory, 'test')
  expect(localDatabaseVersion).toBe(2)
  expect(JSON.parse(JSON.stringify(await snapshots.readActive()))).toEqual(
    JSON.parse(JSON.stringify(original)),
  )
  const head = await local.readHead()
  expect(head).toMatchObject({
    formatVersion: 2,
    revision: 8,
    lastVerifiedRevision: 6,
  })
  expect(head).not.toHaveProperty('bytes')
  expect(await local.readRecord('active')).not.toHaveProperty('bytes')
  expect(await local.readRecord('recovery')).not.toHaveProperty('bytes')
  expect(await local.readRecord('recovery:binary')).not.toHaveProperty('bytes')
  expect(Array.from((await local.readCore(head!.coreSnapshotId))!)).toEqual(
    Array.from(original.bytes),
  )
  expect(await snapshots.readContinuation()).toEqual(continuation)
  for (const key of ['active', 'replacement'])
    expect(await snapshots.readRecovery(`lookalike-${key}`)).toEqual({
      value: {
        key,
        formatVersion: 2,
        coreSnapshotId: 'historical-label',
        snapshot: 'base64',
      },
    })
  expect(
    JSON.parse(
      JSON.stringify(await snapshots.readReplacementRecovery('restore')),
    ),
  ).toEqual(JSON.parse(JSON.stringify(recovery)))
  expect(
    JSON.parse(JSON.stringify(await snapshots.readRecovery('binary'))),
  ).toEqual(JSON.parse(JSON.stringify({ value: original })))
  expect(await snapshots.readRecovery('legacy')).toEqual({
    value: { snapshot: 'base64', fingerprint: 'legacy' },
  })
  await local.transact(
    [...archiveStoreNames, 'coreSnapshots'],
    'readonly',
    (stores, finish) => {
      expect(Object.keys(stores)).toHaveLength(7)
      expect(stores.submissions.index('byProblem').keyPath).toEqual([
        'archiveGeneration',
        'problemSlug',
        'submittedAt',
        'id',
      ])
      expect(stores.submissions.index('byExternalSubmission').unique).toBe(true)
      finish(undefined)
    },
  )
})
it('rolls back the entire migration on abort', async () => {
  const factory = new IDBFactory()
  ;(await seed(factory)).close()
  const put = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put')!
    .value as typeof IDBObjectStore.prototype.put
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args
  ) {
    const result = put.apply(this, args)
    if (this.name === 'coreSnapshots') this.transaction.abort()
    return result
  })
  await expect(
    createLocalIdbStore(factory, 'test').readHead(),
  ).rejects.toThrow()
  vi.restoreAllMocks()
  const db = await seed(factory)
  expect(db.version).toBe(1)
  expect(db.objectStoreNames.contains('coreSnapshots')).toBe(false)
  const request = db.transaction('records').objectStore('records').get('active')
  expect(
    JSON.stringify(
      await new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result)
      }),
    ),
  ).toBe(JSON.stringify(original))
  db.close()
})
it('surfaces blocked upgrades', async () => {
  const factory = new IDBFactory(),
    held = await seed(factory)
  await expect(createLocalIdbStore(factory, 'test').readHead()).rejects.toThrow(
    'blocked',
  )
  held.close()
})
it('surfaces future versions', async () => {
  const factory = new IDBFactory()
  ;(await seed(factory, 3)).close()
  await expect(
    createLocalIdbStore(factory, 'test').readHead(),
  ).rejects.toThrow()
})
it('waits for commit and rolls back after finish when aborted', async () => {
  const local = createLocalIdbStore(new IDBFactory(), 'test')
  await expect(
    local.transact(['records'], 'readwrite', (stores, finish, fail) => {
      expect(stores.records.transaction.durability).toBe('strict')
      stores.records.put('value', 'test')
      finish(undefined)
      fail(new Error('stop'))
    }),
  ).rejects.toThrow('stop')
  expect(await local.readRecord('test')).toBeUndefined()
})

it('uses compound out-of-line keys and omits absent external aliases from the unique index', async () => {
  const local = createLocalIdbStore(new IDBFactory(), 'test')
  const submission = {
    archiveGeneration: 'generation',
    problemSlug: 'two-sum',
    submittedAt: '2026-10-31',
    id: 'one',
  }
  await local.transact(
    [
      'submissions',
      'problemNotes',
      'analysisReports',
      'savedAiNotes',
      'problemScopes',
      'payloads',
    ],
    'readwrite',
    (stores, finish) => {
      for (const store of Object.values(stores))
        expect(store.keyPath).toBeNull()
      stores.submissions.add(submission, ['generation', 'one'])
      stores.submissions.add({ ...submission, id: 'two' }, [
        'generation',
        'two',
      ])
      stores.submissions.add(
        {
          ...submission,
          id: 'three',
          host: 'leetcode.com',
          externalSubmissionId: '123',
        },
        ['generation', 'three'],
      )
      stores.submissions.add(
        {
          archiveGeneration: 'generation',
          attemptAlias: 'attempt-1',
          submissionId: 'one',
        },
        ['generation', 'alias', 'attempt-1'],
      )
      expect(stores.analysisReports.index('byProblem').keyPath).toEqual([
        'archiveGeneration',
        'problemSlug',
        'id',
      ])
      expect(stores.savedAiNotes.index('byProblem').keyPath).toEqual([
        'archiveGeneration',
        'problemSlug',
        'assessmentId',
      ])
      finish(undefined)
    },
  )
  await local.transact(['submissions'], 'readonly', (stores, finish) => {
    const request = stores.submissions.index('byExternalSubmission').count()
    request.onsuccess = () => {
      expect(request.result).toBe(1)
      finish(undefined)
    }
  })
  await expect(
    local.transact(['submissions'], 'readwrite', (stores, finish) => {
      stores.submissions.add(
        {
          ...submission,
          id: 'collision',
          host: 'leetcode.com',
          externalSubmissionId: '123',
        },
        ['generation', 'collision'],
      )
      finish(undefined)
    }),
  ).rejects.toThrow()
})
