import { z } from 'zod'
import type { DbHandle } from './client'
import { serializeDb } from './snapshot'
import {
  coreRecordReferenceKey,
  isBinary,
  localHeadSchema,
  type LocalHead,
  type LocalIdbStore,
} from './local-store-types'
import {
  nextDataHead,
  replacementCommandKey,
  replacementCommandRecordSchema,
  type ReplacementInput,
  type ReplacementContinuation,
} from './snapshot-idb'

export const compositeDescriptorSchema = z.strictObject({
  baseRevision: z.number().int().positive(),
  coreSnapshotId: z.string().min(1),
  archiveGeneration: z.string().min(1),
  datasetToken: z.string().min(1),
  replacementId: z.string().min(1),
  commandFingerprint: z.string().min(1).optional(),
  targetProblemScopes: z
    .array(
      z.strictObject({
        problemSlug: z.string().min(1),
        problemToken: z.string().min(1),
      }),
    )
    .optional(),
  initializedProblemScopes: z
    .array(
      z.strictObject({
        problemSlug: z.string().min(1),
        problemToken: z.string().min(1),
      }),
    )
    .optional(),
})
export type CompositeDescriptor = z.infer<typeof compositeDescriptorSchema>
export interface CompositeCandidate {
  handle: DbHandle
  descriptor: CompositeDescriptor
}
export function assertCandidateBase(
  head: LocalHead,
  descriptor: CompositeDescriptor,
) {
  if (head.revision !== descriptor.baseRevision)
    throw new Error('Local data changed before replacement publication.')
}
const problemScopeSchema = z.strictObject({
  datasetToken: z.string().min(1),
  problemToken: z.string().min(1),
})

const preparedSchema = z.strictObject({
  descriptor: compositeDescriptorSchema,
  fingerprint: z.string(),
  status: z.literal('prepared'),
})

