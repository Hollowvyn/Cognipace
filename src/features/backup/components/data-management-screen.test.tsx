import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { useSyncAction } from '@/features/sync/api/sync-api'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  backupSchemaVersion,
  type BackupFile,
  type BackupReplacementKind,
  type BackupReplacementResult,
  type BackupReplacementState,
  type BackupSummary,
} from '../api/backup-contracts'
import { DataManagementScreen } from './data-management-screen'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

vi.mock('@/features/sync', () => ({
  GitHubSyncSettingsSection: () => (
    <section aria-label="GitHub sync settings">GitHub Sync</section>
  ),
}))

describe('DataManagementScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'backup.getPendingReplacement') {
        return Promise.resolve({ status: 'idle' })
      }

      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    )
  })

  it('exports a full backup and shows completion feedback', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) =>
      Promise.resolve(
        method === 'backup.getPendingReplacement'
          ? { status: 'idle' }
          : validBackup,
      ),
    )
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
    vi.mocked(sendMessage).mockImplementation((method) =>
      Promise.resolve(
        method === 'backup.getPendingReplacement'
          ? { status: 'idle' }
          : validSummary,
      ),
    )
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
    expect(sendMessage).not.toHaveBeenCalledWith(
      'backup.validateFullBackup',
      expect.anything(),
    )
  })

  it('requires confirmation before restoring a full backup', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'backup.getPendingReplacement') {
        return Promise.resolve({ status: 'idle' })
      }

      if (method === 'backup.validateFullBackup') {
        return Promise.resolve(validSummary)
      }

      if (method === 'backup.restoreFullBackup') {
        return Promise.resolve(durableResult('restore'))
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
      if (method === 'backup.getPendingReplacement') {
        return Promise.resolve({ status: 'idle' })
      }

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
    vi.mocked(sendMessage).mockImplementation((method) =>
      Promise.resolve(
        method === 'backup.getPendingReplacement'
          ? { status: 'idle' }
          : durableResult('reset'),
      ),
    )
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
    expect(sendMessage).not.toHaveBeenCalledWith(
      'backup.resetLocalData',
      expect.anything(),
    )

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
    expect(sendMessage).not.toHaveBeenCalledWith(
      'backup.resetLocalData',
      expect.anything(),
    )
  })

  it('closes a pending restore confirmation and retains its selected draft without saved feedback', async () => {
    const user = userEvent.setup()
    mockReplacementRuntime({ kind: 'restore' })
    const { wrapper } = createQueryTestHarness()
    render(<DataManagementScreen />, { wrapper })

    await chooseAndRestoreBackup(user)

    expect(await screen.findByText(persistenceMessage)).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('backup.json')).toBeVisible()
    expect(screen.getByText('Problems: 1')).toBeVisible()
    expect(screen.queryByText('Backup restored.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry saving' })).toBeEnabled()
    expectReplacementActionsDisabled()
  })

  it.each(['restore', 'reset', 'gist-pull'] as const)(
    'reads %s recovery on Settings reload without retrying or replacing data',
    async (kind) => {
      mockReplacementRuntime({ kind, initialPending: true })
      const first = createQueryTestHarness()
      const view = render(<DataManagementScreen />, { wrapper: first.wrapper })
      await screen.findByRole('button', { name: 'Retry saving' })
      view.unmount()
      const second = createQueryTestHarness()

      render(<DataManagementScreen />, { wrapper: second.wrapper })

      expect(
        await screen.findByRole('button', { name: 'Retry saving' }),
      ).toBeEnabled()
      expect(sendMessage).toHaveBeenCalledTimes(2)
      expect(sendMessage).toHaveBeenNthCalledWith(
        2,
        'backup.getPendingReplacement',
        { surface: 'dashboard' },
      )
      expectReplacementActionsDisabled()
    },
  )

  it('retries only publication and clears the restore draft after complete durable recovery', async () => {
    const user = userEvent.setup()
    mockReplacementRuntime({ kind: 'restore' })
    const { wrapper } = createQueryTestHarness()
    render(<DataManagementScreen />, { wrapper })
    await chooseAndRestoreBackup(user)
    await screen.findByRole('button', { name: 'Retry saving' })

    await user.click(screen.getByRole('button', { name: 'Retry saving' }))

    expect(sendMessage).toHaveBeenCalledWith('backup.retryPendingReplacement', {
      surface: 'dashboard',
    })
    expect(
      vi
        .mocked(sendMessage)
        .mock.calls.filter(([method]) => method === 'backup.restoreFullBackup'),
    ).toHaveLength(1)
    expect(
      await screen.findByRole('status', { name: 'Data management feedback' }),
    ).toHaveTextContent('Backup restored.')
    expect(screen.getByText('No backup file selected')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Retry saving' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeEnabled()
  })

  it('recovers a reset without clearing the selected restore draft or showing a restore success', async () => {
    const user = userEvent.setup()
    mockReplacementRuntime({ kind: 'reset' })
    const { wrapper } = createQueryTestHarness()
    render(<DataManagementScreen />, { wrapper })
    await user.upload(
      screen.getByLabelText('Backup file'),
      createBackupFile(validBackup),
    )
    await screen.findByText('Problems: 1')
    await user.click(screen.getByRole('button', { name: 'Clear local data' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Clear local data',
      }),
    )
    await screen.findByRole('button', { name: 'Retry saving' })
    expect(screen.getByText(resetPersistenceMessage)).toBeVisible()
    expect(screen.queryByText(persistenceMessage)).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Local data cleared.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry saving' }))

    expect(await screen.findByText('Local data cleared.')).toBeVisible()
    expect(screen.getByText('backup.json')).toBeVisible()
    expect(screen.queryByText('Backup restored.')).not.toBeInTheDocument()
  })

  it('keeps metadata recovery visible with saved-data text and the selected draft', async () => {
    const user = userEvent.setup()
    mockReplacementRuntime({
      kind: 'restore',
      status: 'durable-sync-metadata-pending',
    })
    const { wrapper } = createQueryTestHarness()
    render(<DataManagementScreen />, { wrapper })

    await chooseAndRestoreBackup(user)

    expect(await screen.findByText(metadataMessage)).toBeVisible()
    expect(screen.queryByText(persistenceMessage)).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('backup.json')).toBeVisible()
    expect(screen.queryByText('Backup restored.')).not.toBeInTheDocument()
    expectReplacementActionsDisabled()

    await user.click(screen.getByRole('button', { name: 'Retry saving' }))

    expect(
      await screen.findByRole('status', { name: 'Data management feedback' }),
    ).toHaveTextContent('Backup restored.')
    expect(screen.getByText('No backup file selected')).toBeVisible()
  })

  it('clears stale recovery on a no-pending response without claiming that the data was saved', async () => {
    const user = userEvent.setup()
    mockReplacementRuntime({
      kind: 'restore',
      retryResult: { status: 'no-pending' },
    })
    const { wrapper } = createQueryTestHarness()
    render(<DataManagementScreen />, { wrapper })
    await chooseAndRestoreBackup(user)
    await screen.findByRole('button', { name: 'Retry saving' })

    await user.click(screen.getByRole('button', { name: 'Retry saving' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Retry saving' }),
      ).not.toBeInTheDocument()
    })
    expect(screen.queryByText(persistenceMessage)).not.toBeInTheDocument()
    expect(screen.queryByText('Backup restored.')).not.toBeInTheDocument()
    expect(screen.getByText('backup.json')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Restore full backup' }),
    ).toBeEnabled()
  })

  it('reveals Gist recovery when the sync action refreshes pending replacement status', async () => {
    const user = userEvent.setup()
    let pending = false
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'backup.getPendingReplacement') {
        return Promise.resolve(
          pending
            ? pendingState('gist-pull', 'persistence-pending')
            : { status: 'idle' },
        )
      }
      if (method === 'sync.pullLatest') {
        pending = true
        return Promise.resolve({
          action: 'pull-latest',
          direction: 'pull',
          outcome: 'error',
          message: 'Gist data still needs saving.',
          reason: 'unknown',
          retryable: true,
          occurredAt: '2026-05-25T12:00:00.000Z',
          status: {
            enabled: false,
            configured: false,
            tokenConfigured: false,
            tokenStatus: {
              provider: 'github:gist',
              configured: false,
              updatedAt: null,
              fingerprint: null,
            },
            gistId: null,
            isSyncing: false,
            lastSyncAt: null,
            lastSyncDirection: null,
            lastPullAt: null,
            lastPushAt: null,
            needsPush: false,
            lastBlockingReason: null,
            lastError: null,
            conflict: null,
          },
        })
      }
      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()
    render(
      <>
        <DataManagementScreen />
        <SyncActionTestButton />
      </>,
      { wrapper },
    )
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith('backup.getPendingReplacement', {
        surface: 'dashboard',
      })
    })

    await user.click(screen.getByRole('button', { name: 'Test Gist pull' }))

    expect(
      await screen.findByRole('button', { name: 'Retry saving' }),
    ).toBeVisible()
    expectReplacementActionsDisabled()
    expect(screen.queryByText('Backup restored.')).not.toBeInTheDocument()
  })

  it('keeps retry saving available after a read-status failure and reports retry errors outside a dialog', async () => {
    const user = userEvent.setup()
    let committed = false
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'backup.getPendingReplacement') {
        return committed
          ? Promise.reject(new Error('Status unavailable.'))
          : Promise.resolve({ status: 'idle' })
      }
      if (method === 'backup.validateFullBackup') {
        return Promise.resolve(validSummary)
      }
      if (method === 'backup.restoreFullBackup') {
        committed = true
        return Promise.resolve(pendingState('restore', 'persistence-pending'))
      }
      if (method === 'backup.retryPendingReplacement') {
        return Promise.reject(new Error('Saving unavailable.'))
      }
      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()
    render(<DataManagementScreen />, { wrapper })
    await chooseAndRestoreBackup(user)
    await screen.findByRole('button', { name: 'Retry saving' })

    await user.click(screen.getByRole('button', { name: 'Retry saving' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Saving unavailable.',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry saving' })).toBeEnabled()
    expect(screen.getByText('backup.json')).toBeVisible()
  })
})

