import {
  createBackupSummary,
  parseBackupFileForCurrentApp,
} from '@/features/backup/api/backup-contracts'
import { createFrozenV6BackupFixture } from '@/features/backup/testing/backup-v6-fixture'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type {
  SerializedSyncStatus,
  SyncActionResult,
} from '../api/sync-contracts'

import { DashboardSyncActionsView } from './dashboard-sync-actions'

describe('DashboardSyncActionsView', () => {
  it('hides actions when Gist sync is not configured', () => {
    render(
      <DashboardSyncActionsView
        isPending={false}
        onPullLatest={vi.fn()}
        onPushLocal={vi.fn()}
        status={notConfiguredStatus}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Pull latest from Gist' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Push local to Gist' }),
    ).not.toBeInTheDocument()
  })

  it('renders configured cloud icon buttons and calls handlers', async () => {
    const user = userEvent.setup()
    const onPullLatest = vi.fn()
    const onPushLocal = vi.fn()

    render(
      <DashboardSyncActionsView
        isPending={false}
        onPullLatest={onPullLatest}
        onPushLocal={onPushLocal}
        status={configuredStatus}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Pull latest from Gist' }),
    )
    await user.click(screen.getByRole('button', { name: 'Push local to Gist' }))

    expect(onPullLatest).toHaveBeenCalledWith({
      confirmLocalOverwrite: false,
    })
    expect(onPushLocal).toHaveBeenCalledWith({
      confirmRemoteOverwrite: false,
    })
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
        ...confirmationRequiredResult,
        action: 'pull-latest',
        direction: 'pull',
        outcome: 'confirmation-required',
        reason: null,
        restorePreview,
        message: 'Review selected remote backup.',
      })
      .mockResolvedValueOnce({
        ...confirmationRequiredResult,
        action: 'pull-latest',
        direction: 'pull',
        outcome: 'success',
        reason: null,
      })
    render(
      <DashboardSyncActionsView
        isPending={false}
        onPullLatest={onPullLatest}
        onPushLocal={vi.fn()}
        status={configuredStatus}
      />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Pull latest from Gist' }),
    )
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

  it('opens a force push dialog when header push requires overwrite confirmation', async () => {
    const user = userEvent.setup()
    const onPushLocal = vi.fn().mockResolvedValue(confirmationRequiredResult)

    render(
      <DashboardSyncActionsView
        isPending={false}
        onPullLatest={vi.fn()}
        onPushLocal={onPushLocal}
        status={configuredStatus}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Push local to Gist' }))

    expect(onPushLocal).toHaveBeenCalledTimes(1)
    expect(onPushLocal).toHaveBeenCalledWith({
      confirmRemoteOverwrite: false,
    })
    expect(onPushLocal).not.toHaveBeenCalledWith({
      confirmRemoteOverwrite: true,
    })
    const dialog = await screen.findByRole('dialog', {
      name: /Force push to Gist/i,
    })
    expect(dialog).toHaveTextContent(/Remote changed/i)
    expect(screen.getByRole('button', { name: /Force push/i })).toBeVisible()
  })

  it('does not open force dialogs from conflict status alone', () => {
    render(
      <DashboardSyncActionsView
        isPending={false}
        onPullLatest={vi.fn()}
        onPushLocal={vi.fn()}
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

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Pull latest from Gist' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Push local to Gist' }),
    ).toBeEnabled()
  })

  it('keeps header sync actions available while auto-sync is paused', () => {
    render(
      <DashboardSyncActionsView
        isPending={false}
        onPullLatest={vi.fn()}
        onPushLocal={vi.fn()}
        status={{
          ...configuredStatus,
          enabled: false,
        }}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Pull latest from Gist' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Push local to Gist' }),
    ).toBeEnabled()
  })

  it('does not open force dialogs from retryable error status alone', () => {
    render(
      <DashboardSyncActionsView
        isPending={false}
        onPullLatest={vi.fn()}
        onPushLocal={vi.fn()}
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

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lets the header force push after overwrite confirmation', async () => {
    const user = userEvent.setup()
    const onPushLocal = vi
      .fn()
      .mockResolvedValueOnce(confirmationRequiredResult)
      .mockResolvedValueOnce({
        ...confirmationRequiredResult,
        outcome: 'success',
        reason: null,
        message: 'Pushed local data.',
      })

    render(
      <DashboardSyncActionsView
        isPending={false}
        onPullLatest={vi.fn()}
        onPushLocal={onPushLocal}
        status={configuredStatus}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Push local to Gist' }))
    await user.click(await screen.findByRole('button', { name: /Force push/i }))

    expect(onPushLocal).toHaveBeenLastCalledWith({
      confirmRemoteOverwrite: true,
    })
    expect(
      await screen.findByRole('dialog', { name: /Push complete/i }),
    ).toHaveTextContent('Pushed local data.')
  })

  it('lets the header force pull when local changes block pulling', async () => {
    const user = userEvent.setup()
    const onPullLatest = vi
      .fn()
      .mockResolvedValueOnce({
        ...confirmationRequiredResult,
        action: 'pull-latest',
        direction: 'pull',
        outcome: 'blocked',
        reason: 'local-dirty',
        message: 'Pull blocked: local changes have not been pushed.',
      })
      .mockResolvedValueOnce({
        ...confirmationRequiredResult,
        action: 'pull-latest',
        direction: 'pull',
        outcome: 'success',
        reason: null,
        message: 'Pulled latest. Local changes were overwritten.',
      })

    render(
      <DashboardSyncActionsView
        isPending={false}
        onPullLatest={onPullLatest}
        onPushLocal={vi.fn()}
        status={configuredStatus}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Pull latest from Gist' }),
    )
    await user.click(await screen.findByRole('button', { name: /Force pull/i }))

    expect(onPullLatest).toHaveBeenLastCalledWith({
      confirmLocalOverwrite: true,
    })
    expect(
      await screen.findByRole('dialog', { name: /Pull complete/i }),
    ).toHaveTextContent(/overwritten/i)
  })

  it('shows a result dialog after a successful pull', async () => {
    const user = userEvent.setup()
    const onPullLatest = vi.fn().mockResolvedValue({
      action: 'pull-latest',
      direction: 'pull',
      outcome: 'success',
      reason: null,
      retryable: false,
      message: 'Pulled latest.',
      status: configuredStatus,
      occurredAt: '2026-05-26T12:00:00.000Z',
    } satisfies SyncActionResult)

    render(
      <DashboardSyncActionsView
        isPending={false}
        onPullLatest={onPullLatest}
        onPushLocal={vi.fn()}
        status={configuredStatus}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Pull latest from Gist' }),
    )

    const dialog = await screen.findByRole('dialog', {
      name: /Pull complete/i,
    })
    expect(dialog).toHaveTextContent('Pulled latest.')
    expect(onPullLatest).toHaveBeenCalledWith({
      confirmLocalOverwrite: false,
    })
  })

  it.each([
    ['a sync action is pending', { isPending: true, isSyncing: false }],
    ['sync status is syncing', { isPending: false, isSyncing: true }],
  ])('disables header sync actions when %s', (_label, state) => {
    render(
      <DashboardSyncActionsView
        isPending={state.isPending}
        onPullLatest={vi.fn()}
        onPushLocal={vi.fn()}
        status={{
          ...configuredStatus,
          isSyncing: state.isSyncing,
        }}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Pull latest from Gist' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Push local to Gist' }),
    ).toBeDisabled()
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
} satisfies SerializedSyncStatus

const configuredStatus = {
  ...notConfiguredStatus,
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
  lastSyncAt: '2026-05-26T12:00:00.000Z',
  lastSyncDirection: 'push',
  lastPushAt: '2026-05-26T12:00:00.000Z',
} satisfies SerializedSyncStatus

const confirmationRequiredResult = {
  action: 'push-local',
  direction: 'push',
  outcome: 'confirmation-required',
  reason: 'remote-changed',
  retryable: false,
  message: 'Remote changed.',
  status: configuredStatus,
  occurredAt: '2026-05-26T12:00:00.000Z',
} satisfies SyncActionResult

it('shows manual unverified upload as a warning with pending changes', async () => {
  const user = userEvent.setup()
  render(
    <DashboardSyncActionsView
      isPending={false}
      status={configuredStatus}
      onPullLatest={vi.fn()}
      onPushLocal={vi.fn().mockResolvedValue({
        ...confirmationRequiredResult,
        action: 'push-local',
        outcome: 'success',
        reason: 'backup-verification-unavailable',
        message: 'Upload is unverified. Local changes remain pending.',
      })}
    />,
  )
  await user.click(screen.getByRole('button', { name: /Push local to Gist/i }))
  expect(
    screen.getByRole('dialog', { name: 'Upload unverified' }),
  ).toBeInTheDocument()
  expect(
    screen
      .getByText('Upload is unverified. Local changes remain pending.')
      .closest('[data-cp-tone]'),
  ).toHaveAttribute('data-cp-tone', 'warning')
})
