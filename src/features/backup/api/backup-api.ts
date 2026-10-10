import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { sendMessage } from '@/extension/messaging'
import {
  invalidateTaggedQueries,
  type CacheInvalidationTag,
} from '@/platform/query/cache-invalidation'
import { queryKeys } from '@/platform/query/query-keys'

import type {
  BackupFile,
  BackupReplacementResult,
  BackupReplacementState,
} from './backup-contracts'

const broadBackupInvalidationTags = [
  'settings',
  'genai',
  'problems',
  'practice',
  'queue',
  'tracks',
  'app-shell',
] as const satisfies readonly CacheInvalidationTag[]

export function useExportFullBackup() {
  return useMutation({
    mutationFn: () =>
      sendMessage('backup.exportFullBackup', { surface: 'dashboard' }),
  })
}

export function useValidateFullBackup() {
  return useMutation({
    mutationFn: validateFullBackupViaRuntime,
  })
}

export function useRestoreFullBackup() {
  return useBackupReplacementAction(restoreFullBackupViaRuntime)
}

export function useResetLocalData() {
  return useBackupReplacementAction(() =>
    sendMessage('backup.resetLocalData', { surface: 'dashboard' }),
  )
}

export function usePendingBackupReplacement() {
  return useQuery({
    queryKey: queryKeys.backup.pendingReplacement(),
    queryFn: () =>
      sendMessage('backup.getPendingReplacement', { surface: 'dashboard' }),
  })
}

export function useRetryPendingBackupReplacement() {
  return useBackupReplacementAction(() =>
    sendMessage('backup.retryPendingReplacement', { surface: 'dashboard' }),
  )
}

function useBackupReplacementAction<TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<BackupReplacementResult>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      const pendingState: BackupReplacementState =
        result.status === 'persistence-pending'
          ? result
          : result.status === 'durable' && result.syncMetadataPending
            ? {
                status: 'durable-sync-metadata-pending',
                kind: result.kind,
                summary: result.summary,
              }
            : { status: 'idle' }

      queryClient.setQueryData(
        queryKeys.backup.pendingReplacement(),
        pendingState,
      )
      if (result.status === 'durable') {
        void invalidateTaggedQueries(queryClient, broadBackupInvalidationTags)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.backup.pendingReplacement(),
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.sync.all })
    },
  })
}

export function validateFullBackupViaRuntime(backup: unknown) {
  return sendMessage('backup.validateFullBackup', {
    surface: 'dashboard',
    backup,
  })
}

export function restoreFullBackupViaRuntime(backup: unknown) {
  return sendMessage('backup.restoreFullBackup', {
    surface: 'dashboard',
    backup,
  })
}

export function downloadBackupFile(
  backup: BackupFile,
  documentRef: Document = document,
) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  })
  const objectUrl = URL.createObjectURL(blob)
  const link = documentRef.createElement('a')

  link.href = objectUrl
  link.download = `cognipace-backup-${backup.exportedAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(objectUrl)
}
