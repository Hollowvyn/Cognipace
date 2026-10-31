import {
  exportFullBackup,
  restoreValidatedBackupData,
  prepareFullBackupRestore,
  type BackupReplacementWork,
} from '@/features/backup/server/backup-service'
import type {
  BackupFile,
  BackupSummary,
  BackupReplacementResult,
} from '@/features/backup/api/backup-contracts'
import { createGitHubGistClient, type GitHubGistClient } from '@/lib/github'
import type { GitHubGistSummary } from '@/lib/github/api/gist-contracts'
import type { Db } from '@/platform/db'
import { flushDbSnapshot } from '@/platform/db'
import { HttpRequestError, isRetryableHttpStatus } from '@/platform/http'
import { z } from 'zod'
import {
  deleteSecret,
  getSecretStatus,
  readSecret,
  saveSecret,
  type SecretStatus,
} from '@/platform/secrets'

import type {
  SerializedSyncStatus,
  SyncActionResult,
} from '../api/sync-contracts'
import {
  markLocalDataChanged,
  readSyncMetadata,
  writeSyncMetadata,
  type SyncMetadata,
} from '../data/sync-metadata-store'
import { createSyncConflict } from '../domain/sync-conflict'
import {
  buildSyncEnvelope,
  parseSyncEnvelopeForCurrentApp,
} from '../domain/sync-envelope'
import type {
  SyncAction,
  SyncActionDirection,
  SyncActionOutcome,
  SyncActionReason,
  SyncErrorKind,
  SyncErrorSummary,
} from '../domain/sync-status'

type MaybePromise<T> = T | Promise<T>

type PushLocalOptions = {
  confirmRemoteOverwrite?: boolean
}

type PullLatestOptions = {
  confirmLocalOverwrite?: boolean
}

export type SyncOperationCoordinator = {
  isRunning: () => boolean
  run: <T>(work: () => Promise<T>) => Promise<T>
}

type SyncOperationState = {
  queue: Promise<void>
  running: boolean
}

export type SyncServiceDependencies = {
  readToken: () => Promise<string | null>
  saveToken: (token: string) => Promise<unknown>
  deleteToken: () => Promise<unknown>
  getTokenStatus: () => Promise<SecretStatus>
  createGitHubClient: (token: string) => GitHubGistClient
  readMetadata: () => Promise<SyncMetadata>
  writeMetadata: (patch: Partial<SyncMetadata>) => Promise<SyncMetadata>
  exportFullBackup: () => Promise<BackupFile>
  restoreBackup: (backup: BackupFile) => Promise<BackupSummary>
  flushDbSnapshot: () => Promise<unknown>
  broadcastInvalidation: () => MaybePromise<void>
  runReplacement: (
    work: BackupReplacementWork,
  ) => Promise<BackupReplacementResult>
  runRemoteRestore?:
    | (<T>(work: () => Promise<T>, context?: PullLatestOptions) => Promise<T>)
    | undefined
  syncCoordinator?: SyncOperationCoordinator | undefined
  now: () => Date
}

const sharedSyncOperationCoordinator = createSyncOperationCoordinator({
  queue: Promise.resolve(),
  running: false,
})

const remoteReplacementMetadataSchema = z.strictObject({
  enabled: z.boolean(),
  gistId: z.string().min(1),
  lastSyncAt: z.iso.datetime(),
  lastSyncDirection: z.literal('pull'),
  lastPullAt: z.iso.datetime(),
  lastRemoteVersion: z.string().nullable(),
  lastRemoteUpdatedAt: z.iso.datetime(),
  localDataUpdatedAt: z.iso.datetime(),
  dirtySinceLastSync: z.literal(false),
  lastBlockingReason: z.null(),
  conflict: z.null(),
  lastError: z.null(),
  autoSyncRetryAttempt: z.literal(0).optional(),
  lastAutoSyncAt: z.iso.datetime().optional(),
})

export function createSyncOperationCoordinator(
  state: SyncOperationState = {
    queue: Promise.resolve(),
    running: false,
  },
): SyncOperationCoordinator {
  return {
    isRunning: () => state.running,
    run: (work) => {
      const queued = state.queue.then(async () => {
        state.running = true

        try {
          return await work()
        } finally {
          state.running = false
        }
      })

      state.queue = queued.then(
        () => undefined,
        () => undefined,
      )

      return queued
    },
  }
}

