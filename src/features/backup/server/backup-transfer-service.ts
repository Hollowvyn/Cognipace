import {
  replacementCommandKey,
  replacementCommandRecordSchema,
} from '@/platform/db/snapshot-idb'
import {
  backupSummarySchema,
  backupReplacementResultSchema,
} from '../api/backup-contracts'
export { splitUtf8Text, transferDigest } from '../api/backup-transfer-contracts'
import { z } from 'zod'
import type { LocalIdbStore } from '@/platform/db/local-store-types'
import {
  backupTransferChunkBytes,
  transferSessionSchema,
  type TransferHandle,
  splitUtf8Text,
  transferDigest,
} from '../api/backup-transfer-contracts'

// These are technical roots only, never part of learning-data export or TTL.
export const transferSessionKey = (id: string): IDBValidKey[] => [
  'backup-transfer-session',
  id,
]
export const transferChunkKey = (
  id: string,
  sequence: number,
): IDBValidKey[] => ['backup-transfer-chunk', id, sequence]
export const transferBudgetKey = ['backup-transfer-budget']
export const transferCancelKey = (id: string): IDBValidKey[] => [
  'backup-transfer-cancel',
  id,
]
export const cancellationReceiptSchema = z.strictObject({
  documentOwner: z.string(),
  ownerToken: z.string(),
})
export const transferBeginKey = (
  owner: string,
  requestId: string,
): IDBValidKey[] => ['backup-transfer-begin', owner, requestId]
const budgetSchema = z.strictObject({
  bytes: z.number().int().min(0),
  sessions: z.number().int().min(0),
})
export const transferRecordSchema = transferSessionSchema.extend({
  documentOwner: z.string(),
  spooledBytes: z.number().int().min(0),
  completionResult: z.unknown().optional(),
  beginRequestId: z.string().optional(),
  pinnedHeader: z.unknown().optional(),
  preview: z.unknown().optional(),
  confirmationToken: z.string().optional(),
})
type Record = z.infer<typeof transferRecordSchema>
const encoder = new TextEncoder()
// Emit JSON syntax and bounded string slices incrementally. In particular, a
// large immutable body is never JSON.stringify'd into a second complete body.
function* jsonParts(value: unknown): Generator<string> {
  if (typeof value === 'string') {
    yield '"'
    for (let i = 0; i < value.length; ) {
      let end = Math.min(value.length, i + 16384)
      if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1]!)) end--
      yield JSON.stringify(value.slice(i, end)).slice(1, -1)
      i = end
    }
    yield '"'
    return
  }
  if (Array.isArray(value)) {
    yield '['
    for (let i = 0; i < value.length; i++) {
      if (i) yield ','
      yield* jsonParts(value[i] ?? null)
    }
    yield ']'
    return
  }
  if (typeof value === 'object' && value !== null) {
    yield '{'
    let first = true
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) continue
      if (!first) yield ','
      first = false
      yield* jsonParts(key)
      yield ':'
      yield* jsonParts(child)
    }
    yield '}'
    return
  }
  yield JSON.stringify(value) ?? 'null'
}
async function emitJson(
  value: unknown,
  write: (text: string) => Promise<void>,
) {
  let buffer = ''
  for (const part of jsonParts(value)) {
    // Fragments are small; at most a single chunk plus one fragment is buffered.
    buffer += part
    if (encoder.encode(buffer).length >= backupTransferChunkBytes) {
      let last = ''
      for (const chunk of splitUtf8Text(buffer)) {
        if (encoder.encode(chunk).length >= backupTransferChunkBytes - 3)
          await write(chunk)
        else last = chunk
      }
      buffer = last
    }
  }
  if (buffer) await write(buffer)
}

export function createBackupTransferService<
  Preview extends { confirmationToken: string },
  Result,
