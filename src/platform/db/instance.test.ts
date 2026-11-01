import { sql } from 'drizzle-orm'
import { IDBObjectStore, indexedDB as testIndexedDB } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./proxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./proxy')>()

  return {
    ...actual,
    setOnMutationHook: vi.fn(actual.setOnMutationHook),
  }
})

// This platform integration test uses feature repositories to seed valid owned-row graphs.
// eslint-disable-next-line no-restricted-imports
import { saveReviewResult } from '@/features/practice/server/practice-service'
// eslint-disable-next-line no-restricted-imports
import { createSettingsRepository } from '@/features/settings/data/settings-repository'
import { getBackgroundDb } from '@/extension/background/app-db'
import { createBackupReplacementCoordinator } from '@/extension/background/backup-replacement'
// eslint-disable-next-line no-restricted-imports
import { createProblemsRepository } from '@/features/problems/data/problems-repository'
// eslint-disable-next-line no-restricted-imports
import { buildTopicGraph } from '@/features/problems/domain/topic-graph'
import { createDb, createSqliteWasmLocator } from './client'
import {
  getAppDb,
  flushDbSnapshot,
  waitForPendingDbSnapshot,
  resetAppDbForTesting,
  beginDbReplacement,
  commitDbReplacementSnapshot,
} from './instance'
import { migrationSql } from './migration-sql'
import {
  legacyTopicMigrationFingerprint,
  legacyTopicMigrationSql,
} from './snapshot-upgrade'
import {
  RECOVERY_KEY,
  TRACK_RECOVERY_KEY,
  FSRS_RECOVERY_KEY,
} from './snapshot-state'
import {
  bytesToBase64,
  base64ToBytes,
  deserializeDb,
  FINGERPRINT_KEY,
  SNAPSHOT_KEY,
  computeFingerprint,
  serializeDb,
} from './snapshot'
import * as snapshot from './snapshot'
import { setOnMutationHook } from './proxy'
import { createSnapshotIdbStore } from './snapshot-idb'
import {
  expectedV8MigrationFingerprint,
  frozenV8MigrationSql,
  frozenV8MigrationEntries,
} from '@/testing/fixtures/tracks-external-progress-legacy-migrations'

const now = new Date('2026-09-26T12:00:00.000Z')
const openedHandles: Awaited<ReturnType<typeof getAppDb>>[] = []

class FakeStorage {
  readonly values: Record<string, unknown> = {}
  rejectActiveSnapshotWrite = false

  get = vi.fn((keys: string[]) =>
    Promise.resolve(
      Object.fromEntries(
        keys
          .filter((key) => key in this.values)
          .map((key) => [key, this.values[key]]),
      ),
    ),
  )

  set = vi.fn((values: Record<string, unknown>) => {
    if (
      this.rejectActiveSnapshotWrite &&
      SNAPSHOT_KEY in values &&
      FINGERPRINT_KEY in values
    ) {
      return Promise.reject(new Error('storage unavailable'))
    }
    Object.assign(this.values, values)
    return Promise.resolve()
  })

  remove = vi.fn((keys: string[]) => {
    for (const key of keys) delete this.values[key]
    return Promise.resolve()
  })
}

beforeEach(() => {
  resetAppDbForTesting()
})

afterEach(() => {
  resetAppDbForTesting()
  while (openedHandles.length > 0) openedHandles.pop()?.rawDb.close()
  vi.unstubAllGlobals()
})

async function openTestDb() {
  const handle = await getAppDb()
  openedHandles.push(handle)
  return handle
}

function installStorage() {
  const storage = new FakeStorage()
  vi.stubGlobal('chrome', { storage: { local: storage } })
  return storage
}

function readRows(db: Awaited<ReturnType<typeof getAppDb>>, table: string) {
  return db.rawDb.exec({
    sql: `SELECT * FROM "${table}" ORDER BY rowid`,
    returnValue: 'resultRows',
  })
}

function readOwnedRows(db: Awaited<ReturnType<typeof getAppDb>>) {
  return Object.fromEntries(
    [
      'problems',
      'companies',
      'problem_companies',
      'problem_topics',
      'problem_practice',
      'fsrs_cards',
      'review_attempts',
      'tracks',
      'track_groups',
      'track_group_problems',
      'track_session',
      'settings_kv',
      'track_problem_progress',
    ].map((table) => [
      table,
      readRows(db, table).sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
    ]),
  )
}

