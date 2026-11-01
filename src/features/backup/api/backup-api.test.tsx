import { IDBFactory } from 'fake-indexeddb'
import { createLocalIdbStore } from '@/platform/db/local-idb'
import {
  createBackupTransferService,
  transferBudgetKey,
  transferBeginKey,
} from '../server/backup-transfer-service'
import { transferDigest } from './backup-transfer-contracts'
import { File as NodeFile } from 'node:buffer'
import { emptyNotesArchive } from '@/features/notes/domain/archive-validation'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryObserver } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { queryKeys } from '@/platform/query/query-keys'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  downloadBackupFile,
  cancelBackupTransfer,
  validateFullBackupViaRuntime,
  exportFullBackupViaRuntime,
  useExportFullBackup,
  usePendingBackupReplacement,
  useResetLocalData,
  useRestoreFullBackup,
  useRetryPendingBackupReplacement,
  useValidateFullBackup,
} from './backup-api'
import {
  backupSchemaVersion,
  type BackupFile,
  type BackupReplacementResult,
  type BackupReplacementState,
  type BackupRestorePreview,
} from './backup-contracts'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

describe('backup API hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports bounded chunks through dashboard sessions and verifies download bytes', async () => {
    const text = JSON.stringify(validBackup)
    const digest = await transferDigest(text)
    vi.mocked(sendMessage).mockImplementation(async (method) => {
      await Promise.resolve()
      if (method === 'backup.beginTransfer')
        return {
          ...selectedTransfer,
          direction: 'export',
          nextSequence: 1,
          bytes: text.length,
          status: 'ready',
          sourceRevision: 1,
          digest,
        }
      if (method === 'backup.readTransferChunk') return { sequence: 0, text }
      return null
    })
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useExportFullBackup(), { wrapper })
    await act(async () => {
      const download = await result.current.mutateAsync()
      expect(await download.blob.text()).toBe(text)
    })
    expect(sendMessage).toHaveBeenCalledWith(
      'backup.beginTransfer',
      expect.objectContaining({ surface: 'dashboard', direction: 'export' }),
    )
    expect(sendMessage).toHaveBeenCalledWith('backup.cancelTransfer', {
      surface: 'dashboard',
      sessionId: selectedTransfer.sessionId,
      ownerToken: selectedTransfer.ownerToken,
    })
    expect(
      vi
        .mocked(sendMessage)
        .mock.calls.some(([method]) => method === 'backup.exportFullBackup'),
    ).toBe(false)
  })
  it('streams a selected File in bounded ordered chunks and confirms only its selected preview', async () => {
    const text = JSON.stringify({
      ...validBackup,
      source: { appVersion: '😀'.repeat(150000) },
    })
    const file = new NodeFile([text], 'backup.json', {
      type: 'application/json',
    }) as unknown as File
    const uploaded: string[] = []
    vi.mocked(sendMessage).mockImplementation(async (method, data) => {
      await Promise.resolve()
      if (method === 'backup.beginTransfer')
        return {
          ...selectedTransfer,
          direction: 'import',
          nextSequence: 0,
          bytes: 0,
          digest: null,
          status: 'receiving',
          sourceRevision: null,
        }
      if (method === 'backup.appendTransferChunk') {
        const chunk = data as { sequence: number; text: string }
        expect(chunk.sequence).toBe(uploaded.length)
        expect(new TextEncoder().encode(chunk.text).length).toBeLessThanOrEqual(
          262144,
        )
        uploaded.push(chunk.text)
        return {
          ...selectedTransfer,
          direction: 'import',
          nextSequence: uploaded.length,
          bytes: 0,
          digest: null,
          status: 'receiving',
          sourceRevision: null,
        }
      }
      if (
        method === 'backup.finishTransfer' &&
        !('confirmationToken' in (data as object))
      )
        return validSummary
      return durableReplacement
    })
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const validate = renderHook(() => useValidateFullBackup(), { wrapper })
    const restore = renderHook(() => useRestoreFullBackup(), { wrapper })
    await act(async () => {
      const preview = await validate.result.current.mutateAsync(file)
      expect(uploaded.join('')).toBe(text)
      expect(uploaded.length).toBeGreaterThan(2)
      await restore.result.current.mutateAsync({
        transfer: preview.transfer,
        confirmationToken: preview.confirmationToken,
      })
    })
    expect(sendMessage).toHaveBeenCalledWith(
      'backup.finishTransfer',
      expect.objectContaining({
        surface: 'dashboard',
        chunks: uploaded.length,
        digest: await transferDigest(text),
        confirmationToken: 'preview-token',
      }),
    )
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    })
    expect(
      vi
        .mocked(sendMessage)
        .mock.calls.some(
          ([method]) =>
            method === 'backup.validateFullBackup' ||
            method === 'backup.restoreFullBackup',
        ),
    ).toBe(false)
  })

  it('reuses its durable begin identity after a lost worker response', async () => {
    const ids: string[] = []
    vi.mocked(sendMessage).mockImplementation(async (method, data) => {
      await Promise.resolve()
      if (method === 'backup.beginTransfer') {
        ids.push((data as { requestId: string }).requestId)
        if (ids.length === 1) throw new Error('worker response lost')
        return {
          ...selectedTransfer,
          direction: 'export',
          status: 'ready',
          nextSequence: 1,
          bytes: 2,
          sourceRevision: 1,
          digest: await transferDigest('{}'),
        }
      }
      if (method === 'backup.readTransferChunk')
        return { sequence: 0, text: '{}' }
      return null
    })
    await expect(exportFullBackupViaRuntime()).rejects.toThrow(
      'worker response lost',
    )
    expect(await (await exportFullBackupViaRuntime()).blob.text()).toBe('{}')
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
  })

  it.each(['spool failure', 'lost resume response'] as const)(
    'recovers a rotated export capability after %s before cleanup and subsequent import',
    async (failure) => {
      const local = createLocalIdbStore(
        new IDBFactory(),
        'export-resume-quality',
      )
      const owner = 'actual-dashboard-document'
      let interrupted = true
      let spoolAttempts = 0
      let originalOwnerToken: string | undefined
      const service = createBackupTransferService({
        local,
        budgetBytes: failure === 'spool failure' ? 3 : 64,
        currentRevision: () => Promise.resolve(1),
        exportSnapshot: async (consume) => {
          spoolAttempts++
          if (interrupted) {
            interrupted = false
            throw new Error('worker interrupted before spool')
          }
          await consume({ value: 'x' }, 1)
        },
        preview: () => Promise.resolve(validSummary),
        restore: () => Promise.resolve(durableReplacement),
      })
      let first = true
      const exportRequests: string[] = []
      const cancelledTokens: string[] = []
      vi.mocked(sendMessage).mockImplementation(async (method, data) => {
        if (method === 'backup.beginTransfer') {
          const request = data as {
            direction: 'import' | 'export'
            requestId: string
            resume?: { sessionId: string; ownerToken: string }
          }
          if (request.direction === 'export')
            exportRequests.push(request.requestId)
          if (first) {
            first = false
            await expect(service.begin(owner, request)).rejects.toThrow(
              'worker interrupted before spool',
            )
          }
          const result = await service.begin(owner, request)
          if (originalOwnerToken === undefined)
            originalOwnerToken = result.ownerToken
          if (request.resume && failure === 'lost resume response')
            throw new Error('resume response lost')
          return result
        }
        const handle = data as unknown as {
          sessionId: string
          ownerToken: string
          sequence: number
          text: string
          chunks: number
          digest: string
        }
        if (method === 'backup.cancelTransfer') {
          cancelledTokens.push(handle.ownerToken)
          return service.cancel(owner, handle)
        }
        if (method === 'backup.appendTransferChunk')
          return service.append(owner, handle, handle.sequence, handle.text)
        if (method === 'backup.finishTransfer')
          return service.finish(owner, handle, handle)
        if (method === 'backup.readTransferChunk')
          return service.read(owner, handle, handle.sequence)
        throw new Error('Unexpected transfer method')
      })
      try {
        await expect(exportFullBackupViaRuntime()).rejects.toThrow(
          failure === 'spool failure' ? /budget/ : /resume response lost/,
        )
        const preview = await validateFullBackupViaRuntime(
          new NodeFile(['{}'], 'after-failed-export.json') as unknown as File,
        )
        expect(preview.transfer.chunks).toBe(1)
        expect(new Set(exportRequests).size).toBe(1)
        expect(exportRequests.length).toBeGreaterThanOrEqual(3)
        expect(cancelledTokens).toHaveLength(1)
        expect(cancelledTokens[0]).not.toBe(originalOwnerToken)
        expect(spoolAttempts).toBe(2)
        expect(await local.readRecord(transferBudgetKey)).toEqual({
          bytes: 2,
          sessions: 1,
        })
        await cancelBackupTransfer(preview.transfer)
      } finally {
        // Keep a failing RED run isolated: recover the current capability using
        // the same actual owner/request receipt, never retry the bulk spool.
        const requestId = exportRequests[0]!
        if (
          (await local.readRecord(transferBeginKey(owner, requestId))) !==
          undefined
        ) {
          const current = await service.begin(owner, {
            direction: 'export',
            requestId,
          })
          await cancelBackupTransfer(current)
        }
      }
    },
  )

  it('retains failed import cleanup and refuses a new spool until cancellation is acknowledged', async () => {
    const begins: string[] = []
    let cancelFails = true
    vi.mocked(sendMessage).mockImplementation((method, data) => {
      if (method === 'backup.beginTransfer') {
        begins.push((data as { requestId: string }).requestId)
        return Promise.resolve({
          ...selectedTransfer,
          direction: 'import',
          status: 'receiving',
          nextSequence: 0,
          bytes: 0,
          sourceRevision: null,
          digest: null,
        })
      }
      if (method === 'backup.appendTransferChunk')
        return Promise.reject(new Error('append response lost'))
      if (method === 'backup.cancelTransfer')
        return cancelFails
          ? Promise.reject(new Error('cancel not delivered'))
          : Promise.resolve(null)
      return Promise.resolve(null)
    })
    const file = new NodeFile(['{}'], 'failed.json') as unknown as File
    await expect(validateFullBackupViaRuntime(file)).rejects.toThrow(/cleanup/i)
    await expect(validateFullBackupViaRuntime(file)).rejects.toThrow(
      /cancel|cleanup/i,
    )
    expect(begins).toHaveLength(1)
    cancelFails = false
    await expect(validateFullBackupViaRuntime(file)).rejects.toThrow(
      'append response lost',
    )
    expect(begins).toHaveLength(2)
    expect(
      vi
        .mocked(sendMessage)
        .mock.calls.filter(([method]) => method === 'backup.cancelTransfer')
        .length,
    ).toBeGreaterThanOrEqual(3)
  })

  it('flushes the streaming decoder at EOF and cancels malformed UTF8 without previewing', async () => {
    vi.mocked(sendMessage).mockImplementation((method) =>
      Promise.resolve(
        method === 'backup.beginTransfer'
          ? {
              ...selectedTransfer,
              direction: 'import',
              status: 'receiving',
              nextSequence: 0,
              bytes: 0,
              digest: null,
              sourceRevision: null,
            }
          : null,
      ),
    )
    const file = new NodeFile(
      [new Uint8Array([0xf0, 0x9f])],
      'truncated.json',
    ) as unknown as File
    await expect(validateFullBackupViaRuntime(file)).rejects.toThrow()
    expect(sendMessage).toHaveBeenCalledWith(
      'backup.cancelTransfer',
      expect.objectContaining({ sessionId: selectedTransfer.sessionId }),
    )
    expect(
      vi
        .mocked(sendMessage)
        .mock.calls.some(([method]) => method === 'backup.finishTransfer'),
    ).toBe(false)
  })

  it('resets local data and invalidates DB-backed query families', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      ...durableReplacement,
      kind: 'reset',
      summary: null,
    })
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useResetLocalData(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('clear-command')
    })

    expect(sendMessage).toHaveBeenCalledWith('backup.resetLocalData', {
      commandId: 'clear-command',
      surface: 'dashboard',
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.settings.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.problems.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.appShell.all,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.backup.pendingReplacement(),
    })
  })

  it('reads pending replacement status through a read-only dashboard query', async () => {
    vi.mocked(sendMessage).mockResolvedValue(pendingReplacement)
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => usePendingBackupReplacement(), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(queryKeys.backup.all).toEqual(['backup'])
    expect(queryKeys.backup.pendingReplacement()).toEqual([
      'backup',
      'pending-replacement',
    ])
    expect(result.current.data).toEqual(pendingReplacement)
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith(
      'backup.getPendingReplacement',
      { surface: 'dashboard' },
    )
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it('refreshes mounted Sync status after Gist metadata recovery completes', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      ...durableReplacement,
      kind: 'gist-pull',
    })
    const { queryClient, wrapper } = createQueryTestHarness()
    const syncKey = queryKeys.sync.status('dashboard')
    queryClient.setQueryData(syncKey, { needsRetry: true })
    const readSyncStatus = vi.fn().mockResolvedValue({ needsRetry: false })
    const observer = new QueryObserver(queryClient, {
      queryKey: syncKey,
      queryFn: readSyncStatus,
      staleTime: Infinity,
    })
    const unsubscribe = observer.subscribe(() => {})
    const retry = renderHook(() => useRetryPendingBackupReplacement(), {
      wrapper,
    })

    try {
      expect(readSyncStatus).not.toHaveBeenCalled()
      await act(async () => {
        await retry.result.current.mutateAsync()
      })
      await waitFor(() =>
        expect(observer.getCurrentResult().data).toEqual({ needsRetry: false }),
      )
      expect(readSyncStatus).toHaveBeenCalledTimes(1)
      expect(sendMessage).toHaveBeenCalledExactlyOnceWith(
        'backup.retryPendingReplacement',
        { surface: 'dashboard' },
      )
    } finally {
      retry.unmount()
      unsubscribe()
      queryClient.clear()
    }
  })

  it.each(['restore', 'reset'] as const)(
    '%s keeps committed data pending without broad invalidation',
    async (kind) => {
      const replacement = {
        ...pendingReplacement,
        kind,
        summary: kind === 'restore' ? validSummary : null,
      } satisfies BackupReplacementResult
      vi.mocked(sendMessage).mockResolvedValue(replacement)
      const { queryClient, wrapper } = createQueryTestHarness()
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      const restore = renderHook(() => useRestoreFullBackup(), { wrapper })
      const reset = renderHook(() => useResetLocalData(), { wrapper })

      await act(async () => {
        if (kind === 'restore') {
          await restore.result.current.mutateAsync({
            transfer: selectedTransfer,
            confirmationToken: 'preview-token',
          })
        } else {
          await reset.result.current.mutateAsync('clear-command')
        }
      })

      expect(invalidateQueries).toHaveBeenCalledTimes(2)
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['backup', 'pending-replacement'],
      })
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.sync.all,
      })
      expect(
        queryClient.getQueryData(queryKeys.backup.pendingReplacement()),
      ).toEqual(replacement)
    },
  )

  it.each(['restore', 'reset'] as const)(
    '%s retains metadata-pending UI without broad invalidation',
    async (kind) => {
      const replacement = {
        ...durableReplacement,
        kind,
        summary: kind === 'restore' ? validSummary : null,
        syncMetadataPending: true,
      } satisfies BackupReplacementResult
      vi.mocked(sendMessage).mockResolvedValue(replacement)
      const { queryClient, wrapper } = createQueryTestHarness()
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      const restore = renderHook(() => useRestoreFullBackup(), { wrapper })
      const reset = renderHook(() => useResetLocalData(), { wrapper })

      await act(async () => {
        if (kind === 'restore') {
          await restore.result.current.mutateAsync({
            transfer: selectedTransfer,
            confirmationToken: 'preview-token',
          })
        } else {
          await reset.result.current.mutateAsync('clear-command')
        }
      })

      expect(invalidateQueries).not.toHaveBeenCalledWith({
        queryKey: queryKeys.settings.all,
      })
      expect(invalidateQueries).not.toHaveBeenCalledWith({
        queryKey: queryKeys.problems.all,
      })
      expect(invalidateQueries).not.toHaveBeenCalledWith({
        queryKey: queryKeys.appShell.all,
      })
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.backup.pendingReplacement(),
      })
      expect(invalidateQueries).toHaveBeenCalledTimes(2)
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.sync.all,
      })
      expect(
        queryClient.getQueryData(queryKeys.backup.pendingReplacement()),
      ).toEqual({
        status: 'durable-sync-metadata-pending',
        kind,
        summary: replacement.summary,
      })
    },
  )

  it.each([
    {
      replacement: pendingReplacement,
      pendingState: pendingReplacement,
      invalidatesData: false,
    },
    {
      replacement: { status: 'no-pending' },
      pendingState: { status: 'idle' },
      invalidatesData: false,
    },
    {
      replacement: durableReplacement,
      pendingState: { status: 'idle' },
      invalidatesData: true,
    },
    {
      replacement: { ...durableReplacement, syncMetadataPending: true },
      pendingState: {
        status: 'durable-sync-metadata-pending',
        kind: 'restore',
        summary: validSummary,
      },
      invalidatesData: false,
    },
    {
      replacement: {
        ...durableReplacement,
        kind: 'reset',
        summary: null,
        syncMetadataPending: true,
      },
      pendingState: {
        status: 'durable-sync-metadata-pending',
        kind: 'reset',
        summary: null,
      },
      invalidatesData: false,
    },
  ] satisfies {
    replacement: BackupReplacementResult
    pendingState: BackupReplacementState
    invalidatesData: boolean
  }[])(
    'retries only pending work for $replacement.status',
    async (testCase) => {
      vi.mocked(sendMessage).mockResolvedValue(testCase.replacement)
      const { queryClient, wrapper } = createQueryTestHarness()
      queryClient.setQueryData(
        queryKeys.backup.pendingReplacement(),
        pendingReplacement,
      )
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderHook(() => useRetryPendingBackupReplacement(), {
        wrapper,
      })

      await act(async () => {
        await result.current.mutateAsync()
      })

      expect(sendMessage).toHaveBeenCalledExactlyOnceWith(
        'backup.retryPendingReplacement',
        { surface: 'dashboard' },
      )
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.backup.pendingReplacement(),
      })
      expect(
        queryClient.getQueryData(queryKeys.backup.pendingReplacement()),
      ).toEqual(testCase.pendingState)
      if (testCase.invalidatesData) {
        expect(invalidateQueries).toHaveBeenCalledWith({
          queryKey: queryKeys.settings.all,
        })
        expect(invalidateQueries).toHaveBeenCalledWith({
          queryKey: queryKeys.problems.all,
        })
        expect(invalidateQueries).toHaveBeenCalledWith({
          queryKey: queryKeys.appShell.all,
        })
      } else {
        expect(invalidateQueries).toHaveBeenCalledTimes(2)
        expect(invalidateQueries).toHaveBeenCalledWith({
          queryKey: queryKeys.sync.all,
        })
      }
    },
  )

  it.each(['restore', 'reset', 'retry'] as const)(
    '%s refreshes recovery and Sync status on failed settlement',
    async (action) => {
      vi.mocked(sendMessage).mockRejectedValue(
        new Error('Storage unavailable.'),
      )
      const { queryClient, wrapper } = createQueryTestHarness()
      queryClient.setQueryData(
        queryKeys.backup.pendingReplacement(),
        pendingReplacement,
      )
      const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
      const restore = renderHook(() => useRestoreFullBackup(), { wrapper })
      const reset = renderHook(() => useResetLocalData(), { wrapper })
      const retry = renderHook(() => useRetryPendingBackupReplacement(), {
        wrapper,
      })

      await act(async () => {
        const operation =
          action === 'restore'
            ? restore.result.current.mutateAsync({
                transfer: selectedTransfer,
                confirmationToken: 'preview-token',
              })
            : action === 'reset'
              ? reset.result.current.mutateAsync('clear-command')
              : retry.result.current.mutateAsync()
        await expect(operation).rejects.toThrow('Storage unavailable.')
      })

      expect(invalidateQueries).toHaveBeenCalledTimes(2)
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.backup.pendingReplacement(),
      })
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.sync.all,
      })
      expect(
        queryClient.getQueryData(queryKeys.backup.pendingReplacement()),
      ).toEqual(pendingReplacement)
    },
  )

  it('keeps response-seeded pending state when its settlement status read fails', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce({ status: 'idle' })
      .mockResolvedValueOnce(pendingReplacement)
      .mockRejectedValueOnce(new Error('Status unavailable.'))
    const { wrapper } = createQueryTestHarness()
    const pending = renderHook(() => usePendingBackupReplacement(), { wrapper })
    const restore = renderHook(() => useRestoreFullBackup(), { wrapper })
    await waitFor(() => expect(pending.result.current.isSuccess).toBe(true))

    await act(async () => {
      await restore.result.current.mutateAsync({
        transfer: selectedTransfer,
        confirmationToken: 'preview-token',
      })
    })

    await waitFor(() => expect(pending.result.current.isError).toBe(true))
    expect(pending.result.current.data).toEqual(pendingReplacement)
  })

  it('uses successful settlement status reads to clear stale response-seeded pending state', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce({ status: 'idle' })
      .mockResolvedValueOnce(pendingReplacement)
      .mockResolvedValueOnce({ status: 'idle' })
    const { wrapper } = createQueryTestHarness()
    const pending = renderHook(() => usePendingBackupReplacement(), { wrapper })
    const restore = renderHook(() => useRestoreFullBackup(), { wrapper })
    await waitFor(() => expect(pending.result.current.isSuccess).toBe(true))

    await act(async () => {
      await restore.result.current.mutateAsync({
        transfer: selectedTransfer,
        confirmationToken: 'preview-token',
      })
    })

    await waitFor(() =>
      expect(pending.result.current.data).toEqual({ status: 'idle' }),
    )
    expect(sendMessage).toHaveBeenCalledTimes(3)
  })

  it('downloads formatted backup JSON through an anchor without downloads permission', () => {
    const revokeObjectUrl = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined)
    const createObjectUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:backup')
    const click = vi.fn()
    const anchor = {
      click,
      download: '',
      href: '',
    } as unknown as HTMLAnchorElement
    const createElement = vi.fn(() => anchor)
    const documentRef = {
      createElement,
    } as unknown as Document

    downloadBackupFile(
      {
        blob: new Blob([JSON.stringify(validBackup)]),
        exportedAt: validBackup.exportedAt,
      },
      documentRef,
    )

    expect(createElement).toHaveBeenCalledWith('a')
    expect(anchor.download).toBe('cognipace-backup-2026-05-25.json')
    expect(anchor.href).toBe('blob:backup')
    expect(click).toHaveBeenCalled()
    expect(createObjectUrl).toHaveBeenCalled()
    expect(createObjectUrl.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:backup')
  })
})

