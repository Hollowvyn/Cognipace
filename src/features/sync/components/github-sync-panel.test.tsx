import {
  createBackupSummary,
  parseBackupFileForCurrentApp,
} from '@/features/backup/api/backup-contracts'
import { createFrozenV6BackupFixture } from '@/features/backup/testing/backup-v6-fixture'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  GitHubSyncPanel,
  type GitHubSyncPanelActions,
} from './github-sync-panel'

const createActions = (
  overrides: Partial<GitHubSyncPanelActions> = {},
): GitHubSyncPanelActions => ({
  onConnectGist: vi.fn(),
  onCreateGist: vi.fn(),
  onDeleteToken: vi.fn(),
  onPullLatest: vi.fn(),
  onPushLocal: vi.fn(),
  onSaveToken: vi.fn(),
  onSetAutoSyncEnabled: vi.fn(),
  onValidateStoredToken: vi.fn(),
  onValidateToken: vi.fn(),
  ...overrides,
})

describe('GitHubSyncPanel', () => {
  it('saves a token and creates a Gist from the not configured state', async () => {
    const user = userEvent.setup()
    const onSaveToken = vi.fn().mockResolvedValue(syncActionResult)
    const onCreateGist = vi.fn().mockResolvedValue(syncActionResult)

    render(
      <GitHubSyncPanel
        actions={createActions({
          onCreateGist,
          onSaveToken,
        })}
        status={notConfiguredStatus}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: /Connect GitHub Sync/i }),
    )
    await user.type(screen.getByLabelText(/Access token/i), 'ghp_secret')
    await user.click(screen.getByRole('button', { name: /Save token/i }))
    await user.click(
      screen.getByRole('button', { name: /Create private Gist/i }),
    )

    expect(onSaveToken).toHaveBeenCalledWith('ghp_secret')
    expect(onCreateGist).toHaveBeenCalled()
  })

  it('shows only a connection CTA before GitHub Sync is configured', () => {
    render(
      <GitHubSyncPanel
        actions={createActions()}
        status={notConfiguredStatus}
      />,
    )

    expect(
      screen.getByRole('button', { name: /Connect GitHub Sync/i }),
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: /Pull latest/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Push local/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Save token/i }),
    ).not.toBeInTheDocument()
  })

  it('shows connected and auto-sync badges with management controls', () => {
    render(
      <GitHubSyncPanel actions={createActions()} status={configuredStatus} />,
    )

    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Auto-sync on')).toBeInTheDocument()
    expect(screen.getByText(/Connected to private Gist/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Manage connection/i }),
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: /Pause auto-sync/i }),
    ).toBeEnabled()
  })

  it('keeps manual pull and push enabled while auto-sync is paused', () => {
    render(
      <GitHubSyncPanel
        actions={createActions()}
        status={{
          ...configuredStatus,
          enabled: false,
        }}
      />,
    )

    expect(screen.getByText('Auto-sync paused')).toBeInTheDocument()
    expect(
      screen.getByText(/Manual pull and push still work/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pull latest/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Push local/i })).toBeEnabled()
  })

  it('resumes auto-sync without disconnecting the saved connection', async () => {
    const user = userEvent.setup()
    const onSetAutoSyncEnabled = vi.fn().mockResolvedValue(syncActionResult)

    render(
      <GitHubSyncPanel
        actions={createActions({ onSetAutoSyncEnabled })}
        status={{
          ...configuredStatus,
          enabled: false,
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Resume auto-sync/i }))

    expect(onSetAutoSyncEnabled).toHaveBeenCalledWith(true)
  })

  it('renders directional sync actions instead of the generic sync action', () => {
    render(
      <GitHubSyncPanel actions={createActions()} status={configuredStatus} />,
    )

    expect(screen.getByRole('button', { name: /Pull latest/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Push local/i })).toBeEnabled()
  })

  it('keeps directional actions visible while a conflict is present', () => {
    render(
      <GitHubSyncPanel
        actions={createActions()}
        status={{
          ...configuredStatus,
          conflict: {
            detectedAt: '2026-05-26T12:10:00.000Z',
            localDataUpdatedAt: '2026-05-26T12:08:00.000Z',
            remoteUpdatedAt: '2026-05-26T12:09:00.000Z',
            remoteVersion: 'remote_2',
          },
        }}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/conflict/i)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pull latest/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Push local/i })).toBeEnabled()
  })

  it('shows retryable auto-sync errors as status without opening force dialogs', () => {
    render(
      <GitHubSyncPanel
        actions={createActions()}
        status={{
          ...configuredStatus,
          lastError: {
            kind: 'network',
            message: 'GitHub is temporarily unavailable.',
            occurredAt: '2026-05-26T12:05:00.000Z',
            retryable: true,
          },
        }}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      /GitHub is temporarily unavailable/i,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the selected legacy remote preview and submits its bound confirmation token', async () => {
    const user = userEvent.setup()
    const restorePreview = {
      ...createBackupSummary(
        parseBackupFileForCurrentApp(createFrozenV6BackupFixture()),
      ),
      confirmationToken: 'remote-preview-token',
      sourceSchemaVersion: 6,
      archiveAbsent: true,
      removesCurrentArchive: true,
    }
    const onPullLatest = vi
      .fn()
      .mockResolvedValueOnce({
        ...syncActionResult,
        action: 'pull-latest',
        direction: 'pull',
        outcome: 'confirmation-required',
        reason: null,
        restorePreview,
        message: 'Review selected remote backup.',
      })
      .mockResolvedValueOnce({
        ...syncActionResult,
        action: 'pull-latest',
        direction: 'pull',
        outcome: 'success',
        reason: null,
      })
    render(
      <GitHubSyncPanel
        actions={createActions({ onPullLatest })}
        status={configuredStatus}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Pull latest' }))
    const dialog = await screen.findByRole('dialog', {
      name: /Force pull from Gist/i,
    })
    expect(dialog).toHaveTextContent(/backup version 6/i)
    expect(dialog).toHaveTextContent(/contains no Notes archive/i)
    await user.click(screen.getByRole('button', { name: /Force pull/i }))
    expect(onPullLatest).toHaveBeenLastCalledWith({
      confirmLocalOverwrite: true,
      confirmationToken: 'remote-preview-token',
    })
  })

  it('opens a force pull confirmation dialog when local changes block pulling', async () => {
    const user = userEvent.setup()
    const onPullLatest = vi
      .fn()
      .mockResolvedValueOnce({
        ...syncActionResult,
        action: 'pull-latest',
        direction: 'pull',
        outcome: 'blocked',
        reason: 'local-dirty',
        message: 'Pull blocked: local changes have not been pushed.',
      })
      .mockResolvedValueOnce({
        ...syncActionResult,
        action: 'pull-latest',
        direction: 'pull',
        outcome: 'success',
        message: 'Latest Gist data pulled. Local changes were overwritten.',
      })

    render(
      <GitHubSyncPanel
        actions={createActions({
          onPullLatest,
        })}
        status={configuredStatus}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Pull latest/i }))

    expect(onPullLatest).toHaveBeenCalledWith({
      confirmLocalOverwrite: false,
    })
    const dialog = await screen.findByRole('dialog', {
      name: /Force pull from Gist/i,
    })
    expect(dialog).toHaveTextContent(/local changes have not been pushed/i)

    await user.click(screen.getByRole('button', { name: /Force pull/i }))

    expect(onPullLatest).toHaveBeenLastCalledWith({
      confirmLocalOverwrite: true,
    })
    expect(
      await screen.findByRole('dialog', { name: /Pull complete/i }),
    ).toHaveTextContent(/Local changes were overwritten/i)
  })

  it('shows warning feedback and skips token-save cleanup when a resolved action is blocked', async () => {
    const user = userEvent.setup()
    const onSaveToken = vi.fn().mockResolvedValue({
      ...syncActionResult,
      outcome: 'blocked',
      reason: 'not-configured',
      message: 'GitHub token was not saved.',
    })

    render(
      <GitHubSyncPanel
        actions={createActions({
          onSaveToken,
        })}
        status={notConfiguredStatus}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: /Connect GitHub Sync/i }),
    )
    await user.type(screen.getByLabelText(/Access token/i), 'ghp_secret')
    await user.click(screen.getByRole('button', { name: /Save token/i }))

    const feedback = await screen.findByText('GitHub token was not saved.')
    expect(feedback.closest('[data-cp-tone]')).toHaveAttribute(
      'data-cp-tone',
      'warning',
    )
    expect(screen.getByLabelText(/Access token/i)).toHaveValue('ghp_secret')
    expect(
      screen.getByRole('button', { name: /Create private Gist/i }),
    ).toBeDisabled()
  })

  it('opens a force push confirmation dialog when the remote changed', async () => {
    const user = userEvent.setup()
    const onPushLocal = vi
      .fn()
      .mockResolvedValueOnce({
        ...syncActionResult,
        action: 'push-local',
        direction: 'push',
        outcome: 'confirmation-required',
        reason: 'remote-changed',
        message: 'Remote changed since this browser last synced.',
      })
      .mockResolvedValueOnce({
        ...syncActionResult,
        action: 'push-local',
        direction: 'push',
        outcome: 'success',
        message: 'Local data pushed to Gist.',
      })

    render(
      <GitHubSyncPanel
        actions={createActions({
          onPushLocal,
        })}
        status={configuredStatus}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Push local/i }))

    expect(onPushLocal).toHaveBeenCalledWith({
      confirmRemoteOverwrite: false,
    })
    const dialog = await screen.findByRole('dialog', {
      name: /Force push to Gist/i,
    })
    expect(dialog).toHaveTextContent(/Remote changed/i)

    await user.click(screen.getByRole('button', { name: /Force push/i }))

    expect(onPushLocal).toHaveBeenLastCalledWith({
      confirmRemoteOverwrite: true,
    })
    expect(
      await screen.findByRole('dialog', { name: /Push complete/i }),
    ).toHaveTextContent(/Local data pushed/i)
  })

  it('cancels force push confirmation without overwriting remote data', async () => {
    const user = userEvent.setup()
    const onPushLocal = vi.fn().mockResolvedValue({
      ...syncActionResult,
      action: 'push-local',
      direction: 'push',
      outcome: 'confirmation-required',
      reason: 'remote-changed',
      message: 'Remote changed. Confirm overwrite before pushing.',
    })

    render(
      <GitHubSyncPanel
        actions={createActions({
          onPushLocal,
        })}
        status={configuredStatus}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Push local/i }))
    await user.click(await screen.findByRole('button', { name: /Cancel/i }))

    expect(
      screen.queryByRole('dialog', { name: /Force push to Gist/i }),
    ).not.toBeInTheDocument()
    expect(onPushLocal).toHaveBeenCalledTimes(1)
  })

  it('requests a normal local push without remote overwrite confirmation', async () => {
    const user = userEvent.setup()
    const onPushLocal = vi.fn().mockResolvedValue({
      ...syncActionResult,
      action: 'push-local',
      direction: 'push',
      outcome: 'success',
    })

    render(
      <GitHubSyncPanel
        actions={createActions({
          onPushLocal,
        })}
        status={configuredStatus}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Push local/i }))

    expect(onPushLocal).toHaveBeenCalledWith({
      confirmRemoteOverwrite: false,
    })
  })

  it('shows local-dirty blocking status and push-needed status before timestamps', () => {
    const { rerender } = render(
      <GitHubSyncPanel
        actions={createActions()}
        status={{
          ...configuredStatus,
          lastBlockingReason: 'local-dirty',
        }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      /Local changes need to be pushed before pulling latest/i,
    )

    rerender(
      <GitHubSyncPanel
        actions={createActions()}
        status={{
          ...configuredStatus,
          lastBlockingReason: null,
          needsPush: true,
        }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      /Local changes are waiting to be pushed/i,
    )
  })

  it('shows the latest push or pull timestamp before legacy sync timestamps', () => {
    const { rerender } = render(
      <GitHubSyncPanel
        actions={createActions()}
        status={{
          ...configuredStatus,
          lastPushAt: '2026-05-26T13:00:00.000Z',
          lastPullAt: '2026-05-26T12:30:00.000Z',
          lastSyncAt: '2026-05-26T12:00:00.000Z',
        }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/Last push:/i)

    rerender(
      <GitHubSyncPanel
        actions={createActions()}
        status={{
          ...configuredStatus,
          lastPushAt: '2026-05-26T12:30:00.000Z',
          lastPullAt: '2026-05-26T13:00:00.000Z',
          lastSyncAt: '2026-05-26T12:00:00.000Z',
        }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/Last pull:/i)

    rerender(
      <GitHubSyncPanel
        actions={createActions()}
        status={{
          ...configuredStatus,
          lastPushAt: null,
          lastPullAt: null,
          lastSyncAt: '2026-05-26T12:00:00.000Z',
          lastSyncDirection: 'no-change',
        }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/Last sync check:/i)
  })

  it('shows danger feedback for resolved error outcomes', async () => {
    const user = userEvent.setup()
    const onPullLatest = vi.fn().mockResolvedValue({
      ...syncActionResult,
      action: 'pull-latest',
      direction: 'pull',
      outcome: 'error',
      reason: 'network',
      message: 'GitHub is unavailable.',
      retryable: true,
    })

    render(
      <GitHubSyncPanel
        actions={createActions({
          onPullLatest,
        })}
        status={configuredStatus}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Pull latest/i }))

    const feedback = await screen.findByText('GitHub is unavailable.')
    expect(feedback.closest('[data-cp-tone]')).toHaveAttribute(
      'data-cp-tone',
      'danger',
    )
  })
})

const notConfiguredStatus = {
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
} as const

const configuredStatus = {
  enabled: true,
  configured: true,
  tokenConfigured: true,
  tokenStatus: {
    provider: 'github:gist',
    configured: true,
    updatedAt: '2026-05-26T12:00:00.000Z',
    fingerprint: 'abcdef123456',
  },
  gistId: 'gist_1',
  isSyncing: false,
  lastSyncAt: '2026-05-26T12:00:00.000Z',
  lastSyncDirection: 'push',
  lastPullAt: null,
  lastPushAt: '2026-05-26T12:00:00.000Z',
  needsPush: false,
  lastBlockingReason: null,
  lastError: null,
  conflict: null,
} as const

const syncActionResult = {
  action: 'set-enabled',
  direction: null,
  outcome: 'success',
  reason: null,
  retryable: false,
  message: 'GitHub sync updated.',
  status: configuredStatus,
  occurredAt: '2026-05-26T12:00:00.000Z',
} as const

it('shows action-needed verification guidance before generic pending status', () => {
  render(
    <GitHubSyncPanel
      actions={createActions()}
      status={{
        ...configuredStatus,
        needsPush: true,
        lastBlockingReason: 'backup-verification-unavailable',
      }}
    />,
  )
  expect(screen.getByText('Action needed')).toBeInTheDocument()
  expect(
    screen.getByText(/Automatic uploads are unavailable.*unverified/i),
  ).toBeInTheDocument()
  expect(screen.queryByText(/waiting to be pushed/i)).not.toBeInTheDocument()
  expect(screen.queryByText('Auto-sync on')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Push local/i })).toBeEnabled()
})

it('offers a manual preview when a legacy backup would remove the archive', () => {
  render(
    <GitHubSyncPanel
      actions={createActions()}
      status={{
        ...configuredStatus,
        lastBlockingReason: 'archive-review-required',
      }}
    />,
  )
  expect(
    screen.getByText(/older backup.*Pull latest.*preview/i),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Pull latest/i })).toBeEnabled()
})

it('keeps concrete sync errors visible when automatic backup verification is unavailable', () => {
  render(
    <GitHubSyncPanel
      actions={createActions()}
      status={{
        ...configuredStatus,
        lastBlockingReason: 'backup-verification-unavailable',
        lastError: {
          kind: 'auth',
          message: 'Token needs replacement.',
          occurredAt: '2026-05-26T12:00:00.000Z',
          retryable: false,
        },
      }}
    />,
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Token needs replacement.',
  )
})