const persistenceMessage =
  'Your data was restored, but it still needs saving. Keep this extension open and choose Retry saving.'
const resetPersistenceMessage =
  'Your data was cleared, but it still needs saving. Keep this extension open and choose Retry saving.'
const metadataMessage = 'Your data is saved. Sync status still needs saving.'

function pendingState<
  TStatus extends Exclude<BackupReplacementState['status'], 'idle'>,
>(kind: BackupReplacementKind, status: TStatus) {
  return { status, kind, summary: kind === 'reset' ? null : validSummary }
}

function durableResult(kind: BackupReplacementKind) {
  return {
    status: 'durable',
    syncMetadataPending: false,
    kind,
    summary: kind === 'reset' ? null : validSummary,
  } as const
}

function mockReplacementRuntime({
  kind,
  status = 'persistence-pending',
  initialPending = false,
  retryResult = durableResult(kind),
}: {
  kind: BackupReplacementKind
  status?: Exclude<BackupReplacementState['status'], 'idle'>
  initialPending?: boolean
  retryResult?: BackupReplacementResult
}) {
  let state: BackupReplacementState = initialPending
    ? pendingState(kind, status)
    : { status: 'idle' }
  vi.mocked(sendMessage).mockImplementation((method) => {
    if (method === 'backup.getPendingReplacement') {
      return Promise.resolve(state)
    }
    if (method === 'backup.validateFullBackup') {
      return Promise.resolve(validSummary)
    }
    if (
      method === 'backup.restoreFullBackup' ||
      method === 'backup.resetLocalData'
    ) {
      state = pendingState(kind, status)
      return Promise.resolve(
        status === 'persistence-pending'
          ? state
          : { ...durableResult(kind), syncMetadataPending: true },
      )
    }
    if (method === 'backup.retryPendingReplacement') {
      state = { status: 'idle' }
      return Promise.resolve(retryResult)
    }
    return Promise.reject(new Error(`Unexpected method ${method}`))
  })
}

