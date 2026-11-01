import { z } from 'zod'
import { archiveStoreNames } from '@/platform/db/local-idb-schema'
import {
  archiveGenerationProgressSchema,
  assertReadyArchive,
} from '@/platform/db/local-root-validation'
import {
  coreRecordReferenceSchema,
  localHeadSchema,
  type LocalHead,
  type LocalIdbStore,
  type LocalStores,
} from '@/platform/db/local-store-types'
import {
  preparedCompositeCandidateSchema,
  isCommittedCompositeCandidate,
  replacementSourceKey,
} from '@/platform/db/composite-publication'
import { readContinuationRecord } from '@/platform/db/snapshot-idb'
import {
  assessmentRecordSchema,
  submissionRecordSchema,
} from '../domain/notes-records'

const storeNames = ['records', 'coreSnapshots', ...archiveStoreNames] as const
const metadataNames = [
  'problemNotes',
  'submissions',
  'analysisReports',
  'savedAiNotes',
  'problemScopes',
] as const
const sweepNames = [
  ...metadataNames,
  'payloads',
  'coreSnapshots',
  'records',
] as const
const progressKey = ['notes-maintenance-progress']
const epochKey = ['local-technical-write-epoch']
const preparedSchema = preparedCompositeCandidateSchema
const progressSchema = z.strictObject({
  epoch: z.number().int().nonnegative(),
  phase: z.enum(['roots', 'provenance', 'validate', 'mark', 'verify', 'sweep']),
  storeIndex: z.number().int().nonnegative(),
  lastKey: z.custom<IDBValidKey>().optional(),
  generations: z.array(z.string()),
  cores: z.array(z.string()),
  payloads: z.array(z.string()),
  lastBatchAt: z.string(),
  uncertainPayloads: z.boolean(),
})
type Progress = z.infer<typeof progressSchema>
export function unreferencedIds<T>(
  allIds: readonly T[],
  reachable: ReadonlySet<T>,
): T[] {
  return allIds.filter((id) => !reachable.has(id))
}
function namespace(key: IDBValidKey) {
  return Array.isArray(key) ? key[0] : undefined
}
function payloadReferences(name: string, value: unknown): string[] {
  if (name === 'submissions') {
    if (
      z
        .object({ attemptAlias: z.string(), id: z.undefined().optional() })
        .safeParse(value).success
    )
      return []
    const row = submissionRecordSchema.strip().parse(value)
    return row.codePayloadId ? [row.codePayloadId] : []
  }
  if (name === 'analysisReports') {
    const row = assessmentRecordSchema.strip().parse(value)
    return [
      row.feedbackPayloadId,
      ...(row.implementationPayloadId ? [row.implementationPayloadId] : []),
    ]
  }
  return []
}
function generationOf(key: IDBValidKey): string {
  if (!Array.isArray(key) || typeof key[0] !== 'string')
    throw new Error('Invalid archive metadata key.')
  return key[0]
}
function consume(
  request: IDBRequest,
  fail: (error: unknown) => void,
  consumeValue: (value: unknown) => void,
) {
  request.onsuccess = () => {
    try {
      consumeValue(request.result)
    } catch (error) {
      fail(error)
    }
  }
}
// Validate published roots before every pass. Opaque historical recoveries are
// interpreted only via separately recorded provenance, never familiar fields.
function publishedRoots(
  s: LocalStores,
  fail: (error: unknown) => void,
  ready: (head: LocalHead, recoveryGeneration: string | null) => void,
) {
  consume(s.records!.get('active'), fail, (value) => {
    const head = localHeadSchema.parse(value)
    consume(
      s.records!.get(['archive-generation', head.archiveGeneration]),
      fail,
      (marker) => {
        assertReadyArchive(marker)
        consume(s.coreSnapshots!.count(head.coreSnapshotId), fail, (count) => {
          if (count !== 1) throw new Error('Missing active core.')
          consume(s.records!.get('recovery'), fail, (recovery) => {
            if (recovery === undefined) {
              ready(head, null)
              return
            }
            consume(
              s.coreSnapshots!.get(['recordReference', 'recovery']),
              fail,
              (value) => {
                const pointer = coreRecordReferenceSchema.parse(value)
                if (!('kind' in pointer))
                  throw new Error(
                    'Recovery requires explicit archive provenance before maintenance.',
                  )
                if (pointer.kind === 'core-only') {
                  consume(
                    s.coreSnapshots!.count(pointer.coreSnapshotId),
                    fail,
                    (count) => {
                      if (count !== 1)
                        throw new Error('Missing core-only recovery.')
                      ready(head, null)
                    },
                  )
                  return
                }
                const prior = localHeadSchema.parse({
                  ...z.record(z.string(), z.unknown()).parse(recovery),
                  key: 'active',
                })
                if (
                  prior.archiveGeneration !== pointer.archiveGeneration ||
                  prior.datasetToken !== pointer.datasetToken
                )
                  throw new Error('Recovery archive provenance mismatch.')
                if (pointer.coreSnapshotId !== prior.coreSnapshotId)
                  throw new Error('Recovery core provenance mismatch.')
                consume(
                  s.coreSnapshots!.count(pointer.coreSnapshotId),
                  fail,
                  (count) => {
                    if (count !== 1) throw new Error('Missing recovery core.')
                    consume(
                      s.records!.get([
                        'archive-generation',
                        prior.archiveGeneration,
                      ]),
                      fail,
                      (marker) => {
                        assertReadyArchive(marker)
                        ready(head, prior.archiveGeneration)
                      },
                    )
                  },
                )
              },
            )
          })
        })
      },
    )
  })
}