export function createSyncService(deps: SyncServiceDependencies) {
  const syncCoordinator = deps.syncCoordinator ?? sharedSyncOperationCoordinator

  async function getStatus(): Promise<SerializedSyncStatus> {
    const [metadata, tokenStatus] = await Promise.all([
      deps.readMetadata(),
      deps.getTokenStatus(),
    ])

    return createStatus(metadata, tokenStatus, syncCoordinator.isRunning())
  }

  async function validateGithubToken(token: string): Promise<SyncActionResult> {
    const client = deps.createGitHubClient(token)
    await client.validateToken()

    return createActionResult({
      action: 'validate-token',
      direction: null,
      message: 'GitHub token validated.',
    })
  }

  async function validateStoredGithubToken(): Promise<SyncActionResult> {
    const message = await runExclusive(
      async () => {
        const client = await readConfiguredClient()
        await client.validateToken()
        await deps.writeMetadata({ lastError: null })

        return 'GitHub token validated.'
      },
      { recordErrors: false },
    )

    return createActionResult({
      action: 'validate-token',
      direction: null,
      message,
    })
  }

  async function saveGithubToken(token: string): Promise<SyncActionResult> {
    const client = deps.createGitHubClient(token)
    await client.validateToken()

    const message = await runExclusive(async () => {
      await deps.saveToken(token)
      await deps.writeMetadata({ lastError: null })

      return 'GitHub token saved.'
    })

    return createActionResult({
      action: 'save-token',
      direction: null,
      message,
    })
  }

  async function deleteGithubToken(): Promise<SyncActionResult> {
    const message = await runExclusive(async () => {
      await deps.deleteToken()
      await deps.writeMetadata({
        enabled: false,
        lastError: null,
        conflict: null,
      })

      return 'GitHub token deleted.'
    })

    return createActionResult({
      action: 'delete-token',
      direction: null,
      message,
    })
  }

  async function createGithubGist(): Promise<SyncActionResult> {
    const message = await runExclusive(async () => {
      const client = await readConfiguredClient()
      const local = await createLocalEnvelopeContent()
      const gist = await client.createSyncGist(local.content)
      await recordPush(gist, local.dataUpdatedAt)

      return 'GitHub Gist created.'
    })

    return createActionResult({
      action: 'create-gist',
      direction: null,
      message,
    })
  }

  async function connectGithubGist(gistId: string): Promise<SyncActionResult> {
    const result = await runExclusive(async () => {
      const client = await readConfiguredClient()
      const metadata = await deps.readMetadata()
      const gist = await client.getGist(gistId)

      assertReadableRemoteSyncContent(gist)

      if (!gist.content) {
        const local = await createLocalEnvelopeContent()
        const updated = await client.updateSyncGist(gistId, local.content)
        await recordPush(updated, local.dataUpdatedAt)

        return {
          direction: null,
          message: 'GitHub Gist connected and initialized.',
        } as const
      }

      parseRemoteSyncEnvelope(gist)

      if (!metadata.dirtySinceLastSync) {
        await deps.writeMetadata({
          enabled: true,
          gistId,
          lastBlockingReason: null,
          conflict: null,
          lastError: null,
        })

        return {
          direction: null,
          message:
            'GitHub Gist connected. Use Pull latest to update this browser.',
        } as const
      }

      await deps.writeMetadata({
        enabled: true,
        gistId,
        lastBlockingReason: 'remote-changed',
        conflict: createSyncConflict({
          detectedAt: deps.now(),
          localDataUpdatedAt: metadata.localDataUpdatedAt,
          remoteUpdatedAt: gist.updatedAt,
          remoteVersion: getRemoteIdentity(gist),
        }),
        lastError: null,
      })

      return {
        direction: null,
        message: 'Choose whether to pull remote data or push local data.',
      } as const
    })

    if (
      result.message ===
      'Choose whether to pull remote data or push local data.'
    ) {
      return createActionResult({
        action: 'connect-gist',
        direction: result.direction,
        outcome: 'confirmation-required',
        reason: 'remote-changed',
        retryable: false,
        message: result.message,
      })
    }

    return createActionResult({
      action: 'connect-gist',
      direction: result.direction,
      message: result.message,
    })
  }

  async function setEnabled(enabled: boolean): Promise<SyncActionResult> {
    const message = await runExclusive(async () => {
      await deps.writeMetadata({ enabled })

      return enabled ? 'Auto-sync resumed.' : 'Auto-sync paused.'
    })

    return createActionResult({
      action: 'set-enabled',
      direction: null,
      message,
    })
  }

  async function checkRemoteOnOpen(): Promise<SyncActionResult> {
    return runAction('check-remote-on-open', null, async () => {
      const [metadata, tokenStatus] = await Promise.all([
        deps.readMetadata(),
        deps.getTokenStatus(),
      ])

      if (!metadata.enabled || !metadata.gistId || !tokenStatus.configured) {
        return createActionResult({
          action: 'check-remote-on-open',
          direction: null,
          outcome: 'no-change',
          reason: 'not-configured',
          message: 'Remote check skipped: GitHub Gist sync is not configured.',
        })
      }

      if (metadata.dirtySinceLastSync) {
        return createActionResult({
          action: 'check-remote-on-open',
          direction: null,
          outcome: 'no-change',
          reason: 'local-dirty',
          message: 'Remote check skipped: local changes need to be pushed.',
        })
      }

      const client = await readConfiguredClient()
      const remote = await client.getGist(metadata.gistId)

      if (!hasRemoteChanged(remote, metadata)) {
        await deps.writeMetadata({
          lastSyncAt: deps.now().toISOString(),
          lastSyncDirection: 'no-change',
          lastRemoteVersion: remote.remoteVersion,
          lastRemoteUpdatedAt: remote.updatedAt,
          lastBlockingReason: null,
          conflict: null,
          lastError: null,
          lastAutoSyncAt: deps.now().toISOString(),
        })

        return createActionResult({
          action: 'check-remote-on-open',
          direction: null,
          outcome: 'no-change',
          reason: 'remote-unchanged',
          message: 'Remote check found no changes.',
        })
      }

      return pullRemote(remote, {
        enabled: metadata.enabled,
        automatic: true,
        action: 'check-remote-on-open',
        message: 'Latest Gist data pulled.',
        metadata,
        tokenStatus,
      })
    })
  }

  async function pullLatest(
    options: PullLatestOptions = {},
  ): Promise<SyncActionResult> {
    return runAction('pull-latest', 'pull', async () => {
      const [metadata, tokenStatus] = await Promise.all([
        deps.readMetadata(),
        deps.getTokenStatus(),
      ])

      if (!metadata.gistId || !tokenStatus.configured) {
        await deps.writeMetadata({ lastBlockingReason: 'not-configured' })

        return createActionResult({
          action: 'pull-latest',
          direction: 'pull',
          outcome: 'blocked',
          reason: 'not-configured',
          message: 'GitHub Gist sync is not configured.',
        })
      }

      const localIsDirty = metadata.dirtySinceLastSync

      if (localIsDirty && options.confirmLocalOverwrite !== true) {
        await deps.writeMetadata({
          lastBlockingReason: 'local-dirty',
          lastError: null,
        })

        return createActionResult({
          action: 'pull-latest',
          direction: 'pull',
          outcome: 'blocked',
          reason: 'local-dirty',
          message: 'Pull blocked: local changes have not been pushed.',
        })
      }

      const client = await readConfiguredClient()
      const remote = await client.getGist(metadata.gistId)

      if (!localIsDirty && !hasRemoteChanged(remote, metadata)) {
        await deps.writeMetadata({
          lastSyncAt: deps.now().toISOString(),
          lastSyncDirection: 'no-change',
          lastRemoteVersion: remote.remoteVersion,
          lastRemoteUpdatedAt: remote.updatedAt,
          lastBlockingReason: null,
          lastError: null,
        })

        return createActionResult({
          action: 'pull-latest',
          direction: 'pull',
          outcome: 'no-change',
          reason: 'remote-unchanged',
          message: 'No remote changes.',
        })
      }

      return pullRemote(remote, {
        enabled: metadata.enabled,
        action: 'pull-latest',
        confirmLocalOverwrite: options.confirmLocalOverwrite === true,
        metadata,
        tokenStatus,
        message: localIsDirty
          ? 'Latest Gist data pulled. Local changes were overwritten.'
          : 'Latest Gist data pulled.',
      })
    })
  }

  async function pushLocal(
    options: PushLocalOptions = {},
  ): Promise<SyncActionResult> {
    return runAction('push-local', 'push', async () => {
      const [metadata, tokenStatus] = await Promise.all([
        deps.readMetadata(),
        deps.getTokenStatus(),
      ])

      if (!metadata.gistId || !tokenStatus.configured) {
        await deps.writeMetadata({ lastBlockingReason: 'not-configured' })

        return createActionResult({
          action: 'push-local',
          direction: 'push',
          outcome: 'blocked',
          reason: 'not-configured',
          message: 'GitHub Gist sync is not configured.',
        })
      }

      const client = await readConfiguredClient()
      const remote = await client.getGist(metadata.gistId)

      if (
        hasRemoteChanged(remote, metadata) &&
        options.confirmRemoteOverwrite !== true
      ) {
        await deps.writeMetadata({
          conflict: createSyncConflict({
            detectedAt: deps.now(),
            localDataUpdatedAt: metadata.localDataUpdatedAt,
            remoteUpdatedAt: remote.updatedAt,
            remoteVersion: getRemoteIdentity(remote),
          }),
          lastBlockingReason: 'remote-changed',
          lastError: null,
        })

        return createActionResult({
          action: 'push-local',
          direction: 'push',
          outcome: 'confirmation-required',
          reason: 'remote-changed',
          message: 'Remote changed since this browser last synced.',
        })
      }

      const local = await createLocalEnvelopeContent()
      const updated = await client.updateSyncGist(
        metadata.gistId,
        local.content,
      )
      await recordPush(updated, local.dataUpdatedAt, {
        enabled: metadata.enabled,
      })

      return createActionResult({
        action: 'push-local',
        direction: 'push',
        message: 'Local data pushed to Gist.',
      })
    })
  }

  async function pullRemote(
    gist: GitHubGistSummary,
    options: {
      enabled: boolean
      automatic?: boolean
      confirmLocalOverwrite?: boolean
      action: SyncAction
      message: string
      metadata: SyncMetadata
      tokenStatus: SecretStatus
    },
  ) {
    const envelope = parseRemoteSyncEnvelope(gist)
    prepareFullBackupRestore(envelope.backup)
    const completedAt = deps.now().toISOString()
    const patch: Partial<SyncMetadata> = {
      enabled: options.enabled,
      gistId: gist.id,
      lastSyncAt: completedAt,
      lastSyncDirection: 'pull',
      lastPullAt: completedAt,
      lastRemoteVersion: gist.remoteVersion,
      lastRemoteUpdatedAt: gist.updatedAt,
      localDataUpdatedAt: envelope.dataUpdatedAt,
      dirtySinceLastSync: false,
      lastBlockingReason: null,
      conflict: null,
      lastError: null,
      ...(options.automatic
        ? { autoSyncRetryAttempt: 0, lastAutoSyncAt: completedAt }
        : {}),
    }
    remoteReplacementMetadataSchema.parse(patch)
    const result = await runRemoteRestore(
      () =>
        deps.runReplacement({
          kind: 'gist-pull',
          commit: () => deps.restoreBackup(envelope.backup),
          ...createRemoteReplacementContinuations(deps, patch),
        }),
      { confirmLocalOverwrite: options.confirmLocalOverwrite === true },
    )
    return createReplacementActionResult(result, options, patch)
  }

  async function createReplacementActionResult(
    result: BackupReplacementResult,
    options: {
      action: SyncAction
      message: string
      metadata: SyncMetadata
      tokenStatus: SecretStatus
    },
    patch: Partial<SyncMetadata>,
  ): Promise<SyncActionResult> {
    const pending =
      result.status === 'persistence-pending' ||
      (result.status === 'durable' && result.syncMetadataPending)
    const message =
      result.status === 'persistence-pending'
        ? 'Gist data was applied in memory but still needs saving. Open Settings > Data Management and choose Retry saving.'
        : pending
          ? 'Gist data is saved locally, but sync status still needs saving. Open Settings > Data Management and choose Retry saving.'
          : options.message
    const error: SyncErrorSummary | null = pending
      ? {
          kind: 'unknown',
          message,
          occurredAt: deps.now().toISOString(),
          retryable: true,
        }
      : null
    if (error) {
      try {
        await deps.writeMetadata({ lastError: error })
      } catch {
        // Recovery belongs to the frozen replacement continuation even if status storage fails.
      }
    }
    let status: SerializedSyncStatus
    try {
      status = await getStatus()
    } catch {
      const knownMetadata =
        !pending && result.status === 'durable'
          ? { ...options.metadata, ...patch }
          : options.metadata
      status = createStatus(
        { ...knownMetadata, ...(error ? { lastError: error } : {}) },
        options.tokenStatus,
        syncCoordinator.isRunning(),
      )
    }
    return {
      action: options.action,
      direction: 'pull',
      outcome: pending ? 'error' : 'success',
      reason: pending ? 'unknown' : null,
      retryable: pending,
      message,
      status,
      occurredAt: deps.now().toISOString(),
    }
  }

  async function recordPush(
    gist: GitHubGistSummary,
    dataUpdatedAt: string,
    options: { enabled?: boolean } = {},
  ) {
    const metadata = await deps.readMetadata()
    const changedDuringPush =
      metadata.dirtySinceLastSync &&
      metadata.localDataUpdatedAt !== null &&
      metadata.localDataUpdatedAt !== dataUpdatedAt

    await deps.writeMetadata({
      enabled: options.enabled ?? true,
      gistId: gist.id,
      lastSyncAt: deps.now().toISOString(),
      lastSyncDirection: 'push',
      lastPushAt: deps.now().toISOString(),
      lastRemoteVersion: gist.remoteVersion,
      lastRemoteUpdatedAt: gist.updatedAt,
      localDataUpdatedAt: changedDuringPush
        ? metadata.localDataUpdatedAt
        : dataUpdatedAt,
      dirtySinceLastSync: changedDuringPush,
      lastBlockingReason: null,
      conflict: null,
      lastError: null,
    })
  }

  async function createLocalEnvelopeContent() {
    const metadata = await deps.readMetadata()
    const dataUpdatedAt =
      metadata.localDataUpdatedAt ?? deps.now().toISOString()
    const backup = await deps.exportFullBackup()

    return {
      content: JSON.stringify(
        buildSyncEnvelope({
          backup,
          dataUpdatedAt,
          exportedAt: deps.now(),
        }),
        null,
        2,
      ),
      dataUpdatedAt,
    }
  }

  async function readConfiguredClient() {
    const token = await deps.readToken()

    if (!token) {
      throw new Error('GitHub token is not configured.')
    }

    return deps.createGitHubClient(token)
  }

  async function createActionResult(input: {
    action: SyncAction
    direction: SyncActionDirection
    message: string
    outcome?: SyncActionOutcome
    reason?: SyncActionReason | null
    retryable?: boolean
  }): Promise<SyncActionResult> {
    return {
      action: input.action,
      direction: input.direction,
      outcome: input.outcome ?? 'success',
      reason: input.reason ?? null,
      retryable: input.retryable ?? false,
      message: input.message,
      status: await getStatus(),
      occurredAt: deps.now().toISOString(),
    }
  }

  async function createErrorActionResult(
    action: SyncAction,
    direction: SyncActionDirection,
    error: unknown,
  ): Promise<SyncActionResult> {
    const retryable = isRetryableSyncError(error)

    await recordError(error, retryable)

    return createActionResult({
      action,
      direction,
      outcome: 'error',
      reason: mapErrorKindToActionReason(classifySyncError(error)),
      retryable,
      message: createSafeSyncErrorMessage(error),
    })
  }

  async function runAction(
    action: SyncAction,
    direction: SyncActionDirection,
    work: () => Promise<SyncActionResult>,
  ): Promise<SyncActionResult> {
    return syncCoordinator.run(async () => {
      try {
        return await work()
      } catch (error) {
        return createErrorActionResult(action, direction, error)
      }
    })
  }

  async function recordError(error: unknown, retryable: boolean) {
    const summary: SyncErrorSummary = {
      kind: classifySyncError(error),
      message: createSafeSyncErrorMessage(error),
      occurredAt: deps.now().toISOString(),
      retryable,
    }

    await deps.writeMetadata({ lastError: summary })
  }

  async function runExclusive<T>(
    work: () => Promise<T>,
    options: { recordErrors?: boolean } = {},
  ): Promise<T> {
    return syncCoordinator.run(async () => {
      try {
        return await work()
      } catch (error) {
        if (options.recordErrors !== false) {
          await recordError(error, isRetryableSyncError(error))
        }

        throw error
      }
    })
  }

  function runRemoteRestore<T>(
    work: () => Promise<T>,
    context: PullLatestOptions,
  ) {
    return deps.runRemoteRestore ? deps.runRemoteRestore(work, context) : work()
  }

  return {
    checkRemoteOnOpen,
    connectGithubGist,
    createGithubGist,
    deleteGithubToken,
    getStatus,
    pullLatest,
    pushLocal,
    saveGithubToken,
    setEnabled,
    validateGithubToken,
    validateStoredGithubToken,
  }
}