async function chooseAndRestoreBackup(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.upload(
    screen.getByLabelText('Backup file'),
    createBackupFile(validBackup),
  )
  await screen.findByText('Problems: 1')
  await user.click(screen.getByRole('button', { name: 'Restore full backup' }))
  await user.click(screen.getByRole('button', { name: 'Confirm restore' }))
}

function expectReplacementActionsDisabled() {
  expect(screen.getByRole('button', { name: 'Export backup' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Choose backup file' }),
  ).toBeDisabled()
  expect(screen.getByLabelText('Backup file')).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Clear local data' }),
  ).toBeDisabled()
  const restore = screen.queryByRole('button', { name: 'Restore full backup' })
  if (restore) {
    expect(restore).toBeDisabled()
  }
}

function SyncActionTestButton() {
  const action = useSyncAction(() =>
    sendMessage('sync.pullLatest', {
      surface: 'dashboard',
      confirmLocalOverwrite: false,
    }),
  )
  return (
    <button
      onClick={() => {
        void action.mutateAsync()
      }}
    >
      Test Gist pull
    </button>
  )
}

function createBackupFile(backup: BackupFile) {
  return new File([JSON.stringify(backup)], 'backup.json', {
    type: 'application/json',
  })
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
      schedulerProfiles: [],
      reviewEvidence: [],
      generations: [],
      commandReceipts: [],
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
          allowExternalProgress: false,
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
