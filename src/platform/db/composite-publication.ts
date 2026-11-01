import { assertReadyArchive } from './local-root-validation'
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
  commandKind: z
    .enum(['restore', 'gist-pull', 'reset', 'problem-reset', 'problem-delete'])
    .optional(),
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
// Cleanup may discard completed preparation only with the exact accepted fence.
export function isCommittedCompositeCandidate(
  descriptor: CompositeDescriptor,
  rawFence: unknown,
  head: LocalHead,
) {
  if (rawFence !== undefined) {
    const fence = replacementCommandRecordSchema.parse(rawFence)
    const kind =
      descriptor.commandKind ??
      z
        .tuple([
          z.enum([
            'restore',
            'gist-pull',
            'reset',
            'problem-reset',
            'problem-delete',
          ]),
          z.unknown(),
        ])
        .parse(JSON.parse(descriptor.commandFingerprint ?? 'null'))[0]
    if (
      fence.commandId !== descriptor.replacementId ||
      fence.requestFingerprint !== descriptor.commandFingerprint ||
      fence.kind !== kind
    )
      throw new Error(
        'Recovery required: completed replacement fence conflicts with prepared roots.',
      )
    return true
  }
  if (descriptor.replacementId !== head.replacementId) return false
  if (
    descriptor.coreSnapshotId !== head.coreSnapshotId ||
    descriptor.archiveGeneration !== head.archiveGeneration ||
    descriptor.datasetToken !== head.datasetToken
  )
    throw new Error(
      'Recovery required: published replacement identity conflicts with prepared roots.',
    )
  return true
}
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

