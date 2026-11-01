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
it('preserves every binary root and continuation during the v1 upgrade', async () => {
  const factory = new IDBFactory()
  ;(await seed(factory)).close()
  const local = createLocalIdbStore(factory, 'test'),
    snapshots = createSnapshotIdbStore(factory, 'test')
  expect(localDatabaseVersion).toBe(3)
  expect(JSON.parse(JSON.stringify(await snapshots.readActive()))).toEqual(
    JSON.parse(JSON.stringify(original)),
  )
  const head = await local.readHead()
  expect(head).toMatchObject({
    formatVersion: 2,
    revision: 8,
    lastVerifiedRevision: 6,
  })
  expect(
    await local.readRecord(['archive-generation', 'legacy']),
  ).toMatchObject({
    identity: 'initial:legacy',
    status: 'ready',
    storeIndex: 5,
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
        'submittedAtSortKey',
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
  ;(await seed(factory, 4)).close()
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

it('keeps preserving v1 recovery provenance usable by bounded technical maintenance', async () => {
  const { IDBKeyRange } = await import('fake-indexeddb')
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const factory = new IDBFactory()
  ;(await seed(factory)).close()
  const local = createLocalIdbStore(factory, 'test')
  await local.readHead()
  const { createNotesMaintenanceService } =
    await import('@/features/notes/server/notes-maintenance-service')
  const maintenance = createNotesMaintenanceService({ local })
  for (let i = 0; i < 40; i++) {
    if (!(await maintenance.collectBatch()).hasMore) break
  }
  expect(await local.readCore('legacy:active')).not.toBeNull()
  expect(await local.readCore('legacy:recovery')).not.toBeNull()
  expect(
    await createSnapshotIdbStore(factory, 'test').readReplacementRecovery(
      'restore',
    ),
  ).toMatchObject({ replacementId: 'restore', revision: 7 })
  vi.unstubAllGlobals()
})

async function seedV2(factory: IDBFactory, corrupt = false) {
  const { makeNotesArchive } =
    await import('@/features/notes/testing/notes-fixtures')
  const row = (await makeNotesArchive()).submissions[0]!
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('test', 2)
    request.onupgradeneeded = () => {
      const database = request.result
      const records = database.createObjectStore('records')
      database
        .createObjectStore('coreSnapshots')
        .put(original.bytes, 'opaque-core')
      for (const name of archiveStoreNames) {
        const store = database.createObjectStore(name)
        if (name !== 'submissions') continue
        store.createIndex('byProblem', [
          'archiveGeneration',
          'problemSlug',
          'submittedAt',
          'id',
        ])
        store.createIndex(
          'byExternalSubmission',
          ['archiveGeneration', 'host', 'externalSubmissionId'],
          { unique: true },
        )
        store.createIndex(
          'byAttemptAlias',
          ['archiveGeneration', 'attemptAlias'],
          { unique: true },
        )
        for (const [id, submittedAt] of [
          ['a', '2026-10-31T12:00:00Z'],
          ['b', '2026-10-31T12:00:00.500000001Z'],
        ])
          store.put(
            {
              ...row,
              id,
              submittedAt:
                corrupt && id === 'b' ? '2026-02-30T12:00:00Z' : submittedAt,
              externalSubmissionId: null,
              archiveGeneration: 'opaque-generation',
            },
            ['opaque-generation', id!],
          )
        store.put(
          {
            archiveGeneration: 'opaque-generation',
            attemptAlias: 'attempt',
            submissionId: 'a',
          },
          ['opaque-generation', 'alias', 'attempt'],
        )
      }
      records.put(
        {
          key: 'active',
          formatVersion: 2,
          coreSnapshotId: 'opaque-core',
          archiveGeneration: 'opaque-generation',
          datasetToken: 'opaque-token',
          revision: 37,
          lastVerifiedRevision: 35,
          savedAt: '2026-10-31',
          fingerprint: 'schema',
        },
        'active',
      )
      records.put(
        { identity: 'opaque-ready', status: 'ready', storeIndex: 5 },
        ['archive-generation', 'opaque-generation'],
      )
      records.put(91, ['local-technical-write-epoch'])
      records.put({ opaque: 'pending' }, 'replacement-pending')
      records.put(
        { ...original, opaque: 'must remain binary' },
        'recovery:opaque-binary',
      )
      records.put({ kind: 'core-only', coreSnapshotId: 'opaque-core' }, [
        'provenance',
        'opaque',
      ])
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

async function readV2State(database: IDBDatabase) {
  const transaction = database.transaction([
    'records',
    'coreSnapshots',
    'submissions',
  ])
  const result: Record<string, unknown> = {}
  for (const name of ['records', 'coreSnapshots', 'submissions']) {
    const store = transaction.objectStore(name)
    const keys = store.getAllKeys(),
      values = store.getAll()
    values.onsuccess = () => {
      result[name] = { keys: keys.result, values: values.result }
    }
  }
  return new Promise<typeof result>((resolve, reject) => {
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
}

it('backfills the actual v2 raw index without changing roots, technical state, payloads or aliases', async () => {
  const { IDBKeyRange } = await import('fake-indexeddb')
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const factory = new IDBFactory()
  const database = await seedV2(factory)
  const before = await readV2State(database)
  await new Promise<void>((resolve) => {
    const request = database
      .transaction('submissions')
      .objectStore('submissions')
      .index('byProblem')
      .getAll()
    request.onsuccess = () => {
      expect(request.result.map((row: { id: string }) => row.id)).toEqual([
        'b',
        'a',
      ])
      resolve()
    }
  })
  database.close()
  const local = createLocalIdbStore(factory, 'test')
  await local.readHead()
  await local.transact(
    ['records', 'coreSnapshots', 'submissions'],
    'readonly',
    (s, done) => {
      const request = s.submissions.index('byProblem').getAll()
      request.onsuccess = () => {
        expect(request.result.map((row: { id: string }) => row.id)).toEqual([
          'a',
          'b',
        ])
        expect(request.result[1]).toMatchObject({
          submittedAt: '2026-10-31T12:00:00.500000001Z',
          submittedAtSortKey: '2026-10-31T12:00:00.500000001',
        })
        done(undefined)
      }
    },
  )
  const reopened = await new Promise<IDBDatabase>((resolve) => {
    const request = factory.open('test', 3)
    request.onsuccess = () => resolve(request.result)
  })
  const after = await readV2State(reopened)
  expect(after.records).toEqual(before.records)
  expect(after.coreSnapshots).toEqual(before.coreSnapshots)
  const rows = (after.submissions as { values: Array<Record<string, unknown>> })
    .values
  expect(
    rows
      .filter((row) => row.id !== undefined)
      .every((row) => typeof row.submittedAtSortKey === 'string'),
  ).toBe(true)
  expect(rows.find((row) => row.attemptAlias === 'attempt')).not.toHaveProperty(
    'submittedAtSortKey',
  )
  expect({
    ...(after.submissions as { keys: unknown[]; values: unknown[] }),
    values: rows.map((value) => {
      const row = { ...value }
      delete row.submittedAtSortKey
      return row
    }),
  }).toEqual(before.submissions)
  reopened.close()
  vi.unstubAllGlobals()
})

it.each(['corrupt', 'abort'])(
  'rolls back the v3 index and all backfill writes on %s',
  async (fault) => {
    const factory = new IDBFactory()
    const database = await seedV2(factory, fault === 'corrupt')
    const before = await readV2State(database)
    database.close()
    if (fault === 'abort') {
      const { IDBCursor } = await import('fake-indexeddb')
      const update = Object.getOwnPropertyDescriptor(
        IDBCursor.prototype,
        'update',
      )!.value as typeof IDBCursor.prototype.update
      vi.spyOn(IDBCursor.prototype, 'update').mockImplementation(function (
        this: IDBCursor,
        value: unknown,
      ) {
        const request = update.call(this, value)
        request.onsuccess = () => request.transaction!.abort()
        return request
      })
    }
    await expect(
      createLocalIdbStore(factory, 'test').readHead(),
    ).rejects.toThrow()
    vi.restoreAllMocks()
    const unchanged = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('test', 2)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB request failed.'))
    })
    expect(unchanged.version).toBe(2)
    expect(await readV2State(unchanged)).toEqual(before)
    expect(
      unchanged
        .transaction('submissions')
        .objectStore('submissions')
        .index('byProblem').keyPath,
    ).toEqual(['archiveGeneration', 'problemSlug', 'submittedAt', 'id'])
    unchanged.close()
  },
)