describe('committed snapshot publication', () => {
  it('resumes replacement continuation after validated startup schema upgrade', async () => {
    installStorage()
    const store = createSnapshotIdbStore(
      testIndexedDB,
      `replacement-upgrade-${crypto.randomUUID()}`,
    )
    const legacy = await createDb({
      migrationSql: frozenV8MigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    const bytes = serializeDb(legacy)
    await store.commitSnapshot(bytes, expectedV8MigrationFingerprint, now)
    await store.commitReplacement(bytes, expectedV8MigrationFingerprint, now, {
      replacementId: 'restore-before-upgrade',
      kind: 'restore',
    })
    legacy.rawDb.close()
    openedHandles.push(await getAppDb({ snapshotStore: store }))
    const active = await store.readActive()
    expect(active).toMatchObject({
      revision: 3,
      replacementId: 'restore-before-upgrade',
      fingerprint: computeFingerprint(migrationSql),
    })
    expect(await store.readRecovery(TRACK_RECOVERY_KEY)).not.toBeNull()
    expect(
      Buffer.compare(
        Buffer.from(
          (await store.readReplacementRecovery('restore-before-upgrade'))!
            .bytes,
        ),
        Buffer.from(bytes),
      ),
    ).toBe(0)
    const onDurable = vi.fn().mockResolvedValue(undefined)
    const finishSyncMetadata = vi.fn().mockResolvedValue(undefined)
    const coordinator = createBackupReplacementCoordinator({
      store,
      resumeAdoption: async () => {
        const handle = await getAppDb({ snapshotStore: store })
        expect(Buffer.from(serializeDb(handle))).toEqual(
          Buffer.from((await store.readActive())!.bytes),
        )
      },
      resume: () => ({ onDurable, finishSyncMetadata }),
    })
    await coordinator.ready()
    expect(coordinator.getState().status).toBe('durable-sync-metadata-pending')
    expect(await coordinator.retry()).toMatchObject({
      status: 'durable',
      syncMetadataPending: false,
    })
    expect(onDurable).toHaveBeenCalledTimes(1)
    expect(finishSyncMetadata).toHaveBeenCalledTimes(1)
    expect((await store.readActive())?.revision).toBe(3)
  })
  it('reopens the old durable data after replacement publication aborts', async () => {
    installStorage()
    const store = createSnapshotIdbStore(
      testIndexedDB,
      `replacement-open-${crypto.randomUUID()}`,
    )
    const opened = await getAppDb({ snapshotStore: store })
    openedHandles.push(opened)
    const before = await store.readActive()
    const oldSettings = readRows(opened, 'settings_kv')
    beginDbReplacement()
    await createSettingsRepository(opened.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    const originalPut = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'put',
    )!.value as typeof IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: globalThis.IDBObjectStore,
      ...args
    ) {
      const request = originalPut.apply(this, args)
      this.transaction.abort()
      return request
    })
    await expect(
      commitDbReplacementSnapshot({
        replacementId: 'restore-1',
        kind: 'restore',
      }),
    ).rejects.toThrow()
    vi.restoreAllMocks()
    expect((await store.readActive())?.bytes).toEqual(before?.bytes)
    resetAppDbForTesting()
    const reopened = await getAppDb({ snapshotStore: store })
    openedHandles.push(reopened)
    expect(readRows(reopened, 'settings_kv')).toEqual(oldSettings)
  })
  it('rejects a mismatched IDB readback and retries the unacknowledged snapshot', async () => {
    installStorage()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `readback-${crypto.randomUUID()}`,
    )
    const handle = await getAppDb({ snapshotStore })
    openedHandles.push(handle)
    const before = (await snapshotStore.readActive())!
    await createSettingsRepository(handle.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    const read = vi.spyOn(snapshotStore, 'readActive')
    read.mockResolvedValueOnce(before)
    await expect(flushDbSnapshot()).rejects.toThrow(
      'IndexedDB snapshot readback did not match',
    )
    read.mockRestore()
    const failedRevision = (await snapshotStore.readActive())!.revision
    await flushDbSnapshot()
    expect((await snapshotStore.readActive())?.revision).toBe(failedRevision)
  })
  it('does not acknowledge a retry when IDB still reads a different snapshot', async () => {
    installStorage()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `readback-stale-${crypto.randomUUID()}`,
    )
    const handle = await getAppDb({ snapshotStore })
    openedHandles.push(handle)
    const before = (await snapshotStore.readActive())!
    await createSettingsRepository(handle.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    const read = vi.spyOn(snapshotStore, 'readActive')
    const commit = vi.spyOn(snapshotStore, 'commitSnapshot')
    read.mockResolvedValueOnce(before)
    await expect(flushDbSnapshot()).rejects.toThrow(
      'IndexedDB snapshot readback did not match',
    )
    const firstRevision = (await snapshotStore.readActive())!.revision
    read.mockResolvedValueOnce(before)
    await expect(flushDbSnapshot()).rejects.toThrow(
      'IndexedDB snapshot readback did not match',
    )
    expect(commit).toHaveBeenCalledTimes(1)
    expect((await snapshotStore.readActive())?.revision).toBe(firstRevision)
  })
  it('waits for the IDB commit, skips unchanged flushes, and reopens the last durable state after a failed commit', async () => {
    installStorage()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `durability-${crypto.randomUUID()}`,
    )
    const handle = await getAppDb({ snapshotStore })
    openedHandles.push(handle)
    const baseline = (await snapshotStore.readActive())!
    await flushDbSnapshot()
    expect((await snapshotStore.readActive())?.revision).toBe(baseline.revision)

    const settings = createSettingsRepository(handle.db)
    await settings.updateSettings({ appearance: { themeMode: 'dark' } }, now)
    let releaseCommit!: () => void
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve
    })
    const originalCommit = snapshotStore.commitSnapshot.bind(snapshotStore)
    const commit = vi
      .spyOn(snapshotStore, 'commitSnapshot')
      .mockImplementation(async (...args) => {
        await commitGate
        return originalCommit(...args)
      })
    let settled = false
    const pending = flushDbSnapshot().then(() => {
      settled = true
    })
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1))
    expect(settled).toBe(false)
    expect((await snapshotStore.readActive())?.revision).toBe(baseline.revision)
    releaseCommit()
    await pending
    const durable = (await snapshotStore.readActive())!
    expect(durable.revision).toBe(baseline.revision + 1)
    await flushDbSnapshot()
    expect((await snapshotStore.readActive())?.revision).toBe(durable.revision)

    commit.mockRejectedValueOnce(new Error('IDB transaction aborted'))
    await settings.updateSettings(
      { appearance: { themeMode: 'light' } },
      new Date(now.getTime() + 1_000),
    )
    await expect(flushDbSnapshot()).rejects.toThrow('IDB transaction aborted')
    resetAppDbForTesting()
    const reopened = await getAppDb({ snapshotStore })
    openedHandles.push(reopened)
    expect(
      (await createSettingsRepository(reopened.db).getSettings()).appearance
        .themeMode,
    ).toBe('dark')
  })
  it.each(['ROLLBACK', 'COMMIT'])(
    'defers automatic publication until a stalled transaction ends with %s',
    async (ending) => {
      const storage = installStorage()
      const handle = await openTestDb()
      const settings = createSettingsRepository(handle.db)
      await settings.updateSettings({ appearance: { themeMode: 'dark' } }, now)
      await flushDbSnapshot()
      const baseline = storage.values[SNAPSHOT_KEY]
      handle.rawDb.exec('BEGIN')
      await handle.db.run(
        sql`UPDATE settings_kv SET value = ${JSON.stringify({ ...(await settings.getSettings()), appearance: { themeMode: 'light' } })} WHERE key = 'user-settings'`,
      )
      await new Promise((resolve) => setTimeout(resolve, 325))
      expect(storage.values[SNAPSHOT_KEY] === baseline).toBe(true)
      handle.rawDb.exec(ending)
      await new Promise((resolve) => setTimeout(resolve, 325))
      resetAppDbForTesting()
      const reopened = await openTestDb()
      expect(
        (await createSettingsRepository(reopened.db).getSettings()).appearance
          .themeMode,
      ).toBe(ending === 'COMMIT' ? 'light' : 'dark')
    },
  )

  it('rejects explicit flush during an open transaction and retains the durable baseline', async () => {
    const storage = installStorage()
    const handle = await openTestDb()
    const baseline = storage.values[SNAPSHOT_KEY]
    handle.rawDb.exec('BEGIN')
    await handle.db.run(
      sql`INSERT INTO settings_kv (key, value, updated_at) VALUES ('guard-probe', 'uncommitted', 1)`,
    )
    await expect(flushDbSnapshot()).rejects.toThrow(/transaction/i)
    expect(storage.values[SNAPSHOT_KEY] === baseline).toBe(true)
    handle.rawDb.exec('ROLLBACK')
    await flushDbSnapshot()
  })
})

