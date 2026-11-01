import { CloudDownload, CloudUpload } from 'lucide-react'
import { useState } from 'react'

import { IconButton } from '@/components/ui/icon-button'

import { usePullLatest, usePushLocal, useSyncStatus } from '../api/sync-api'
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

type DashboardSyncActionResult =
  | Promise<SyncActionResult | null | undefined | void>
  | SyncActionResult
  | null
  | undefined
  | void

interface DashboardSyncActionsViewProps {
  isPending: boolean
  onPullLatest: (options?: {
    confirmLocalOverwrite?: boolean
    confirmationToken?: string
  }) => DashboardSyncActionResult
  onPushLocal: (options: {
    confirmRemoteOverwrite: boolean
  }) => DashboardSyncActionResult
  status: SerializedSyncStatus | null | undefined
}

export function DashboardSyncActions() {
  const status = useSyncStatus('dashboard')
  const pullLatest = usePullLatest()
  const pushLocal = usePushLocal()

  return (
    <DashboardSyncActionsView
      isPending={pullLatest.isPending || pushLocal.isPending}
      onPullLatest={(options) => pullLatest.mutateAsync(options)}
      onPushLocal={(options) => pushLocal.mutateAsync(options)}
      status={status.data}
    />
  )
}

export function DashboardSyncActionsView({
  isPending,
  onPullLatest,
  onPushLocal,
  status,
}: DashboardSyncActionsViewProps) {
  const [dialog, setDialog] = useState<SyncDialogState | null>(null)

  if (!status?.configured) {
    return null
  }

  const disabled = isPending || status.isSyncing

  async function handlePullLatest(
    confirmLocalOverwrite = false,
    options: { clearDialog?: boolean } = {},
    confirmationToken?: string,
  ) {
    if (options.clearDialog !== false) {
      setDialog(null)
    }

    try {
      const result = await onPullLatest({
        confirmLocalOverwrite,
        ...(confirmationToken ? { confirmationToken } : {}),
      })
      setDialog(createSyncActionDialogState(result, 'Pulled latest from Gist.'))
    } catch (error) {
      setDialog(
        createSyncErrorDialogState(error, 'Failed to pull latest from Gist.'),
      )
    }
  }

  async function handlePushLocal(
    confirmRemoteOverwrite = false,
    options: { clearDialog?: boolean } = {},
  ) {
    if (options.clearDialog !== false) {
      setDialog(null)
    }

    try {
      const result = await onPushLocal({ confirmRemoteOverwrite })
      setDialog(
        createSyncActionDialogState(result, 'Pushed local data to Gist.'),
      )
    } catch (error) {
      setDialog(
        createSyncErrorDialogState(error, 'Failed to push local data to Gist.'),
      )
    }
  }

  return (
    <>
      <IconButton
        disabled={disabled}
        label="Pull latest from Gist"
        onClick={() => {
          void handlePullLatest(false)
        }}
        tooltip="Pull latest from Gist"
        variant="ghost"
      >
        <CloudDownload aria-hidden="true" />
      </IconButton>
      <IconButton
        disabled={disabled}
        label="Push local to Gist"
        onClick={() => {
          void handlePushLocal(false)
        }}
        tooltip="Push local to Gist"
        variant="ghost"
      >
        <CloudUpload aria-hidden="true" />
      </IconButton>
      {dialog ? (
        <SyncActionDialogForState
          dialog={dialog}
          isPending={isPending}
          onClose={() => {
            setDialog(null)
          }}
          onForcePull={(preview) => {
            void handlePullLatest(
              true,
              { clearDialog: false },
              preview?.confirmationToken,
            )
          }}
          onForcePush={() => {
            void handlePushLocal(true, { clearDialog: false })
          }}
        />
      ) : null}
    </>
  )
}
