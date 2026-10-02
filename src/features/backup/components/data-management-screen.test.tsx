import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  backupSchemaVersion,
  type BackupFile,
  type BackupSummary,
} from '../api/backup-contracts'
import { BackupRestorePanel } from './backup-restore-panel'
import { DataManagementScreen } from './data-management-screen'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

vi.mock('@/features/sync', () => ({
  GitHubSyncSettingsSection: () => (
    <section aria-label="GitHub sync settings">GitHub Sync</section>
  ),
}))

vi.mock('./backup-restore-panel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./backup-restore-panel')>()

  return {
    ...actual,
    BackupRestorePanel: vi.fn(actual.BackupRestorePanel),
  }
})

describe('DataManagementScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    )
  })

  it('exports a full backup and shows completion feedback', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValue(validBackup)
    const { wrapper } = createQueryTestHarness()

    render(<DataManagementScreen />, { wrapper })
    const backupPanel = screen.getByRole('region', { name: 'Export backup' })

    await user.click(screen.getByRole('button', { name: 'Export backup' }))

    expect(sendMessage).toHaveBeenCalledWith('backup.exportFullBackup', {
      surface: 'dashboard',
    })
    expect(
      await screen.findByRole('status', { name: 'Data management feedback' }),
    ).toHaveTextContent('Backup exported.')
    expect(within(backupPanel).queryByText('Backup exported.')).toBeNull()
  })

  it('renders GitHub sync settings before import content and reset', () => {
    const { wrapper } = createQueryTestHarness()

    render(<DataManagementScreen />, { wrapper })

    const backup = screen.getByRole('region', { name: 'Export backup' })
    const sync = screen.getByRole('region', { name: 'GitHub sync settings' })
    const importContent = screen.getByRole('region', {
      name: 'Import content',
    })
    const reset = screen.getByRole('region', { name: 'Clear local data' })

    expect(
      backup.compareDocumentPosition(sync) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      sync.compareDocumentPosition(importContent) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      importContent.compareDocumentPosition(reset) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      screen.getByText('Back up, restore, import, or clear local study data.'),
    ).toBeVisible()
  })

  it('validates an imported backup, shows the selected file, and keeps restore calm', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValue(validSummary)
    const { wrapper } = createQueryTestHarness()

    render(<DataManagementScreen />, { wrapper })

    expect(screen.queryByText('No file chosen')).not.toBeInTheDocument()
    expect(screen.getByText('No backup file selected')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Restore full backup' }),
    ).not.toBeInTheDocument()

    await user.upload(
      screen.getByLabelText('Backup file'),
      createBackupFile(validBackup),
    )

    expect(sendMessage).toHaveBeenCalledWith('backup.validateFullBackup', {
      surface: 'dashboard',
      backup: validBackup,
    })
    expect(
      await screen.findByRole('status', { name: 'Data management feedback' }),
    ).toHaveTextContent('Backup ready to restore.')
    expect(screen.getByText('backup.json')).toBeVisible()
    expect(
      screen.getByText(`Schema version: ${backupSchemaVersion}`),
    ).toBeVisible()
    expect(
      screen.getByText(
        `Exported: ${formatExpectedDateTime(validSummary.exportedAt)}`,
      ),
    ).toBeVisible()
    expect(screen.getByText('App version: 0.0.0')).toBeVisible()
    expect(screen.getByText('Problems: 1')).toBeVisible()
    expect(screen.getByText('Tracks: 1')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Restore full backup' }),
    ).not.toHaveClass('bg-destructive')
  })

  it('shows an alert for invalid JSON without calling runtime validation', async () => {
    const user = userEvent.setup()
    const { wrapper } = createQueryTestHarness()

    render(<DataManagementScreen />, { wrapper })

    await user.upload(
      screen.getByLabelText('Backup file'),
      new File(['not json'], 'backup.json', { type: 'application/json' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid JSON backup file.',
    )
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('restores the latest selected backup when an earlier file read finishes late', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValue(validSummary)
    const { wrapper } = createQueryTestHarness()
    const backupA = { ...validBackup, exportedAt: '2026-05-01T12:00:00.000Z' }
    const backupB = { ...validBackup, exportedAt: '2026-05-02T12:00:00.000Z' }
    const firstRead = createDeferred<string>()
    const fileA = createBackupFile(backupA, 'A.json')
    Object.defineProperty(fileA, 'text', { value: () => firstRead.promise })

    render(<DataManagementScreen />, { wrapper })

    await user.upload(screen.getByLabelText('Backup file'), fileA)
    expect(screen.getByLabelText('Backup file')).toBeEnabled()
    await user.upload(
      screen.getByLabelText('Backup file'),
      createBackupFile(backupB, 'B.json'),
    )
    expect(
      await screen.findByRole('status', { name: 'Data management feedback' }),
    ).toHaveTextContent('Backup ready to restore.')

    await act(() => {
      firstRead.resolve(JSON.stringify(backupA))
      return firstRead.promise
    })

    expect(screen.getByText('B.json')).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Restore full backup' }),
    )
    await user.click(screen.getByRole('button', { name: 'Confirm restore' }))

    expect(sendMessage).toHaveBeenCalledWith('backup.restoreFullBackup', {
      surface: 'dashboard',
      backup: backupB,
    })
  })

  it('keeps a newer backup ready when an earlier file read rejects', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValue(validSummary)
    const { wrapper } = createQueryTestHarness()
    const firstRead = createDeferred<string>()
    const fileA = createBackupFile(validBackup, 'A.json')
    Object.defineProperty(fileA, 'text', { value: () => firstRead.promise })

    render(<DataManagementScreen />, { wrapper })

    await user.upload(screen.getByLabelText('Backup file'), fileA)
    await user.upload(
      screen.getByLabelText('Backup file'),
      createBackupFile(validBackup, 'B.json'),
    )
    expect(
      await screen.findByRole('status', { name: 'Data management feedback' }),
    ).toHaveTextContent('Backup ready to restore.')

    await act(() => {
      firstRead.reject(new Error('Failed to read A.json.'))
      return firstRead.promise.catch(() => undefined)
    })

    expect(screen.getByText('B.json')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: 'Data management feedback' }),
    ).toHaveTextContent('Backup ready to restore.')
    expect(
      screen.getByRole('button', { name: 'Restore full backup' }),
    ).toBeEnabled()
  })

  it.each(['succeeds', 'rejects'] as const)(
    'keeps the latest backup when an earlier validation %s late',
    async (outcome) => {
      const user = userEvent.setup()
      const firstValidation = createDeferred<BackupSummary>()
      const backupA = {
        ...validBackup,
        exportedAt: '2026-05-01T12:00:00.000Z',
      }
      const backupB = {
        ...validBackup,
        exportedAt: '2026-05-02T12:00:00.000Z',
      }
      const summaryB = { ...validSummary, exportedAt: backupB.exportedAt }
      vi.mocked(sendMessage).mockImplementation((method, payload) => {
        if (method === 'backup.validateFullBackup') {
          const { backup } = payload as { backup: BackupFile }
          return backup.exportedAt === backupA.exportedAt
            ? firstValidation.promise
            : Promise.resolve(summaryB)
        }
        if (method === 'backup.restoreFullBackup') {
          return Promise.resolve(summaryB)
        }
        return Promise.reject(new Error(`Unexpected method ${method}`))
      })
      const { wrapper } = createQueryTestHarness()

      render(<DataManagementScreen />, { wrapper })

      await user.upload(
        screen.getByLabelText('Backup file'),
        createBackupFile(backupA, 'A.json'),
      )
      await waitFor(() => {
        expect(screen.getByLabelText('Backup file')).toBeDisabled()
      })

      // Exercise the selection callback while the real input is disabled.
      act(() => {
        const props = vi.mocked(BackupRestorePanel).mock.calls.at(-1)?.[0]
        props?.onFileSelect(createBackupFile(backupB, 'B.json'))
      })
      expect(
        await screen.findByRole('status', { name: 'Data management feedback' }),
      ).toHaveTextContent('Backup ready to restore.')

      await act(() => {
        if (outcome === 'succeeds') {
          firstValidation.resolve({
            ...validSummary,
            exportedAt: backupA.exportedAt,
          })
        } else {
          firstValidation.reject(new Error('A.json validation failed.'))
        }
        return firstValidation.promise.catch(() => undefined)
      })

      expect(screen.getByText('B.json')).toBeVisible()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(
        screen.getByText(
          `Exported: ${formatExpectedDateTime(summaryB.exportedAt)}`,
        ),
      ).toBeVisible()
      await user.click(
        screen.getByRole('button', { name: 'Restore full backup' }),
      )
      await user.click(screen.getByRole('button', { name: 'Confirm restore' }))

      expect(sendMessage).toHaveBeenCalledWith('backup.restoreFullBackup', {
        surface: 'dashboard',
        backup: backupB,
      })
    },
  )

  it('requires confirmation before restoring a full backup', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'backup.validateFullBackup') {
        return Promise.resolve(validSummary)
      }

      if (method === 'backup.restoreFullBackup') {
        return Promise.resolve(validSummary)
      }

      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()

    render(<DataManagementScreen />, { wrapper })

    await user.upload(
      screen.getByLabelText('Backup file'),
      createBackupFile(validBackup),
    )
    await screen.findByRole('status', { name: 'Data management feedback' })
    await user.click(
      screen.getByRole('button', { name: 'Restore full backup' }),
    )

    expect(
      screen.getByRole('dialog', { name: 'Restore full backup?' }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Confirm restore' }))

    expect(sendMessage).toHaveBeenCalledWith('backup.restoreFullBackup', {
      surface: 'dashboard',
      backup: validBackup,
    })
    expect(
      await screen.findByRole('status', { name: 'Data management feedback' }),
    ).toHaveTextContent('Backup restored.')
    expect(screen.getByText('No backup file selected')).toBeVisible()
    expect(
      screen.queryByText(`Schema version: ${backupSchemaVersion}`),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Restore full backup' }),
    ).not.toBeInTheDocument()
  })

  it('offers a backup export inside the clear confirmation dialog', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'backup.exportFullBackup') {
        return Promise.resolve(validBackup)
      }

      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()

    render(<DataManagementScreen />, { wrapper })

    expect(
      screen.queryByRole('button', { name: 'Export current backup' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear local data' }))

    const dialog = screen.getByRole('dialog', { name: 'Clear local data?' })
    expect(dialog).toHaveTextContent('Are you sure?')

    await user.click(
      within(dialog).getByRole('button', { name: 'Export backup first' }),
    )

    expect(sendMessage).toHaveBeenCalledWith('backup.exportFullBackup', {
      surface: 'dashboard',
    })
    const exportedButton = await within(dialog).findByRole('button', {
      name: 'Backup exported',
    })
    expect(exportedButton).toHaveAttribute('data-cp-tone', 'success')
    expect(
      within(dialog).queryByText('Backup exported.'),
    ).not.toBeInTheDocument()
  })

  it('cancels and confirms clearing local data through a confirmation dialog', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValue(null)
    const { wrapper } = createQueryTestHarness()

    render(<DataManagementScreen />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Clear local data' }))

    expect(
      screen.getByRole('dialog', { name: 'Clear local data?' }),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Clear local data?' }),
      ).not.toBeInTheDocument()
    })
    expect(sendMessage).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Clear local data' }))
    await user.click(
      within(
        screen.getByRole('dialog', { name: 'Clear local data?' }),
      ).getByRole('button', { name: 'Clear local data' }),
    )

    expect(sendMessage).toHaveBeenCalledWith('backup.resetLocalData', {
      surface: 'dashboard',
    })
  })

  it('closes clear confirmation when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValue(null)
    const { wrapper } = createQueryTestHarness()

    render(<DataManagementScreen />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Clear local data' }))

    const dialog = screen.getByRole('dialog', { name: 'Clear local data?' })
    const backdrop = dialog.parentElement

    expect(backdrop).not.toBeNull()
    await user.click(backdrop as HTMLElement)

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Clear local data?' }),
      ).not.toBeInTheDocument()
    })
    expect(sendMessage).not.toHaveBeenCalled()
  })
})

