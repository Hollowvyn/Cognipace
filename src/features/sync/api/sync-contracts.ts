import { backupRestorePreviewSchema } from '@/features/backup/api/backup-contracts'
import { z } from 'zod'

import { secretStatusSchema } from '@/platform/secrets'

export const syncSurfaceSchema = z.enum([
  'popup',
  'dashboard',
  'content-script',
])

export const syncRequestSchema = z.strictObject({
  surface: syncSurfaceSchema,
})

export const syncGithubTokenRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
  token: z.string().trim().min(1),
})

export const syncGithubGistRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
  gistId: z.string().trim().min(1),
})

export const syncSetEnabledRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
  enabled: z.boolean(),
})

export const syncPullLatestRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
  confirmLocalOverwrite: z.boolean().default(false),
  confirmationToken: z.string().min(1).optional(),
})

export const syncPushLocalRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
  confirmRemoteOverwrite: z.boolean().default(false),
})

export const syncActionSchema = z.enum([
  'validate-token',
  'save-token',
  'delete-token',
  'create-gist',
  'connect-gist',
  'set-enabled',
  'pull-latest',
  'push-local',
  'check-remote-on-open',
])

export const syncActionDirectionSchema = z.enum(['pull', 'push']).nullable()

export const syncActionOutcomeSchema = z.enum([
  'success',
  'no-change',
  'blocked',
  'confirmation-required',
  'error',
])

export const syncActionReasonSchema = z.enum([
  'not-configured',
  'local-dirty',
  'archive-review-required',
  'backup-verification-unavailable',
  'remote-changed',
  'remote-unchanged',
  'auth',
  'permission',
  'missing-gist',
  'invalid-remote',
  'unsupported-schema',
  'network',
  'rate-limit',
  'already-running',
  'unknown',
])

export const syncErrorSummarySchema = z.strictObject({
  kind: z.enum([
    'auth',
    'conflict',
    'gist-missing',
    'network',
    'rate-limit',
    'remote-invalid',
    'schema-unsupported',
    'unknown',
  ]),
  message: z.string(),
  occurredAt: z.iso.datetime(),
  retryable: z.boolean(),
})

export const syncConflictSummarySchema = z.strictObject({
  detectedAt: z.iso.datetime(),
  localDataUpdatedAt: z.iso.datetime().nullable(),
  remoteUpdatedAt: z.iso.datetime().nullable(),
  remoteVersion: z.string().nullable(),
})

export const syncStatusSchema = z.strictObject({
  enabled: z.boolean(),
  configured: z.boolean(),
  tokenConfigured: z.boolean(),
  tokenStatus: secretStatusSchema,
  gistId: z.string().nullable(),
  isSyncing: z.boolean(),
  lastSyncAt: z.iso.datetime().nullable(),
  lastSyncDirection: z.enum(['push', 'pull', 'no-change']).nullable(),
  lastPullAt: z.iso.datetime().nullable(),
  lastPushAt: z.iso.datetime().nullable(),
  needsPush: z.boolean(),
  lastBlockingReason: syncActionReasonSchema.nullable(),
  lastError: syncErrorSummarySchema.nullable(),
  conflict: syncConflictSummarySchema.nullable(),
})

export const syncActionResultSchema = z.strictObject({
  restorePreview: z.lazy(() => backupRestorePreviewSchema).optional(),
  action: syncActionSchema,
  direction: syncActionDirectionSchema,
  outcome: syncActionOutcomeSchema,
  reason: syncActionReasonSchema.nullable(),
  retryable: z.boolean(),
  message: z.string(),
  status: syncStatusSchema,
  occurredAt: z.iso.datetime(),
})

export type SyncRequest = z.infer<typeof syncRequestSchema>
export type SyncGithubTokenRequest = z.infer<
  typeof syncGithubTokenRequestSchema
>
export type SyncGithubGistRequest = z.infer<typeof syncGithubGistRequestSchema>
export type SyncSetEnabledRequest = z.infer<typeof syncSetEnabledRequestSchema>
export type SyncPullLatestRequest = z.infer<typeof syncPullLatestRequestSchema>
export type SyncPushLocalRequest = z.infer<typeof syncPushLocalRequestSchema>
export type SerializedSyncStatus = z.infer<typeof syncStatusSchema>
export type SyncActionResult = z.infer<typeof syncActionResultSchema>
