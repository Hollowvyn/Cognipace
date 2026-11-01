import type { SecretStatus } from '@/platform/secrets/secret-contracts'

export type SyncDirection = 'no-change' | 'pull' | 'push'

export type SyncAction =
  | 'validate-token'
  | 'save-token'
  | 'delete-token'
  | 'create-gist'
  | 'connect-gist'
  | 'set-enabled'
  | 'pull-latest'
  | 'push-local'
  | 'check-remote-on-open'

export type SyncActionDirection = 'pull' | 'push' | null

export type SyncActionOutcome =
  | 'success'
  | 'no-change'
  | 'blocked'
  | 'confirmation-required'
  | 'error'

export type SyncActionReason =
  | 'not-configured'
  | 'local-dirty'
  | 'archive-review-required'
  | 'backup-verification-unavailable'
  | 'remote-changed'
  | 'remote-unchanged'
  | 'auth'
  | 'permission'
  | 'missing-gist'
  | 'invalid-remote'
  | 'unsupported-schema'
  | 'network'
  | 'rate-limit'
  | 'already-running'
  | 'unknown'

export type SyncErrorKind =
  | 'auth'
  | 'conflict'
  | 'gist-missing'
  | 'network'
  | 'rate-limit'
  | 'remote-invalid'
  | 'schema-unsupported'
  | 'unknown'

export interface SyncErrorSummary {
  kind: SyncErrorKind
  message: string
  occurredAt: string
  retryable: boolean
}

export interface SyncStatus {
  enabled: boolean
  configured: boolean
  tokenConfigured: boolean
  tokenStatus: SecretStatus
  gistId: string | null
  isSyncing: boolean
  lastSyncAt: string | null
  lastSyncDirection: SyncDirection | null
  lastPullAt: string | null
  lastPushAt: string | null
  needsPush: boolean
  lastBlockingReason: SyncActionReason | null
  lastError: SyncErrorSummary | null
  conflict: SyncConflictSummary | null
}

export interface SyncActionResult {
  action: SyncAction
  direction: SyncActionDirection
  outcome: SyncActionOutcome
  reason: SyncActionReason | null
  retryable: boolean
  message: string
  status: SyncStatus
  occurredAt: string
}

export interface SyncConflictSummary {
  detectedAt: string
  localDataUpdatedAt: string | null
  remoteUpdatedAt: string | null
  remoteVersion: string | null
}