export function createBackgroundSyncService(
  db: Db,
  broadcastInvalidation: () => MaybePromise<void>,
  options: {
    runReplacement: SyncServiceDependencies['runReplacement']
    runRemoteRestore?: SyncServiceDependencies['runRemoteRestore']
    syncCoordinator?: SyncOperationCoordinator
  },
) {
  return createSyncService({
    readToken: () => readSecret('github:gist'),
    saveToken: (token) => saveSecret('github:gist', token),
    deleteToken: () => deleteSecret('github:gist'),
    getTokenStatus: () => getSecretStatus('github:gist'),
    createGitHubClient: (token) => createGitHubGistClient({ token }),
    readMetadata: readSyncMetadata,
    writeMetadata: writeSyncMetadata,
    exportFullBackup: () => exportFullBackup(db),
    restoreBackup: (backup) => restoreValidatedBackupData(db, backup),
    flushDbSnapshot,
    broadcastInvalidation,
    runReplacement: options.runReplacement,
    syncCoordinator: options.syncCoordinator ?? sharedSyncOperationCoordinator,
    ...(options.runRemoteRestore
      ? { runRemoteRestore: options.runRemoteRestore }
      : {}),
    now: () => new Date(),
  })
}

// Separate scope ensures retained continuations cannot capture the remote payload.
function createRemoteReplacementContinuations(
  deps: Pick<
    SyncServiceDependencies,
    'flushDbSnapshot' | 'broadcastInvalidation' | 'writeMetadata'
  >,
  patch: Partial<SyncMetadata>,
) {
  const frozenPatch = Object.freeze({ ...patch })
  return {
    flush: deps.flushDbSnapshot,
    onDurable: async () => deps.broadcastInvalidation(),
    finishSyncMetadata: () => deps.writeMetadata(frozenPatch),
  }
}

