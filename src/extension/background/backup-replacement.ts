import type {
  BackupReplacementResult,
  BackupReplacementState,
  BackupReplacementPending,
} from '@/features/backup/api/backup-contracts'
import type { BackupReplacementWork } from '@/features/backup/server/backup-replacement-work'
import type {
  ReplacementContinuation,
  SnapshotIdbStore,
} from '@/platform/db/snapshot-idb'

const pendingMessage =
  'Local data replacement still needs saving. Open Settings > Data Management and choose Retry saving.'
type PendingWork = BackupReplacementPending &
  Pick<BackupReplacementWork, 'flush' | 'onDurable' | 'finishSyncMetadata'> & {
    durable: boolean
    invalidated: boolean
    replacementId?: string
    continuation: ReplacementContinuation | undefined
    syncMetadataPatch?: Record<string, unknown>
  }

export function createBackupReplacementCoordinator(
  options: {
    store?: SnapshotIdbStore
    resume?: (
      record: ReplacementContinuation,
    ) => Pick<BackupReplacementWork, 'onDurable' | 'finishSyncMetadata'>
  } = {},
) {
  let pending: PendingWork | null = null
  let running = false
  let loaded = false
  let loading: Promise<void> | null = null

  function ready(): Promise<void> {
    if (loaded) return Promise.resolve()
    if (!options.store) {
      loaded = true
      return Promise.resolve()
    }
    if (!loading)
      loading = options.store
        .readContinuation()
        .then(async (record) => {
          if (record) {
            const active = await options.store?.readActive()
            if (!active || active.revision !== record.committedRevision)
              throw new Error(
                'Replacement continuation does not match the active snapshot.',
              )
            if (!options.resume)
              throw new Error('Replacement continuation cannot be resumed.')
            pending = {
              kind: record.kind,
              summary: null,
              durable: true,
              invalidated: !record.needsInvalidation,
              replacementId: record.replacementId,
              continuation: record,
              flush: () =>
                Promise.reject(
                  new Error('Committed replacement cannot be published again.'),
                ),
              ...options.resume(record),
            }
          }
          loaded = true
        })
        .finally(() => {
          loading = null
        })
    return loading
  }

  function getState(): BackupReplacementState {
    if (!pending) return { status: 'idle' }
    return {
      status: pending.durable
        ? 'durable-sync-metadata-pending'
        : 'persistence-pending',
      kind: pending.kind,
      summary: pending.summary,
    }
  }

  function assertIdle() {
    if (pending || running) throw new Error(pendingMessage)
  }

  async function settle(): Promise<BackupReplacementResult> {
    if (!pending) return { status: 'no-pending' }
    const current = pending
    const { kind, summary } = current
    if (!current.durable) {
      try {
        await current.flush(
          current.replacementId
            ? {
                replacementId: current.replacementId,
                kind: current.kind,
                ...(current.syncMetadataPatch
                  ? { syncMetadataPatch: current.syncMetadataPatch }
                  : {}),
              }
            : undefined,
        )
      } catch {
        const committed =
          options.store && current.replacementId
            ? await options.store.readContinuation().catch(() => null)
            : null
        if (!committed || committed.replacementId !== current.replacementId) {
          return { status: 'persistence-pending', kind, summary }
        }
        current.continuation = committed
      }
      current.durable = true
      if (options.store)
        current.continuation =
          (await options.store.readContinuation()) ?? undefined
    }
    if (
      !current.invalidated &&
      (!current.continuation || current.continuation.needsInvalidation)
    ) {
      try {
        await current.onDurable()
        if (options.store && current.replacementId) {
          await options.store.markInvalidated(current.replacementId)
          current.continuation =
            (await options.store.readContinuation()) ?? undefined
        }
        current.invalidated = true
      } catch {
        if (options.store)
          return { status: 'durable', syncMetadataPending: true, kind, summary }
        current.invalidated = true
      }
    }
    try {
      if (!current.continuation || current.continuation.needsSyncMetadata) {
        await current.finishSyncMetadata()
        if (options.store && current.replacementId) {
          await options.store.markSyncMetadataComplete(current.replacementId)
          current.continuation =
            (await options.store.readContinuation()) ?? undefined
        }
      }
    } catch {
      return { status: 'durable', syncMetadataPending: true, kind, summary }
    }
    if (options.store && current.replacementId) {
      try {
        await options.store.completeContinuation(current.replacementId)
      } catch {
        const remaining = await options.store
          .readContinuation()
          .catch(() => current.continuation)
        if (remaining)
          return { status: 'durable', syncMetadataPending: true, kind, summary }
      }
    }
    pending = null
    return { status: 'durable', syncMetadataPending: false, kind, summary }
  }

  async function run(
    work: BackupReplacementWork,
  ): Promise<BackupReplacementResult> {
    if (options.store) await ready()
    assertIdle()
    running = true
    try {
      work.beforeCommit?.()
      let summary: BackupReplacementPending['summary']
      try {
        summary = await work.commit()
      } catch (error) {
        work.abortCommit?.()
        throw error
      }
      // Keep publication continuations only. Commit and its full input are released.
      const { kind, flush, onDurable, finishSyncMetadata } = work
      pending = {
        kind,
        summary,
        flush,
        onDurable,
        finishSyncMetadata,
        durable: false,
        invalidated: false,
        continuation: undefined,
        ...(options.store ? { replacementId: crypto.randomUUID() } : {}),
        ...(work.syncMetadataPatch
          ? { syncMetadataPatch: work.syncMetadataPatch }
          : {}),
      }
      return await settle()
    } finally {
      running = false
    }
  }

  async function retry(): Promise<BackupReplacementResult> {
    await ready()
    if (running) throw new Error(pendingMessage)
    running = true
    try {
      return await settle()
    } finally {
      running = false
    }
  }

  return { ready, getState, assertIdle, run, retry }
}
