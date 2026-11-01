import {
  CheckCircle2,
  CloudDownload,
  CloudUpload,
  Link2,
  PauseCircle,
  PlayCircle,
  Settings2,
} from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { Surface } from '@/components/ui/surface'
import { formatDateTime } from '@/utils/date-format'

import type {
  SerializedSyncStatus,
  SyncActionResult,
} from '../api/sync-contracts'
import {
  createSyncActionDialogState,
  createSyncErrorDialogState,
  SyncActionDialogForState,
  type SyncDialogState,
} from './sync-action-dialog'
import { GitHubSyncConnectionDialog } from './github-sync-connection-dialog'

type MaybePromise<T> = T | Promise<T>

export type GitHubSyncActionResult =
  MaybePromise<SyncActionResult | null | void>

export interface GitHubSyncPanelActions {
  onConnectGist: (gistId: string) => GitHubSyncActionResult
  onCreateGist: () => GitHubSyncActionResult
  onDeleteToken: () => GitHubSyncActionResult
  onPullLatest: (input?: {
    confirmLocalOverwrite?: boolean
    confirmationToken?: string
  }) => GitHubSyncActionResult
  onPushLocal: (input?: {
    confirmRemoteOverwrite?: boolean
  }) => GitHubSyncActionResult
  onSaveToken: (token: string) => GitHubSyncActionResult
  onSetAutoSyncEnabled: (enabled: boolean) => GitHubSyncActionResult
  onValidateStoredToken: () => GitHubSyncActionResult
  onValidateToken: (token: string) => GitHubSyncActionResult
}

