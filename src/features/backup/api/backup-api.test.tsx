import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { queryKeys } from '@/platform/query/query-keys'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  downloadBackupFile,
  useExportFullBackup,
  useResetLocalData,
  useRestoreFullBackup,
  useValidateFullBackup,
} from './backup-api'
import {
  backupSchemaVersion,
  type BackupFile,
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
    vi.mocked(sendMessage).mockResolvedValue(validSummary)
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
  })

  it('resets local data and invalidates DB-backed query families', async () => {
    vi.mocked(sendMessage).mockResolvedValue(null)
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