export function createCompositePublication(
  local: LocalIdbStore,
  fingerprint: string,
) {
  const key = (id: string): IDBValidKey => ['composite-candidate', id]
  return {
    async loadPrepared(replacementId: string, commandFingerprint: string) {
      const raw = await local.readRecord(key(replacementId))
      if (raw === undefined) return null
      const parsed = preparedSchema.safeParse(raw)
      if (!parsed.success || parsed.data.fingerprint !== fingerprint)
        throw new Error(
          'Recovery required: prepared replacement metadata is incomplete or incompatible.',
        )
      const { descriptor } = parsed.data
      if (descriptor.commandFingerprint === undefined)
        throw new Error(
          'Recovery required: prepared replacement request identity is missing.',
        )
      if (
        descriptor.replacementId !== replacementId ||
        descriptor.commandFingerprint !== commandFingerprint
      )
        throw new Error(
          'Problem data command identity conflict. Refresh and try again.',
        )
      const head = await local.readHead()
      if (!head)
        throw new Error(
          'Recovery required: active replacement base is missing.',
        )
      assertCandidateBase(head, descriptor)
      const bytes = await local.readCore(descriptor.coreSnapshotId)
      if (!bytes || !isBinary(bytes) || bytes.byteLength === 0)
        throw new Error(
          'Recovery required: prepared replacement core is missing or invalid.',
        )
      return { descriptor, bytes: new Uint8Array(bytes) }
    },
    async prepare(
      candidate: CompositeCandidate,
      stageArchive: () => Promise<void>,
    ) {
      const descriptor = compositeDescriptorSchema.parse(candidate.descriptor)
      if (
        !candidate.handle.sqlite3.capi.sqlite3_get_autocommit(
          candidate.handle.rawDb,
        )
      )
        throw new Error(
          'Cannot prepare a candidate during an open transaction.',
        )
      const bytes = serializeDb(candidate.handle)
      const head = await local.readHead()
      if (!head) throw new Error('Cannot replace a missing active snapshot.')
      assertCandidateBase(head, descriptor)
      if (
        descriptor.coreSnapshotId === head.coreSnapshotId ||
        descriptor.archiveGeneration === head.archiveGeneration
      )
        throw new Error(
          'Replacement requires detached core and archive identities.',
        )
      // Serialized candidate only; a WASM handle never crosses the durable boundary.
      await local.transact(
        ['records', 'coreSnapshots'],
        'readwrite',
        (s, done, fail) => {
          const existing = s.records.get(key(descriptor.replacementId))
          existing.onsuccess = () => {
            try {
              if (existing.result !== undefined) {
                const prior = preparedSchema.parse(existing.result)
                if (
                  JSON.stringify(prior.descriptor) !==
                    JSON.stringify(descriptor) ||
                  prior.fingerprint !== fingerprint
                )
                  throw new Error(
                    'Replacement identity reused with another candidate.',
                  )
                const core = s.coreSnapshots.get(descriptor.coreSnapshotId)
                core.onsuccess = () => {
                  if (!isBinary(core.result) || !sameBytes(core.result, bytes))
                    fail(new Error('Prepared replacement core changed.'))
                  else done(undefined)
                }
              } else {
                s.coreSnapshots.add(bytes, descriptor.coreSnapshotId)
                s.records.add(
                  { descriptor, fingerprint, status: 'prepared' },
                  key(descriptor.replacementId),
                )
                done(undefined)
              }
            } catch (error) {
              fail(error)
            }
          }
        },
      )
      await stageArchive()
    },
    async publishCompositeCandidate(
      candidate: CompositeCandidate,
      input: ReplacementInput,
    ): Promise<LocalHead> {
      const descriptor = compositeDescriptorSchema.parse(candidate.descriptor)
      if (
        descriptor.commandFingerprint !== undefined &&
        input.commandFingerprint !== descriptor.commandFingerprint
      )
        throw new Error(
          'Prepared replacement request fingerprint does not match.',
        )
      if (input.replacementId !== descriptor.replacementId)
        throw new Error('Replacement identity does not match candidate.')
      // Retry after a lost commit/readback response reconciles identity before CAS.
      const current = await local.readHead()
      if (current?.replacementId === descriptor.replacementId)
        return verify(current)
      const published = await local.transact<
        LocalHead,
        'records' | 'coreSnapshots' | 'problemScopes'
      >(
        ['records', 'coreSnapshots', 'problemScopes'],
        'readwrite',
        (s, done, fail) => {
          const request = s.records.get('active')
          request.onsuccess = () => {
            try {
              const prior = localHeadSchema.parse(request.result)
              assertCandidateBase(prior, descriptor)
              if (
                (input.kind === 'restore' || input.kind === 'gist-pull') &&
                descriptor.datasetToken === prior.datasetToken
              )
                throw new Error(
                  'Full replacement requires a fresh Notes dataset scope.',
                )
              const prepared = s.records.get(key(descriptor.replacementId))
              prepared.onsuccess = () => {
                try {
                  const value = preparedSchema.parse(prepared.result)
                  if (
                    JSON.stringify(value.descriptor) !==
                      JSON.stringify(descriptor) ||
                    value.fingerprint !== fingerprint
                  )
                    throw new Error(
                      'Prepared replacement identity does not match.',
                    )
                  const staged = s.records.get([
                    'archive-generation',
                    descriptor.archiveGeneration,
                  ])
                  staged.onsuccess = () => {
                    try {
                      if (
                        z
                          .object({ status: z.literal('ready') })
                          .safeParse(staged.result).success === false
                      )
                        throw new Error(
                          'Replacement archive staging is incomplete.',
                        )
                      const continuation = s.records.get(
                        'replacement-continuation',
                      )
                      continuation.onsuccess = () => {
                        try {
                          if (continuation.result !== undefined)
                            throw new Error(
                              'An earlier replacement continuation is unresolved.',
                            )
                          const core = s.coreSnapshots.get(
                            descriptor.coreSnapshotId,
                          )
                          core.onsuccess = () => {
                            try {
                              if (!isBinary(core.result)) {
                                fail(
                                  new Error(
                                    'Prepared core snapshot is missing.',
                                  ),
                                )
                                return
                              }
                              const next = localHeadSchema.parse({
                                ...nextDataHead(prior, new Date()),
                                ...descriptor,
                                key: 'active',
                                formatVersion: 2,
                                fingerprint,
                              })
                              s.records.put(
                                {
                                  ...prior,
                                  key: 'replacement',
                                  replacementId: descriptor.replacementId,
                                },
                                'recovery',
                              )
                              s.coreSnapshots.put(
                                { coreSnapshotId: prior.coreSnapshotId },
                                coreRecordReferenceKey('recovery'),
                              )
                              if (input.commandFingerprint) {
                                const command =
                                  replacementCommandRecordSchema.parse({
                                    commandId: descriptor.replacementId,
                                    kind: input.kind,
                                    requestFingerprint:
                                      input.commandFingerprint,
                                    status: 'committed',
                                  })
                                s.records.add(
                                  command,
                                  replacementCommandKey(
                                    descriptor.replacementId,
                                  ),
                                )
                              }
                              s.records.put(next, 'active')
                              if (
                                descriptor.datasetToken !== prior.datasetToken
                              ) {
                                // Recovery/full restore never revives historical
                                // problem scopes. Preserve only verified descriptor-bound
                                // fresh scopes; rotate copied historical rows atomically.
                                const preparedScopes = new Map(
                                  [
                                    ...(descriptor.targetProblemScopes ?? []),
                                    ...(descriptor.initializedProblemScopes ??
                                      []),
                                  ].map((scope) => [
                                    scope.problemSlug,
                                    scope.problemToken,
                                  ]),
                                )
                                const verifiedPreparedScopes = new Set<string>()
                                const scopes = s.problemScopes.openCursor(
                                  IDBKeyRange.bound(
                                    [descriptor.archiveGeneration],
                                    [descriptor.archiveGeneration, []],
                                  ),
                                )
                                scopes.onsuccess = () => {
                                  try {
                                    const cursor = scopes.result
                                    if (!cursor) {
                                      if (
                                        (input.kind === 'reset' ||
                                          input.kind === 'restore' ||
                                          input.kind === 'gist-pull') &&
                                        descriptor.commandFingerprint &&
                                        verifiedPreparedScopes.size !==
                                          preparedScopes.size
                                      )
                                        throw new Error(
                                          'Prepared Clear scopes are incomplete.',
                                        )
                                      return
                                    }
                                    const key = cursor.key
                                    if (
                                      !Array.isArray(key) ||
                                      typeof key[1] !== 'string'
                                    )
                                      throw new Error(
                                        'Invalid staged problem scope key.',
                                      )
                                    const row = problemScopeSchema.parse(
                                      cursor.value,
                                    )
                                    const preparedToken = preparedScopes.get(
                                      key[1],
                                    )
                                    const isPreparedFreshScope =
                                      row.datasetToken ===
                                        descriptor.datasetToken &&
                                      preparedToken !== undefined &&
                                      row.problemToken === preparedToken
                                    if (isPreparedFreshScope)
                                      verifiedPreparedScopes.add(key[1])
                                    if (!isPreparedFreshScope) {
                                      if (
                                        (input.kind === 'reset' ||
                                          input.kind === 'restore' ||
                                          input.kind === 'gist-pull') &&
                                        descriptor.commandFingerprint &&
                                        preparedToken !== undefined
                                      )
                                        throw new Error(
                                          'Prepared Clear scope tokens do not match their descriptor.',
                                        )
                                      cursor.update({
                                        datasetToken: descriptor.datasetToken,
                                        problemToken: crypto.randomUUID(),
                                      })
                                    }
                                    cursor.continue()
                                  } catch (error) {
                                    fail(error)
                                  }
                                }
                              }
                              s.records.put(
                                {
                                  key: 'replacement-continuation',
                                  replacementId: descriptor.replacementId,
                                  kind: input.kind,
                                  committedRevision: next.revision,
                                  needsInvalidation: true,
                                  needsSyncMetadata: true,
                                  ...(input.syncMetadataPatch
                                    ? {
                                        syncMetadataPatch:
                                          input.syncMetadataPatch,
                                      }
                                    : {}),
                                } satisfies ReplacementContinuation,
                                'replacement-continuation',
                              )
                              done(next)
                            } catch (error) {
                              fail(error)
                            }
                          }
                        } catch (error) {
                          fail(error)
                        }
                      }
                    } catch (error) {
                      fail(error)
                    }
                  }
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
      return verify(published)
      async function verify(expected: LocalHead) {
        const actual = await local.readHead()
        const bytes = await local.readCore(descriptor.coreSnapshotId)
        const preparedBytes = serializeDb(candidate.handle)
        if (
          !actual ||
          actual.replacementId !== descriptor.replacementId ||
          actual.coreSnapshotId !== descriptor.coreSnapshotId ||
          actual.archiveGeneration !== descriptor.archiveGeneration ||
          actual.datasetToken !== descriptor.datasetToken ||
          actual.revision !== descriptor.baseRevision + 1 ||
          actual.fingerprint !== fingerprint ||
          !bytes ||
          !sameBytes(bytes, preparedBytes)
        )
          throw new Error(
            'Database recovery required: composite publication readback did not match.',
          )
        return expected
      }
    },
  }
}
function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((b, i) => b === right[i])
}
