import type {
  BackupReplacementResult,
  BackupReplacementState,
  BackupReplacementPending,
} from '@/features/backup/api/backup-contracts'
import type { BackupReplacementWork } from '@/features/backup/server/backup-replacement-work'

const pendingMessage =
  'Local data replacement still needs saving. Open Settings > Data Management and choose Retry saving.'
type PendingWork = BackupReplacementPending &
  Pick<BackupReplacementWork, 'flush' | 'onDurable' | 'finishSyncMetadata'> & {
    durable: boolean
  }

export function createBackupReplacementCoordinator() {
  let pending: PendingWork | null = null
  let running = false

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
        await current.flush()
      } catch {
        return { status: 'persistence-pending', kind, summary }
      }
      current.durable = true
      try {
        await current.onDurable()
      } catch {
        // Snapshot publication succeeded. Transport failure cannot repeat it.
      }
    }
    try {
      await current.finishSyncMetadata()
    } catch {
      return { status: 'durable', syncMetadataPending: true, kind, summary }
    }
    pending = null
    return { status: 'durable', syncMetadataPending: false, kind, summary }
  }

  async function run(
    work: BackupReplacementWork,
  ): Promise<BackupReplacementResult> {
    assertIdle()
    running = true
    try {
      const summary = await work.commit()
      // Keep publication continuations only. Commit and its full input are released.
      const { kind, flush, onDurable, finishSyncMetadata } = work
      pending = {
        kind,
        summary,
        flush,
        onDurable,
        finishSyncMetadata,
        durable: false,
      }
      return await settle()
    } finally {
      running = false
    }
  }

  async function retry(): Promise<BackupReplacementResult> {
    if (running) throw new Error(pendingMessage)
    running = true
    try {
      return await settle()
    } finally {
      running = false
    }
  }

  return { getState, assertIdle, run, retry }
}
