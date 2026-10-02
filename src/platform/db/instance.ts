import { createDb, createSqliteWasmLocator, type DbHandle } from './client'
import { migrationEntries, migrationSql } from './migration-sql'
import { openSnapshot, type PublishContext } from './open-snapshot'
import { setOnMutationHook } from './proxy'
import { seedInitialCatalog } from './seed'
import {
  computeFingerprint,
  deserializeDb,
  serializeDb,
  writeSnapshotToStorage,
} from './snapshot'
import {
  legacyTopicMigrationFingerprint,
  legacyTopicMigrationSql,
  selectUpgradeSql,
  validateSnapshotSchema,
  assertDatabaseIntegrity,
} from './snapshot-upgrade'
import {
  preserveRecovery,
  readSnapshotState,
  type SnapshotStorage,
} from './snapshot-state'

const snapshotDebounceMs = 250

let handlePromise: Promise<DbHandle> | null = null
let activeHandle: DbHandle | null = null
let openGeneration = 0
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let snapshotWriteChain: Promise<void> = Promise.resolve()
let mutationVersion = 0
let persistedMutationVersion = 0

export interface AppDbOptions {
  beforePublish?: (handle: DbHandle, context: PublishContext) => Promise<void>
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
  mutationVersion = 0
  persistedMutationVersion = 0

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
    preserve: (raw) => preserveRecovery(storage, raw, new Date()),
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
          : candidateFingerprint === legacyTopicMigrationFingerprint
            ? legacyTopicMigrationSql
            : selectUpgradeSql(candidateFingerprint, migrationEntries)
      await validateSnapshotSchema(candidate, expectedSql)
      assertDatabaseIntegrity(candidate)
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
  mutationVersion += 1
  if (!canUseChromeStorage()) {
    return
  }

  if (snapshotTimer) {
    clearTimeout(snapshotTimer)
  }

  snapshotTimer = setTimeout(() => {
    snapshotTimer = null
    void writeSnapshotAfterPending()
  }, snapshotDebounceMs)
}

async function writeSnapshotAfterPending() {
  await enqueueSnapshotWrite(persistSnapshot)
}

function enqueueSnapshotWrite(write: () => Promise<void>) {
  const writePromise = snapshotWriteChain.then(write)
  snapshotWriteChain = writePromise.catch(() => undefined)
  return writePromise
}

async function persistSnapshot() {
  if (!activeHandle || !canUseChromeStorage()) {
    return
  }

  const generation = openGeneration
  const version = mutationVersion
  await writeSnapshotToStorage({
    fingerprint: computeFingerprint(migrationSql),
    bytes: serializeDb(activeHandle),
    hasMutations: version !== persistedMutationVersion,
  })
  if (generation === openGeneration) persistedMutationVersion = version
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
