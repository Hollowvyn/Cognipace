import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  FeedbackToast,
  type FeedbackToastStatus,
} from '@/components/ui/feedback-toast'
import { InlineStatus } from '@/components/ui/inline-status'
import { ImportContentPanel } from '@/features/imports'
import { GitHubSyncSettingsSection } from '@/features/sync'

import {
  downloadBackupFile,
  cancelBackupTransfer,
  retryBackupTransferCleanup,
  type SelectedBackupTransfer,
  useExportFullBackup,
  usePendingBackupReplacement,
  useResetLocalData,
  useRestoreFullBackup,
  useRetryPendingBackupReplacement,
  useValidateFullBackup,
} from '../api/backup-api'
import type {
  BackupReplacementResult,
  BackupRestorePreview,
} from '../api/backup-contracts'

import {
  BackupConfirmationDialog,
  BackupRestorePanel,
} from './backup-restore-panel'
import { ResetLocalDataPanel } from './reset-local-data-panel'

export function DataManagementScreen() {
  const exportBackup = useExportFullBackup()
  const validateBackup = useValidateFullBackup()
  const restoreBackup = useRestoreFullBackup()
  const resetLocalData = useResetLocalData()
  const resetCommandId = useRef<string | null>(null)
  const pendingReplacement = usePendingBackupReplacement()
  const retryReplacement = useRetryPendingBackupReplacement()
  const [selectedBackup, setSelectedBackup] =
    useState<SelectedBackupTransfer | null>(null)
  const [selectedBackupFileName, setSelectedBackupFileName] = useState<
    string | null
  >(null)
  const [backupSummary, setBackupSummary] =
    useState<BackupRestorePreview | null>(null)
  const [backupToast, setBackupToast] = useState<FeedbackToastStatus | null>(
    null,
  )
  const [backupError, setBackupError] = useState<string | null>(null)
  const [resetStatus, setResetStatus] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const replacementState = pendingReplacement.data
  const isReplacementPending =
    replacementState?.status === 'persistence-pending' ||
    replacementState?.status === 'durable-sync-metadata-pending'

  async function handleExport(scope: 'backup' | 'reset') {
    if (isReplacementPending) {
      return
    }
    clearStatus(scope)

    try {
      const backup = await exportBackup.mutateAsync()
      downloadBackupFile(backup)
      if (scope === 'backup') {
        setBackupToast({ message: 'Backup exported.', tone: 'success' })
        return
      }

      setResetStatus('Backup exported.')
    } catch (error) {
      setError(scope, readErrorMessage(error, 'Failed to export backup.'))
    }
  }

  const fileSelectionEpoch = useRef({ value: 0 })
  const selectedTransferLifetime = useRef<{
    transfer: SelectedBackupTransfer
    retained: boolean
  } | null>(null)
  useEffect(() => {
    const selectionEpoch = fileSelectionEpoch.current
    void retryBackupTransferCleanup().catch((error) =>
      setBackupError(
        readErrorMessage(
          error,
          'Backup transfer cleanup failed. Select a file to retry.',
        ),
      ),
    )
    return () => {
      ++selectionEpoch.value
      const selected = selectedTransferLifetime.current
      if (selected && !selected.retained)
        void cancelBackupTransfer(selected.transfer).catch(() => {})
    }
  }, [])
  async function handleFileSelect(file: File) {
    if (isReplacementPending) {
      return
    }
    const epoch = ++fileSelectionEpoch.current.value
    setBackupToast(null)
    setBackupError(null)

    try {
      const previous = selectedTransferLifetime.current
      if (previous) await cancelBackupTransfer(previous.transfer)
      selectedTransferLifetime.current = null
      setSelectedBackup(null)
      setSelectedBackupFileName(file.name)
      setBackupSummary(null)
      const summary = await validateBackup.mutateAsync(file)
      if (epoch !== fileSelectionEpoch.current.value) {
        await cancelBackupTransfer(summary.transfer)
        return
      }
      selectedTransferLifetime.current = {
        transfer: summary.transfer,
        retained: false,
      }
      setSelectedBackup(summary.transfer)
      setBackupSummary(summary)
      setBackupToast({
        message: 'Backup ready to restore.',
        tone: 'success',
      })
    } catch (error) {
      if (epoch === fileSelectionEpoch.current.value)
        setBackupError(readErrorMessage(error, 'Backup validation failed.'))
    }
  }

  async function handleRestoreConfirm() {
    if (!selectedBackup || isReplacementPending) {
      return
    }

    setBackupError(null)
    setBackupToast(null)
    setRecoveryError(null)

    try {
      if (selectedTransferLifetime.current)
        selectedTransferLifetime.current.retained = true
      const result = await restoreBackup.mutateAsync({
        transfer: selectedBackup,
        confirmationToken: backupSummary!.confirmationToken,
      })
      setRestoreDialogOpen(false)
      completeReplacement(result)
    } catch (error) {
      setBackupError(readErrorMessage(error, 'Failed to restore backup.'))
    }
  }

  async function handleResetConfirm() {
    if (isReplacementPending) {
      await handleRetrySaving()
      return
    }
    setResetError(null)
    setResetStatus(null)
    setRecoveryError(null)

    try {
      resetCommandId.current ??= crypto.randomUUID()
      const result = await resetLocalData.mutateAsync(resetCommandId.current)
      if (result.status === 'durable' && !result.syncMetadataPending)
        setResetDialogOpen(false)
      completeReplacement(result)
    } catch (error) {
      setResetError(readErrorMessage(error, 'Failed to clear local data.'))
    }
  }

  async function handleRetrySaving() {
    setRecoveryError(null)

    try {
      completeReplacement(await retryReplacement.mutateAsync())
    } catch (error) {
      setRecoveryError(readErrorMessage(error, 'Failed to save local data.'))
    }
  }

  function completeReplacement(result: BackupReplacementResult) {
    if (result.status !== 'durable' || result.syncMetadataPending) {
      return
    }

    if (result.kind === 'restore') {
      selectedTransferLifetime.current = null
      setSelectedBackup(null)
      setSelectedBackupFileName(null)
      setBackupSummary(null)
      setBackupError(null)
      setBackupToast({ message: 'Backup restored.', tone: 'success' })
    } else if (result.kind === 'reset') {
      setResetDialogOpen(false)
      setResetError(null)
      setResetStatus('Local data cleared.')
    }
  }

  function clearStatus(scope: 'backup' | 'reset') {
    setError(scope, null)
    if (scope === 'backup') {
      setBackupToast(null)
      return
    }

    setResetStatus(null)
  }

  function setError(scope: 'backup' | 'reset', value: string | null) {
    if (scope === 'backup') {
      setBackupError(value)
      return
    }

    setResetError(value)
  }

  return (
    <section
      aria-labelledby="data-management-title"
      className="grid min-w-0 w-full max-w-[64rem] gap-[var(--cp-surface-gap)]"
    >
      <header className="grid gap-1">
        <h1
          className="m-0 text-[length:var(--cp-title-font-size)] font-bold leading-tight"
          id="data-management-title"
        >
          Data Management
        </h1>
        <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
          Back up, restore, import, or clear local study data.
        </p>
      </header>

      {isReplacementPending ? (
        <div className="grid gap-2">
          <InlineStatus>
            {replacementState.status === 'persistence-pending'
              ? replacementState.kind === 'reset'
                ? 'Clearing local data still needs saving. Keep this extension open and choose Retry saving.'
                : replacementState.kind === 'problem-reset' ||
                    replacementState.kind === 'problem-delete'
                  ? 'Your problem data change still needs saving. Keep this extension open and choose Retry saving.'
                  : 'Your data was restored, but it still needs saving. Keep this extension open and choose Retry saving.'
              : 'Your data is saved. Sync status still needs saving.'}
          </InlineStatus>
          {recoveryError ? (
            <InlineStatus role="alert" tone="danger">
              {recoveryError}
            </InlineStatus>
          ) : null}
          <div>
            <Button
              disabled={retryReplacement.isPending}
              onClick={() => {
                void handleRetrySaving()
              }}
              size="sm"
            >
              {retryReplacement.isPending ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : null}
              Retry saving
            </Button>
          </div>
        </div>
      ) : null}

      <BackupRestorePanel
        hasSelectedTransfer={selectedBackup !== null}
        error={backupError}
        isExporting={exportBackup.isPending}
        isRestoring={restoreBackup.isPending}
        isReplacementPending={isReplacementPending}
        isValidating={validateBackup.isPending}
        onExport={() => {
          void handleExport('backup')
        }}
        onFileSelect={(file) => {
          void handleFileSelect(file)
        }}
        onOpenRestoreDialog={() => {
          setRestoreDialogOpen(true)
        }}
        selectedFileName={selectedBackupFileName}
        summary={backupSummary}
      />
      <FeedbackToast
        dismissLabel="Dismiss data management feedback"
        label="Data management feedback"
        status={backupToast}
      />
      <GitHubSyncSettingsSection />
      <ImportContentPanel />
      <ResetLocalDataPanel
        error={resetError}
        isResetting={resetLocalData.isPending}
        isReplacementPending={isReplacementPending}
        onOpenResetDialog={() => {
          resetCommandId.current = null
          setResetError(null)
          setResetDialogOpen(true)
        }}
        status={resetStatus}
      />

      {restoreDialogOpen ? (
        <BackupConfirmationDialog
          confirmLabel="Confirm restore"
          description={
            backupSummary?.archiveAbsent
              ? 'This older backup contains no Notes archive. Restoring replaces current local data and removes all current problem notes, submission history, and saved AI notes. Export a full backup first to keep them.'
              : 'This replaces current local CogniPace data, including notes, submission history, and saved AI notes, with the selected backup.'
          }
          error={backupError}
          isPending={restoreBackup.isPending}
          onCancel={() => {
            if (!restoreBackup.isPending) {
              setRestoreDialogOpen(false)
            }
          }}
          onConfirm={() => {
            void handleRestoreConfirm()
          }}
          title="Restore full backup?"
        />
      ) : null}

      {resetDialogOpen ? (
        <BackupConfirmationDialog
          confirmLabel={
            isReplacementPending ? 'Retry saving' : 'Clear local data'
          }
          description="Are you sure? This clears notes, submission history, saved AI, practice history and schedules, problems, tracks, and settings from this extension install. Export a backup first if you might need this data later."
          error={resetError}
          savingPending={isReplacementPending}
          status={
            isReplacementPending
              ? 'Saving is incomplete. Retry saving to finish clearing local data.'
              : undefined
          }
          isPending={resetLocalData.isPending || retryReplacement.isPending}
          onSecondaryAction={() => {
            void handleExport('reset')
          }}
          onCancel={() => {
            if (
              !isReplacementPending &&
              !resetLocalData.isPending &&
              !exportBackup.isPending
            ) {
              setResetDialogOpen(false)
            }
          }}
          onConfirm={() => {
            void handleResetConfirm()
          }}
          secondaryActionLabel={
            resetStatus === 'Backup exported.'
              ? 'Backup exported'
              : 'Export backup first'
          }
          secondaryActionPending={exportBackup.isPending}
          secondaryActionTone={
            resetStatus === 'Backup exported.' ? 'success' : undefined
          }
          title="Clear local data?"
        />
      ) : null}
    </section>
  )
}

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