export function markSyncLocalDataChanged(now = new Date()) {
  return markLocalDataChanged(now)
}

function createStatus(
  metadata: SyncMetadata,
  tokenStatus: SecretStatus,
  isSyncing: boolean,
): SerializedSyncStatus {
  return {
    enabled: metadata.enabled,
    configured: tokenStatus.configured && Boolean(metadata.gistId),
    tokenConfigured: tokenStatus.configured,
    tokenStatus,
    gistId: metadata.gistId,
    isSyncing,
    lastSyncAt: metadata.lastSyncAt,
    lastSyncDirection: metadata.lastSyncDirection,
    lastPullAt: metadata.lastPullAt,
    lastPushAt: metadata.lastPushAt,
    needsPush: metadata.dirtySinceLastSync,
    lastBlockingReason: metadata.lastBlockingReason,
    lastError: metadata.lastError,
    conflict: metadata.conflict,
  }
}

function hasRemoteChanged(remote: GitHubGistSummary, metadata: SyncMetadata) {
  if (remote.remoteVersion && metadata.lastRemoteVersion) {
    return remote.remoteVersion !== metadata.lastRemoteVersion
  }

  if (metadata.lastRemoteUpdatedAt) {
    return remote.updatedAt !== metadata.lastRemoteUpdatedAt
  }

  return metadata.lastRemoteVersion === null
    ? true
    : remote.remoteVersion !== metadata.lastRemoteVersion
}

