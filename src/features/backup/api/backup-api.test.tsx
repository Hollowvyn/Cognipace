import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryObserver } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { queryKeys } from '@/platform/query/query-keys'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  downloadBackupFile,
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
  type BackupSummary,
} from './backup-contracts'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

describe('backup API hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports through the dashboard runtime surface', async () => {
    vi.mocked(sendMessage).mockResolvedValue(validBackup)
    const { wrapper } = createQueryTestHarness()
    const { result } = renderHook(() => useExportFullBackup(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(sendMessage).toHaveBeenCalledWith('backup.exportFullBackup', {
      surface: 'dashboard',
    })
  })

  it('validates and restores selected backup payloads', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(validSummary)
      .mockResolvedValueOnce(durableReplacement)
    const { queryClient, wrapper } = createQueryTestHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    const validate = renderHook(() => useValidateFullBackup(), { wrapper })
    const restore = renderHook(() => useRestoreFullBackup(), { wrapper })

    await act(async () => {
      await validate.result.current.mutateAsync(validBackup)
      await restore.result.current.mutateAsync(validBackup)
    })

    expect(sendMessage).toHaveBeenCalledWith('backup.validateFullBackup', {
      surface: 'dashboard',
      backup: validBackup,
    })
    expect(sendMessage).toHaveBeenCalledWith('backup.restoreFullBackup', {
      surface: 'dashboard',
      backup: validBackup,
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
      await result.current.mutateAsync()
    })

    expect(sendMessage).toHaveBeenCalledWith('backup.resetLocalData', {
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
          await restore.result.current.mutateAsync(validBackup)
        } else {
          await reset.result.current.mutateAsync()
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
    '%s broad-invalidates durable data while retaining pending sync metadata',
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
          await restore.result.current.mutateAsync(validBackup)
        } else {
          await reset.result.current.mutateAsync()
        }
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
      invalidatesData: true,
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
            ? restore.result.current.mutateAsync(validBackup)
            : action === 'reset'
              ? reset.result.current.mutateAsync()
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
      await restore.result.current.mutateAsync(validBackup)
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
      await restore.result.current.mutateAsync(validBackup)
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

    downloadBackupFile(validBackup, documentRef)

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
  },
} satisfies BackupSummary

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