export function GitHubSyncPanel({
  actions,
  isPending = false,
  status,
}: {
  actions: GitHubSyncPanelActions
  isPending?: boolean | undefined
  status: SerializedSyncStatus
}) {
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [dialog, setDialog] = useState<SyncDialogState | null>(null)

  async function runPanelAction(
    action: () => GitHubSyncActionResult,
    fallbackMessage: string,
    options: { afterSuccess?: () => void; clearDialog?: boolean } = {},
  ) {
    if (options.clearDialog !== false) {
      setDialog(null)
    }

    try {
      const result = await action()

      if (isSuccessfulAction(result)) {
        options.afterSuccess?.()
      }

      setDialog(createSyncActionDialogState(result, fallbackMessage))
    } catch (error) {
      setDialog(createSyncErrorDialogState(error, 'Sync action failed.'))
    }
  }

  async function runPullLatestAction(
    confirmLocalOverwrite = false,
    options: { clearDialog?: boolean } = {},
    confirmationToken?: string,
  ) {
    await runPanelAction(
      () =>
        actions.onPullLatest({
          confirmLocalOverwrite,
          ...(confirmationToken ? { confirmationToken } : {}),
        }),
      'Latest Gist data pulled.',
      options,
    )
  }

  async function runPushLocalAction(
    confirmRemoteOverwrite: boolean,
    options: { clearDialog?: boolean } = {},
  ) {
    if (options.clearDialog !== false) {
      setDialog(null)
    }

    try {
      const result = await actions.onPushLocal({ confirmRemoteOverwrite })

      setDialog(
        createSyncActionDialogState(result, 'Local data pushed to Gist.'),
      )
    } catch (error) {
      setDialog(createSyncErrorDialogState(error, 'Sync action failed.'))
    }
  }

  function handleConnectionActionResult(
    result: SyncActionResult | null | undefined | void,
    fallbackMessage: string,
  ) {
    setConnectionDialogOpen(false)
    setDialog(createSyncActionDialogState(result, fallbackMessage))
  }

  return (
    <Surface aria-labelledby="github-sync-title" className="grid gap-4">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2
            className="m-0 text-[length:var(--cp-title-font-size)] font-bold leading-tight"
            id="github-sync-title"
          >
            GitHub Sync
          </h2>
          <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
            Sync local CogniPace data through a private GitHub Gist.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={readConnectionTone(status)} variant="outline">
            {readConnectionLabel(status)}
          </Badge>
          {status.configured ? (
            <Badge
              tone={status.enabled ? 'success' : 'warning'}
              variant="outline"
            >
              {status.enabled ? 'Auto-sync on' : 'Auto-sync paused'}
            </Badge>
          ) : null}
        </div>
      </header>

      <SyncStatusBlock status={status} />

      {status.configured ? (
        <div className="grid gap-3 rounded-[var(--cp-radius-md)] border border-border bg-background/60 p-3">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <h3 className="m-0 text-[length:var(--cp-copy-font-size)] font-semibold">
                Connected to private Gist
              </h3>
              <p className="m-0 text-[length:var(--cp-badge-font-size)] text-muted-foreground">
                Token saved and verified in trusted extension storage. Gist{' '}
                <span className="font-mono text-foreground">
                  {status.gistId}
                </span>
                .
              </p>
              {!status.enabled ? (
                <p className="m-0 text-[length:var(--cp-badge-font-size)] text-muted-foreground">
                  Manual pull and push still work while automatic sync is
                  paused.
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={isPending}
              onClick={() => {
                setConnectionDialogOpen(true)
              }}
              size="sm"
              variant="outline"
            >
              <Settings2 aria-hidden="true" />
              Manage connection
            </Button>
            <Button
              disabled={isPending}
              onClick={() => {
                void runPanelAction(
                  () => actions.onSetAutoSyncEnabled(!status.enabled),
                  status.enabled ? 'Auto-sync paused.' : 'Auto-sync resumed.',
                )
              }}
              size="sm"
              variant="outline"
            >
              {status.enabled ? (
                <PauseCircle aria-hidden="true" />
              ) : (
                <PlayCircle aria-hidden="true" />
              )}
              {status.enabled ? 'Pause auto-sync' : 'Resume auto-sync'}
            </Button>
            <Button
              disabled={isPending}
              onClick={() => {
                void runPullLatestAction(false)
              }}
              size="sm"
              variant="outline"
            >
              <CloudDownload aria-hidden="true" />
              Pull latest
            </Button>
            <Button
              disabled={isPending}
              onClick={() => {
                void runPushLocalAction(false)
              }}
              size="sm"
              variant="outline"
            >
              <CloudUpload aria-hidden="true" />
              Push local
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-[var(--cp-radius-md)] border border-border bg-background/60 p-3">
          <div className="grid gap-1">
            <h3 className="m-0 text-[length:var(--cp-copy-font-size)] font-semibold">
              No GitHub connection
            </h3>
            <p className="m-0 text-[length:var(--cp-badge-font-size)] text-muted-foreground">
              Add a token and connect a private Gist to start syncing.
            </p>
          </div>
          <Button
            disabled={isPending}
            onClick={() => {
              setConnectionDialogOpen(true)
            }}
            size="sm"
          >
            <Link2 aria-hidden="true" />
            Connect GitHub Sync
          </Button>
        </div>
      )}
      {connectionDialogOpen ? (
        <GitHubSyncConnectionDialog
          actions={actions}
          isPending={isPending}
          onActionResult={handleConnectionActionResult}
          onClose={() => {
            setConnectionDialogOpen(false)
          }}
          status={status}
        />
      ) : null}
      {dialog ? (
        <SyncActionDialogForState
          dialog={dialog}
          isPending={isPending}
          onClose={() => {
            setDialog(null)
          }}
          onForcePull={(preview) => {
            void runPullLatestAction(
              true,
              { clearDialog: false },
              preview?.confirmationToken,
            )
          }}
          onForcePush={() => {
            void runPushLocalAction(true, { clearDialog: false })
          }}
        />
      ) : null}
    </Surface>
  )
}

function SyncStatusBlock({ status }: { status: SerializedSyncStatus }) {
  if (status.conflict) {
    return (
      <InlineStatus role="alert" tone="warning">
        Sync conflict detected. Choose whether to pull remote data or push local
        data.
      </InlineStatus>
    )
  }

  if (status.lastError) {
    return (
      <InlineStatus role="alert" tone="danger">
        {status.lastError.message}
      </InlineStatus>
    )
  }

  if (!status.tokenConfigured) {
    return <InlineStatus>Add a GitHub token to enable Gist sync.</InlineStatus>
  }

  if (!status.gistId) {
    return (
      <InlineStatus>Create or connect a private CogniPace Gist.</InlineStatus>
    )
  }

  if (status.lastBlockingReason === 'local-dirty') {
    return (
      <InlineStatus tone="warning">
        Local changes need to be pushed before pulling latest Gist data.
      </InlineStatus>
    )
  }

  if (status.needsPush) {
    return (
      <InlineStatus tone="warning">
        Local changes are waiting to be pushed to Gist.
      </InlineStatus>
    )
  }

  const lastSyncStatus = readLastSyncStatus(status)

  return (
    <InlineStatus tone="success">
      <CheckCircle2 aria-hidden="true" />
      {lastSyncStatus ?? 'GitHub sync is ready.'}
    </InlineStatus>
  )
}

function readConnectionLabel(status: SerializedSyncStatus) {
  if (status.conflict) {
    return 'Conflict'
  }

  if (status.lastError) {
    return status.lastError.retryable ? 'Retry needed' : 'Error'
  }

  if (status.configured) {
    return 'Connected'
  }

  return 'Not connected'
}

function readConnectionTone(status: SerializedSyncStatus) {
  if (status.conflict || status.lastError?.retryable) {
    return 'warning'
  }

  if (status.lastError) {
    return 'danger'
  }

  return status.configured ? 'success' : 'neutral'
}

function readLastSyncStatus(status: SerializedSyncStatus) {
  const latestDirectionalSync = readLatestDirectionalSync(status)

  if (latestDirectionalSync) {
    return `Last ${latestDirectionalSync.label}: ${formatDateTime(
      latestDirectionalSync.timestamp,
    )}`
  }

  if (status.lastSyncAt) {
    const label =
      status.lastSyncDirection === 'no-change'
        ? 'sync check'
        : (status.lastSyncDirection ?? 'sync')

    return `Last ${label}: ${formatDateTime(status.lastSyncAt)}`
  }

  return null
}

function readLatestDirectionalSync(status: SerializedSyncStatus) {
  const candidates = [
    status.lastPushAt ? { label: 'push', timestamp: status.lastPushAt } : null,
    status.lastPullAt ? { label: 'pull', timestamp: status.lastPullAt } : null,
  ].filter((candidate): candidate is { label: string; timestamp: string } =>
    Boolean(candidate),
  )

  return candidates.toSorted(
    (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp),
  )[0]
}

function isSuccessfulAction(result: unknown) {
  return !isSyncActionResult(result) || result.outcome === 'success'
}

function isSyncActionResult(result: unknown): result is SyncActionResult {
  return (
    result !== null &&
    typeof result === 'object' &&
    'outcome' in result &&
    (result.outcome === 'success' ||
      result.outcome === 'no-change' ||
      result.outcome === 'blocked' ||
      result.outcome === 'confirmation-required' ||
      result.outcome === 'error')
  )
}