>(dependencies: {
  local: LocalIdbStore
  budgetBytes?: number
  currentRevision: () => Promise<number>
  exportSnapshot: (
    consume: (backup: unknown, revision: number) => Promise<void>,
  ) => Promise<void>
  preview: (input: unknown, sessionId: string) => Promise<Preview>
  restore: (input: unknown, token: string, sessionId: string) => Promise<Result>
}) {
  const { local } = dependencies
  const budgetBytes = dependencies.budgetBytes ?? 256 * 1024 * 1024
  async function owned(owner: string, handle: TransferHandle) {
    const record = transferRecordSchema.parse(
      await local.readRecord(transferSessionKey(handle.sessionId)),
    )
    assertOwner(record, owner, handle)
    return record
  }
  function assertOwner(record: Record, owner: string, handle: TransferHandle) {
    if (
      record.documentOwner !== owner ||
      record.ownerToken !== handle.ownerToken
    )
      throw new Error(
        'Transfer owner capability does not match this dashboard document.',
      )
  }
  function update<T>(
    owner: string,
    handle: TransferHandle,
    operation: (
      record: Record,
      store: IDBObjectStore,
      budget: { bytes: number; sessions: number },
    ) => {
      record?: Record
      budget?: { bytes: number; sessions: number }
      result: T
    },
  ) {
    return local.transact<T, 'records'>(
      ['records'],
      'readwrite',
      (stores, done, fail) => {
        const request = stores.records.get(transferSessionKey(handle.sessionId))
        request.onsuccess = () => {
          try {
            const record = transferRecordSchema.parse(request.result)
            assertOwner(record, owner, handle)
            const budgetRequest = stores.records.get(transferBudgetKey)
            budgetRequest.onsuccess = () => {
              try {
                const budget = budgetSchema.parse(
                  budgetRequest.result ?? { bytes: 0, sessions: 0 },
                )
                const next = operation(record, stores.records, budget)
                if (next.record)
                  stores.records.put(
                    next.record,
                    transferSessionKey(record.sessionId),
                  )
                if (next.budget !== undefined)
                  stores.records.put(next.budget, transferBudgetKey)
                done(next.result)
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
  }
  async function append(
    owner: string,
    handle: TransferHandle,
    sequence: number,
    text: string,
  ) {
    const bytes = encoder.encode(text).length
    if (
      !Number.isSafeInteger(sequence) ||
      sequence < 0 ||
      !bytes ||
      bytes > backupTransferChunkBytes
    )
      throw new Error('Invalid transfer chunk.')
    const before = await owned(owner, handle)
    if (sequence < before.nextSequence) {
      if (
        (await local.readRecord(
          transferChunkKey(handle.sessionId, sequence),
        )) !== text
      )
        throw new Error('Conflicting transfer retry.')
      return before
    }
    return update(owner, handle, (record, store, budget) => {
      if (record.status !== 'receiving' || sequence !== record.nextSequence)
        throw new Error('Transfer sequence is out of order.')
      if (budget.bytes + bytes > budgetBytes)
        throw new Error(
          'Backup transfer space budget is full. Cancel a transfer before trying again.',
        )
      store.put(text, transferChunkKey(record.sessionId, sequence))
      const next = {
        ...record,
        nextSequence: sequence + 1,
        bytes: record.bytes + bytes,
        spooledBytes: record.spooledBytes + bytes,
      }
      return {
        record: next,
        budget: { ...budget, bytes: budget.bytes + bytes },
        result: next,
      }
    })
  }
  async function cancel(owner: string, handle: TransferHandle) {
    const cancelled = await local.readRecord(
      transferCancelKey(handle.sessionId),
    )
    if (cancelled !== undefined) {
      const receipt = cancellationReceiptSchema.parse(cancelled)
      if (
        receipt.documentOwner !== owner ||
        receipt.ownerToken !== handle.ownerToken
      )
        throw new Error(
          'Transfer owner capability does not match this dashboard document.',
        )
      return null
    }
    return update(owner, handle, (record, store, budget) => {
      for (let i = 0; i < record.nextSequence; i++)
        store.delete(transferChunkKey(record.sessionId, i))
      store.put(
        { documentOwner: record.documentOwner, ownerToken: record.ownerToken },
        transferCancelKey(record.sessionId),
      )
      store.delete(transferSessionKey(record.sessionId))
      if (record.beginRequestId)
        store.delete(transferBeginKey(owner, record.beginRequestId))
      return {
        budget: {
          bytes: budget.bytes - record.spooledBytes,
          sessions: budget.sessions - 1,
        },
        result: null,
      }
    })
  }
  async function spool(owner: string, record: Record) {
    await dependencies.exportSnapshot(async (backup, revision) => {
      if (
        record.sourceRevision !== null &&
        record.sourceRevision !== revision
      ) {
        await cancel(owner, record)
        throw new Error('Source revision changed. Request a fresh export.')
      }
      const object = z.record(z.string(), z.unknown()).parse(backup)
      const header = record.pinnedHeader ?? {
        ...('exportedAt' in object ? { exportedAt: object.exportedAt } : {}),
        ...('source' in object ? { source: object.source } : {}),
      }
      await update(owner, record, (current) => ({
        record: { ...current, sourceRevision: revision, pinnedHeader: header },
        result: null,
      }))
      const pinned = {
        ...object,
        ...z.record(z.string(), z.unknown()).parse(header),
      }
      let sequence = 0
      await emitJson(pinned, async (text) => {
        await append(owner, record, sequence++, text)
      })
      const digest = await transferDigest(
        await readText(record.sessionId, sequence),
      )
      await update(owner, record, (current) => ({
        record: { ...current, status: 'ready', digest },
        result: null,
      }))
    })
    return owned(owner, record)
  }
  async function begin(
    owner: string,
    input: {
      direction: 'import' | 'export'
      requestId?: string
      resume?: TransferHandle | undefined
    },
  ): Promise<Record> {
    if (input.resume) {
      const record = await owned(owner, input.resume)
      if (record.direction !== input.direction)
        throw new Error('Transfer direction does not match.')
      if (
        record.direction === 'export' &&
        record.status === 'receiving' &&
        record.sourceRevision !== null &&
        record.sourceRevision !== (await dependencies.currentRevision())
      ) {
        await cancel(owner, input.resume)
        throw new Error('Source revision changed. Request a fresh export.')
      }
      const rotated = await update(owner, input.resume, (current) => {
        const next = { ...current, ownerToken: crypto.randomUUID() }
        return { record: next, result: next }
      })
      if (rotated.direction === 'export' && rotated.status === 'receiving')
        return spool(owner, rotated)
      return rotated
    }
    if (input.requestId) {
      const receipt = await local.readRecord(
        transferBeginKey(owner, input.requestId),
      )
      if (typeof receipt === 'string') {
        const record = transferRecordSchema.parse(
          await local.readRecord(transferSessionKey(receipt)),
        )
        if (
          record.documentOwner !== owner ||
          record.direction !== input.direction
        )
          throw new Error('Transfer begin identity conflicts.')
        // Lost begin responses return the durable receipt first; an explicit
        // resume then regenerates a pinned export under the full gate.
        return record
      }
    }
    const record: Record = {
      sessionId: crypto.randomUUID(),
      ownerToken: crypto.randomUUID(),
      documentOwner: owner,
      direction: input.direction,
      status: 'receiving',
      nextSequence: 0,
      bytes: 0,
      spooledBytes: 0,
      digest: null,
      sourceRevision: null,
      ...(input.requestId ? { beginRequestId: input.requestId } : {}),
    }
    const selected = await local.transact<Record, 'records'>(
      ['records'],
      'readwrite',
      (stores, done, fail) => {
        const request = stores.records.get(transferBudgetKey)
        request.onsuccess = () => {
          try {
            const budget = budgetSchema.parse(
              request.result ?? { bytes: 0, sessions: 0 },
            )
            const allocate = () => {
              if (budget.sessions >= 16)
                throw new Error(
                  'Backup transfer space is full. Cancel a transfer before trying again.',
                )
              stores.records.put(
                { ...budget, sessions: budget.sessions + 1 },
                transferBudgetKey,
              )
              stores.records.put(record, transferSessionKey(record.sessionId))
              if (input.requestId)
                stores.records.put(
                  record.sessionId,
                  transferBeginKey(owner, input.requestId),
                )
              done(record)
            }
            if (!input.requestId) allocate()
            else {
              const prior = stores.records.get(
                transferBeginKey(owner, input.requestId),
              )
              prior.onsuccess = () => {
                try {
                  if (prior.result === undefined) allocate()
                  else {
                    const session = stores.records.get(
                      transferSessionKey(z.string().parse(prior.result)),
                    )
                    session.onsuccess = () => {
                      try {
                        const existing = transferRecordSchema.parse(
                          session.result,
                        )
                        if (
                          existing.documentOwner !== owner ||
                          existing.direction !== input.direction
                        )
                          throw new Error('Transfer begin identity conflicts.')
                        done(existing)
                      } catch (error) {
                        fail(error)
                      }
                    }
                  }
                } catch (error) {
                  fail(error)
                }
              }
            }
          } catch (error) {
            fail(error)
          }
        }
      },
    )
    if (selected.direction === 'export' && selected.status === 'receiving')
      return spool(owner, selected)
    return selected
  }
  async function read(owner: string, handle: TransferHandle, sequence: number) {
    const record = await owned(owner, handle)
    if (
      record.direction !== 'export' ||
      record.status !== 'ready' ||
      sequence < 0 ||
      sequence >= record.nextSequence
    )
      throw new Error('Export is incomplete or sequence unavailable.')
    const text = z
      .string()
      .parse(
        await local.readRecord(transferChunkKey(record.sessionId, sequence)),
      )
    return { sequence, text }
  }
  async function readText(id: string, chunks: number) {
    let text = ''
    for (let i = 0; i < chunks; i++)
      text += z.string().parse(await local.readRecord(transferChunkKey(id, i)))
    return text
  }
  async function finish(
    owner: string,
    handle: TransferHandle,
    input: {
      chunks: number
      digest: string
      confirmationToken?: string | undefined
    },
  ) {
    const record = await owned(owner, handle)
    if (
      record.direction !== 'import' ||
      input.chunks !== record.nextSequence ||
      !input.chunks
    )
      throw new Error('Transfer is incomplete.')
    if (record.status === 'complete') {
      if (
        input.digest !== record.digest ||
        input.confirmationToken !== record.confirmationToken
      )
        throw new Error(
          'Transfer confirmation does not match its completed receipt.',
        )
      return record.completionResult as Result
    }
    const text = await readText(record.sessionId, record.nextSequence)
    const digest = await transferDigest(text)
    if (digest !== input.digest || (record.digest && digest !== record.digest))
      throw new Error('Transfer final digest does not match.')
    // Full parsing/preflight remains a whole-file allocation; Phase 4 measures
    // this separately. Finishing never applies without a confirmed preview.
    const backup: unknown = JSON.parse(text)
    if (input.confirmationToken) {
      if (record.confirmationToken !== input.confirmationToken)
        throw new Error('Transfer confirmation does not match its preview.')
      const result = await dependencies.restore(
        backup,
        input.confirmationToken,
        record.sessionId,
      )
      if (
        typeof result === 'object' &&
        result !== null &&
        'status' in result &&
        result.status === 'durable' &&
        !(
          'syncMetadataPending' in result && result.syncMetadataPending === true
        )
      ) {
        await update(owner, handle, (current) => ({
          record: { ...current, status: 'complete', completionResult: result },
          result: null,
        }))
      }
      return result
    }
    if (record.confirmationToken) return record.preview as Preview
    const preview = await dependencies.preview(backup, record.sessionId)
    const sourceRevision = await dependencies.currentRevision()
    await update(owner, handle, (current) => ({
      record: {
        ...current,
        status: 'ready',
        sourceRevision,
        digest,
        preview,
        confirmationToken: preview.confirmationToken,
      },
      result: null,
    }))
    return preview
  }
  return { begin, append, read, finish, cancel, assertOwned: owned }
}

/** Caller holds the mutation queue and the replacement coordinator is idle.
 * Reconcile durable command fences after generic Retry saving (including a
 * lost reconciliation response). Never read archive body chunks or replay SQL. */
export async function reconcileCompletedBackupTransfers(local: LocalIdbStore) {
  const value = await local.readRecord(transferBudgetKey)
  if (value === undefined || budgetSchema.parse(value).sessions === 0) return 0
  return local.transact<number, 'records'>(
    ['records'],
    'readwrite',
    (stores, done, fail) => {
      const continuation = stores.records.get('replacement-continuation')
      continuation.onsuccess = () => {
        if (continuation.result !== undefined) {
          done(0)
          return
        }
        let completed = 0
        const request = stores.records.openKeyCursor()
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) {
            done(completed)
            return
          }
          const key = cursor.key
          if (!Array.isArray(key) || key[0] !== 'backup-transfer-session') {
            cursor.continue()
            return
          }
          const selected = stores.records.get(key)
          selected.onsuccess = () => {
            try {
              const record = transferRecordSchema.parse(selected.result)
              if (
                record.direction !== 'import' ||
                record.status !== 'ready' ||
                !record.confirmationToken
              ) {
                cursor.continue()
                return
              }
              const commandRequest = stores.records.get(
                replacementCommandKey(record.confirmationToken),
              )
              commandRequest.onsuccess = () => {
                try {
                  if (commandRequest.result === undefined) {
                    cursor.continue()
                    return
                  }
                  const command = replacementCommandRecordSchema.parse(
                    commandRequest.result,
                  )
                  const previewRequest = stores.records.get([
                    'backup-preview',
                    record.confirmationToken!,
                  ])
                  previewRequest.onsuccess = () => {
                    try {
                      const preview = z
                        .object({
                          inputDigest: z.string(),
                          kind: z.literal('restore'),
                          sourceIdentity: z.string(),
                        })
                        .parse(previewRequest.result)
                      if (
                        command.kind !== 'restore' ||
                        command.commandId !== record.confirmationToken ||
                        command.requestFingerprint !==
                          JSON.stringify(['restore', preview.inputDigest]) ||
                        preview.sourceIdentity !==
                          JSON.stringify([
                            'dashboard-transfer',
                            record.documentOwner,
                            record.sessionId,
                          ])
                      )
                        throw new Error(
                          'Transfer recovery identity does not match its accepted restore.',
                        )
                      const completionResult =
                        backupReplacementResultSchema.parse({
                          status: 'durable',
                          kind: 'restore',
                          syncMetadataPending: false,
                          summary: backupSummarySchema
                            .strip()
                            .parse(record.preview),
                        })
                      stores.records.put(
                        { ...record, status: 'complete', completionResult },
                        key,
                      )
                      completed++
                      cursor.continue()
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
        }
      }
    },
  )
}
