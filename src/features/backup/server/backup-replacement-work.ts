import type {
  BackupReplacementKind,
  BackupSummary,
} from '../api/backup-contracts'

export type BackupReplacementWork = {
  kind: BackupReplacementKind
  commit: () => Promise<BackupSummary | null>
  flush: () => Promise<unknown>
  onDurable: () => Promise<unknown>
  finishSyncMetadata: () => Promise<unknown>
}
