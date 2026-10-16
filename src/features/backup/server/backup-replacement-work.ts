import type {
  BackupReplacementKind,
  BackupSummary,
} from '../api/backup-contracts'
import type { ReplacementInput } from '@/platform/db/snapshot-idb'

export type BackupReplacementWork = {
  kind: BackupReplacementKind
  commit: () => Promise<BackupSummary | null>
  flush: (input?: ReplacementInput) => Promise<unknown>
  onDurable: () => Promise<unknown>
  finishSyncMetadata: () => Promise<unknown>
  syncMetadataPatch?: Record<string, unknown>
  beforeCommit?: () => void
  abortCommit?: () => void
}
