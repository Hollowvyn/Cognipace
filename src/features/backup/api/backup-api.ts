import { backupRestorePreviewSchema } from './backup-contracts'
import {
  splitUtf8Text,
  transferDigest,
  type TransferHandle,
} from './backup-transfer-contracts'
export interface SelectedBackupTransfer extends TransferHandle {
  chunks: number
  digest: string
}
export interface BackupDownload {
  blob: Blob
  exportedAt: string
}
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { sendMessage } from '@/extension/messaging'
import {
  invalidateTaggedQueries,
  type CacheInvalidationTag,
} from '@/platform/query/cache-invalidation'
import { queryKeys } from '@/platform/query/query-keys'

import type {
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
    mutationFn: exportFullBackupViaRuntime,
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
  return useBackupReplacementAction((commandId: string) =>
    sendMessage('backup.resetLocalData', { surface: 'dashboard', commandId }),
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
      if (result.status === 'durable' && !result.syncMetadataPending) {
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

// A lost worker response retains the request identity for the next explicit
// retry in this dashboard document, so begin cannot silently allocate again.
let pendingExportBegin: string | undefined
let exportCapabilityNeedsRecovery = false
let pendingExportCleanupHandle: TransferHandle | undefined
let pendingImportBegin:
  | { key: string; requestId: string; session?: TransferHandle }
  | undefined
const pendingTransferCleanup = new Map<string, TransferHandle>()
async function beginExportTransfer() {
  pendingExportBegin ??= crypto.randomUUID()
  const session = await sendMessage('backup.beginTransfer', {
    surface: 'dashboard',
    direction: 'export',
    requestId: pendingExportBegin,
  })
  return session
}
export async function exportFullBackupViaRuntime(): Promise<BackupDownload> {
  let session = await beginExportTransfer()
  const chunks: string[] = []
  let failed = false
  let failure: unknown
  let download: BackupDownload | undefined
  try {
    if (session.status === 'receiving') {
      // Resume rotates the server capability before spooling can fail. Until
      // its response arrives, recover only through the same begin receipt.
      exportCapabilityNeedsRecovery = true
      session = await sendMessage('backup.beginTransfer', {
        surface: 'dashboard',
        direction: 'export',
        requestId: pendingExportBegin!,
        resume: {
          sessionId: session.sessionId,
          ownerToken: session.ownerToken,
        },
      })
      exportCapabilityNeedsRecovery = false
    }
    for (let sequence = 0; sequence < session.nextSequence; sequence++) {
      const chunk = await sendMessage('backup.readTransferChunk', {
        surface: 'dashboard',
        sessionId: session.sessionId,
        ownerToken: session.ownerToken,
        sequence,
      })
      if (chunk.sequence !== sequence)
        throw new Error('Backup chunk sequence does not match.')
      chunks.push(chunk.text)
    }
    const blob = new Blob(chunks, { type: 'application/json' })
    if ((await transferDigest(await blob.text())) !== session.digest)
      throw new Error('Backup download digest does not match.')
    download = { blob, exportedAt: new Date().toISOString() }
  } catch (error) {
    failed = true
    failure = error
  }
  try {
    if (exportCapabilityNeedsRecovery) {
      session = await beginExportTransfer()
      exportCapabilityNeedsRecovery = false
    }
    pendingExportCleanupHandle = session
    await cancelBackupTransfer(session)
  } catch (error) {
    failed = true
    failure = new Error(
      'Backup export cleanup failed. Retry export or select a file to retry cleanup.',
      { cause: error },
    )
  }
  if (failed) throw failure
  if (!download) throw new Error('Backup download is unavailable.')
  return download
}
export async function cancelBackupTransfer(handle: TransferHandle) {
  pendingTransferCleanup.set(handle.sessionId, handle)
  await sendMessage('backup.cancelTransfer', {
    surface: 'dashboard',
    sessionId: handle.sessionId,
    ownerToken: handle.ownerToken,
  })
  pendingTransferCleanup.delete(handle.sessionId)
  if (pendingExportCleanupHandle?.sessionId === handle.sessionId) {
    pendingExportBegin = undefined
    pendingExportCleanupHandle = undefined
    exportCapabilityNeedsRecovery = false
  }
  if (pendingImportBegin?.session?.sessionId === handle.sessionId)
    pendingImportBegin = undefined
}
export async function retryBackupTransferCleanup() {
  if (exportCapabilityNeedsRecovery) {
    const current = await beginExportTransfer()
    exportCapabilityNeedsRecovery = false
    pendingExportCleanupHandle = current
    await cancelBackupTransfer(current)
  }
  for (const handle of pendingTransferCleanup.values())
    await cancelBackupTransfer(handle)
}
export async function validateFullBackupViaRuntime(file: File) {
  await retryBackupTransferCleanup()
  const key = JSON.stringify([file.name, file.size, file.lastModified])
  if (pendingImportBegin && pendingImportBegin.key !== key) {
    const prior =
      pendingImportBegin.session ??
      (await sendMessage('backup.beginTransfer', {
        surface: 'dashboard',
        direction: 'import',
        requestId: pendingImportBegin.requestId,
      }))
    await cancelBackupTransfer(prior)
    pendingImportBegin = undefined
  }
  pendingImportBegin ??= { key, requestId: crypto.randomUUID() }
  const session = await sendMessage('backup.beginTransfer', {
    surface: 'dashboard',
    direction: 'import',
    requestId: pendingImportBegin.requestId,
  })
  pendingImportBegin.session = session
  let sequence = 0,
    buffer = ''
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  async function flush(text: string, final = false) {
    buffer += text
    let previous: string | undefined
    for (const part of splitUtf8Text(buffer)) {
      if (previous !== undefined) {
        await sendMessage('backup.appendTransferChunk', {
          surface: 'dashboard',
          sessionId: session.sessionId,
          ownerToken: session.ownerToken,
          sequence: sequence++,
          text: previous,
        })
      }
      previous = part
    }
    buffer = previous ?? ''
    if (final && buffer) {
      await sendMessage('backup.appendTransferChunk', {
        surface: 'dashboard',
        sessionId: session.sessionId,
        ownerToken: session.ownerToken,
        sequence: sequence++,
        text: buffer,
      })
      buffer = ''
    }
  }
  try {
    reader = file.stream().getReader()
    while (true) {
      const item = await reader.read()
      if (item.done) break
      await flush(decoder.decode(item.value, { stream: true }))
    }
    await flush(decoder.decode(), true)
    // WebCrypto SHA256 still needs a whole-file buffer; Phase 4 measures this.
    const digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
      ),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('')
    const transfer = {
      sessionId: session.sessionId,
      ownerToken: session.ownerToken,
      chunks: sequence,
      digest,
    }
    const preview = backupRestorePreviewSchema.parse(
      await sendMessage('backup.finishTransfer', {
        surface: 'dashboard',
        ...transfer,
      }),
    )
    pendingImportBegin = undefined
    return { ...preview, transfer }
  } catch (error) {
    await reader?.cancel().catch(() => {})
    try {
      await cancelBackupTransfer(session)
    } catch (cleanupError) {
      throw new Error(
        'Backup transfer cleanup failed. Select a file again to retry cleanup.',
        { cause: cleanupError },
      )
    }
    throw error
  } finally {
    reader?.releaseLock()
  }
}
export function restoreFullBackupViaRuntime(input: {
  transfer: SelectedBackupTransfer
  confirmationToken: string
}) {
  return sendMessage('backup.finishTransfer', {
    surface: 'dashboard',
    ...input.transfer,
    confirmationToken: input.confirmationToken,
  }).then((result) => {
    if ('confirmationToken' in result)
      throw new Error('Backup needs confirmation before restoring.')
    return result
  })
}
export function downloadBackupFile(
  backup: BackupDownload,
  documentRef: Document = document,
) {
  const objectUrl = URL.createObjectURL(backup.blob)
  const link = documentRef.createElement('a')
  link.href = objectUrl
  link.download = `cognipace-backup-${backup.exportedAt.slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(objectUrl)
}