export const pendingCompositeKey = 'replacement-prepublication'
export const replacementSourceKey = (id: string): IDBValidKey => [
  'replacement-source',
  id,
]
export const compositeResumeSchema = z.strictObject({
  kind: z.enum([
    'restore',
    'gist-pull',
    'reset',
    'problem-reset',
    'problem-delete',
  ]),
  summary: z.unknown(),
  recipe: z.unknown(),
  syncMetadataPatch: z.record(z.string(), z.unknown()).optional(),
})
export type CompositeResume = z.infer<typeof compositeResumeSchema>
const pendingCompositeSchema = z.strictObject({
  replacementId: z.string().min(1),
  digest: z.string().min(1),
})
export async function compositeDigest(value: unknown) {
  const bytes = isBinary(value)
    ? value
    : new TextEncoder().encode(JSON.stringify(value))
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)),
    ),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('')
}
export const preparedCompositeCandidateSchema = z
  .strictObject({
    descriptor: compositeDescriptorSchema,
    fingerprint: z.string(),
    status: z.literal('prepared'),
    coreDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    resume: compositeResumeSchema.optional(),
    resumeDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    sourceReference: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      value.sourceReference === undefined ||
      value.sourceReference === value.descriptor.replacementId,
    'Accepted replacement source reference must match its command.',
  )
export type PendingCompositePreparation = z.infer<
  typeof preparedCompositeCandidateSchema
> & { resume: CompositeResume }

/** Metadata/key discovery only; no SQLite initialization or owner mutation. */
export async function readPendingCompositePreparation(
  local: LocalIdbStore,
): Promise<PendingCompositePreparation | null> {
  try {
    return await readPendingPreparation(local)
  } catch (cause) {
    throw new Error(
      'Recovery required: prepared replacement admission cannot be verified.',
      { cause },
    )
  }
}
async function readPendingPreparation(
  local: LocalIdbStore,
): Promise<PendingCompositePreparation | null> {
  const head = await local.readHead()
  const rawPointer = await local.readRecord(pendingCompositeKey)
  const candidates = await local.transact<
    Array<{ key: IDBValidKey; value: unknown }>,
    'records'
  >(['records'], 'readonly', (s, done, fail) => {
    const rows: Array<{ key: IDBValidKey; value: unknown }> = []
    const request = s.records.openKeyCursor(
      IDBKeyRange.lowerBound(['composite-candidate']),
    )
    request.onsuccess = () => {
      const cursor = request.result
      if (
        !cursor ||
        !Array.isArray(cursor.key) ||
        cursor.key[0] !== 'composite-candidate'
      )
        return done(rows)
      // Nested keys also belong to this namespace. Only hydrate matched compact
      // metadata; the first following namespace may contain a full source body.
      try {
        const value = s.records.get(cursor.key)
        value.onsuccess = () => {
          rows.push({ key: cursor.key, value: value.result as unknown })
          cursor.continue()
        }
      } catch (error) {
        fail(error)
      }
    }
  })
  let unresolved: z.infer<typeof preparedCompositeCandidateSchema> | undefined
  for (const row of candidates) {
    const value = preparedCompositeCandidateSchema.parse(row.value)
    const descriptor = value.descriptor
    if (
      !head ||
      !Array.isArray(row.key) ||
      row.key.length !== 2 ||
      row.key[1] !== descriptor.replacementId
    )
      throw new Error('Recovery required: invalid prepared replacement root.')
    if (
      isCommittedCompositeCandidate(
        descriptor,
        await local.readRecord(replacementCommandKey(descriptor.replacementId)),
        head,
      )
    )
      continue
    if (unresolved)
      throw new Error(
        'Recovery required: multiple unresolved prepared replacements.',
      )
    unresolved = value
  }
  if (!unresolved && rawPointer === undefined) return null
  const pointer = pendingCompositeSchema.safeParse(rawPointer)
  if (
    !head ||
    !unresolved ||
    !pointer.success ||
    !unresolved.resume ||
    !unresolved.coreDigest ||
    pointer.data.replacementId !== unresolved.descriptor.replacementId ||
    pointer.data.digest !== unresolved.resumeDigest ||
    unresolved.fingerprint !== head.fingerprint
  )
    throw new Error(
      'Recovery required: prepared replacement admission is missing or invalid.',
    )
  assertCandidateBase(head, unresolved.descriptor)
  const digest = await compositeDigest({
    descriptor: unresolved.descriptor,
    resume: unresolved.resume,
    coreDigest: unresolved.coreDigest,
    sourceReference: unresolved.sourceReference,
  })
  const coreExists = await local.transact<boolean, 'coreSnapshots'>(
    ['coreSnapshots'],
    'readonly',
    (s, done) => {
      const request = s.coreSnapshots.getKey(
        unresolved.descriptor.coreSnapshotId,
      )
      request.onsuccess = () => done(request.result !== undefined)
    },
  )
  if (digest !== pointer.data.digest || !coreExists)
    throw new Error(
      'Recovery required: prepared replacement metadata changed or core is missing.',
    )
  if (unresolved.sourceReference) {
    const exists = await local.transact<boolean, 'records'>(
      ['records'],
      'readonly',
      (s, done) => {
        const request = s.records.getKey(
          replacementSourceKey(unresolved.sourceReference!),
        )
        request.onsuccess = () => done(request.result !== undefined)
      },
    )
    if (!exists)
      throw new Error(
        'Recovery required: accepted replacement source is missing.',
      )
  }
  return { ...unresolved, resume: unresolved.resume }
}

export function createCompositePublication(
  local: LocalIdbStore,
  fingerprint: string,
) {
  const key = (id: string): IDBValidKey => ['composite-candidate', id]
  return {
    async loadPrepared(replacementId: string, commandFingerprint: string) {
      const raw = await local.readRecord(key(replacementId))
      if (raw === undefined) return null
      const parsed = preparedCompositeCandidateSchema.safeParse(raw)
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
      if (
        parsed.data.coreDigest &&
        (await compositeDigest(new Uint8Array(bytes))) !==
          parsed.data.coreDigest
      )
        throw new Error('Recovery required: prepared replacement core changed.')
      return { descriptor, bytes: new Uint8Array(bytes) }
    },
    async prepare(
      candidate: CompositeCandidate,
      stageArchive: () => Promise<void>,
      admission?: { resume: CompositeResume; source?: unknown },
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
      const resume = admission && compositeResumeSchema.parse(admission.resume)
      const coreDigest = admission ? await compositeDigest(bytes) : undefined
      const sourceReference =
        admission?.source === undefined ? undefined : descriptor.replacementId
      const resumeDigest = resume
        ? await compositeDigest({
            descriptor,
            resume,
            coreDigest,
            sourceReference,
          })
        : undefined
      // Serialized candidate only; a WASM handle never crosses the durable boundary.
      await local.transact(
        ['records', 'coreSnapshots'],
        'readwrite',
        (s, done, fail) => {
          const guard = s.records.get(pendingCompositeKey)
          guard.onsuccess = () => {
            if (
              guard.result !== undefined &&
              (!resumeDigest ||
                JSON.stringify(guard.result) !==
                  JSON.stringify({
                    replacementId: descriptor.replacementId,
                    digest: resumeDigest,
                  }))
            ) {
              fail(
                new Error(
                  'Recovery required: another prepublication admission is unresolved.',
                ),
              )
              return
            }
            const existing = s.records.get(key(descriptor.replacementId))
            existing.onsuccess = () => {
              try {
                if (existing.result !== undefined) {
                  const prior = preparedCompositeCandidateSchema.parse(
                    existing.result,
                  )
                  if (
                    JSON.stringify(prior.descriptor) !==
                      JSON.stringify(descriptor) ||
                    prior.fingerprint !== fingerprint ||
                    (resumeDigest !== undefined &&
                      prior.resumeDigest !== resumeDigest)
                  )
                    throw new Error(
                      'Replacement identity reused with another candidate.',
                    )
                  const core = s.coreSnapshots.get(descriptor.coreSnapshotId)
                  core.onsuccess = () => {
                    if (
                      !isBinary(core.result) ||
                      !sameBytes(core.result, bytes)
                    )
                      fail(new Error('Prepared replacement core changed.'))
                    else done(undefined)
                  }
                } else {
                  s.coreSnapshots.add(bytes, descriptor.coreSnapshotId)
                  s.records.add(
                    {
                      descriptor,
                      fingerprint,
                      status: 'prepared',
                      ...(resume
                        ? {
                            resume,
                            resumeDigest,
                            coreDigest,
                            ...(sourceReference ? { sourceReference } : {}),
                          }
                        : {}),
                    },
                    key(descriptor.replacementId),
                  )
                  if (resumeDigest) {
                    if (sourceReference)
                      s.records.add(
                        admission!.source,
                        replacementSourceKey(sourceReference),
                      )
                    s.records.add(
                      {
                        replacementId: descriptor.replacementId,
                        digest: resumeDigest,
                      },
                      pendingCompositeKey,
                    )
                  }
                  done(undefined)
                }
              } catch (error) {
                fail(error)
              }
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
      if (descriptor.commandKind && input.kind !== descriptor.commandKind)
        throw new Error('Prepared replacement command kind does not match.')
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
                  const value = preparedCompositeCandidateSchema.parse(
                    prepared.result,
                  )
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
                      assertReadyArchive(staged.result)
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
                                {
                                  kind: 'paired',
                                  coreSnapshotId: prior.coreSnapshotId,
                                  archiveGeneration: prior.archiveGeneration,
                                  datasetToken: prior.datasetToken,
                                },
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
                              s.records.delete(pendingCompositeKey)
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
