import { createDb, createSqliteWasmLocator, type DbHandle } from './client'
import { migrationEntries, migrationSql } from './migration-sql'
import { openSnapshot, type PublishContext } from './open-snapshot'
import { setOnMutationHook } from './proxy'
import { seedInitialCatalog } from './seed'
import {
  computeFingerprint,
  FINGERPRINT_KEY,
  SNAPSHOT_KEY,
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
  RECOVERY_KEY,
  TRACK_RECOVERY_KEY,
  SNAPSHOT_RECOVERY_KEYS,
  sameRecoveryValue,
} from './snapshot-state'
import {
  createSnapshotIdbStore,
  type ActiveSnapshotRecord,
  type SnapshotIdbStore,
  type ReplacementInput,
} from './snapshot-idb'

const snapshotDebounceMs = 250

let handlePromise: Promise<DbHandle> | null = null
let activeHandle: DbHandle | null = null
let activeSnapshotStore: SnapshotIdbStore | null = null
let openGeneration = 0
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let snapshotWriteChain: Promise<void> = Promise.resolve()
let lastPersistedBytes: Uint8Array | null = null
let snapshotCommitNeedsReconciliation = false
let replacementPublicationPending = false

export interface AppDbOptions {
  beforePublish?: (handle: DbHandle, context: PublishContext) => Promise<void>
  validateCurrentData?: (handle: DbHandle) => Promise<void>
  snapshotStore?: SnapshotIdbStore
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

export function beginDbReplacement() {
  if (replacementPublicationPending)
    throw new Error('A database replacement is already pending.')
  replacementPublicationPending = true
  if (snapshotTimer) {
    clearTimeout(snapshotTimer)
    snapshotTimer = null
  }
}

export function abortDbReplacement() {
  replacementPublicationPending = false
}

export async function commitDbReplacementSnapshot(input: ReplacementInput) {
  if (!replacementPublicationPending)
    throw new Error('No database replacement is pending.')
  await enqueueSnapshotWrite(async () => {
    if (!activeHandle || !activeSnapshotStore)
      throw new Error('IndexedDB replacement publication is unavailable.')
    if (!activeHandle.sqlite3.capi.sqlite3_get_autocommit(activeHandle.rawDb))
      throw new Error(
        'Cannot publish a database snapshot during an open transaction.',
      )
    const bytes = serializeDb(activeHandle)
    const fingerprint = computeFingerprint(migrationSql)
    await activeSnapshotStore.commitReplacement(
      bytes,
      fingerprint,
      new Date(),
      input,
    )
    lastPersistedBytes = bytes
    snapshotCommitNeedsReconciliation = false
    replacementPublicationPending = false
  })
}

export function resetAppDbForTesting() {
  openGeneration += 1
  setOnMutationHook(null)
  handlePromise = null
  activeHandle = null
  activeSnapshotStore = null
  lastPersistedBytes = null
  snapshotCommitNeedsReconciliation = false
  replacementPublicationPending = false

  if (snapshotTimer) {
    clearTimeout(snapshotTimer)
    snapshotTimer = null
  }
}

async function openAppDb(options: AppDbOptions, generation: number) {
  const fingerprint = computeFingerprint(migrationSql)
  const storage = createSnapshotStorage()
  const snapshotStore =
    options.snapshotStore ??
    (typeof indexedDB === 'undefined'
      ? undefined
      : createSnapshotIdbStore(indexedDB))
  const openingState: {
    source: 'idb' | 'legacy' | 'empty'
    stage:
      | 'recovery preservation'
      | 'restoration'
      | 'validation'
      | 'upgrade'
      | 'preparation'
      | 'publication'
      | 'Chrome snapshot mirror publication'
  } = {
    source: 'empty',
    stage: 'restoration',
  }
  let idbSource: ActiveSnapshotRecord | null = null
  let legacyBytes: Uint8Array | null = null
  let legacyFingerprint: string | null = null
  const handle = await openSnapshot({
    currentFingerprint: fingerprint,
    read: async () => {
      if (snapshotStore) {
        let active
        try {
          active = await snapshotStore.readActive()
        } catch {
          throw new Error(
            'Database recovery required: IndexedDB snapshot cannot be read.',
          )
        }
        if (active) {
          openingState.source = 'idb'
          idbSource = active
          const bytes = new Uint8Array(active.bytes)
          return {
            kind: 'stored',
            raw: {},
            bytes,
            fingerprint: active.fingerprint,
          }
        }
      }
      const state = await readSnapshotState(storage)
      openingState.source = state.kind === 'empty' ? 'empty' : 'legacy'
      if (state.kind === 'stored') {
        legacyBytes = state.bytes
        legacyFingerprint = state.fingerprint
      }
      return state
    },
    preserve: (raw) => {
      openingState.stage = 'recovery preservation'
      const sourceFingerprint = idbSource?.fingerprint ?? raw[FINGERPRINT_KEY]
      const key =
        sourceFingerprint === legacyFsrsMigrationFingerprint
          ? FSRS_RECOVERY_KEY
          : sourceFingerprint === legacyTrackMigrationFingerprint
            ? TRACK_RECOVERY_KEY
            : RECOVERY_KEY
      return idbSource && snapshotStore
        ? preserveIdbRecovery(snapshotStore, key, idbSource)
        : preserveRecovery(storage, raw, new Date(), key)
    },
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
      openingState.stage = 'restoration'
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
      openingState.stage = 'validation'
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
      openingState.stage = 'upgrade'
      candidate.rawDb.exec(selectUpgradeSql(fromFingerprint, migrationEntries))
      return Promise.resolve()
    },
    prepare: async (candidate, context) => {
      openingState.stage = 'preparation'
      await options.beforePublish?.(candidate, context)
      assertCurrentOpenGeneration(generation)
    },
    publish: async (candidate) => {
      openingState.stage = 'publication'
      await enqueueSnapshotWrite(async () => {
        assertCurrentOpenGeneration(generation)
        const bytes = serializeDb(candidate)
        if (snapshotStore) {
          await snapshotStore.commitSnapshot(bytes, fingerprint, new Date())
        }
        if (
          canUseChromeStorage() &&
          (openingState.source !== 'legacy' || !snapshotStore)
        ) {
          try {
            openingState.stage = 'Chrome snapshot mirror publication'
            await writeSnapshotToStorage({ fingerprint, bytes })
          } catch (error) {
            if (openingState.source !== 'idb' || !isChromeQuotaError(error)) {
              throw error
            }
          }
          openingState.stage = 'publication'
        }
      })
    },
  }).catch((error: unknown) => {
    if (openingState.source === 'idb') {
      if (openingState.stage === 'Chrome snapshot mirror publication') {
        throw new Error(
          'Database recovery required: Chrome snapshot mirror publication failed.',
          { cause: error },
        )
      }
      throw new Error(
        `Database recovery required: IndexedDB ${openingState.stage} failed.`,
        { cause: error },
      )
    }
    throw error
  })

