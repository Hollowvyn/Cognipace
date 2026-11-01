import {
  isCommittedCompositeCandidate,
  preparedCompositeCandidateSchema,
  pendingCompositeKey,
  readPendingCompositePreparation,
  type PendingCompositePreparation,
} from './composite-publication'
import { archiveStoreNames } from './local-idb-schema'
import {
  assertFreshLocalStores,
  initialArchiveMarker,
  readReadyArchive,
} from './local-root-validation'
import { z } from 'zod'
import { createLocalIdbStore } from './local-idb'
import {
  coreRecordReferenceKey,
  coreRecordReferenceSchema,
  isBinary,
  localHeadSchema,
} from './local-store-types'

export function nextDataHead<T extends { revision: number; savedAt: string }>(
  head: T,
  now: Date,
): T {
  if (
    !Number.isSafeInteger(head.revision) ||
    head.revision < 0 ||
    head.revision === Number.MAX_SAFE_INTEGER
  )
    throw new Error('Snapshot revision limit reached.')
  return { ...head, revision: head.revision + 1, savedAt: now.toISOString() }
}

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
  archiveGeneration?: string
  datasetToken?: string
  coreSnapshotId?: string
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

export type ReplacementKind =
  | 'restore'
  | 'reset'
  | 'gist-pull'
  | 'problem-reset'
  | 'problem-delete'
export interface ReplacementContinuation {
  key: 'replacement-continuation'
  replacementId: string
  kind: ReplacementKind
  committedRevision: number
  needsInvalidation: boolean
  needsSyncMetadata: boolean
  syncMetadataPatch?: Record<string, unknown>
}

// Compact global fences survive dataset clears and never reference physical roots.
export const replacementCommandKey = (commandId: string): IDBValidKey => [
  'replacement-command',
  commandId,
]
export const replacementCommandRecordSchema = z.strictObject({
  commandId: z.string().min(1),
  kind: z.enum([
    'reset',
    'problem-reset',
    'problem-delete',
    'restore',
    'gist-pull',
  ]),
  requestFingerprint: z.string().min(1),
  status: z.literal('committed'),
})
export type ReplacementCommandRecord = z.infer<
  typeof replacementCommandRecordSchema
>

export type ReplacementInput = Pick<
  ReplacementContinuation,
  'replacementId' | 'kind' | 'syncMetadataPatch'
> & { commandFingerprint?: string }

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
  readPendingPreparation?(): Promise<PendingCompositePreparation | null>
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