const validSummary = {
  schemaVersion: backupSchemaVersion,
  confirmationToken: 'preview-token',
  sourceSchemaVersion: 7,
  archiveAbsent: false,
  removesCurrentArchive: false,
  exportedAt: '2026-05-25T12:00:00.000Z',
  source: {},
  counts: {
    problems: 0,
    topics: 0,
    topicAliases: 0,
    topicRelations: 0,
    companies: 0,
    problemTopics: 0,
    problemCompanies: 0,
    problemPractice: 0,
    fsrsCards: 0,
    reviewAttempts: 0,
    tracks: 0,
    trackGroups: 0,
    trackMemberships: 0,
    trackProgress: 0,
    trackSession: 0,
    settings: 0,
    notes: 0,
    submissions: 0,
    assessments: 0,
    savedAiInclusions: 0,
    payloadBytes: 0,
  },
} satisfies BackupRestorePreview

const pendingReplacement = {
  status: 'persistence-pending',
  kind: 'restore',
  summary: validSummary,
} as const satisfies BackupReplacementState

const durableReplacement = {
  status: 'durable',
  kind: 'restore',
  summary: validSummary,
  syncMetadataPending: false,
} as const satisfies BackupReplacementResult

const validBackup = {
  schemaVersion: backupSchemaVersion,
  notesArchive: emptyNotesArchive(),
  app: 'cognipace',
  exportedAt: '2026-05-25T12:00:00.000Z',
  source: {},
  data: {
    problems: [],
    topics: [],
    topicAliases: [],
    topicRelations: [],
    companies: [],
    problemTopics: [],
    problemCompanies: [],
    practice: {
      problemPractice: [],
      fsrsCards: [],
      reviewAttempts: [],
      schedulerProfiles: [],
      reviewEvidence: [],
      generations: [],
      commandReceipts: [],
    },
    tracks: {
      tracks: [],
      groups: [],
      memberships: [],
      progress: [],
      session: [],
    },
    settings: [],
  },
} satisfies BackupFile

const selectedTransfer = {
  sessionId: 'b4b22db1-74f2-443e-ae5c-2d41d1d28127',
  ownerToken: '976ba5f6-7e65-40db-83f9-8895d9ca4dcc',
  chunks: 1,
  digest: '0'.repeat(64),
}
