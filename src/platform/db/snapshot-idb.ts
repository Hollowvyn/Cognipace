export interface ActiveSnapshotRecord {
  key: 'active'
  fingerprint: string
  bytes: Uint8Array
  revision: number
  lastVerifiedRevision: number
  savedAt: string
  replacementId?: string
}

export interface ReplacementRecoveryRecord {
  key: 'replacement'
  replacementId: string
  revision: number
  fingerprint: string
  bytes: Uint8Array
  savedAt: string
}

export type ReplacementRecoverySummary = Omit<
  ReplacementRecoveryRecord,
  'bytes'
> & { byteLength: number }

export type ReplacementKind = 'restore' | 'reset' | 'gist-pull'
export interface ReplacementContinuation {
  key: 'replacement-continuation'
  replacementId: string
  kind: ReplacementKind
  committedRevision: number
  needsInvalidation: boolean
  needsSyncMetadata: boolean
  syncMetadataPatch?: Record<string, unknown>
}

export type ReplacementInput = Pick<
  ReplacementContinuation,
  'replacementId' | 'kind' | 'syncMetadataPatch'
>

export interface SnapshotIdbStore {
  readActive(): Promise<ActiveSnapshotRecord | null>
  commitSnapshot(
    bytes: Uint8Array,
    fingerprint: string,
    now: Date,
  ): Promise<ActiveSnapshotRecord>
  acknowledgeVerifiedRevision(revision: number): Promise<void>
  readRecovery(key: string): Promise<{ value: unknown } | null>
  commitRecovery(key: string, value: unknown): Promise<void>
  commitReplacement(
    bytes: Uint8Array,
    fingerprint: string,
    now: Date,
    input: ReplacementInput,
  ): Promise<ActiveSnapshotRecord>
  readContinuation(): Promise<ReplacementContinuation | null>
  markInvalidated(replacementId: string): Promise<void>
  markSyncMetadataComplete(replacementId: string): Promise<void>
  completeContinuation(replacementId: string): Promise<void>
  listReplacementRecoveries(): Promise<ReplacementRecoverySummary[]>
  readReplacementRecovery(
    replacementId: string,
  ): Promise<ReplacementRecoveryRecord | null>
}

function readReplacementRecoveryRecord(
  value: unknown,
): ReplacementRecoveryRecord | null {
  if (value === undefined) return null
  if (
    typeof value !== 'object' ||
    value === null ||
    !('key' in value) ||
    value.key !== 'replacement' ||
    !('replacementId' in value) ||
    typeof value.replacementId !== 'string' ||
    !('revision' in value) ||
    !Number.isSafeInteger(value.revision) ||
    !('fingerprint' in value) ||
    typeof value.fingerprint !== 'string' ||
    !('bytes' in value) ||
    Object.prototype.toString.call(value.bytes) !== '[object Uint8Array]' ||
    !('savedAt' in value) ||
    typeof value.savedAt !== 'string'
  )
    throw new Error('The stored replacement recovery record is invalid.')
  return value as ReplacementRecoveryRecord
}