export function readContinuationRecord(
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
    ![
      'restore',
      'reset',
      'gist-pull',
      'problem-reset',
      'problem-delete',
    ].includes(String(value.kind)) ||
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

export function createSnapshotIdbStore(
  factory: IDBFactory,
  databaseName = 'cognipace-local-v1',
): SnapshotIdbStore {
  const local = createLocalIdbStore(factory, databaseName)
  function transact<T>(
    mode: IDBTransactionMode,
    operate: (
      records: IDBObjectStore,
      finish: (value: T) => void,
      fail: (error: unknown) => void,
      read: (key: IDBValidKey) => {
        result: unknown
        onsuccess: (() => void) | null
      },
      write: (value: unknown, key: IDBValidKey) => void,
    ) => void,
  ): Promise<T> {
    return local.transact(
      ['records', 'coreSnapshots', ...archiveStoreNames],
      mode,
      (stores, finish, fail) => {
        const records = stores.records
        const cores = stores.coreSnapshots
        const heads = new Map<IDBValidKey, Record<string, unknown>>()
        const binaries = new Map<IDBValidKey, Uint8Array>()
        function read(key: IDBValidKey) {
          const output: { result: unknown; onsuccess: (() => void) | null } = {
            result: undefined,
            onsuccess: null,
          }
          const request = records.get(key)
          request.onsuccess = () => {
            try {
              const value: unknown = request.result
              if (
                typeof value === 'object' &&
                value !== null &&
                'formatVersion' in value &&
                value.formatVersion === 2 &&
                'coreSnapshotId' in value &&
                'key' in value &&
                (value.key === 'active' || value.key === 'replacement')
              ) {
                if (key === 'active') localHeadSchema.parse(value)
                const hydrate = () => {
                  if (typeof value.coreSnapshotId !== 'string')
                    throw new Error('The stored core reference is invalid.')
                  heads.set(key, value)
                  const core = cores.get(value.coreSnapshotId)
                  core.onsuccess = () => {
                    try {
                      if (!isBinary(core.result))
                        throw new Error(
                          'The stored core snapshot is missing or invalid.',
                        )
                      binaries.set(key, core.result)
                      const metadata = { ...value } as Record<string, unknown>
                      delete metadata.formatVersion
                      delete metadata.coreSnapshotId
                      if (key === 'active') {
                        delete metadata.archiveGeneration
                        delete metadata.datasetToken
                      }
                      output.result = { ...metadata, bytes: core.result }
                      output.onsuccess?.()
                    } catch (error) {
                      fail(error)
                    }
                  }
                }
                if (key === 'active')
                  readReadyArchive(
                    records,
                    String(
                      'archiveGeneration' in value
                        ? value.archiveGeneration
                        : '',
                    ),
                    hydrate,
                    fail,
                  )
                else {
                  // Recovery values are historically opaque. Only separately
                  // recorded provenance authorizes treating one as a core head.
                  const reference = cores.get(coreRecordReferenceKey(key))
                  reference.onsuccess = () => {
                    try {
                      if (reference.result === undefined) {
                        output.result = value
                        output.onsuccess?.()
                        return
                      }
                      const pointer = coreRecordReferenceSchema.parse(
                        reference.result,
                      )
                      if (pointer.coreSnapshotId !== value.coreSnapshotId)
                        throw new Error(
                          'The stored recovery core reference is invalid.',
                        )
                      if ('kind' in pointer && pointer.kind === 'paired') {
                        if (
                          !('archiveGeneration' in value) ||
                          value.archiveGeneration !==
                            pointer.archiveGeneration ||
                          !('datasetToken' in value) ||
                          value.datasetToken !== pointer.datasetToken
                        )
                          throw new Error(
                            'The stored recovery archive provenance is invalid.',
                          )
                        readReadyArchive(
                          records,
                          pointer.archiveGeneration,
                          hydrate,
                          fail,
                        )
                      } else hydrate()
                    } catch (error) {
                      fail(error)
                    }
                  }
                }
              } else {
                if (key === 'active' && value === undefined)
                  assertFreshLocalStores(
                    stores,
                    () => {
                      output.result = value
                      output.onsuccess?.()
                    },
                    fail,
                  )
                else {
                  output.result = value
                  output.onsuccess?.()
                }
              }
            } catch (error) {
              fail(error)
            }
          }
          return output
        }
        function write(value: unknown, key: IDBValidKey) {
          if (
            typeof value === 'object' &&
            value !== null &&
            'bytes' in value &&
            isBinary(value.bytes) &&
            'key' in value &&
            (value.key === 'active' || value.key === 'replacement')
          ) {
            const { bytes, ...rawMetadata } = value
            const metadata: Record<string, unknown> = rawMetadata
            const activePrior =
              key !== 'active' && binaries.get('active') === bytes
                ? heads.get('active')
                : undefined
            if (activePrior) {
              metadata.archiveGeneration = activePrior.archiveGeneration
              metadata.datasetToken = activePrior.datasetToken
            }
            const previous = heads.get(key) ?? activePrior
            const coreSnapshotId =
              previous && binaries.get(key) === bytes
                ? String(previous.coreSnapshotId)
                : crypto.randomUUID()
            if (!previous || binaries.get(key) !== bytes)
              cores.add(bytes, coreSnapshotId)
            if (key !== 'active')
              cores.put(
                activePrior
                  ? {
                      kind: 'paired',
                      coreSnapshotId,
                      archiveGeneration: activePrior.archiveGeneration,
                      datasetToken: activePrior.datasetToken,
                    }
                  : { kind: 'core-only', coreSnapshotId },
                coreRecordReferenceKey(key),
              )
            const archiveGeneration = previous
              ? z.string().min(1).parse(previous.archiveGeneration)
              : crypto.randomUUID()
            if (key === 'active' && !previous)
              records.put(initialArchiveMarker, [
                'archive-generation',
                archiveGeneration,
              ])
            records.put(
              {
                ...metadata,
                formatVersion: 2,
                coreSnapshotId,
                ...(key === 'active'
                  ? {
                      archiveGeneration: archiveGeneration,
                      datasetToken:
                        previous?.datasetToken ?? crypto.randomUUID(),
                    }
                  : {}),
              },
              key,
            )
          } else records.put(value, key)
        }
        operate(records, finish, fail, read, write)
      },
    )
  }

  // Best-effort retirement is restricted to the outgoing ordinary-save core.
  // Unknown roots defer to bounded reachability maintenance. Never scan bodies
  // or archive rows here, and never turn an already durable save into failure.
  async function retireOrdinaryCore(
    oldId: string | undefined,
    next: ActiveSnapshotRecord,
  ) {
    if (!oldId) return
    try {
      const expected = await local.readHead() // validates the published pair
      if (
        !expected ||
        expected.coreSnapshotId === oldId ||
        expected.revision !== next.revision ||
        expected.fingerprint !== next.fingerprint ||
        expected.savedAt !== next.savedAt
      )
        return
      const verified = await local.readCore(expected.coreSnapshotId)
      if (
        !verified ||
        verified.byteLength !== next.bytes.byteLength ||
        !verified.every((byte, i) => byte === next.bytes[i])
      )
        return
      await local.transact(
        ['records', 'coreSnapshots'],
        'readwrite',
        (s, finish, fail) => {
          const keep = () => finish(undefined)
          const guard = (callback: () => void) => () => {
            try {
              callback()
            } catch (error) {
              fail(error)
            }
          }
          // Opaque history is never hydrated by discovery. Separately stored
          // provenance authorizes validating a recovery's compact head fields.
          const checkReference = (
            recordKey: IDBValidKey,
            rawPointer: unknown,
            ready: () => void,
          ) => {
            const pointer = coreRecordReferenceSchema.parse(rawPointer)
            if (pointer.coreSnapshotId === oldId) {
              keep()
              return
            }
            const presence = s.records.getKey(recordKey)
            presence.onsuccess = guard(() => {
              if (presence.result === undefined) {
                keep()
                return
              }
              const target = s.records.get(recordKey)
              target.onsuccess = guard(() => {
                const metadata = z
                  .object({
                    key: z.enum(['active', 'replacement']),
                    formatVersion: z.literal(2),
                    coreSnapshotId: z.string().min(1),
                    fingerprint: z.string(),
                    revision: z
                      .number()
                      .int()
                      .positive()
                      .max(Number.MAX_SAFE_INTEGER),
                    savedAt: z.string(),
                    archiveGeneration: z.string().min(1).optional(),
                    datasetToken: z.string().min(1).optional(),
                  })
                  .parse(target.result)
                if (metadata.coreSnapshotId !== pointer.coreSnapshotId) {
                  keep()
                  return
                }
                const core = s.coreSnapshots.getKey(pointer.coreSnapshotId)
                core.onsuccess = guard(() => {
                  if (core.result === undefined) {
                    keep()
                    return
                  }
                  if ('kind' in pointer && pointer.kind === 'paired') {
                    if (
                      metadata.archiveGeneration !==
                        pointer.archiveGeneration ||
                      metadata.datasetToken !== pointer.datasetToken
                    ) {
                      keep()
                      return
                    }
                    readReadyArchive(
                      s.records,
                      pointer.archiveGeneration,
                      ready,
                      fail,
                    )
                  } else ready()
                })
              })
            })
          }
          const checkReservedRecovery = (ready: () => void) => {
            const recovery = s.records.getKey('recovery')
            recovery.onsuccess = guard(() => {
              if (recovery.result === undefined) {
                ready()
                return
              }
              const provenance = s.coreSnapshots.get(
                coreRecordReferenceKey('recovery'),
              )
              provenance.onsuccess = guard(() => {
                if (provenance.result === undefined) {
                  keep()
                  return
                }
                checkReference('recovery', provenance.result, ready)
              })
            })
          }
          const active = s.records.get('active')
          active.onsuccess = () => {
            try {
              const current = localHeadSchema.parse(active.result)
              if (
                current.coreSnapshotId !== expected.coreSnapshotId ||
                current.revision !== expected.revision ||
                current.archiveGeneration !== expected.archiveGeneration ||
                current.datasetToken !== expected.datasetToken ||
                current.fingerprint !== expected.fingerprint ||
                current.savedAt !== expected.savedAt ||
                current.replacementId !== expected.replacementId ||
                current.lastVerifiedRevision !== expected.lastVerifiedRevision
              ) {
                keep()
                return
              }
              readReadyArchive(
                s.records,
                current.archiveGeneration,
                () => {
                  checkReservedRecovery(() => {
                    const pending = s.records.get(pendingCompositeKey)
                    pending.onsuccess = guard(() => {
                      if (pending.result !== undefined) {
                        keep()
                        return
                      }
                      const continuation = s.records.get(
                        'replacement-continuation',
                      )
                      continuation.onsuccess = guard(() => {
                        if (continuation.result !== undefined) {
                          keep()
                          return
                        }
                        let candidateCount = 0
                        const candidates = s.records.openKeyCursor(
                          IDBKeyRange.lowerBound(['composite-candidate']),
                        )
                        candidates.onsuccess = guard(() => {
                          try {
                            const cursor = candidates.result
                            if (
                              cursor &&
                              Array.isArray(cursor.key) &&
                              cursor.key[0] === 'composite-candidate'
                            ) {
                              if (++candidateCount >= 64) {
                                keep()
                                return
                              }
                              const candidateRead = s.records.get(cursor.key)
                              candidateRead.onsuccess = guard(() => {
                                const candidate =
                                  preparedCompositeCandidateSchema.parse(
                                    candidateRead.result,
                                  )
                                const descriptor = candidate.descriptor
                                if (
                                  !Array.isArray(cursor.key) ||
                                  cursor.key.length !== 2 ||
                                  cursor.key[1] !== descriptor.replacementId
                                ) {
                                  keep()
                                  return
                                }
                                const fence = s.records.get(
                                  replacementCommandKey(
                                    descriptor.replacementId,
                                  ),
                                )
                                fence.onsuccess = () => {
                                  try {
                                    // Only an exact durable command fence can discharge
                                    // an unrelated completed candidate after later saves.
                                    if (
                                      fence.result === undefined ||
                                      !isCommittedCompositeCandidate(
                                        descriptor,
                                        fence.result,
                                        current,
                                      )
                                    ) {
                                      keep()
                                      return
                                    }
                                    cursor.continue()
                                  } catch (error) {
                                    fail(error)
                                  }
                                }
                              })
                              return
                            }
                          } catch (error) {
                            fail(error)
                            return
                          }
                          let count = 0
                          const references = s.coreSnapshots.openKeyCursor(
                            IDBKeyRange.lowerBound(['recordReference']),
                          )
                          references.onsuccess = () => {
                            try {
                              const cursor = references.result
                              if (
                                !cursor ||
                                !Array.isArray(cursor.key) ||
                                cursor.key[0] !== 'recordReference'
                              ) {
                                // The new binary must still exist in this same
                                // proof/delete transaction after readback.
                                const activeCore = s.coreSnapshots.getKey(
                                  current.coreSnapshotId,
                                )
                                activeCore.onsuccess = guard(() => {
                                  if (activeCore.result === undefined) {
                                    keep()
                                    return
                                  }
                                  s.coreSnapshots.delete(oldId)
                                  finish(undefined)
                                })
                                return
                              }
                              // Reaching the cap is uncertainty, including exactly 64.
                              if (++count >= 64) {
                                keep()
                                return
                              }
                              const referenceRead = s.coreSnapshots.get(
                                cursor.key,
                              )
                              referenceRead.onsuccess = guard(() => {
                                const reference =
                                  coreRecordReferenceSchema.safeParse(
                                    referenceRead.result,
                                  )
                                if (
                                  !Array.isArray(cursor.key) ||
                                  cursor.key.length !== 2 ||
                                  !reference.success ||
                                  reference.data.coreSnapshotId === oldId
                                ) {
                                  keep()
                                  return
                                }
                                checkReference(
                                  cursor.key[1]!,
                                  reference.data,
                                  () => cursor.continue(),
                                )
                              })
                            } catch (error) {
                              fail(error)
                            }
                          }
                        })
                      })
                    })
                  })
                },
                fail,
              )
            } catch (error) {
              fail(error)
            }
          }
        },
      )
    } catch {
      // Publication is already durable. Retain outgoing bytes on any proof or
      // cleanup failure; normal reachability maintenance remains the fallback.
    }
  }

  return {
    listReplacementRecoveries() {
      return transact('readonly', (_records, finish, fail, read) => {
        const request = read('recovery')
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
      return transact('readonly', (_records, finish, fail, read) => {
        const request = read('recovery')
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
      return transact('readonly', (_records, finish, fail, read) => {
        const request = read('replacement-continuation')
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
      return transact('readwrite', (records, finish, fail, read, write) => {
        const continuationRequest = read('replacement-continuation')
        continuationRequest.onsuccess = () => {
          try {
            if (readContinuationRecord(continuationRequest.result))
              throw new Error(
                'An earlier replacement continuation is unresolved.',
              )
            const activeRequest = read('active')
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
                  ...nextDataHead(
                    { revision: previous.revision, savedAt },
                    now,
                  ),
                  lastVerifiedRevision: previous.lastVerifiedRevision,
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
                write(
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
                write(next, 'active')
                write(continuation, 'replacement-continuation')
                const legacyCursor = records.openCursor()
                legacyCursor.onsuccess = () => {
                  const cursor = legacyCursor.result
                  if (!cursor) return
                  if (
                    typeof cursor.key === 'string' &&
                    (cursor.key === 'recovery:replacement' ||
                      cursor.key.startsWith('recovery:replacement:'))
                  ) {
                    cursor.delete()
                    records.transaction
                      .objectStore('coreSnapshots')
                      .delete(coreRecordReferenceKey(cursor.key))
                  }
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
      return transact('readwrite', (records, finish, fail, read) => {
        const request = read('replacement-continuation')
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
      return transact('readonly', (_records, finish, _fail, read) => {
        const request = read(`recovery:${key}`)
        request.onsuccess = () =>
          finish(
            request.result === undefined ? null : { value: request.result },
          )
      })
    },

    commitRecovery(key, value) {
      return transact('readwrite', (_records, finish, fail, read, write) => {
        const request = read(`recovery:${key}`)
        request.onsuccess = () => {
          if (request.result !== undefined) {
            fail(
              new Error(
                'An earlier database recovery record must be exported before another upgrade.',
              ),
            )
            return
          }
          write(value, `recovery:${key}`)
          finish()
        }
      })
    },

    readPendingPreparation: () => readPendingCompositePreparation(local),

    readActive() {
      return transact('readonly', (_records, finish, fail, read) => {
        const request = read('active')
        request.onsuccess = () => {
          try {
            finish(readRecord(request.result))
          } catch (error) {
            fail(error)
          }
        }
      })
    },

    async commitSnapshot(bytes, fingerprint, now) {
      const savedBytes = bytes.slice()
      const savedAt = now.toISOString()
      let outgoingCoreId: string | undefined
      const committed = await transact<ActiveSnapshotRecord>(
        'readwrite',
        (records, finish, fail, read, write) => {
          const continuationRequest = read('replacement-continuation')
          continuationRequest.onsuccess = () => {
            try {
              const continuation = readContinuationRecord(
                continuationRequest.result,
              )
              const rawHead = records.get('active')
              rawHead.onsuccess = () => {
                const parsed = localHeadSchema.safeParse(rawHead.result)
                if (parsed.success) outgoingCoreId = parsed.data.coreSnapshotId
              }
              const request = read('active')
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
                        previous.replacementId !==
                          continuation.replacementId) ||
                      previous.fingerprint === fingerprint)
                  )
                    throw new Error(
                      'Cannot publish unrelated data while a replacement continuation is unresolved.',
                    )
                  const next: ActiveSnapshotRecord = {
                    key: 'active',
                    fingerprint,
                    bytes: savedBytes,
                    ...nextDataHead(
                      { revision: previous?.revision ?? 0, savedAt },
                      now,
                    ),
                    lastVerifiedRevision: previous?.lastVerifiedRevision ?? 0,
                    ...(continuation
                      ? { replacementId: continuation.replacementId }
                      : {}),
                  }
                  write(next, 'active')
                  finish(next)
                } catch (error) {
                  fail(error)
                }
              }
            } catch (error) {
              fail(error)
            }
          }
        },
      )
      await retireOrdinaryCore(outgoingCoreId, committed)
      return committed
    },

    acknowledgeVerifiedRevision(revision) {
      if (!Number.isSafeInteger(revision) || revision < 0) {
        return Promise.reject(new Error('Invalid verified revision.'))
      }
      // Verification changes metadata only. Never hydrate or rewrite core bytes.
      return local.transact(
        ['records'],
        'readwrite',
        (stores, finish, fail) => {
          const request = stores.records.get('active')
          request.onsuccess = () => {
            try {
              const previous =
                request.result === undefined
                  ? null
                  : localHeadSchema.parse(request.result)
              if (!previous || revision > previous.revision)
                throw new Error(
                  'Cannot verify a missing or future snapshot revision.',
                )
              stores.records.put(
                {
                  ...previous,
                  lastVerifiedRevision: Math.max(
                    previous.lastVerifiedRevision,
                    revision,
                  ),
                },
                'active',
              )
              finish(undefined)
            } catch (error) {
              fail(error)
            }
          }
        },
      )
    },
  }

  function updateContinuation(
    replacementId: string,
    flag: 'needsInvalidation' | 'needsSyncMetadata',
    value: false,
  ): Promise<void> {
    return transact('readwrite', (_records, finish, fail, read, write) => {
      const request = read('replacement-continuation')
      request.onsuccess = () => {
        try {
          const current = readContinuationRecord(request.result)
          if (!current || current.replacementId !== replacementId)
            throw new Error('Replacement continuation does not match.')
          write({ ...current, [flag]: value }, 'replacement-continuation')
          finish()
        } catch (error) {
          fail(error)
        }
      }
    })
  }
}