function getRemoteIdentity(remote: GitHubGistSummary) {
  return remote.remoteVersion ?? remote.updatedAt
}

function parseRemoteSyncEnvelope(gist: GitHubGistSummary) {
  assertReadableRemoteSyncContent(gist)

  if (!gist.content) {
    throw new Error('GitHub Gist does not contain CogniPace sync data.')
  }

  let remotePayload: unknown
  try {
    remotePayload = JSON.parse(gist.content)
  } catch (error) {
    throw new Error('GitHub Gist sync file contains invalid JSON.', {
      cause: error,
    })
  }

  return parseSyncEnvelopeForCurrentApp(remotePayload)
}

function assertReadableRemoteSyncContent(gist: GitHubGistSummary) {
  if (gist.contentTruncated) {
    throw new Error(
      'GitHub Gist sync file is truncated and cannot be read through the GitHub API.',
    )
  }

  if (gist.content !== null && gist.content.trim().length === 0) {
    throw new Error('GitHub Gist sync file is empty.')
  }
}

function classifySyncError(error: unknown): SyncErrorKind {
  const status = error instanceof HttpRequestError ? error.status : undefined
  const message = createSafeSyncErrorMessage(error).toLowerCase()

  if (
    status === 429 ||
    message.includes('rate limit') ||
    message.includes('rate-limit')
  ) {
    return 'rate-limit'
  }

  if (
    status === 404 ||
    message.includes('not found') ||
    message.includes('404')
  ) {
    return 'gist-missing'
  }

  if (
    status === 401 ||
    status === 403 ||
    message.includes('credential') ||
    message.includes('bad credentials') ||
    message.includes('token') ||
    message.includes('auth') ||
    message.includes('unauthorized')
  ) {
    return 'auth'
  }

  if (message.includes('unsupported')) {
    return 'schema-unsupported'
  }

  if (
    error instanceof SyntaxError ||
    getErrorName(error) === 'ZodError' ||
    message.includes('invalid json') ||
    message.includes('invalid backup') ||
    message.includes('sync file') ||
    message.includes('sync data') ||
    message.includes('not a cognipace')
  ) {
    return 'remote-invalid'
  }

  if (
    status === undefined &&
    (message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('offline') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('load failed'))
  ) {
    return 'network'
  }

  return 'unknown'
}

function isRetryableSyncError(error: unknown) {
  const status = error instanceof HttpRequestError ? error.status : undefined

  if (isRetryableHttpStatus(status)) {
    return true
  }

  const kind = classifySyncError(error)

  return kind === 'network' || kind === 'rate-limit' || kind === 'unknown'
}

function mapErrorKindToActionReason(kind: SyncErrorKind): SyncActionReason {
  switch (kind) {
    case 'auth':
      return 'auth'
    case 'gist-missing':
      return 'missing-gist'
    case 'network':
      return 'network'
    case 'rate-limit':
      return 'rate-limit'
    case 'remote-invalid':
      return 'invalid-remote'
    case 'schema-unsupported':
      return 'unsupported-schema'
    case 'conflict':
      return 'remote-changed'
    case 'unknown':
      return 'unknown'
  }
}

function createSafeSyncErrorMessage(error: unknown) {
  const message = getUnknownErrorMessage(error)
  const cleaned = message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, '[redacted]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, '[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted]')
    .trim()

  return (cleaned || 'Sync failed.').slice(0, 300)
}

function getErrorName(error: unknown) {
  return error instanceof Error ? error.name : null
}

function getUnknownErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Sync failed.'
}
