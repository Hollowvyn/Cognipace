import { createDb, createSqliteWasmLocator, type DbHandle } from './client'
import { migrationEntries, migrationSql } from './migration-sql'
import { openSnapshot, type PublishContext } from './open-snapshot'
import { setOnMutationHook } from './proxy'
import { seedInitialCatalog } from './seed'
import {
  computeFingerprint,
  FINGERPRINT_KEY,
  deserializeDb,
  serializeDb,
  writeSnapshotToStorage,
} from './snapshot'
import {
  selectSnapshotBaselineSql,
  legacyFsrsMigrationFingerprint,
  legacyTrackMigrationFingerprint,
  selectUpgradeSql,
  validateSnapshotSchema,
  assertDatabaseIntegrity,
} from './snapshot-upgrade'
import {
  preserveRecovery,
  readSnapshotState,
  type SnapshotStorage,
  FSRS_RECOVERY_KEY,
  TRACK_RECOVERY_KEY,
} from './snapshot-state'

const snapshotDebounceMs = 250

let handlePromise: Promise<DbHandle> | null = null
let activeHandle: DbHandle | null = null
let openGeneration = 0
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let snapshotWriteChain: Promise<void> = Promise.resolve()

export interface AppDbOptions {
  beforePublish?: (handle: DbHandle, context: PublishContext) => Promise<void>
  validateCurrentData?: (handle: DbHandle) => Promise<void>
}

export function getAppDb(options: AppDbOptions = {}) {
  if (!handlePromise) {
    const generation = openGeneration
    const opening = openAppDb(options, generation).catch((error: unknown) => {
      if (generation === openGeneration && handlePromise === opening) {
        handlePromise = null
      }
      throw error
    })
    handlePromise = opening
  }
  return handlePromise
}

export async function flushDbSnapshot() {
  if (snapshotTimer) {
    clearTimeout(snapshotTimer)
    snapshotTimer = null
  }

  await writeSnapshotAfterPending()
}

export function resetAppDbForTesting() {
  openGeneration += 1
  setOnMutationHook(null)
  handlePromise = null
  activeHandle = null

  if (snapshotTimer) {
    clearTimeout(snapshotTimer)
    snapshotTimer = null
  }
}

async function openAppDb(options: AppDbOptions, generation: number) {
  const fingerprint = computeFingerprint(migrationSql)
  const storage = createSnapshotStorage()
  const handle = await openSnapshot({
    currentFingerprint: fingerprint,
    read: () => readSnapshotState(storage),
    preserve: (raw) =>
      preserveRecovery(
        storage,
        raw,
        new Date(),
        raw[FINGERPRINT_KEY] === legacyFsrsMigrationFingerprint
          ? FSRS_RECOVERY_KEY
          : raw[FINGERPRINT_KEY] === legacyTrackMigrationFingerprint
            ? TRACK_RECOVERY_KEY
            : undefined,
      ),
    fresh: async () => {
      const freshHandle = await createDb({
        migrationSql,
        locateWasm: createSqliteWasmLocator(),
      })
      try {
        await seedInitialCatalog(freshHandle.db)
        return freshHandle
      } catch (error) {
        closeFailedHandle(freshHandle)
        throw error
      }
    },
    restore: async (bytes) => {
      const restoredHandle = await createDb({
        locateWasm: createSqliteWasmLocator(),
      })
      try {
        deserializeDb(restoredHandle, bytes)
        return restoredHandle
      } catch (error) {
        closeFailedHandle(restoredHandle)
        throw error
      }
    },
    validate: async (candidate, candidateFingerprint) => {
      const expectedSql =
        candidateFingerprint === fingerprint
          ? migrationSql
          : selectSnapshotBaselineSql(candidateFingerprint)
      await validateSnapshotSchema(candidate, expectedSql)
      assertDatabaseIntegrity(candidate)
      if (candidateFingerprint === fingerprint)
        await options.validateCurrentData?.(candidate)
    },
    upgrade: (candidate, fromFingerprint) => {
      candidate.rawDb.exec(selectUpgradeSql(fromFingerprint, migrationEntries))
      return Promise.resolve()
    },
    prepare: async (candidate, context) => {
      await options.beforePublish?.(candidate, context)
      assertCurrentOpenGeneration(generation)
    },
    publish: async (candidate) => {
      await enqueueSnapshotWrite(async () => {
        assertCurrentOpenGeneration(generation)
        if (canUseChromeStorage()) {
          await writeSnapshotToStorage({
            fingerprint,
            bytes: serializeDb(candidate),
          })
        }
      })
    },
  })

  if (generation !== openGeneration) {
    closeFailedHandle(handle)
    throw new Error('Database open was reset before activation.')
  }

  activeHandle = handle
  setOnMutationHook(() => scheduleSnapshot())
  return handle
}

function scheduleSnapshot() {
  if (!canUseChromeStorage()) {
    return
  }

  if (snapshotTimer) {
    clearTimeout(snapshotTimer)
  }

  snapshotTimer = setTimeout(() => {
    snapshotTimer = null
    void writeSnapshotAfterPending(true)
  }, snapshotDebounceMs)
}

async function writeSnapshotAfterPending(automatic = false) {
  await enqueueSnapshotWrite(() => persistSnapshot(automatic))
}

function enqueueSnapshotWrite(write: () => Promise<void>) {
  const writePromise = snapshotWriteChain.then(write)
  snapshotWriteChain = writePromise.catch(() => undefined)
  return writePromise
}

async function persistSnapshot(automatic: boolean) {
  if (!activeHandle || !canUseChromeStorage()) {
    return
  }

  // SQLite's export includes uncommitted pages. Check at serialization time,
  // including writes that waited behind an earlier storage publication.
  if (!activeHandle.sqlite3.capi.sqlite3_get_autocommit(activeHandle.rawDb)) {
    if (automatic) {
      scheduleSnapshot()
      return
    }
    throw new Error(
      'Cannot publish a database snapshot during an open transaction.',
    )
  }

  await writeSnapshotToStorage({
    fingerprint: computeFingerprint(migrationSql),
    bytes: serializeDb(activeHandle),
  })
}

function createSnapshotStorage(): SnapshotStorage {
  if (!canUseChromeStorage()) {
    return {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
    }
  }

  return {
    get: (keys) => chrome.storage.local.get(keys),
    set: (values) => chrome.storage.local.set(values),
  }
}

function canUseChromeStorage() {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.storage !== 'undefined' &&
    typeof chrome.storage.local !== 'undefined'
  )
}

function closeFailedHandle(handle: DbHandle) {
  try {
    handle.rawDb.close()
  } catch {
    // Keep the setup failure as the reported error.
  }
}

function assertCurrentOpenGeneration(generation: number) {
  if (generation !== openGeneration) {
    throw new Error('Database open was reset before publication.')
  }
}