describe('app database startup', () => {
  it('publishes a fresh startup snapshot to both IDB and Chrome storage', async () => {
    const storage = installStorage()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `fresh-${crypto.randomUUID()}`,
    )

    openedHandles.push(await getAppDb({ snapshotStore }))

    const active = await snapshotStore.readActive()
    expect(active?.fingerprint).toBe(computeFingerprint(migrationSql))
    expect(storage.values[FINGERPRINT_KEY]).toBe(active?.fingerprint)
    expect(
      Buffer.compare(
        Buffer.from(base64ToBytes(String(storage.values[SNAPSHOT_KEY]))),
        Buffer.from(active!.bytes),
      ),
    ).toBe(0)
  })

  it('publishes an IDB upgrade startup snapshot to Chrome storage', async () => {
    const storage = installStorage()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `upgrade-${crypto.randomUUID()}`,
    )
    const legacy = await createDb({
      migrationSql: frozenV8MigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    await snapshotStore.commitSnapshot(
      serializeDb(legacy),
      expectedV8MigrationFingerprint,
      now,
    )
    legacy.rawDb.close()

    openedHandles.push(await getAppDb({ snapshotStore }))

    const active = await snapshotStore.readActive()
    expect(active?.fingerprint).toBe(computeFingerprint(migrationSql))
    expect(storage.values[FINGERPRINT_KEY]).toBe(active?.fingerprint)
    expect(
      Buffer.compare(
        Buffer.from(base64ToBytes(String(storage.values[SNAPSHOT_KEY]))),
        Buffer.from(active!.bytes),
      ),
    ).toBe(0)
  })

  it('upgrades an IDB snapshot larger than Chrome quota with a binary IDB recovery copy', async () => {
    const storage = installStorage()
    const originalSet = storage.set
    storage.set = vi.fn(async (values) => {
      if (JSON.stringify(values).length > 10 * 1024 * 1024) {
        throw new Error('Chrome quota exceeded')
      }
      await originalSet(values)
    })
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `large-upgrade-${crypto.randomUUID()}`,
    )
    const legacy = await createDb({
      migrationSql: frozenV8MigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    legacy.rawDb.exec(
      `INSERT INTO settings_kv (key, value, updated_at) VALUES ('large-proof', '${'x'.repeat(11 * 1024 * 1024)}', 1)`,
    )
    const originalBytes = serializeDb(legacy)
    expect(originalBytes.byteLength).toBeGreaterThan(10 * 1024 * 1024)
    await snapshotStore.commitSnapshot(
      originalBytes,
      expectedV8MigrationFingerprint,
      now,
    )
    legacy.rawDb.close()

    const upgraded = await getAppDb({ snapshotStore })
    openedHandles.push(upgraded)
    expect(
      upgraded.rawDb.exec({
        sql: "SELECT length(value) FROM settings_kv WHERE key = 'large-proof'",
        returnValue: 'resultRows',
      }),
    ).toEqual([[11 * 1024 * 1024]])
    const recovery = await snapshotStore.readRecovery(TRACK_RECOVERY_KEY)
    expect(recovery?.value).toMatchObject({
      version: 2,
      fingerprint: expectedV8MigrationFingerprint,
    })
    const recoveryBytes = (recovery?.value as { bytes: Uint8Array }).bytes
    expect(
      Buffer.compare(Buffer.from(recoveryBytes), Buffer.from(originalBytes)),
    ).toBe(0)
    expect(storage.values[TRACK_RECOVERY_KEY]).toBeUndefined()
    expect(storage.values[SNAPSHOT_KEY]).toBeUndefined()

    await createSettingsRepository(upgraded.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    await expect(flushDbSnapshot()).resolves.toBeUndefined()

    resetAppDbForTesting()
    const reopened = await getAppDb({ snapshotStore })
    openedHandles.push(reopened)
    expect(
      reopened.rawDb.exec({
        sql: "SELECT length(value) FROM settings_kv WHERE key = 'large-proof'",
        returnValue: 'resultRows',
      }),
    ).toEqual([[11 * 1024 * 1024]])
    expect(
      (await createSettingsRepository(reopened.db).getSettings()).appearance
        .themeMode,
    ).toBe('dark')
  }, 45_000)

  it('identifies a non-quota Chrome mirror failure after IDB upgrade publication', async () => {
    const storage = installStorage()
    storage.rejectActiveSnapshotWrite = true
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `mirror-${crypto.randomUUID()}`,
    )
    const legacy = await createDb({
      migrationSql: frozenV8MigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    await snapshotStore.commitSnapshot(
      serializeDb(legacy),
      expectedV8MigrationFingerprint,
      now,
    )
    legacy.rawDb.close()

    await expect(getAppDb({ snapshotStore })).rejects.toThrow(
      'Chrome snapshot mirror publication failed',
    )
    expect((await snapshotStore.readActive())?.fingerprint).toBe(
      computeFingerprint(migrationSql),
    )
  })

  it('reports an IDB recovery collision separately from invalid snapshot data', async () => {
    installStorage()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `collision-${crypto.randomUUID()}`,
    )
    const legacy = await createDb({
      migrationSql: frozenV8MigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    await snapshotStore.commitSnapshot(
      serializeDb(legacy),
      expectedV8MigrationFingerprint,
      now,
    )
    legacy.rawDb.close()
    await snapshotStore.commitRecovery(TRACK_RECOVERY_KEY, {
      version: 2,
      fingerprint: 'another',
      bytes: new Uint8Array([1]),
      savedAt: now.toISOString(),
    })

    await expect(getAppDb({ snapshotStore })).rejects.toThrow(
      'IndexedDB recovery preservation failed',
    )
    expect((await snapshotStore.readActive())?.fingerprint).toBe(
      expectedV8MigrationFingerprint,
    )
  })

  it('reports an IDB upgrade publication failure without calling the source invalid', async () => {
    installStorage()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `publication-${crypto.randomUUID()}`,
    )
    const legacy = await createDb({
      migrationSql: frozenV8MigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    await snapshotStore.commitSnapshot(
      serializeDb(legacy),
      expectedV8MigrationFingerprint,
      now,
    )
    legacy.rawDb.close()
    vi.spyOn(snapshotStore, 'commitSnapshot').mockRejectedValue(
      new Error('IDB write failed'),
    )

    await expect(getAppDb({ snapshotStore })).rejects.toThrow(
      'IndexedDB publication failed',
    )
    expect((await snapshotStore.readActive())?.fingerprint).toBe(
      expectedV8MigrationFingerprint,
    )
    expect(await snapshotStore.readRecovery(TRACK_RECOVERY_KEY)).not.toBeNull()
  })

  it('migrates a validated matching legacy snapshot before removing its pair', async () => {
    const storage = installStorage()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `migration-${crypto.randomUUID()}`,
    )
    const legacy = await createDb({
      migrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    legacy.rawDb.exec(
      "INSERT INTO settings_kv (key, value, updated_at) VALUES ('migration-proof', 'preserved', 1)",
    )
    const originalBytes = serializeDb(legacy)
    legacy.rawDb.close()
    storage.values[SNAPSHOT_KEY] = bytesToBase64(originalBytes)
    storage.values[FINGERPRINT_KEY] = computeFingerprint(migrationSql)
    storage.remove.mockImplementation(async (keys) => {
      const persisted = await snapshotStore.readActive()
      expect(persisted?.fingerprint).toBe(computeFingerprint(migrationSql))
      expect(
        Buffer.compare(
          Buffer.from(persisted!.bytes),
          Buffer.from(originalBytes),
        ),
      ).toBe(0)
      for (const key of keys) delete storage.values[key]
    })

    const handle = await getAppDb({ snapshotStore })
    openedHandles.push(handle)
    expect(readRows(handle, 'settings_kv')).toContainEqual([
      'migration-proof',
      'preserved',
      1,
    ])
    expect(storage.values[SNAPSHOT_KEY]).toBeUndefined()
    expect(storage.values[FINGERPRINT_KEY]).toBeUndefined()
    expect(storage.remove).toHaveBeenCalledWith([SNAPSHOT_KEY, FINGERPRINT_KEY])
  })

  it('reopens the newest IDB data after migrating, mutating, and flushing', async () => {
    const storage = installStorage()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `migration-${crypto.randomUUID()}`,
    )
    const legacy = await createDb({
      migrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    storage.values[SNAPSHOT_KEY] = bytesToBase64(serializeDb(legacy))
    storage.values[FINGERPRINT_KEY] = computeFingerprint(migrationSql)
    legacy.rawDb.close()

    const handle = await getAppDb({ snapshotStore })
    openedHandles.push(handle)
    await createSettingsRepository(handle.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    await flushDbSnapshot()
    resetAppDbForTesting()

    const reopened = await getAppDb({ snapshotStore })
    openedHandles.push(reopened)
    expect(
      (await createSettingsRepository(reopened.db).getSettings()).appearance
        .themeMode,
    ).toBe('dark')
  })

  it('keeps the legacy pair and fails recovery when IDB migration publication fails', async () => {
    const storage = installStorage()
    const legacy = await createDb({
      migrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    storage.values[SNAPSHOT_KEY] = bytesToBase64(serializeDb(legacy))
    storage.values[FINGERPRINT_KEY] = computeFingerprint(migrationSql)
    legacy.rawDb.close()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `migration-${crypto.randomUUID()}`,
    )
    vi.spyOn(snapshotStore, 'commitSnapshot').mockRejectedValue(
      new Error('IDB write failed'),
    )

    await expect(getAppDb({ snapshotStore })).rejects.toThrow(
      'Database recovery required',
    )
    expect(storage.values[SNAPSHOT_KEY]).toEqual(expect.any(String))
    expect(storage.values[FINGERPRINT_KEY]).toBe(
      computeFingerprint(migrationSql),
    )
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('does not fall back to a valid legacy pair when IDB active is invalid', async () => {
    const storage = installStorage()
    const legacy = await createDb({
      migrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    storage.values[SNAPSHOT_KEY] = bytesToBase64(serializeDb(legacy))
    storage.values[FINGERPRINT_KEY] = computeFingerprint(migrationSql)
    legacy.rawDb.close()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `migration-${crypto.randomUUID()}`,
    )
    vi.spyOn(snapshotStore, 'readActive').mockRejectedValue(
      new Error('invalid active record'),
    )

    await expect(getAppDb({ snapshotStore })).rejects.toThrow(
      'Database recovery required',
    )
    expect(storage.values[SNAPSHOT_KEY]).toEqual(expect.any(String))
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('requires recovery for invalid IDB bytes even with a valid legacy pair', async () => {
    const storage = installStorage()
    const legacy = await createDb({
      migrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    storage.values[SNAPSHOT_KEY] = bytesToBase64(serializeDb(legacy))
    storage.values[FINGERPRINT_KEY] = computeFingerprint(migrationSql)
    legacy.rawDb.close()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `migration-${crypto.randomUUID()}`,
    )
    await snapshotStore.commitSnapshot(
      new Uint8Array([1, 2, 3]),
      computeFingerprint(migrationSql),
      now,
    )

    await expect(getAppDb({ snapshotStore })).rejects.toThrow(
      'IndexedDB validation failed',
    )
    expect(storage.values[SNAPSHOT_KEY]).toEqual(expect.any(String))
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('preserves all three legacy recovery records in IDB before removing old keys', async () => {
    const storage = installStorage()
    const snapshotStore = createSnapshotIdbStore(
      testIndexedDB,
      `migration-${crypto.randomUUID()}`,
    )
    const legacy = await createDb({
      migrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    storage.values[SNAPSHOT_KEY] = bytesToBase64(serializeDb(legacy))
    storage.values[FINGERPRINT_KEY] = computeFingerprint(migrationSql)
    legacy.rawDb.close()
    for (const key of [RECOVERY_KEY, TRACK_RECOVERY_KEY, FSRS_RECOVERY_KEY]) {
      storage.values[key] = {
        version: 1,
        savedAt: now.toISOString(),
        raw: { [SNAPSHOT_KEY]: key },
      }
    }
    storage.remove.mockImplementation(async (keys) => {
      for (const key of keys) {
        if (
          [RECOVERY_KEY, TRACK_RECOVERY_KEY, FSRS_RECOVERY_KEY].includes(key)
        ) {
          expect(await snapshotStore.readRecovery(key)).toEqual({
            value: storage.values[key],
          })
        }
        delete storage.values[key]
      }
    })

    openedHandles.push(await getAppDb({ snapshotStore }))
    for (const key of [RECOVERY_KEY, TRACK_RECOVERY_KEY, FSRS_RECOVERY_KEY]) {
      expect(await snapshotStore.readRecovery(key)).toMatchObject({
        value: { raw: { [SNAPSHOT_KEY]: key } },
      })
      expect(storage.values[key]).toBeUndefined()
    }
  })
  it.each([
    'missing-evidence',
    'partial-evidence',
    'missing-local',
    'missing-problem',
  ])(
    'rejects current %s without preparation, rotation or publication',
    async (caseName) => {
      const storage = installStorage()
      const handle = await getBackgroundDb()
      openedHandles.push(handle)
      await saveReviewResult(handle.db, {
        problemSlug: 'two-sum',
        rating: 'good',
        reviewAttemptId: 'first-current',
      })
      await saveReviewResult(handle.db, {
        problemSlug: 'two-sum',
        rating: 'hard',
        reviewAttemptId: 'second-current',
      })
      if (caseName === 'missing-evidence')
        handle.rawDb.exec('DELETE FROM practice_review_evidence')
      if (caseName === 'partial-evidence')
        handle.rawDb.exec(
          "DELETE FROM practice_review_evidence WHERE review_attempt_id = 'first-current'",
        )
      if (caseName === 'missing-local')
        handle.rawDb.exec(
          "DELETE FROM practice_generations WHERE scope_id = 'local'",
        )
      if (caseName === 'missing-problem')
        handle.rawDb.exec(
          "DELETE FROM practice_generations WHERE scope_id = 'problem:two-sum'",
        )
      await flushDbSnapshot()
      const original = { ...storage.values }
      storage.set.mockClear()
      resetAppDbForTesting()
      await expect(getBackgroundDb()).rejects.toThrow(
        /Practice|generation|evidence/i,
      )
      expect(storage.values).toEqual(original)
      expect(storage.set).not.toHaveBeenCalled()
    },
  )

  it('invokes the current-data callback without preparation and retains bytes on rejection', async () => {
    const storage = installStorage()
    await openTestDb()
    const original = { ...storage.values }
    resetAppDbForTesting()
    storage.set.mockClear()
    const beforePublish = vi.fn()
    const validateCurrentData = vi.fn(() =>
      Promise.reject(new Error('feature preflight failed')),
    )
    await expect(
      getAppDb({ beforePublish, validateCurrentData }),
    ).rejects.toThrow('feature preflight failed')
    expect(beforePublish).not.toHaveBeenCalled()
    expect(validateCurrentData).toHaveBeenCalledTimes(1)
    expect(storage.set).not.toHaveBeenCalled()
    expect(storage.values).toEqual(original)
  })
  it('upgrades populated shipped v8 while preserving an earlier v7 recovery and the v8 original', async () => {
    const storage = installStorage()
    const legacy = await createDb({
      migrationSql: legacyTopicMigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    legacy.rawDb.exec(`
      INSERT INTO problems (slug, title, difficulty, is_premium, created_at, updated_at)
      VALUES ('v8-question', 'Preserved question', 'hard', 0, 11, 12);
      INSERT INTO tracks (id, slug, title, description, due_at, created_at, updated_at)
      VALUES ('v8-track', 'v8-track', 'Preserved track', 'Keep me', 99, 11, 12);
      INSERT INTO track_groups (id, track_id, title, position, created_at, updated_at)
      VALUES ('v8-group', 'v8-track', 'Preserved group', 3, 11, 12);
      INSERT INTO track_group_problems (track_group_id, track_id, problem_slug, position)
      VALUES ('v8-group', 'v8-track', 'v8-question', 7);
      INSERT INTO fsrs_cards (id, problem_slug, card_kind, due_at, stability, difficulty, elapsed_days,
        scheduled_days, learning_steps, reps, lapses, state, last_review_at, created_at, updated_at)
      VALUES ('v8-card', 'v8-question', 'default', 500, 2, 3, 1, 2, 0, 1, 0, 'review', 22, 11, 12);
      INSERT INTO review_attempts (id, problem_slug, card_id, rating, review_mode, reviewed_at, created_at, updated_at)
      VALUES ('v8-review', 'v8-question', 'v8-card', 'easy', 'free-practice', 22, 22, 23);
      INSERT INTO track_problem_progress (track_id, problem_slug, review_attempt_id, completed_at,
        completed_rating, created_at, updated_at)
      VALUES ('v8-track', 'v8-question', 'v8-review', 22, 'easy', 22, 23);
      INSERT INTO track_session (id, active_track_id, active_group_id, started_at, updated_at)
      VALUES ('active', 'v8-track', 'v8-group', 11, 12);
      INSERT INTO settings_kv (key, value, updated_at) VALUES ('v8-proof', '{"preserved":true}', 12);
    `)
    const earlierV7Snapshot = bytesToBase64(serializeDb(legacy))
    legacy.rawDb.exec(frozenV8MigrationEntries[8].sql)
    const expected = readOwnedRows(legacy)
    const snapshot = bytesToBase64(serializeDb(legacy))
    legacy.rawDb.close()
    storage.values[SNAPSHOT_KEY] = snapshot
    storage.values[FINGERPRINT_KEY] = expectedV8MigrationFingerprint
    const existingRecovery = {
      version: 1,
      savedAt: now.toISOString(),
      raw: {
        [SNAPSHOT_KEY]: earlierV7Snapshot,
        [FINGERPRINT_KEY]: legacyTopicMigrationFingerprint,
      },
    }
    storage.values[RECOVERY_KEY] = existingRecovery

    let prepared = false
    const upgraded = await getAppDb({
      beforePublish: (handle) => {
        expect(
          handle.rawDb.exec({
            sql: 'SELECT allow_external_progress FROM tracks',
            returnValue: 'resultRows',
          }),
        ).toEqual([[0]])
        expect(storage.values[SNAPSHOT_KEY]).toBe(snapshot)
        expect(storage.values[TRACK_RECOVERY_KEY]).toMatchObject({
          raw: {
            [SNAPSHOT_KEY]: snapshot,
            [FINGERPRINT_KEY]: expectedV8MigrationFingerprint,
          },
        })
        prepared = true
        return Promise.resolve()
      },
    })
    openedHandles.push(upgraded)

    expect(prepared).toBe(true)
    expect(readOwnedRows(upgraded)).toEqual({
      ...expected,
      tracks: expected.tracks!.map((row) => [...row, 0]),
    })
    expect(storage.values[RECOVERY_KEY]).toEqual(existingRecovery)
    expect(storage.values[TRACK_RECOVERY_KEY]).toMatchObject({
      raw: {
        [SNAPSHOT_KEY]: snapshot,
        [FINGERPRINT_KEY]: expectedV8MigrationFingerprint,
      },
    })
    expect(storage.values[FINGERPRINT_KEY]).toBe(
      computeFingerprint(migrationSql),
    )
    resetAppDbForTesting()
    const reopened = await openTestDb()
    expect(readOwnedRows(reopened)).toEqual(readOwnedRows(upgraded))
  })

  it.each(['schema', 'publication', 'track recovery collision'] as const)(
    'retains the v8 original when %s fails',
    async (failure) => {
      const storage = installStorage()
      const legacy = await createDb({
        migrationSql: frozenV8MigrationSql,
        locateWasm: createSqliteWasmLocator(),
      })
      legacy.rawDb.exec(
        "INSERT INTO tracks (id, slug, title, created_at, updated_at) VALUES ('kept', 'kept', 'Kept', 11, 12)",
      )
      if (failure === 'schema')
        legacy.rawDb.exec('CREATE TABLE unrecognized (id TEXT)')
      const snapshot = bytesToBase64(serializeDb(legacy))
      legacy.rawDb.close()
      storage.values[SNAPSHOT_KEY] = snapshot
      storage.values[FINGERPRINT_KEY] = expectedV8MigrationFingerprint
      storage.rejectActiveSnapshotWrite = failure === 'publication'
      const earlierRecovery = {
        version: 1,
        savedAt: now.toISOString(),
        raw: {
          [SNAPSHOT_KEY]: 'earlier v7 original',
          [FINGERPRINT_KEY]: legacyTopicMigrationFingerprint,
        },
      }
      storage.values[RECOVERY_KEY] = earlierRecovery
      const earlierTrackRecovery = {
        version: 1,
        savedAt: now.toISOString(),
        raw: {
          [SNAPSHOT_KEY]: 'another v8 original',
          [FINGERPRINT_KEY]: expectedV8MigrationFingerprint,
        },
      }
      if (failure === 'track recovery collision')
        storage.values[TRACK_RECOVERY_KEY] = earlierTrackRecovery

      await expect(getAppDb()).rejects.toThrow(
        failure === 'schema'
          ? 'The stored database schema does not match its supported version.'
          : failure === 'publication'
            ? 'storage unavailable'
            : 'An earlier database recovery record must be exported before another upgrade.',
      )
      expect(storage.values[SNAPSHOT_KEY]).toBe(snapshot)
      expect(storage.values[FINGERPRINT_KEY]).toBe(
        expectedV8MigrationFingerprint,
      )
      expect(storage.values[RECOVERY_KEY]).toEqual(earlierRecovery)
      if (failure === 'track recovery collision')
        expect(storage.values[TRACK_RECOVERY_KEY]).toEqual(earlierTrackRecovery)
      else
        expect(storage.values[TRACK_RECOVERY_KEY]).toMatchObject({
          raw: {
            [SNAPSHOT_KEY]: snapshot,
            [FINGERPRINT_KEY]: expectedV8MigrationFingerprint,
          },
        })
      if (failure === 'publication') {
        const firstTrackRecovery = storage.values[TRACK_RECOVERY_KEY]
        storage.rejectActiveSnapshotWrite = false
        resetAppDbForTesting()
        const retried = await openTestDb()
        expect(
          retried.rawDb.exec({
            sql: 'SELECT id, allow_external_progress FROM tracks',
            returnValue: 'resultRows',
          }),
        ).toEqual([['kept', 0]])
        expect(storage.values[RECOVERY_KEY]).toEqual(earlierRecovery)
        expect(storage.values[TRACK_RECOVERY_KEY]).toEqual(firstTrackRecovery)
      }
    },
  )

  it('round-trips seeded problem, review, FSRS, track, and settings data', async () => {
    installStorage()
    const handle = await openTestDb()
    await saveReviewResult(handle.db, {
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: now,
      isCorrect: true,
      targetRetention: 0.9,
    })
    await createSettingsRepository(handle.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    handle.rawDb.exec('UPDATE tracks SET allow_external_progress = 1')
    await flushDbSnapshot()
    const expected = readOwnedRows(handle)
    expect(expected.problems).not.toHaveLength(0)
    expect(expected.review_attempts).not.toHaveLength(0)
    expect(expected.fsrs_cards).not.toHaveLength(0)
    expect(expected.tracks).not.toHaveLength(0)
    expect(expected.settings_kv).not.toHaveLength(0)

    resetAppDbForTesting()
    const reopened = await openTestDb()

    expect(readOwnedRows(reopened)).toEqual(expected)
  })

  it('returns one in-flight open promise to concurrent callers', async () => {
    installStorage()
    const first = getAppDb()
    const second = getAppDb()

    expect(second).toBe(first)
    const handle = await first
    openedHandles.push(handle)
  })

  it('boots and validates a fresh database without Chrome storage', async () => {
    vi.stubGlobal('chrome', undefined)

    const handle = await openTestDb()
    expect(
      handle.rawDb.exec({
        sql: 'PRAGMA integrity_check',
        returnValue: 'resultRows',
      }),
    ).toEqual([['ok']])
    expect(
      handle.rawDb.exec({
        sql: 'SELECT COUNT(*) FROM problems',
        returnValue: 'resultRows',
      }),
    ).toEqual([[101]])
    await expect(flushDbSnapshot()).resolves.toBeUndefined()
  })

  it('keeps the database unavailable until preparation and active publication resolve', async () => {
    const fakeStorage = installStorage()
    let releasePreparation!: () => void
    let enteredPreparation!: () => void
    const preparationEntered = new Promise<void>((resolve) => {
      enteredPreparation = resolve
    })
    const preparationGate = new Promise<void>((resolve) => {
      releasePreparation = resolve
    })
    let releasePublication!: () => void
    let enteredPublication!: () => void
    const publicationEntered = new Promise<void>((resolve) => {
      enteredPublication = resolve
    })
    const publicationGate = new Promise<void>((resolve) => {
      releasePublication = resolve
    })
    const originalSet = fakeStorage.set
    fakeStorage.set = vi.fn(async (values) => {
      if (SNAPSHOT_KEY in values && FINGERPRINT_KEY in values) {
        enteredPublication()
        await publicationGate
      }
      await originalSet(values)
    })

    let resolved = false
    const opening = getAppDb({
      beforePublish: async () => {
        enteredPreparation()
        await preparationGate
      },
    }).then((handle) => {
      openedHandles.push(handle)
      resolved = true
      return handle
    })

    await preparationEntered
    expect(resolved).toBe(false)
    releasePreparation()
    await publicationEntered
    expect(resolved).toBe(false)
    releasePublication()
    await expect(opening).resolves.toBeDefined()
  })

  it('clears a failed fresh open so callers can retry without a stale hook', async () => {
    const fakeStorage = installStorage()
    fakeStorage.values['unrelated-local-setting'] = 'keep me'
    fakeStorage.rejectActiveSnapshotWrite = true
    const opening = getAppDb()

    await expect(opening).rejects.toThrow('storage unavailable')
    expect(fakeStorage.values[SNAPSHOT_KEY]).toBeUndefined()
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBeUndefined()
    expect(fakeStorage.values['unrelated-local-setting']).toBe('keep me')

    fakeStorage.rejectActiveSnapshotWrite = false
    const retried = openTestDb()
    await expect(retried).resolves.toBeDefined()
    expect(fakeStorage.values[SNAPSHOT_KEY]).toEqual(expect.any(String))
    expect(fakeStorage.values[FINGERPRINT_KEY]).toEqual(
      computeFingerprint(migrationSql),
    )
  })

  it('does not publish or install mutation hooks when beforePublish rejects, then retries cleanly', async () => {
    const fakeStorage = installStorage()
    const setMutationHook = vi.mocked(setOnMutationHook)
    setMutationHook.mockClear()
    const reconciliationFailure = new Error('reconciliation failed')

    await expect(
      getAppDb({
        beforePublish: () => Promise.reject(reconciliationFailure),
      }),
    ).rejects.toBe(reconciliationFailure)

    expect(fakeStorage.values[SNAPSHOT_KEY]).toBeUndefined()
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBeUndefined()
    expect(setMutationHook).not.toHaveBeenCalled()

    const retried = await openTestDb()
    expect(fakeStorage.values[SNAPSHOT_KEY]).toEqual(expect.any(String))
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(
      computeFingerprint(migrationSql),
    )
    expect(setMutationHook).toHaveBeenCalledTimes(1)
    expect(setMutationHook).toHaveBeenLastCalledWith(expect.any(Function))
    expect(retried).toBeDefined()
  })

  it('retains a populated legacy snapshot and recovery pair when reconciliation publication fails', async () => {
    const fakeStorage = installStorage()
    const legacyHandle = await createDb({
      migrationSql: legacyTopicMigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    legacyHandle.rawDb.exec(`
      INSERT INTO topics (id, label, created_at, updated_at)
      VALUES
        ('depth-first-search', 'Depth-First Search', 11, 12),
        ('graph-theory', 'Graph Theory', 13, 14);
      INSERT INTO topic_relations (parent_topic_id, child_topic_id, created_at, updated_at)
      VALUES ('graph-theory', 'depth-first-search', 15, 16);
    `)
    const originalSnapshot = bytesToBase64(serializeDb(legacyHandle))
    legacyHandle.rawDb.close()
    fakeStorage.values[SNAPSHOT_KEY] = originalSnapshot
    fakeStorage.values[FINGERPRINT_KEY] = legacyTopicMigrationFingerprint
    fakeStorage.rejectActiveSnapshotWrite = true

    await expect(getBackgroundDb()).rejects.toThrow('storage unavailable')

    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe(originalSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(
      legacyTopicMigrationFingerprint,
    )
    expect(fakeStorage.values[RECOVERY_KEY]).toMatchObject({
      version: 1,
      raw: {
        [SNAPSHOT_KEY]: originalSnapshot,
        [FINGERPRINT_KEY]: legacyTopicMigrationFingerprint,
      },
    })

    fakeStorage.rejectActiveSnapshotWrite = false
    const retry = await getBackgroundDb()
    openedHandles.push(retry)
    expect(
      retry.rawDb.exec({
        sql: `SELECT kind FROM topic_relations WHERE source_topic_id = 'depth-first-search' AND target_topic_id = 'graph-theory'`,
        returnValue: 'resultRows',
      }),
    ).toEqual([['applies-to']])
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(
      computeFingerprint(migrationSql),
    )
    expect(fakeStorage.values[RECOVERY_KEY]).toMatchObject({
      version: 1,
      raw: {
        [SNAPSHOT_KEY]: originalSnapshot,
        [FINGERPRINT_KEY]: legacyTopicMigrationFingerprint,
      },
    })
  })

  it('preserves populated v7 data while the background callback reconciles before 0008 publication', async () => {
    const fakeStorage = installStorage()
    const legacyHandle = await createDb({
      migrationSql: legacyTopicMigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    legacyHandle.rawDb.exec(`
      INSERT INTO problems (slug, title, difficulty, is_premium, created_at, updated_at)
      VALUES ('legacy-two-sum', 'Two Sum', 'easy', 1, 101, 102);
      INSERT INTO companies (id, label)
      VALUES ('legacy-company', 'Legacy Company');
      INSERT INTO problem_companies (problem_slug, company_id)
      VALUES ('legacy-two-sum', 'legacy-company');
      INSERT INTO problem_practice (
        problem_slug, status, first_seen_at, last_seen_at, last_reviewed_at,
        last_rating, last_elapsed_seconds, best_elapsed_seconds, interview_pattern,
        time_complexity, space_complexity, languages, notes, solved_count,
        attempt_count, is_suspended, created_at, updated_at
      ) VALUES (
        'legacy-two-sum', 'scheduled', 101, 201, 201, 'good', 42, 40,
        'two-pointers', 'O(n)', 'O(1)', '["TypeScript"]', 'keep this note',
        2, 3, 0, 101, 202
      );
      INSERT INTO fsrs_cards (
        id, problem_slug, card_kind, due_at, stability, difficulty, elapsed_days,
        scheduled_days, learning_steps, reps, lapses, state, last_review_at,
        created_at, updated_at
      ) VALUES (
        'legacy-card', 'legacy-two-sum', 'default', 987654321, 4.5, 5.5, 3,
        7, 0, 2, 1, 'review', 201, 101, 202
      );
      INSERT INTO review_attempts (
        id, problem_slug, card_id, rating, review_mode, reviewed_at, elapsed_seconds,
        is_correct, interview_pattern, time_complexity, space_complexity, languages,
        notes, fsrs_review_log, created_at, updated_at
      ) VALUES (
        'legacy-review', 'legacy-two-sum', 'legacy-card', 'good', 'free-practice',
        201, 42, 1, 'two-pointers', 'O(n)', 'O(1)', '["TypeScript"]',
        'review note', '{"rating":"good","state":"new","dueAt":"1970-01-01T00:00:00.101Z","stability":0,"difficulty":0,"elapsedDays":0,"lastElapsedDays":0,"scheduledDays":0,"learningSteps":0,"reviewedAt":"1970-01-01T00:00:00.201Z"}', 201, 202
      );
      INSERT INTO tracks (id, slug, title, description, due_at, created_at, updated_at)
      VALUES ('legacy-track', 'legacy-track', 'Legacy Track', 'preserve order', 456789, 101, 202);
      INSERT INTO track_groups (id, track_id, title, position, created_at, updated_at)
      VALUES ('legacy-group', 'legacy-track', 'Ordered group', 4, 101, 202);
      INSERT INTO track_group_problems (track_group_id, track_id, problem_slug, position)
      VALUES ('legacy-group', 'legacy-track', 'legacy-two-sum', 7);
      INSERT INTO track_problem_progress (
        track_id, problem_slug, review_attempt_id, completed_at, completed_rating,
        created_at, updated_at
      ) VALUES ('legacy-track', 'legacy-two-sum', 'legacy-review', 201, 'good', 101, 202);
      INSERT INTO track_session (id, active_track_id, active_group_id, started_at, updated_at)
      VALUES ('active-session', 'legacy-track', 'legacy-group', 101, 202);
      INSERT INTO settings_kv (key, value, updated_at)
      VALUES ('topic-upgrade-test', '{"kept":true}', 303);

      INSERT INTO topics (id, label, created_at, updated_at)
      VALUES
        ('depth-first-search', 'Depth-First Search', 11, 12),
        ('breadth-first-search', 'Breadth-First Search', 13, 14),
        ('graph-theory', 'Graph Theory', 15, 16),
        ('tree', 'Tree', 17, 18),
        ('custom-pattern', 'Custom Pattern', 19, 20);
      INSERT INTO problem_topics (problem_slug, topic_id)
      VALUES
        ('legacy-two-sum', 'depth-first-search'),
        ('legacy-two-sum', 'breadth-first-search'),
        ('legacy-two-sum', 'custom-pattern');
      INSERT INTO topic_aliases (alias_key, label, topic_id, created_at, updated_at)
      VALUES ('MY   Pattern Alias ', 'My   Pattern Alias ', 'custom-pattern', 21, 22);
      INSERT INTO topic_relations (parent_topic_id, child_topic_id, created_at, updated_at)
      VALUES
        ('tree', 'depth-first-search', 23, 24),
        ('tree', 'breadth-first-search', 25, 26);
    `)

    const expectedOwnedRows = readOwnedRows(legacyHandle)
    const originalSnapshot = bytesToBase64(serializeDb(legacyHandle))
    legacyHandle.rawDb.close()
    fakeStorage.values[SNAPSHOT_KEY] = originalSnapshot
    fakeStorage.values[FINGERPRINT_KEY] = legacyTopicMigrationFingerprint

    let publishSawReconciledDatabase = false
    const originalSet = fakeStorage.set
    fakeStorage.set = vi.fn(async (values: Record<string, unknown>) => {
      if (SNAPSHOT_KEY in values && FINGERPRINT_KEY in values) {
        const published = await createDb({
          locateWasm: createSqliteWasmLocator(),
        })
        try {
          deserializeDb(published, base64ToBytes(String(values[SNAPSHOT_KEY])))
          const aliases = published.rawDb.exec({
            sql: "SELECT alias_key FROM topic_aliases WHERE topic_id = 'custom-pattern'",
            returnValue: 'resultRows',
          })
          const relations = published.rawDb.exec({
            sql: 'SELECT source_topic_id, target_topic_id, kind FROM topic_relations',
            returnValue: 'resultRows',
          })
          publishSawReconciledDatabase =
            aliases.some(([aliasKey]) => aliasKey === 'my pattern alias') &&
            relations.some(
              ([source, target, kind]) =>
                source === 'depth-first-search' &&
                target === 'tree' &&
                kind === 'applies-to',
            )
        } finally {
          published.rawDb.close()
        }
      }
      return originalSet(values)
    })

    const upgraded = await getBackgroundDb()
    openedHandles.push(upgraded)

    expect(publishSawReconciledDatabase).toBe(true)
    expect(readOwnedRows(upgraded)).toEqual({
      ...expectedOwnedRows,
      tracks: expectedOwnedRows.tracks!.map((row) => [...row, 0]),
    })
    expect(fakeStorage.values[RECOVERY_KEY]).toMatchObject({
      version: 1,
      raw: {
        [SNAPSHOT_KEY]: originalSnapshot,
        [FINGERPRINT_KEY]: legacyTopicMigrationFingerprint,
      },
    })

    const upgradedRows = upgraded.rawDb.exec({
      sql: 'SELECT source_topic_id, target_topic_id, kind FROM topic_relations',
      returnValue: 'resultRows',
    })
    const currentTopicIds = upgraded.rawDb.exec({
      sql: 'SELECT id FROM topics',
      returnValue: 'resultRows',
    }) as Array<[string]>
    const typedRelations = upgradedRows as Array<
      [string, string, 'broader' | 'applies-to']
    >
    const topicGraph = buildTopicGraph(
      currentTopicIds.map(([id]) => ({ id })),
      typedRelations.map(([sourceTopicId, targetTopicId, kind]) => ({
        sourceTopicId,
        targetTopicId,
        kind,
      })),
    )
    expect(topicGraph.effectiveTopicIds(['breadth-first-search'])).toEqual([
      'breadth-first-search',
    ])

    const savedWithAlias = await createProblemsRepository(
      upgraded.db,
    ).createProblem(
      {
        slugOrUrl: 'alias-resolution-after-upgrade',
        title: 'Alias Resolution After Upgrade',
        difficulty: 'medium',
        isPremium: false,
        topicLabels: [' my pattern alias '],
        companyLabels: [],
      },
      now,
    )
    expect(savedWithAlias.topics).toEqual([
      expect.objectContaining({
        id: 'custom-pattern',
        label: 'Custom Pattern',
      }),
    ])
  })

  it('retains the v7 snapshot and existing recovery copy when alias reconciliation rejects a collision', async () => {
    const fakeStorage = installStorage()
    const legacyHandle = await createDb({
      migrationSql: legacyTopicMigrationSql,
      locateWasm: createSqliteWasmLocator(),
    })
    legacyHandle.rawDb.exec(`
      INSERT INTO topics (id, label, created_at, updated_at)
      VALUES ('tree', 'Tree', 1, 2), ('graph-theory', 'Graph Theory', 3, 4);
      INSERT INTO topic_aliases (alias_key, label, topic_id, created_at, updated_at)
      VALUES
        ('first-key', 'Shared Alias', 'tree', 5, 6),
        ('second-key', ' shared   alias ', 'graph-theory', 7, 8);
    `)
    const originalSnapshot = bytesToBase64(serializeDb(legacyHandle))
    legacyHandle.rawDb.close()
    const oldRecoveryRecord = {
      version: 1,
      raw: {
        [SNAPSHOT_KEY]: originalSnapshot,
        [FINGERPRINT_KEY]: legacyTopicMigrationFingerprint,
      },
      savedAt: '2026-09-26T10:00:00.000Z',
    }
    fakeStorage.values[SNAPSHOT_KEY] = originalSnapshot
    fakeStorage.values[FINGERPRINT_KEY] = legacyTopicMigrationFingerprint
    fakeStorage.values[RECOVERY_KEY] = oldRecoveryRecord

    await expect(getBackgroundDb()).rejects.toThrow(/conflicting alias/i)

    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe(originalSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(
      legacyTopicMigrationFingerprint,
    )
    expect(fakeStorage.values[RECOVERY_KEY]).toEqual(oldRecoveryRecord)
  })

  it('discards an open made stale by reset without replacing the new handle or snapshot', async () => {
    const fakeStorage = installStorage()
    let releaseOldPreparation!: () => void
    let enterOldPreparation!: () => void
    const oldPreparationEntered = new Promise<void>((resolve) => {
      enterOldPreparation = resolve
    })
    const oldPreparationGate = new Promise<void>((resolve) => {
      releaseOldPreparation = resolve
    })
    let staleHandle: Awaited<ReturnType<typeof getAppDb>> | undefined
    const staleOpen = getAppDb({
      beforePublish: async (handle) => {
        staleHandle = handle
        enterOldPreparation()
        await oldPreparationGate
      },
    })

    await oldPreparationEntered
    resetAppDbForTesting()
    const currentHandle = await openTestDb()
    await createSettingsRepository(currentHandle.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    await flushDbSnapshot()
    const currentSnapshot = fakeStorage.values[SNAPSHOT_KEY]
    const currentFingerprint = fakeStorage.values[FINGERPRINT_KEY]

    releaseOldPreparation()
    await expect(staleOpen).rejects.toThrow('reset')
    expect(staleHandle).toBeDefined()
    expect(() => staleHandle?.rawDb.exec('SELECT 1')).toThrow()
    expect(await getAppDb()).toBe(currentHandle)
    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe(currentSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(currentFingerprint)

    resetAppDbForTesting()
    const reloaded = await openTestDb()
    await expect(
      createSettingsRepository(reloaded.db).getSettings(),
    ).resolves.toMatchObject({
      appearance: { themeMode: 'dark' },
    })
  })

  it('serializes startup snapshot writes across reset so stale publication cannot win', async () => {
    const fakeStorage = installStorage()
    let releaseFirstPairWrite!: () => void
    let enterFirstPairWrite!: () => void
    const firstPairWriteEntered = new Promise<void>((resolve) => {
      enterFirstPairWrite = resolve
    })
    const firstPairWriteGate = new Promise<void>((resolve) => {
      releaseFirstPairWrite = resolve
    })
    let enterLaterPairWrite!: () => void
    const laterPairWriteStarted = new Promise<void>((resolve) => {
      enterLaterPairWrite = resolve
    })
    const writeEvents: string[] = []
    const originalSet = fakeStorage.set
    let pairWriteCount = 0
    fakeStorage.set = vi.fn(async (values) => {
      let pairWriteNumber: number | undefined
      if (SNAPSHOT_KEY in values && FINGERPRINT_KEY in values) {
        pairWriteCount += 1
        pairWriteNumber = pairWriteCount
        if (pairWriteNumber === 1) {
          writeEvents.push('old-write-start')
          enterFirstPairWrite()
          await firstPairWriteGate
        } else {
          writeEvents.push('new-write-start')
          enterLaterPairWrite()
        }
      }
      await originalSet(values)
      if (pairWriteNumber !== undefined) {
        writeEvents.push(
          pairWriteNumber === 1 ? 'old-write-end' : 'new-write-end',
        )
      }
    })

    const staleOpen = getAppDb()
    await firstPairWriteEntered
    resetAppDbForTesting()

    let newPreparationFinished!: () => void
    const newPreparation = new Promise<void>((resolve) => {
      newPreparationFinished = resolve
    })
    const currentOpen = getAppDb({
      beforePublish: async (handle) => {
        await createSettingsRepository(handle.db).updateSettings(
          { appearance: { themeMode: 'dark' } },
          now,
        )
        newPreparationFinished()
      },
    })
    await newPreparation
    releaseFirstPairWrite()
    const [staleResult, currentResult] = await Promise.allSettled([
      staleOpen,
      currentOpen,
    ])
    await laterPairWriteStarted
    expect(writeEvents).toEqual([
      'old-write-start',
      'old-write-end',
      'new-write-start',
      'new-write-end',
    ])
    expect(staleResult.status).toBe('rejected')
    expect(currentResult.status).toBe('fulfilled')
    if (currentResult.status !== 'fulfilled') return
    openedHandles.push(currentResult.value)

    const currentSnapshot = fakeStorage.values[SNAPSHOT_KEY]
    const currentFingerprint = fakeStorage.values[FINGERPRINT_KEY]
    expect(currentFingerprint).toBe(computeFingerprint(migrationSql))

    resetAppDbForTesting()
    const reloaded = await openTestDb()
    await expect(
      createSettingsRepository(reloaded.db).getSettings(),
    ).resolves.toMatchObject({
      appearance: { themeMode: 'dark' },
    })
    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe(currentSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(currentFingerprint)
  })

  it('retains a recovery copy after restarting from partial snapshot state', async () => {
    const fakeStorage = installStorage()
    fakeStorage.values[SNAPSHOT_KEY] = 'partial-snapshot'

    await expect(getAppDb()).rejects.toThrow('Database recovery required')
    const recoveryCopy = fakeStorage.values[RECOVERY_KEY]
    expect(recoveryCopy).toMatchObject({
      version: 1,
      raw: { [SNAPSHOT_KEY]: 'partial-snapshot' },
    })

    resetAppDbForTesting()
    await expect(getAppDb()).rejects.toThrow('Database recovery required')
    expect(fakeStorage.values[RECOVERY_KEY]).toEqual(recoveryCopy)
    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe('partial-snapshot')
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBeUndefined()
  })

  it('preserves a valid stored snapshot when a mutation flush write fails', async () => {
    const fakeStorage = installStorage()
    const firstHandle = await openTestDb()
    const settings = createSettingsRepository(firstHandle.db)
    await settings.updateSettings({ appearance: { themeMode: 'dark' } }, now)
    await flushDbSnapshot()
    const originalSnapshot = fakeStorage.values[SNAPSHOT_KEY]
    const originalFingerprint = fakeStorage.values[FINGERPRINT_KEY]

    fakeStorage.rejectActiveSnapshotWrite = true
    await settings.updateSettings(
      { appearance: { themeMode: 'light' } },
      new Date(now.getTime() + 1_000),
    )
    await expect(flushDbSnapshot()).rejects.toThrow('storage unavailable')
    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe(originalSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(originalFingerprint)

    fakeStorage.rejectActiveSnapshotWrite = false
    await flushDbSnapshot()
    const retriedSnapshot = fakeStorage.values[SNAPSHOT_KEY]
    expect(retriedSnapshot).not.toBe(originalSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(originalFingerprint)

    resetAppDbForTesting()
    const reopened = await openTestDb()
    await expect(
      createSettingsRepository(reopened.db).getSettings(),
    ).resolves.toMatchObject({
      appearance: { themeMode: 'light' },
    })
    expect(fakeStorage.values[SNAPSHOT_KEY]).toBe(retriedSnapshot)
    expect(fakeStorage.values[FINGERPRINT_KEY]).toBe(originalFingerprint)
  })
})

it('flushes scheduled core data before archive work but leaves a clean archive path serialization-free', async () => {
  installStorage()
  const snapshotStore = createSnapshotIdbStore(
    testIndexedDB,
    `archive-gate-${crypto.randomUUID()}`,
  )
  const handle = await getAppDb({ snapshotStore })
  openedHandles.push(handle)
  const serialize = vi.spyOn(snapshot, 'serializeDb')
  const commit = vi.spyOn(snapshotStore, 'commitSnapshot')
  try {
    await waitForPendingDbSnapshot()
    expect(serialize).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
    await createSettingsRepository(handle.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    await waitForPendingDbSnapshot()
    expect(serialize).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledOnce()
    await waitForPendingDbSnapshot()
    expect(serialize).toHaveBeenCalledOnce()
  } finally {
    serialize.mockRestore()
    commit.mockRestore()
  }
})

it('joins in-flight core publication and retains a failed join until an explicit retry saves it', async () => {
  installStorage()
  const snapshotStore = createSnapshotIdbStore(
    testIndexedDB,
    `core-join-${crypto.randomUUID()}`,
  )
  const handle = await getAppDb({ snapshotStore })
  openedHandles.push(handle)
  await createSettingsRepository(handle.db).updateSettings(
    { appearance: { themeMode: 'dark' } },
    now,
  )
  let reject!: (error: Error) => void
  const commit = vi
    .spyOn(snapshotStore, 'commitSnapshot')
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
  const publication = flushDbSnapshot()
  const publicationFailure = expect(publication).rejects.toThrow('disk full')
  let joined = false
  const join = waitForPendingDbSnapshot().then(() => {
    joined = true
  })
  const joinFailure = expect(join).rejects.toThrow('disk full')
  await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce())
  expect(joined).toBe(false)
  reject(new Error('disk full'))
  await Promise.all([publicationFailure, joinFailure])
  await expect(waitForPendingDbSnapshot()).rejects.toThrow('disk full')
  await flushDbSnapshot()
  await expect(waitForPendingDbSnapshot()).resolves.toBeUndefined()
  commit.mockRestore()
})

it('retains a failed automatic timer publication for the next shared gate', async () => {
  installStorage()
  const snapshotStore = createSnapshotIdbStore(
    testIndexedDB,
    `automatic-failure-${crypto.randomUUID()}`,
  )
  const handle = await getAppDb({ snapshotStore })
  openedHandles.push(handle)
  const commit = vi
    .spyOn(snapshotStore, 'commitSnapshot')
    .mockRejectedValueOnce(new Error('automatic disk full'))
  try {
    await createSettingsRepository(handle.db).updateSettings(
      { appearance: { themeMode: 'dark' } },
      now,
    )
    await vi.waitFor(() => expect(commit).toHaveBeenCalledOnce())
    await expect(waitForPendingDbSnapshot()).rejects.toThrow(
      'automatic disk full',
    )
    await flushDbSnapshot()
    await expect(waitForPendingDbSnapshot()).resolves.toBeUndefined()
  } finally {
    commit.mockRestore()
  }
})

it('adopts a detached candidate while an async reader retains the old handle and subsequent writes use the new core', async () => {
  const {
    withCurrentAppDb,
    createDetachedCoreCandidate,
    adoptPublishedCoreCandidate,
    prepareDbReplacement,
  } = await import('./instance')
  installStorage()
  const factory = new (await import('fake-indexeddb')).IDBFactory()
  vi.stubGlobal('indexedDB', factory)
  vi.stubGlobal('IDBKeyRange', (await import('fake-indexeddb')).IDBKeyRange)
  const local = (await import('./local-idb')).createLocalIdbStore(factory)
  const store = createSnapshotIdbStore(factory)
  const original = await getAppDb({ snapshotStore: store })
  let release!: () => void
  let entered!: () => void
  const running = new Promise<void>((resolve) => {
    entered = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const reader = withCurrentAppDb(async (handle) => {
    entered()
    await gate
    expect(() => handle.rawDb.exec('SELECT 1')).not.toThrow()
  })
  await running
  await prepareDbReplacement()
  const head = (await local.readHead())!
  const detached = await createDetachedCoreCandidate(serializeDb(original))
  await createSettingsRepository(detached.db).updateSettings(
    { appearance: { themeMode: 'dark' } },
    now,
  )
  const candidate = {
    handle: detached,
    descriptor: {
      baseRevision: head.revision,
      coreSnapshotId: 'detached-core',
      archiveGeneration: 'detached-archive',
      datasetToken: 'detached-dataset',
      replacementId: 'detached-replacement',
    },
  }
  const publication = (
    await import('./composite-publication')
  ).createCompositePublication(local, head.fingerprint)
  await publication.prepare(candidate, async () => {
    await local.writeTechnicalRecord(
      ['archive-generation', 'detached-archive'],
      { identity: 'fixture', status: 'ready', storeIndex: 5 },
    )
  })
  const published = await publication.publishCompositeCandidate(candidate, {
    kind: 'restore',
    replacementId: 'detached-replacement',
  })
  await adoptPublishedCoreCandidate(candidate, published, local)
  expect(await getAppDb()).toBe(detached)
  expect(() => original.rawDb.exec('SELECT 1')).not.toThrow()
  release()
  await reader
  expect(() => original.rawDb.exec('SELECT 1')).toThrow()
  expect(
    (await createSettingsRepository((await getAppDb()).db).getSettings())
      .appearance.themeMode,
  ).toBe('dark')
  await store.markInvalidated('detached-replacement')
  await store.markSyncMetadataComplete('detached-replacement')
  await store.completeContinuation('detached-replacement')
  await createSettingsRepository((await getAppDb()).db).updateSettings(
    { appearance: { themeMode: 'light' } },
    now,
  )
  await flushDbSnapshot()
  const reopened = await createDetachedCoreCandidate(
    new Uint8Array((await store.readActive())!.bytes),
  )
  expect(
    (await createSettingsRepository(reopened.db).getSettings()).appearance
      .themeMode,
  ).toBe('light')
  reopened.rawDb.close()
  detached.rawDb.close()
})
