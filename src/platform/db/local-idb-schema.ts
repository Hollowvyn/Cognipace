import { coreRecordReferenceKey, isBinary } from './local-store-types'

export const localDatabaseVersion = 2
export const archiveStoreNames = [
  'problemNotes',
  'submissions',
  'analysisReports',
  'savedAiNotes',
  'payloads',
  'problemScopes',
] as const

// All archive stores use out-of-line keys. Optional external aliases omit index
// fields entirely; IndexedDB does not index a compound key with missing fields.
export function createArchiveStores(database: IDBDatabase): void {
  for (const name of archiveStoreNames) {
    if (database.objectStoreNames.contains(name)) continue
    const store = database.createObjectStore(name)
    if (name === 'submissions') {
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
      // Attempt-alias records share this store and have their own alias fields.
      store.createIndex(
        'byAttemptAlias',
        ['archiveGeneration', 'attemptAlias'],
        { unique: true },
      )
    }
    if (name === 'analysisReports')
      store.createIndex('byProblem', ['archiveGeneration', 'problemSlug', 'id'])
    if (name === 'savedAiNotes')
      store.createIndex('byProblem', [
        'archiveGeneration',
        'problemSlug',
        'assessmentId',
      ])
  }
}

export function upgradeLocalDatabase(
  database: IDBDatabase,
  transaction: IDBTransaction,
): void {
  if (!database.objectStoreNames.contains('records'))
    database.createObjectStore('records')
  if (!database.objectStoreNames.contains('coreSnapshots'))
    database.createObjectStore('coreSnapshots')
  createArchiveStores(database)
  const records = transaction.objectStore('records')
  const cores = transaction.objectStore('coreSnapshots')
  // Initialized atomically on fresh creation and preserving v1 upgrade.
  records.put(0, ['local-technical-write-epoch'])
  const request = records.openCursor()
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) return
    const value: unknown = cursor.value
    if (
      (cursor.key === 'active' ||
        cursor.key === 'recovery' ||
        (typeof cursor.key === 'string' &&
          cursor.key.startsWith('recovery:'))) &&
      typeof value === 'object' &&
      value !== null &&
      'bytes' in value &&
      isBinary(value.bytes) &&
      'key' in value &&
      (value.key === 'active' || value.key === 'replacement')
    ) {
      const { bytes, ...metadata } = value
      const coreSnapshotId = `legacy:${encodeURIComponent(String(cursor.key))}`
      cores.put(bytes, coreSnapshotId)
      if (cursor.key === 'active')
        records.put(
          { identity: 'initial:legacy', status: 'ready', storeIndex: 5 },
          ['archive-generation', 'legacy'],
        )
      if (cursor.key !== 'active')
        cores.put(
          { kind: 'core-only', coreSnapshotId },
          coreRecordReferenceKey(cursor.key),
        )
      cursor.update({
        ...metadata,
        formatVersion: 2,
        coreSnapshotId,
        ...(cursor.key === 'active'
          ? { archiveGeneration: 'legacy', datasetToken: 'legacy' }
          : {}),
      })
    }
    cursor.continue()
  }
}