  try {
    if (snapshotStore) {
      if (openingState.source === 'legacy') {
        const expectedBytes =
          legacyFingerprint === fingerprint && legacyBytes
            ? legacyBytes
            : serializeDb(handle)
        if (!(await snapshotStore.readActive())) {
          await snapshotStore.commitSnapshot(
            expectedBytes,
            fingerprint,
            new Date(),
          )
        }
        await assertIdbSnapshot(snapshotStore, expectedBytes, fingerprint)
      }
      await migrateRecoveryRecords(storage, snapshotStore)
      if (openingState.source === 'legacy') {
        await storage.remove?.([SNAPSHOT_KEY, FINGERPRINT_KEY])
      }
    }
  } catch (error) {
    closeFailedHandle(handle)
    throw new Error(
      'Database recovery required: snapshot migration could not be completed.',
      { cause: error },
    )
  }

  if (generation !== openGeneration) {
    closeFailedHandle(handle)
    throw new Error('Database open was reset before activation.')
  }

  activeHandle = handle
  activeSnapshotStore = snapshotStore ?? null
  lastPersistedBytes = serializeDb(handle)
  snapshotCommitNeedsReconciliation = false
  setOnMutationHook(() => scheduleSnapshot())
  return handle
}

function scheduleSnapshot() {
  if (replacementPublicationPending) return
  if (!canUseChromeStorage() && !activeSnapshotStore) {
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
  if (replacementPublicationPending) {
    if (automatic) return
    throw new Error('Database replacement publication is pending.')
  }
  if (!activeHandle || (!canUseChromeStorage() && !activeSnapshotStore)) {
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

  const fingerprint = computeFingerprint(migrationSql)
  const bytes = serializeDb(activeHandle)
  if (
    !snapshotCommitNeedsReconciliation &&
    lastPersistedBytes &&
    sameBytes(bytes, lastPersistedBytes)
  )
    return
  if (activeSnapshotStore) {
    if (snapshotCommitNeedsReconciliation) {
      const active = await activeSnapshotStore.readActive()
      if (
        active?.fingerprint === fingerprint &&
        sameBytes(active.bytes, bytes)
      ) {
        lastPersistedBytes = bytes
        snapshotCommitNeedsReconciliation = false
        return
      }
      throw new Error('IndexedDB snapshot readback did not match.')
    }
    await activeSnapshotStore.commitSnapshot(bytes, fingerprint, new Date())
    snapshotCommitNeedsReconciliation = true
    await assertIdbSnapshot(activeSnapshotStore, bytes, fingerprint)
    snapshotCommitNeedsReconciliation = false
  }
  if (!activeSnapshotStore && canUseChromeStorage()) {
    try {
      await writeSnapshotToStorage({ fingerprint, bytes })
    } catch (error) {
      if (activeSnapshotStore && isChromeQuotaError(error)) return
      throw error
    }
  }
  lastPersistedBytes = bytes
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return (
    left.length === right.length &&
    left.every((byte, index) => byte === right[index])
  )
}

function createSnapshotStorage(): SnapshotStorage {
  if (!canUseChromeStorage()) {
    return {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    }
  }

  return {
    get: (keys) => chrome.storage.local.get(keys),
    set: (values) => chrome.storage.local.set(values),
    remove: (keys) => chrome.storage.local.remove(keys),
  }
}

async function assertIdbSnapshot(
  store: SnapshotIdbStore,
  bytes: Uint8Array,
  fingerprint: string,
) {
  const persisted = await store.readActive()
  if (
    !persisted ||
    persisted.fingerprint !== fingerprint ||
    persisted.bytes.length !== bytes.length ||
    persisted.bytes.some((value, index) => value !== bytes[index])
  ) {
    throw new Error('IndexedDB snapshot readback did not match.')
  }
}

async function preserveIdbRecovery(
  store: SnapshotIdbStore,
  key: string,
  source: ActiveSnapshotRecord,
) {
  const existing = await store.readRecovery(key)
  if (existing !== null) {
    if (matchesIdbRecovery(existing.value, source)) return
    throw new Error(
      'An earlier database recovery record must be exported before another upgrade.',
    )
  }
  await store.commitRecovery(key, {
    version: 2,
    fingerprint: source.fingerprint,
    bytes: new Uint8Array(source.bytes),
    savedAt: new Date().toISOString(),
  })
  const persisted = await store.readRecovery(key)
  if (persisted === null || !matchesIdbRecovery(persisted.value, source)) {
    throw new Error('IndexedDB recovery readback did not match.')
  }
}

function matchesIdbRecovery(value: unknown, source: ActiveSnapshotRecord) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 2 ||
    !('fingerprint' in value) ||
    value.fingerprint !== source.fingerprint ||
    !('bytes' in value) ||
    Object.prototype.toString.call(value.bytes) !== '[object Uint8Array]'
  )
    return false
  const bytes = value.bytes as Uint8Array
  return (
    bytes.length === source.bytes.length &&
    bytes.every((byte, index) => byte === source.bytes[index])
  )
}

function isChromeQuotaError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'QuotaExceededError' || /quota/i.test(error.message))
  )
}

async function migrateRecoveryRecords(
  storage: SnapshotStorage,
  store: SnapshotIdbStore,
) {
  const values = await storage.get([...SNAPSHOT_RECOVERY_KEYS])
  for (const key of SNAPSHOT_RECOVERY_KEYS) {
    if (!Object.hasOwn(values, key)) continue
    const current = await store.readRecovery(key)
    if (current === null) await store.commitRecovery(key, values[key])
    const persisted = await store.readRecovery(key)
    if (
      persisted === null ||
      !sameRecoveryValue(persisted.value, values[key])
    ) {
      throw new Error('IndexedDB recovery readback did not match.')
    }
    await storage.remove?.([key])
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