export function createNotesMaintenanceService({
  local,
  now = () => new Date(),
  batchSize = 100,
}: {
  local: LocalIdbStore
  now?: () => Date
  batchSize?: number
}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500)
    throw new Error('Invalid maintenance batch size.')
  async function collectBatch() {
    return local.transact<
      {
        removedGenerations: string[]
        removedPayloadIds: string[]
        deletedRecords: number
        scannedKeys: number
        hasMore: boolean
      },
      (typeof storeNames)[number]
    >(storeNames, 'readwrite', (s, done, fail) => {
      const abort = (error: unknown) =>
        fail(
          new Error(
            'Archive maintenance requires recovery; no data was collected.',
            { cause: error },
          ),
        )
      publishedRoots(s, abort, (head, recoveryGeneration) => {
        consume(s.records.get(epochKey), abort, (epochValue) => {
          const epoch = z
            .number()
            .int()
            .positive()
            .max(Number.MAX_SAFE_INTEGER)
            .parse(epochValue)
          consume(s.records.get(progressKey), abort, (value) => {
            const saved =
              value === undefined ? null : progressSchema.parse(value)
            // local-idb increments exactly once at admission. Our own progress write
            // shares that epoch; any OTHER write invalidates the entire mark manifest.
            const progress: Progress =
              saved && saved.epoch === epoch - 1
                ? saved
                : {
                    epoch,
                    phase: 'roots',
                    storeIndex: 0,
                    generations: [
                      head.archiveGeneration,
                      ...(recoveryGeneration ? [recoveryGeneration] : []),
                    ],
                    cores: [head.coreSnapshotId],
                    payloads: [],
                    uncertainPayloads: false,
                    lastBatchAt: now().toISOString(),
                  }
            const generations = new Set(progress.generations),
              cores = new Set(progress.cores),
              payloads = new Set(progress.payloads)
            const result = {
              removedGenerations: [] as string[],
              removedPayloadIds: [] as string[],
              deletedRecords: 0,
              scannedKeys: 0,
              hasMore: true,
            }
            const save = () => {
              progress.epoch = epoch
              progress.generations = [...generations]
              progress.cores = [...cores]
              progress.payloads = [...payloads]
              progress.lastBatchAt = now().toISOString()
              if (result.hasMore) s.records.put(progress, progressKey)
              else s.records.delete(progressKey)
              done(result)
            }
            const transition = (phase: Progress['phase']) => {
              progress.phase = phase
              progress.storeIndex = 0
              delete progress.lastKey
              save()
            }
            const range =
              progress.lastKey === undefined
                ? undefined
                : IDBKeyRange.lowerBound(progress.lastKey, true)
            if (progress.phase === 'roots') {
              const request = s.records.openKeyCursor(range)
              request.onsuccess = () => {
                try {
                  const cursor = request.result
                  if (!cursor) {
                    transition('provenance')
                    return
                  }
                  progress.lastKey = cursor.key
                  result.scannedKeys++
                  const next = () => {
                    if (result.scannedKeys >= batchSize) save()
                    else cursor.continue()
                  }
                  const key = cursor.key,
                    kind = namespace(key)
                  if (kind === 'archive-generation') {
                    consume(s.records.get(key), abort, (value) => {
                      const marker =
                        archiveGenerationProgressSchema.parse(value)
                      if (!Array.isArray(key) || typeof key[1] !== 'string')
                        throw new Error('Invalid archive generation key.')
                      if (marker.status === 'staging') {
                        generations.add(key[1])
                        progress.uncertainPayloads = true
                      }
                      next()
                    })
                  } else if (kind === 'composite-candidate') {
                    consume(s.records.get(key), abort, (value) => {
                      const descriptor = preparedSchema.parse(value).descriptor
                      consume(
                        s.records.get([
                          'replacement-command',
                          descriptor.replacementId,
                        ]),
                        abort,
                        (fence) => {
                          if (
                            !Array.isArray(key) ||
                            key[1] !== descriptor.replacementId
                          )
                            throw new Error(
                              'Prepared replacement key mismatch.',
                            )
                          if (
                            isCommittedCompositeCandidate(
                              descriptor,
                              fence,
                              head,
                            )
                          ) {
                            next()
                            return
                          }
                          generations.add(descriptor.archiveGeneration)
                          cores.add(descriptor.coreSnapshotId)
                          next()
                        },
                      )
                    })
                  } else if (key === 'replacement-continuation') {
                    consume(s.records.get(key), abort, (value) => {
                      const continuation = readContinuationRecord(value)
                      if (
                        !continuation ||
                        continuation.replacementId !== head.replacementId ||
                        continuation.committedRevision > head.revision
                      )
                        throw new Error(
                          'Unresolved continuation does not match published roots.',
                        )
                      next()
                    })
                  } else next()
                } catch (error) {
                  abort(error)
                }
              }
              return
            }
            if (progress.phase === 'provenance') {
              const request = s.coreSnapshots.openKeyCursor(range)
              request.onsuccess = () => {
                try {
                  const cursor = request.result
                  if (!cursor) {
                    validateRoots()
                    return
                  }
                  progress.lastKey = cursor.key
                  result.scannedKeys++
                  const next = () => {
                    if (result.scannedKeys >= batchSize) save()
                    else cursor.continue()
                  }
                  if (namespace(cursor.key) !== 'recordReference') {
                    next()
                    return
                  }
                  const key = cursor.key as IDBValidKey[]
                  consume(s.coreSnapshots.get(cursor.key), abort, (value) => {
                    const pointer = coreRecordReferenceSchema.parse(value)
                    cores.add(pointer.coreSnapshotId)
                    if ('kind' in pointer && pointer.kind === 'paired')
                      generations.add(pointer.archiveGeneration)
                    consume(s.records.get(key[1]!), abort, (value) => {
                      if (value === undefined)
                        throw new Error('Missing recovery provenance target.')
                      next()
                    })
                  })
                } catch (error) {
                  abort(error)
                }
              }
              function validateRoots() {
                transition('validate')
              }
              return
            }
            if (progress.phase === 'validate' || progress.phase === 'verify') {
              const items: Array<{
                kind: 'records' | 'coreSnapshots' | 'payloads'
                id: string
              }> =
                progress.phase === 'verify'
                  ? [...payloads].map((id) => ({ kind: 'payloads', id }))
                  : [...generations].map((id) => ({ kind: 'records', id }))
              if (progress.phase === 'validate')
                items.push(
                  ...[...cores].map((id) => ({
                    kind: 'coreSnapshots' as const,
                    id,
                  })),
                )
              const batch = items.slice(
                progress.storeIndex,
                progress.storeIndex + batchSize,
              )
              if (!batch.length) {
                transition(progress.phase === 'verify' ? 'sweep' : 'mark')
                return
              }
              let pending = batch.length
              for (const item of batch) {
                result.scannedKeys++
                consume(
                  item.kind === 'records'
                    ? s.records.get(['archive-generation', item.id])
                    : s[item.kind].count(item.id),
                  abort,
                  (value) => {
                    if (item.kind === 'records')
                      archiveGenerationProgressSchema.parse(value)
                    else if (value !== 1)
                      throw new Error('Missing rooted immutable object.')
                    if (--pending === 0) {
                      progress.storeIndex += batch.length
                      save()
                    }
                  },
                )
              }
              return
            }
            if (progress.phase === 'mark') {
              const name = metadataNames[progress.storeIndex]
              if (!name) throw new Error('Invalid maintenance mark store.')
              const request = s[name].openKeyCursor(range)
              request.onsuccess = () => {
                try {
                  const cursor = request.result
                  if (!cursor) {
                    progress.storeIndex++
                    delete progress.lastKey
                    if (progress.storeIndex === metadataNames.length) {
                      progress.phase = 'verify'
                      progress.storeIndex = 0
                    }
                    save()
                    return
                  }
                  progress.lastKey = cursor.key
                  result.scannedKeys++
                  const next = () => {
                    if (result.scannedKeys >= batchSize) save()
                    else cursor.continue()
                  }
                  const generation = generationOf(cursor.key)
                  if (
                    generations.has(generation) &&
                    (name === 'submissions' || name === 'analysisReports')
                  )
                    consume(s[name].get(cursor.key), abort, (value) => {
                      for (const id of payloadReferences(name, value))
                        payloads.add(id)
                      next()
                    })
                  else next()
                } catch (error) {
                  abort(error)
                }
              }
              return
            }
            const name = sweepNames[progress.storeIndex]
            if (!name) throw new Error('Invalid maintenance sweep store.')
            const request = s[name].openKeyCursor(range)
            request.onsuccess = () => {
              try {
                const cursor = request.result
                if (!cursor) {
                  progress.storeIndex++
                  delete progress.lastKey
                  if (progress.storeIndex === sweepNames.length)
                    result.hasMore = false
                  save()
                  return
                }
                progress.lastKey = cursor.key
                result.scannedKeys++
                const next = () => {
                  if (result.scannedKeys >= batchSize) save()
                  else cursor.continue()
                }
                const remove = () => {
                  s[name].delete(cursor.key)
                  result.deletedRecords++
                }
                if (name === 'payloads') {
                  if (typeof cursor.key !== 'string')
                    throw new Error('Invalid immutable payload key.')
                  if (
                    !progress.uncertainPayloads &&
                    !payloads.has(cursor.key)
                  ) {
                    remove()
                    result.removedPayloadIds.push(cursor.key)
                  }
                } else if (name === 'coreSnapshots') {
                  if (typeof cursor.key === 'string' && !cores.has(cursor.key))
                    remove()
                } else if (name === 'records') {
                  const key = cursor.key,
                    kind = namespace(key)
                  if (kind === 'archive-generation') {
                    const generation = (key as IDBValidKey[])[1]
                    if (typeof generation !== 'string')
                      throw new Error('Invalid generation key.')
                    if (!generations.has(generation)) {
                      remove()
                      result.removedGenerations.push(generation)
                    }
                  } else if (kind === 'composite-candidate') {
                    consume(s.records.get(key), abort, (value) => {
                      const descriptor = preparedSchema.parse(value).descriptor
                      consume(
                        s.records.get([
                          'replacement-command',
                          descriptor.replacementId,
                        ]),
                        abort,
                        (fence) => {
                          if (
                            !Array.isArray(key) ||
                            key[1] !== descriptor.replacementId
                          )
                            throw new Error(
                              'Prepared replacement key mismatch.',
                            )
                          if (
                            isCommittedCompositeCandidate(
                              descriptor,
                              fence,
                              head,
                            )
                          ) {
                            consume(
                              s.records.get('replacement-continuation'),
                              abort,
                              (continuation) => {
                                if (continuation === undefined) {
                                  const prepared = preparedSchema.parse(value)
                                  if (prepared.sourceReference)
                                    s.records.delete(
                                      replacementSourceKey(
                                        prepared.sourceReference,
                                      ),
                                    )
                                  remove()
                                }
                                next()
                              },
                            )
                          } else next()
                        },
                      )
                    })
                    return
                  }
                  // Compact command/Notes/cancel/begin receipts, leases, and standalone
                  // previews remain intact. None are interpreted as physical core roots.
                } else if (!generations.has(generationOf(cursor.key))) remove()
                next()
              } catch (error) {
                abort(error)
              }
            }
          })
        })
      })
    })
  }
  async function getArchiveUsage() {
    return local.transact<
      {
        active: {
          notes: number
          submissions: number
          assessments: number
          savedAiNotes: number
          payloads: number
          logicalPayloadBytes: number
        }
        recoveryLogicalPayloadBytes: number
        technicalRecords: number
      },
      (typeof storeNames)[number]
    >(storeNames, 'readonly', (s, done, fail) => {
      publishedRoots(s, fail, (head, recoveryGeneration) => {
        const active = {
          notes: 0,
          submissions: 0,
          assessments: 0,
          savedAiNotes: 0,
          payloads: 0,
          logicalPayloadBytes: 0,
        }
        const activeIds = new Set<string>(),
          recoveryIds = new Set<string>()
        let pending = metadataNames.length * 2
        const scanned = () => {
          if (--pending === 0) readPayloadSizes()
        }
        for (const [generation, recovery] of [
          [head.archiveGeneration, false],
          [recoveryGeneration, true],
        ] as const)
          for (const name of metadataNames) {
            if (generation === null) {
              scanned()
              continue
            }
            const request = s[name].openKeyCursor(
              IDBKeyRange.bound([generation], [generation, []]),
            )
            request.onsuccess = () => {
              try {
                const cursor = request.result
                if (!cursor) {
                  scanned()
                  return
                }
                if (!recovery) {
                  if (name === 'problemNotes') active.notes++
                  if (name === 'savedAiNotes') active.savedAiNotes++
                }
                if (name === 'submissions' || name === 'analysisReports')
                  consume(s[name].get(cursor.key), fail, (value) => {
                    const refs = payloadReferences(name, value)
                    for (const id of refs)
                      (recovery ? recoveryIds : activeIds).add(id)
                    if (!recovery) {
                      if (name === 'analysisReports') active.assessments++
                      else if (
                        !z
                          .object({
                            attemptAlias: z.string(),
                            id: z.undefined().optional(),
                          })
                          .safeParse(value).success
                      )
                        active.submissions++
                    }
                    cursor.continue()
                  })
                else cursor.continue()
              } catch (error) {
                fail(error)
              }
            }
          }
        function readPayloadSizes() {
          let recoveryLogicalPayloadBytes = 0
          const ids = new Set([...activeIds, ...recoveryIds])
          let pending = ids.size + 1
          let technicalRecords = 0
          const next = () => {
            if (--pending === 0)
              done({ active, recoveryLogicalPayloadBytes, technicalRecords })
          }
          // These are logical body lengths from only reachable IDs. No global
          // payload enumeration and no bodies or private receipts cross runtime.
          for (const id of ids)
            consume(s.payloads.get(id), fail, (value) => {
              const row = z
                .object({
                  id: z.literal(id),
                  byteLength: z.number().int().nonnegative(),
                })
                .parse(value)
              if (activeIds.has(id)) {
                active.payloads++
                active.logicalPayloadBytes += row.byteLength
              } else recoveryLogicalPayloadBytes += row.byteLength
              next()
            })
          consume(
            s.records.count(IDBKeyRange.lowerBound([])),
            fail,
            (count) => {
              technicalRecords = z.number().int().nonnegative().parse(count)
              next()
            },
          )
        }
      })
    })
  }
  return { collectBatch, getArchiveUsage }
}
