export interface ActiveSnapshotRecord {
  key: 'active'
  fingerprint: string
  bytes: Uint8Array
  revision: number
  lastVerifiedRevision: number
  savedAt: string
}

export interface SnapshotIdbStore {
  readActive(): Promise<ActiveSnapshotRecord | null>
  commitSnapshot(
    bytes: Uint8Array,
    fingerprint: string,
    now: Date,
  ): Promise<ActiveSnapshotRecord>
  acknowledgeVerifiedRevision(revision: number): Promise<void>
}

function validateActive(value: unknown): ActiveSnapshotRecord {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('key' in value) ||
    value.key !== 'active' ||
    !('fingerprint' in value) ||
    typeof value.fingerprint !== 'string' ||
    !('bytes' in value) ||
    Object.prototype.toString.call(value.bytes) !== '[object Uint8Array]' ||
    !('revision' in value) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 ||
    !('lastVerifiedRevision' in value) ||
    !Number.isSafeInteger(value.lastVerifiedRevision) ||
    (value.lastVerifiedRevision as number) < 0 ||
    (value.lastVerifiedRevision as number) > (value.revision as number) ||
    !('savedAt' in value) ||
    typeof value.savedAt !== 'string'
  ) {
    throw new Error('The stored active snapshot record is invalid.')
  }
  return value as ActiveSnapshotRecord
}

function readRecord(value: unknown): ActiveSnapshotRecord | null {
  return value === undefined ? null : validateActive(value)
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export function createSnapshotIdbStore(
  factory: IDBFactory,
  databaseName = 'cognipace-local-v1',
): SnapshotIdbStore {
  function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = factory.open(databaseName, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('records')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(asError(request.error))
      request.onblocked = () =>
        reject(new Error('The snapshot database is blocked.'))
    })
  }

  async function transact<T>(
    mode: IDBTransactionMode,
    operate: (
      records: IDBObjectStore,
      finish: (value: T) => void,
      fail: (error: unknown) => void,
    ) => void,
  ): Promise<T> {
    const database = await openDatabase()
    return new Promise<T>((resolve, reject) => {
      let result: T
      let failure: Error | null = null
      let transaction: IDBTransaction
      try {
        transaction = database.transaction('records', mode)
      } catch (error) {
        database.close()
        reject(asError(error))
        return
      }

      transaction.oncomplete = () => {
        database.close()
        resolve(result)
      }
      transaction.onerror = () => {
        database.close()
        reject(asError(failure ?? transaction.error))
      }
      transaction.onabort = () => {
        database.close()
        reject(
          asError(
            failure ??
              transaction.error ??
              new Error('Snapshot transaction aborted.'),
          ),
        )
      }

      try {
        operate(
          transaction.objectStore('records'),
          (value) => {
            result = value
          },
          (error) => {
            failure = error instanceof Error ? error : new Error(String(error))
            transaction.abort()
          },
        )
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error))
        transaction.abort()
      }
    })
  }

  return {
    readActive() {
      return transact('readonly', (records, finish, fail) => {
        const request = records.get('active')
        request.onsuccess = () => {
          try {
            finish(readRecord(request.result))
          } catch (error) {
            fail(error)
          }
        }
      })
    },

    commitSnapshot(bytes, fingerprint, now) {
      const savedBytes = bytes.slice()
      const savedAt = now.toISOString()
      return transact('readwrite', (records, finish, fail) => {
        const request = records.get('active')
        request.onsuccess = () => {
          try {
            const previous = readRecord(request.result)
            const next: ActiveSnapshotRecord = {
              key: 'active',
              fingerprint,
              bytes: savedBytes,
              revision: (previous?.revision ?? 0) + 1,
              lastVerifiedRevision: previous?.lastVerifiedRevision ?? 0,
              savedAt,
            }
            records.put(next, 'active')
            finish(next)
          } catch (error) {
            fail(error)
          }
        }
      })
    },

    acknowledgeVerifiedRevision(revision) {
      if (!Number.isSafeInteger(revision) || revision < 0) {
        return Promise.reject(new Error('Invalid verified revision.'))
      }
      return transact('readwrite', (records, finish, fail) => {
        const request = records.get('active')
        request.onsuccess = () => {
          try {
            const previous = readRecord(request.result)
            if (!previous || revision > previous.revision) {
              fail(
                new Error(
                  'Cannot verify a missing or future snapshot revision.',
                ),
              )
              return
            }
            records.put(
              {
                ...previous,
                lastVerifiedRevision: Math.max(
                  previous.lastVerifiedRevision,
                  revision,
                ),
              } satisfies ActiveSnapshotRecord,
              'active',
            )
            finish()
          } catch (error) {
            fail(error)
          }
        }
      })
    },
  }
}