function createBackupFile(backup: BackupFile, fileName = 'backup.json') {
  return new File([JSON.stringify(backup)], fileName, {
    type: 'application/json',
  })
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

// ⚡ Bolt: Cache DateTimeFormat at module level to prevent excessive
// ~4.9s/10k instantiations cost
const expectedDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatExpectedDateTime(value: string) {
  return expectedDateTimeFormatter.format(new Date(value))
}

const validSummary = {
  schemaVersion: backupSchemaVersion,
  exportedAt: '2026-05-25T12:00:00.000Z',
  source: {
    appVersion: '0.0.0',
  },
  counts: {
    problems: 1,
    topics: 1,
    topicAliases: 0,
    topicRelations: 0,
    companies: 1,
    problemTopics: 1,
    problemCompanies: 1,
    problemPractice: 1,
    fsrsCards: 1,
    reviewAttempts: 1,
    tracks: 1,
    trackGroups: 1,
    trackMemberships: 1,
    trackProgress: 1,
    trackSession: 1,
    settings: 1,
  },
} satisfies BackupSummary

const validBackup = {
  schemaVersion: backupSchemaVersion,
  app: 'cognipace',
  exportedAt: '2026-05-25T12:00:00.000Z',
  source: {},
  data: {
    problems: [
      {
        slug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
        createdAt: '2026-05-25T12:00:00.000Z',
        updatedAt: '2026-05-25T12:00:00.000Z',
      },
    ],
    topics: [
      {
        id: 'array',
        label: 'Array',
        createdAt: '2026-05-25T12:00:00.000Z',
        updatedAt: '2026-05-25T12:00:00.000Z',
      },
    ],
    topicAliases: [],
    topicRelations: [],
    companies: [{ id: 'meta', label: 'Meta' }],
    problemTopics: [{ problemSlug: 'two-sum', topicId: 'array' }],
    problemCompanies: [{ problemSlug: 'two-sum', companyId: 'meta' }],
    practice: {
      problemPractice: [
        {
          problemSlug: 'two-sum',
          status: 'review',
          firstSeenAt: '2026-05-25T12:00:00.000Z',
          lastSeenAt: '2026-05-25T12:00:00.000Z',
          lastReviewedAt: '2026-05-25T12:00:00.000Z',
          lastRating: 'good',
          lastElapsedSeconds: 600,
          bestElapsedSeconds: 600,
          interviewPattern: 'hash-map',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(n)',
          languages: 'TypeScript',
          notes: 'review note',
          solvedCount: 1,
          attemptCount: 1,
          isSuspended: false,
          createdAt: '2026-05-25T12:00:00.000Z',
          updatedAt: '2026-05-25T12:00:00.000Z',
        },
      ],
      fsrsCards: [
        {
          id: 'card-1',
          problemSlug: 'two-sum',
          cardKind: 'default',
          dueAt: '2026-05-26T12:00:00.000Z',
          stability: 2.5,
          difficulty: 4.5,
          elapsedDays: 0,
          scheduledDays: 1,
          learningSteps: 0,
          reps: 1,
          lapses: 0,
          state: 'review',
          lastReviewAt: '2026-05-25T12:00:00.000Z',
          createdAt: '2026-05-25T12:00:00.000Z',
          updatedAt: '2026-05-25T12:00:00.000Z',
        },
      ],
      reviewAttempts: [
        {
          id: 'attempt-1',
          problemSlug: 'two-sum',
          cardId: 'card-1',
          rating: 'good',
          reviewMode: 'manual',
          reviewedAt: '2026-05-25T12:00:00.000Z',
          elapsedSeconds: 600,
          isCorrect: true,
          interviewPattern: 'hash-map',
          timeComplexity: 'O(n)',
          spaceComplexity: 'O(n)',
          languages: 'TypeScript',
          notes: 'review note',
          fsrsReviewLog: null,
          createdAt: '2026-05-25T12:00:00.000Z',
          updatedAt: '2026-05-25T12:00:00.000Z',
        },
      ],
    },
    tracks: {
      tracks: [
        {
          id: 'custom-track',
          slug: 'custom-track',
          title: 'Custom Track',
          description: 'A local track',
          dueAt: null,
          createdAt: '2026-05-25T12:00:00.000Z',
          updatedAt: '2026-05-25T12:00:00.000Z',
        },
      ],
      groups: [
        {
          id: 'custom-track:arrays',
          trackId: 'custom-track',
          title: 'Arrays',
          position: 1,
          createdAt: '2026-05-25T12:00:00.000Z',
          updatedAt: '2026-05-25T12:00:00.000Z',
        },
      ],
      memberships: [
        {
          trackGroupId: 'custom-track:arrays',
          problemSlug: 'two-sum',
          position: 1,
        },
      ],
      progress: [
        {
          trackId: 'custom-track',
          problemSlug: 'two-sum',
          reviewAttemptId: 'attempt-1',
          completedAt: '2026-05-25T12:00:00.000Z',
          completedRating: 'good',
          createdAt: '2026-05-25T12:00:00.000Z',
          updatedAt: '2026-05-25T12:00:00.000Z',
        },
      ],
      session: [
        {
          id: 'active',
          activeTrackId: 'custom-track',
          activeGroupId: 'custom-track:arrays',
          startedAt: '2026-05-25T12:00:00.000Z',
          updatedAt: '2026-05-25T12:00:00.000Z',
        },
      ],
    },
    settings: [
      {
        key: 'user-settings',
        value:
          '{"practice":{"dailyGoal":3,"mode":"guided","problemFilters":{"skipPremium":false}},"assessment":{"requireSolveTime":true,"strictTiming":false,"timeTargetsMinutes":{"easy":20,"medium":35,"hard":50}},"overlay":{"defaultMode":"expanded","autoStartTimer":false}}',
        updatedAt: '2026-05-25T12:00:00.000Z',
      },
    ],
  },
} satisfies BackupFile