function readContinuationRecord(
  value: unknown,
): ReplacementContinuation | null {
  if (value === undefined) return null
  if (
    typeof value !== 'object' ||
    value === null ||
    !('key' in value) ||
    value.key !== 'replacement-continuation' ||
    !('replacementId' in value) ||
    typeof value.replacementId !== 'string' ||
    !('kind' in value) ||
    !['restore', 'reset', 'gist-pull'].includes(String(value.kind)) ||
    !('committedRevision' in value) ||
    !Number.isSafeInteger(value.committedRevision) ||
    !('needsInvalidation' in value) ||
    typeof value.needsInvalidation !== 'boolean' ||
    !('needsSyncMetadata' in value) ||
    typeof value.needsSyncMetadata !== 'boolean'
  ) {
    throw new Error('The stored replacement continuation is invalid.')
  }
  return value as ReplacementContinuation
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
    typeof value.savedAt !== 'string' ||
    ('replacementId' in value &&
      (typeof value.replacementId !== 'string' ||
        value.replacementId.length === 0))
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
      let settled = false
      request.onupgradeneeded = () => {
        request.result.createObjectStore('records')
      }
      request.onsuccess = () => {
        if (settled) {
          request.result.close()
          return
        }
        settled = true
        resolve(request.result)
      }
      request.onerror = () => {
        if (settled) return
        settled = true
        reject(asError(request.error))
      }
      request.onblocked = () => {
        if (settled) return
        settled = true
        reject(new Error('The snapshot database is blocked.'))
      }
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
    listReplacementRecoveries() {
      return transact('readonly', (records, finish, fail) => {
        const request = records.get('recovery')
        request.onsuccess = () => {
          try {
            const record = readReplacementRecoveryRecord(request.result)
            finish(
              record
                ? [
                    {
                      key: 'replacement',
                      replacementId: record.replacementId,
                      revision: record.revision,
                      fingerprint: record.fingerprint,
                      savedAt: record.savedAt,
                      byteLength: record.bytes.byteLength,
                    },
                  ]
                : [],
            )
          } catch (error) {
            fail(error)
          }
        }
      })
    },
    readReplacementRecovery(replacementId) {
      return transact('readonly', (records, finish, fail) => {
        const request = records.get('recovery')
        request.onsuccess = () => {
          try {
            const record = readReplacementRecoveryRecord(request.result)
            finish(record?.replacementId === replacementId ? record : null)
          } catch (error) {
            fail(error)
          }
        }
      })
    },
    readContinuation() {
      return transact('readonly', (records, finish, fail) => {
        const request = records.get('replacement-continuation')
        request.onsuccess = () => {
          try {
            finish(readContinuationRecord(request.result))
          } catch (error) {
            fail(error)
          }
        }
      })
    },

    commitReplacement(bytes, fingerprint, now, input) {
      const savedBytes = bytes.slice()
      const savedAt = now.toISOString()
      return transact('readwrite', (records, finish, fail) => {
        const continuationRequest = records.get('replacement-continuation')
        continuationRequest.onsuccess = () => {
          try {
            if (readContinuationRecord(continuationRequest.result))
              throw new Error(
                'An earlier replacement continuation is unresolved.',
              )
            const activeRequest = records.get('active')
            activeRequest.onsuccess = () => {
              try {
                const previous = readRecord(activeRequest.result)
                if (!previous)
                  throw new Error('Cannot replace a missing active snapshot.')
                if (previous.revision === Number.MAX_SAFE_INTEGER)
                  throw new Error('Snapshot revision limit reached.')
                const next: ActiveSnapshotRecord = {
                  key: 'active',
                  fingerprint,
                  bytes: savedBytes,
                  revision: previous.revision + 1,
                  lastVerifiedRevision: previous.lastVerifiedRevision,
                  savedAt,
                  replacementId: input.replacementId,
                }
                const continuation: ReplacementContinuation = {
                  key: 'replacement-continuation',
                  replacementId: input.replacementId,
                  kind: input.kind,
                  committedRevision: next.revision,
                  needsInvalidation: true,
                  needsSyncMetadata: true,
                  ...(input.syncMetadataPatch
                    ? { syncMetadataPatch: input.syncMetadataPatch }
                    : {}),
                }
                records.put(
                  {
                    key: 'replacement',
                    replacementId: input.replacementId,
                    revision: previous.revision,
                    fingerprint: previous.fingerprint,
                    bytes: previous.bytes,
                    savedAt: previous.savedAt,
                  } satisfies ReplacementRecoveryRecord,
                  'recovery',
                )
                records.put(next, 'active')
                records.put(continuation, 'replacement-continuation')
                const legacyCursor = records.openCursor()
                legacyCursor.onsuccess = () => {
                  const cursor = legacyCursor.result
                  if (!cursor) return
                  if (
                    typeof cursor.key === 'string' &&
                    (cursor.key === 'recovery:replacement' ||
                      cursor.key.startsWith('recovery:replacement:'))
                  )
                    cursor.delete()
                  cursor.continue()
                }
                finish(next)
              } catch (error) {
                fail(error)
              }
            }
          } catch (error) {
            fail(error)
          }
        }
      })
    },

    markInvalidated(replacementId) {
      return updateContinuation(replacementId, 'needsInvalidation', false)
    },
    markSyncMetadataComplete(replacementId) {
      return updateContinuation(replacementId, 'needsSyncMetadata', false)
    },
    completeContinuation(replacementId) {
      return transact('readwrite', (records, finish, fail) => {
        const request = records.get('replacement-continuation')
        request.onsuccess = () => {
          try {
            const current = readContinuationRecord(request.result)
            if (
              !current ||
              current.replacementId !== replacementId ||
              current.needsInvalidation ||
              current.needsSyncMetadata
            )
              throw new Error('Replacement continuation is not complete.')
            records.delete('replacement-continuation')
            finish()
          } catch (error) {
            fail(error)
          }
        }
      })
    },
    readRecovery(key) {
      return transact('readonly', (records, finish) => {
        const request = records.get(`recovery:${key}`)
        request.onsuccess = () =>
          finish(
            request.result === undefined ? null : { value: request.result },
          )
      })
    },

    commitRecovery(key, value) {
      return transact('readwrite', (records, finish, fail) => {
        const request = records.get(`recovery:${key}`)
        request.onsuccess = () => {
          if (request.result !== undefined) {
            fail(
              new Error(
                'An earlier database recovery record must be exported before another upgrade.',
              ),
            )
            return
          }
          records.put(value, `recovery:${key}`)
          finish()
        }
      })
    },

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
        const continuationRequest = records.get('replacement-continuation')
        continuationRequest.onsuccess = () => {
          try {
            const continuation = readContinuationRecord(
              continuationRequest.result,
            )
            const request = records.get('active')
            request.onsuccess = () => {
              try {
                const previous = readRecord(request.result)
                if (previous?.revision === Number.MAX_SAFE_INTEGER)
                  throw new Error('Snapshot revision limit reached.')
                if (
                  continuation &&
                  (!previous ||
                    previous.revision < continuation.committedRevision ||
                    (previous.revision > continuation.committedRevision &&
                      previous.replacementId !== continuation.replacementId) ||
                    previous.fingerprint === fingerprint)
                )
                  throw new Error(
                    'Cannot publish unrelated data while a replacement continuation is unresolved.',
                  )
                const next: ActiveSnapshotRecord = {
                  key: 'active',
                  fingerprint,
                  bytes: savedBytes,
                  revision: (previous?.revision ?? 0) + 1,
                  lastVerifiedRevision: previous?.lastVerifiedRevision ?? 0,
                  savedAt,
                  ...(continuation
                    ? { replacementId: continuation.replacementId }
                    : {}),
                }
                records.put(next, 'active')
                finish(next)
              } catch (error) {
                fail(error)
              }
            }
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

  function updateContinuation(
    replacementId: string,
    flag: 'needsInvalidation' | 'needsSyncMetadata',
    value: false,
  ): Promise<void> {
    return transact('readwrite', (records, finish, fail) => {
      const request = records.get('replacement-continuation')
      request.onsuccess = () => {
        try {
          const current = readContinuationRecord(request.result)
          if (!current || current.replacementId !== replacementId)
            throw new Error('Replacement continuation does not match.')
          records.put({ ...current, [flag]: value }, 'replacement-continuation')
          finish()
        } catch (error) {
          fail(error)
        }
      }
    })
  }
}
