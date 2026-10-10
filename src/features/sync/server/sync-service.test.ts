import { describe, expect, it, vi } from 'vitest'

import {
  backupSchemaVersion,
  type BackupFile,
  type BackupSummary,
} from '@/features/backup/api/backup-contracts'
import type { GitHubGistSummary } from '@/lib/github/api/gist-contracts'
import type { SecretStatus } from '@/platform/secrets'
import { createBackupReplacementCoordinator } from '@/extension/background/backup-replacement'

import { defaultSyncMetadata } from '../data/sync-metadata-store'
import type { SyncMetadata } from '../data/sync-metadata-store'
import { buildSyncEnvelope } from '../domain/sync-envelope'
import { syncActionResultSchema, syncStatusSchema } from '../api/sync-contracts'
import {
  createSyncOperationCoordinator,
  createSyncService,
  type SyncServiceDependencies,
} from './sync-service'

const currentTime = '2026-05-26T12:30:00.000Z'

const backup: BackupFile = {
  schemaVersion: backupSchemaVersion,
  app: 'cognipace',
  exportedAt: '2026-05-26T12:00:00.000Z',
  source: { appVersion: '0.0.0' },
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
}

const legacyBackup = {
  schemaVersion: 1,
  app: 'cognipace',
  exportedAt: '2026-05-26T12:00:00.000Z',
  source: { appVersion: '0.0.0' },
  data: {
    problems: [
      {
        slug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
        createdAt: '2026-05-26T12:00:00.000Z',
        updatedAt: '2026-05-26T12:00:00.000Z',
      },
    ],
    topics: [],
    companies: [],
    problemTopics: [],
    problemCompanies: [],
    practice: {
      problemPractice: [],
      fsrsCards: [],
      reviewAttempts: [],
    },
    tracks: {
      tracks: [
        {
          id: 'leetcode-75',
          slug: 'leetcode-75',
          title: 'LeetCode 75',
          description: null,
          dueAt: null,
          createdAt: '2026-05-26T12:00:00.000Z',
          updatedAt: '2026-05-26T12:00:00.000Z',
        },
      ],
      groups: [
        {
          id: 'leetcode-75:arrays',
          trackId: 'leetcode-75',
          title: 'Arrays',
          position: 1,
          createdAt: '2026-05-26T12:00:00.000Z',
          updatedAt: '2026-05-26T12:00:00.000Z',
        },
      ],
      memberships: [
        {
          trackGroupId: 'leetcode-75:arrays',
          problemSlug: 'two-sum',
          position: 1,
        },
      ],
      progress: [
        {
          trackGroupId: 'leetcode-75:arrays',
          problemSlug: 'two-sum',
          completedAt: '2026-05-26T12:00:00.000Z',
          completedRating: 'good',
          createdAt: '2026-05-26T12:00:00.000Z',
          updatedAt: '2026-05-26T12:00:00.000Z',
        },
      ],
      session: [],
    },
    settings: [],
  },
}

const backupSummary: BackupSummary = {
  schemaVersion: backup.schemaVersion,
  exportedAt: backup.exportedAt,
  source: backup.source,
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
}

const tokenStatus: SecretStatus = {
  provider: 'github:gist',
  configured: true,
  updatedAt: '2026-05-26T12:00:00.000Z',
  fingerprint: 'abcdef123456',
}

describe('sync service', () => {
  it('returns status and action results that satisfy sync contracts', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      lastSyncAt: '2026-05-26T12:00:00.000Z',
      lastSyncDirection: 'push',
      lastPushAt: '2026-05-26T12:00:00.000Z',
      dirtySinceLastSync: true,
      lastBlockingReason: 'local-dirty',
    })

    const status = await harness.service.getStatus()
    expect(syncStatusSchema.parse(status)).toEqual(status)

    const actionResult =
      await harness.service.validateGithubToken('github_pat_secret')
    expect(syncActionResultSchema.parse(actionResult)).toEqual(actionResult)
  })

  it('validates the configured token without exposing the token to UI payloads', async () => {
    const harness = createHarness()
    harness.setMetadata({
      lastError: {
        kind: 'auth',
        message: 'Previous token failure.',
        occurredAt: '2026-05-26T12:00:00.000Z',
        retryable: false,
      },
    })

    const result = await harness.service.validateStoredGithubToken()

    expect(harness.readToken).toHaveBeenCalledTimes(1)
    expect(harness.createGitHubClient).toHaveBeenCalledWith('ghp_secret')
    expect(harness.githubClient.validateToken).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      action: 'validate-token',
      direction: null,
      outcome: 'success',
      message: 'GitHub token validated.',
      status: {
        lastError: null,
      },
    })
    expect(JSON.stringify(result)).not.toContain('ghp_secret')
  })

  it('does not persist lastError when explicit token validation fails', async () => {
    const harness = createHarness()
    harness.setMetadata({
      lastError: null,
    })
    harness.githubClient.validateToken.mockRejectedValue(
      new Error('Bad credentials for ghp_secret'),
    )

    await expect(
      harness.service.validateGithubToken('ghp_secret'),
    ).rejects.toThrow(/Bad credentials/)

    expect(harness.getMetadata().lastError).toBeNull()
    expect(didWritePersistedLastError(harness)).toBe(false)
  })

  it('does not persist lastError when stored token validation fails', async () => {
    const harness = createHarness()
    harness.githubClient.validateToken.mockRejectedValue(
      new Error('Bad credentials for ghp_secret'),
    )

    await expect(harness.service.validateStoredGithubToken()).rejects.toThrow(
      /Bad credentials/,
    )

    expect(harness.getMetadata().lastError).toBeNull()
    expect(didWritePersistedLastError(harness)).toBe(false)
  })

  it('does not persist lastError when save token validation fails', async () => {
    const harness = createHarness()
    harness.githubClient.validateToken.mockRejectedValue(
      new Error('Bad credentials for ghp_secret'),
    )

    await expect(harness.service.saveGithubToken('ghp_secret')).rejects.toThrow(
      /Bad credentials/,
    )

    expect(harness.saveToken).not.toHaveBeenCalled()
    expect(harness.getMetadata().lastError).toBeNull()
    expect(didWritePersistedLastError(harness)).toBe(false)
  })

  it('returns confirmation-required when connecting a remote Gist over dirty local data', async () => {
    const harness = createHarness()
    harness.setMetadata({
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:15:00.000Z',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:20:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify(
          buildSyncEnvelope({
            backup,
            dataUpdatedAt: '2026-05-26T12:20:00.000Z',
          }),
        ),
      }),
    )

    const result = await harness.service.connectGithubGist('gist_1')
    const parsed = syncActionResultSchema.parse(result)

    expect(parsed).toMatchObject({
      action: 'connect-gist',
      direction: null,
      outcome: 'confirmation-required',
      reason: 'remote-changed',
      retryable: false,
      message: 'Choose whether to pull remote data or push local data.',
      status: {
        lastBlockingReason: 'remote-changed',
      },
    })
  })

  it('keeps dirty connected remote unsynced so a later unconfirmed push still requires confirmation', async () => {
    const harness = createHarness()
    harness.setMetadata({
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:15:00.000Z',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:20:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify(
          buildSyncEnvelope({
            backup,
            dataUpdatedAt: '2026-05-26T12:20:00.000Z',
          }),
        ),
      }),
    )

    await expect(
      harness.service.connectGithubGist('gist_1'),
    ).resolves.toMatchObject({
      action: 'connect-gist',
      outcome: 'confirmation-required',
      reason: 'remote-changed',
    })
    expect(harness.getMetadata()).toMatchObject({
      enabled: true,
      gistId: 'gist_1',
      lastRemoteVersion: null,
      lastRemoteUpdatedAt: null,
      lastBlockingReason: 'remote-changed',
    })

    await expect(harness.service.pushLocal()).resolves.toMatchObject({
      action: 'push-local',
      direction: 'push',
      outcome: 'confirmation-required',
      reason: 'remote-changed',
      message: 'Remote changed since this browser last synced.',
    })
    expect(harness.githubClient.updateSyncGist).not.toHaveBeenCalled()
  })

  it('pullLatest restores remote data when local is clean and remote changed', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify(
          buildSyncEnvelope({
            backup,
            dataUpdatedAt: '2026-05-26T12:10:00.000Z',
          }),
        ),
      }),
    )

    await expect(harness.service.pullLatest()).resolves.toMatchObject({
      action: 'pull-latest',
      direction: 'pull',
      outcome: 'success',
      reason: null,
      retryable: false,
      message: 'Latest Gist data pulled.',
    })
    expect(harness.restoreBackup).toHaveBeenCalledWith(backup)
    expect(harness.flushDbSnapshot).toHaveBeenCalled()
    expect(harness.broadcastInvalidation).toHaveBeenCalled()
    expect(harness.getMetadata()).toMatchObject({
      dirtySinceLastSync: false,
      lastPullAt: currentTime,
      lastRemoteVersion: 'remote_2',
      lastSyncDirection: 'pull',
    })
  })

  it('pullLatest works while auto-sync is paused and keeps auto-sync paused', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: false,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify(
          buildSyncEnvelope({
            backup,
            dataUpdatedAt: '2026-05-26T12:10:00.000Z',
          }),
        ),
      }),
    )

    await expect(harness.service.pullLatest()).resolves.toMatchObject({
      action: 'pull-latest',
      direction: 'pull',
      outcome: 'success',
      message: 'Latest Gist data pulled.',
      status: {
        enabled: false,
        configured: true,
      },
    })
    expect(harness.restoreBackup).toHaveBeenCalledWith(backup)
    expect(harness.getMetadata()).toMatchObject({
      enabled: false,
      dirtySinceLastSync: false,
      lastPullAt: currentTime,
      lastRemoteVersion: 'remote_2',
      lastSyncDirection: 'pull',
    })
  })

  it('pullLatest restores normalized v1 remote backup data', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify({
          syncEnvelopeVersion: 1,
          app: 'cognipace',
          exportedAt: '2026-05-26T12:10:00.000Z',
          dataUpdatedAt: '2026-05-26T12:10:00.000Z',
          backup: legacyBackup,
        }),
      }),
    )

    await expect(harness.service.pullLatest()).resolves.toMatchObject({
      action: 'pull-latest',
      direction: 'pull',
      outcome: 'success',
    })
    expect(harness.restoreBackup).toHaveBeenCalledTimes(1)
    const restoredBackup = harness.restoreBackup.mock.calls[0]![0]

    expect(restoredBackup.schemaVersion).toBe(backupSchemaVersion)
    expect(restoredBackup.data.tracks.tracks[0]).toMatchObject({
      allowExternalProgress: false,
    })
    expect(restoredBackup.data.tracks.progress).toEqual([
      expect.objectContaining({
        trackId: 'leetcode-75',
        problemSlug: 'two-sum',
        reviewAttemptId: null,
      }),
    ])
  })

  it('pullLatest normalizes a v3 remote topic graph before restore', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
    })
    const v3Backup = {
      ...backup,
      schemaVersion: 3,
      data: {
        ...backup.data,
        practice: {
          problemPractice: backup.data.practice.problemPractice,
          fsrsCards: backup.data.practice.fsrsCards,
          reviewAttempts: backup.data.practice.reviewAttempts,
        },
        topics: [
          {
            id: 'array',
            label: 'Array',
            createdAt: backup.exportedAt,
            updatedAt: backup.exportedAt,
          },
          {
            id: 'hash-table',
            label: 'Hash Table',
            createdAt: backup.exportedAt,
            updatedAt: backup.exportedAt,
          },
        ],
        topicAliases: [],
        topicRelations: [
          {
            parentTopicId: 'array',
            childTopicId: 'hash-table',
            createdAt: backup.exportedAt,
            updatedAt: backup.exportedAt,
          },
        ],
      },
    }
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify({
          syncEnvelopeVersion: 1,
          app: 'cognipace',
          exportedAt: backup.exportedAt,
          dataUpdatedAt: backup.exportedAt,
          backup: v3Backup,
        }),
      }),
    )

    await expect(harness.service.pullLatest()).resolves.toMatchObject({
      outcome: 'success',
      direction: 'pull',
    })
    expect(harness.restoreBackup).toHaveBeenCalledTimes(1)
    const restoredBackup = harness.restoreBackup.mock.calls[0]![0]
    expect(restoredBackup.schemaVersion).toBe(backupSchemaVersion)
    expect(restoredBackup.data.topicRelations).toContainEqual(
      expect.objectContaining({
        sourceTopicId: 'hash-table',
        targetTopicId: 'array',
        kind: 'broader',
      }),
    )
  })

  it('pullLatest preserves a current external-progress policy in envelope v1', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
    })
    const withExternalProgress = createExternalProgressBackup()
    const envelope = buildSyncEnvelope({
      backup: withExternalProgress,
      dataUpdatedAt: '2026-05-26T12:10:00.000Z',
    })
    expect(envelope.syncEnvelopeVersion).toBe(1)
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        remoteVersion: 'remote_2',
        content: JSON.stringify(envelope),
      }),
    )

    await expect(harness.service.pullLatest()).resolves.toMatchObject({
      outcome: 'success',
      direction: 'pull',
    })
    expect(harness.restoreBackup).toHaveBeenCalledWith(withExternalProgress)
  })

  it('pullLatest normalizes a v4 external-progress policy to false', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
    })
    const current = createExternalProgressBackup()
    const legacy = {
      ...current,
      schemaVersion: 4,
      data: {
        ...current.data,
        practice: {
          problemPractice: current.data.practice.problemPractice,
          fsrsCards: current.data.practice.fsrsCards,
          reviewAttempts: current.data.practice.reviewAttempts,
        },
        tracks: {
          ...current.data.tracks,
          tracks: current.data.tracks.tracks.map((track) =>
            Object.fromEntries(
              Object.entries(track).filter(
                ([key]) => key !== 'allowExternalProgress',
              ),
            ),
          ),
        },
      },
    }
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        remoteVersion: 'remote_2',
        content: JSON.stringify({
          syncEnvelopeVersion: 1,
          app: 'cognipace',
          exportedAt: backup.exportedAt,
          dataUpdatedAt: backup.exportedAt,
          backup: legacy,
        }),
      }),
    )

    await expect(harness.service.pullLatest()).resolves.toMatchObject({
      outcome: 'success',
      direction: 'pull',
    })
    expect(harness.restoreBackup).toHaveBeenCalledWith({
      ...current,
      data: {
        ...current.data,
        tracks: {
          ...current.data.tracks,
          tracks: current.data.tracks.tracks.map((track) => ({
            ...track,
            allowExternalProgress: false,
          })),
        },
      },
    })
  })

  it('pushLocal carries v5 external progress without changing the sync envelope', async () => {
    const harness = createHarness()
    const withExternalProgress = createExternalProgressBackup()
    harness.exportFullBackup.mockResolvedValue(withExternalProgress)
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: true,
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({ id: 'gist_1', remoteVersion: 'remote_1' }),
    )
    harness.githubClient.updateSyncGist.mockResolvedValue(
      createGistSummary({ id: 'gist_1', remoteVersion: 'remote_2' }),
    )

    await expect(harness.service.pushLocal()).resolves.toMatchObject({
      outcome: 'success',
      direction: 'push',
    })
    const content = harness.githubClient.updateSyncGist.mock.calls[0]![1]
    expect(JSON.parse(content)).toMatchObject({
      syncEnvelopeVersion: 1,
      backup: withExternalProgress,
    })
  })

  it('pullLatest rejects a future remote backup before restore', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify({
          syncEnvelopeVersion: 1,
          app: 'cognipace',
          exportedAt: backup.exportedAt,
          dataUpdatedAt: backup.exportedAt,
          backup: { ...backup, schemaVersion: backupSchemaVersion + 1 },
        }),
      }),
    )

    await expect(harness.service.pullLatest()).resolves.toMatchObject({
      outcome: 'error',
    })
    expect(harness.restoreBackup).not.toHaveBeenCalled()
  })

  it('pullLatest blocks dirty local data without restoring remote data', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:05:00.000Z',
      lastRemoteVersion: 'remote_1',
      lastError: {
        kind: 'network',
        message: 'Previous network failure.',
        occurredAt: '2026-05-26T12:00:00.000Z',
        retryable: true,
      },
    })

    await expect(harness.service.pullLatest()).resolves.toMatchObject({
      action: 'pull-latest',
      direction: 'pull',
      outcome: 'blocked',
      reason: 'local-dirty',
      retryable: false,
      message: 'Pull blocked: local changes have not been pushed.',
    })
    expect(harness.githubClient.getGist).not.toHaveBeenCalled()
    expect(harness.restoreBackup).not.toHaveBeenCalled()
    expect(harness.getMetadata()).toMatchObject({
      dirtySinceLastSync: true,
      lastBlockingReason: 'local-dirty',
      lastError: null,
    })
  })

  it('pullLatest overwrites dirty local data after explicit confirmation', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:05:00.000Z',
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify(
          buildSyncEnvelope({
            backup,
            dataUpdatedAt: '2026-05-26T12:10:00.000Z',
          }),
        ),
      }),
    )

    const pullLatest = harness.service.pullLatest as (options: {
      confirmLocalOverwrite: boolean
    }) => Promise<unknown>

    await expect(
      pullLatest({ confirmLocalOverwrite: true }),
    ).resolves.toMatchObject({
      action: 'pull-latest',
      direction: 'pull',
      outcome: 'success',
      reason: null,
      retryable: false,
      message: 'Latest Gist data pulled. Local changes were overwritten.',
    })
    expect(harness.restoreBackup).toHaveBeenCalledWith(backup)
    expect(harness.flushDbSnapshot).toHaveBeenCalled()
    expect(harness.broadcastInvalidation).toHaveBeenCalled()
    expect(harness.getMetadata()).toMatchObject({
      dirtySinceLastSync: false,
      lastBlockingReason: null,
      lastPullAt: currentTime,
      lastRemoteVersion: 'remote_2',
      lastSyncDirection: 'pull',
    })
  })

  it('pullLatest returns no-change when remote is unchanged', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:00:00.000Z',
        remoteVersion: 'remote_1',
      }),
    )

    await expect(harness.service.pullLatest()).resolves.toMatchObject({
      action: 'pull-latest',
      direction: 'pull',
      outcome: 'no-change',
      reason: 'remote-unchanged',
      retryable: false,
      message: 'No remote changes.',
    })
    expect(harness.restoreBackup).not.toHaveBeenCalled()
    expect(harness.getMetadata()).toMatchObject({
      lastSyncAt: currentTime,
      lastSyncDirection: 'no-change',
      lastBlockingReason: null,
    })
  })

  it('checkRemoteOnOpen skips when sync is not configured without fetching remote data', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: false,
      gistId: null,
      dirtySinceLastSync: false,
    })

    await expect(harness.service.checkRemoteOnOpen()).resolves.toMatchObject({
      action: 'check-remote-on-open',
      direction: null,
      outcome: 'no-change',
      reason: 'not-configured',
      retryable: false,
      message: 'Remote check skipped: GitHub Gist sync is not configured.',
    })
    expect(harness.githubClient.getGist).not.toHaveBeenCalled()
    expect(harness.restoreBackup).not.toHaveBeenCalled()
  })

  it('checkRemoteOnOpen skips dirty local data without fetching remote data', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:05:00.000Z',
    })

    await expect(harness.service.checkRemoteOnOpen()).resolves.toMatchObject({
      action: 'check-remote-on-open',
      direction: null,
      outcome: 'no-change',
      reason: 'local-dirty',
      retryable: false,
      message: 'Remote check skipped: local changes need to be pushed.',
    })
    expect(harness.githubClient.getGist).not.toHaveBeenCalled()
    expect(harness.restoreBackup).not.toHaveBeenCalled()
  })

  it('checkRemoteOnOpen updates metadata when remote is unchanged', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
      lastBlockingReason: 'remote-changed',
      lastError: {
        kind: 'network',
        message: 'Previous network failure.',
        occurredAt: '2026-05-26T12:00:00.000Z',
        retryable: true,
      },
      conflict: {
        detectedAt: '2026-05-26T12:00:00.000Z',
        localDataUpdatedAt: null,
        remoteUpdatedAt: '2026-05-26T12:00:00.000Z',
        remoteVersion: 'remote_1',
      },
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_1',
      }),
    )

    await expect(harness.service.checkRemoteOnOpen()).resolves.toMatchObject({
      action: 'check-remote-on-open',
      direction: null,
      outcome: 'no-change',
      reason: 'remote-unchanged',
      retryable: false,
      message: 'Remote check found no changes.',
    })
    expect(harness.restoreBackup).not.toHaveBeenCalled()
    expect(harness.getMetadata()).toMatchObject({
      lastSyncAt: currentTime,
      lastSyncDirection: 'no-change',
      lastRemoteVersion: 'remote_1',
      lastRemoteUpdatedAt: '2026-05-26T12:10:00.000Z',
      lastAutoSyncAt: currentTime,
      lastBlockingReason: null,
      lastError: null,
      conflict: null,
    })
  })

  it('checkRemoteOnOpen pulls changed remote data and resets retry state', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
      autoSyncRetryAttempt: 2,
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify(
          buildSyncEnvelope({
            backup,
            dataUpdatedAt: '2026-05-26T12:10:00.000Z',
          }),
        ),
      }),
    )

    await expect(harness.service.checkRemoteOnOpen()).resolves.toMatchObject({
      action: 'check-remote-on-open',
      direction: 'pull',
      outcome: 'success',
      reason: null,
      retryable: false,
      message: 'Latest Gist data pulled.',
    })
    expect(harness.restoreBackup).toHaveBeenCalledWith(backup)
    expect(harness.flushDbSnapshot).toHaveBeenCalled()
    expect(harness.broadcastInvalidation).toHaveBeenCalled()
    expect(harness.getMetadata()).toMatchObject({
      dirtySinceLastSync: false,
      lastPullAt: currentTime,
      lastRemoteVersion: 'remote_2',
      lastSyncDirection: 'pull',
      autoSyncRetryAttempt: 0,
      lastAutoSyncAt: currentTime,
    })
  })

  it('pushLocal writes local backup when remote is unchanged', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:05:00.000Z',
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:00:00.000Z',
        remoteVersion: 'remote_1',
      }),
    )
    harness.githubClient.updateSyncGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: currentTime,
        remoteVersion: 'remote_2',
      }),
    )

    await expect(harness.service.pushLocal()).resolves.toMatchObject({
      action: 'push-local',
      direction: 'push',
      outcome: 'success',
      reason: null,
      retryable: false,
      message: 'Local data pushed to Gist.',
    })
    expect(harness.githubClient.updateSyncGist).toHaveBeenCalledTimes(1)
    expect(harness.getMetadata()).toMatchObject({
      dirtySinceLastSync: false,
      lastPushAt: currentTime,
      lastRemoteVersion: 'remote_2',
      lastSyncDirection: 'push',
    })
  })

  it('pushLocal works while auto-sync is paused and keeps auto-sync paused', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: false,
      gistId: 'gist_1',
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:05:00.000Z',
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:00:00.000Z',
        remoteVersion: 'remote_1',
      }),
    )
    harness.githubClient.updateSyncGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: currentTime,
        remoteVersion: 'remote_2',
      }),
    )

    await expect(harness.service.pushLocal()).resolves.toMatchObject({
      action: 'push-local',
      direction: 'push',
      outcome: 'success',
      message: 'Local data pushed to Gist.',
      status: {
        enabled: false,
        configured: true,
      },
    })
    expect(harness.githubClient.updateSyncGist).toHaveBeenCalledTimes(1)
    expect(harness.getMetadata()).toMatchObject({
      enabled: false,
      dirtySinceLastSync: false,
      lastPushAt: currentTime,
      lastRemoteVersion: 'remote_2',
      lastSyncDirection: 'push',
    })
  })

  it('pushLocal requires confirmation when remote changed elsewhere', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:05:00.000Z',
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_2',
      }),
    )

    await expect(harness.service.pushLocal()).resolves.toMatchObject({
      action: 'push-local',
      direction: 'push',
      outcome: 'confirmation-required',
      reason: 'remote-changed',
      retryable: false,
      message: 'Remote changed since this browser last synced.',
    })
    expect(harness.githubClient.updateSyncGist).not.toHaveBeenCalled()
    expect(harness.getMetadata()).toMatchObject({
      conflict: {
        localDataUpdatedAt: '2026-05-26T12:05:00.000Z',
        remoteUpdatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_2',
      },
      lastBlockingReason: 'remote-changed',
    })
  })

  it('pushLocal overwrites changed remote data after confirmation', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:05:00.000Z',
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_2',
      }),
    )
    harness.githubClient.updateSyncGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: currentTime,
        remoteVersion: 'remote_3',
      }),
    )

    await expect(
      harness.service.pushLocal({ confirmRemoteOverwrite: true }),
    ).resolves.toMatchObject({
      action: 'push-local',
      direction: 'push',
      outcome: 'success',
      reason: null,
      retryable: false,
    })
    expect(harness.githubClient.updateSyncGist).toHaveBeenCalledTimes(1)
    expect(harness.getMetadata()).toMatchObject({
      conflict: null,
      dirtySinceLastSync: false,
      lastBlockingReason: null,
      lastPushAt: currentTime,
    })
  })

  it('pushLocal returns a redacted retryable error result for network failures', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:05:00.000Z',
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockRejectedValue(
      new Error('Failed to fetch with Bearer ghp_secret'),
    )

    await expect(harness.service.pushLocal()).resolves.toMatchObject({
      action: 'push-local',
      direction: 'push',
      outcome: 'error',
      reason: 'network',
      retryable: true,
    })
    expect(JSON.stringify(harness.getMetadata().lastError)).not.toContain(
      'ghp_secret',
    )
    expect(harness.getMetadata().dirtySinceLastSync).toBe(true)
  })

  it('creates a private Gist from current backup', async () => {
    const harness = createHarness()
    harness.githubClient.createSyncGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: currentTime,
        remoteVersion: 'remote_1',
        content: '{}',
      }),
    )

    await expect(harness.service.createGithubGist()).resolves.toMatchObject({
      message: 'GitHub Gist created.',
      status: {
        configured: true,
        tokenStatus,
      },
    })

    const content = harness.githubClient.createSyncGist.mock.calls[0]?.[0]
    expect(JSON.parse(content ?? '{}')).toMatchObject({
      app: 'cognipace',
      dataUpdatedAt: currentTime,
      backup,
    })
    expect(harness.getMetadata()).toMatchObject({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
      lastSyncDirection: 'push',
    })
  })

  it('pullLatest manually restores clean local data when remote changed', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify(
          buildSyncEnvelope({
            backup,
            dataUpdatedAt: '2026-05-26T12:10:00.000Z',
          }),
        ),
      }),
    )

    await harness.service.pullLatest()

    expect(harness.restoreBackup).toHaveBeenCalledWith(backup)
    expect(harness.flushDbSnapshot).toHaveBeenCalled()
    expect(harness.broadcastInvalidation).toHaveBeenCalled()
    expect(harness.getMetadata()).toMatchObject({
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_2',
      lastRemoteUpdatedAt: '2026-05-26T12:10:00.000Z',
      lastSyncDirection: 'pull',
    })
  })

  it('does not overwrite a truncated remote sync file when connecting a Gist', async () => {
    const harness = createHarness()
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        remoteVersion: 'remote_1',
        content: null,
        contentTruncated: true,
        rawUrl:
          'https://gist.githubusercontent.com/octocat/gist_1/raw/sync.json',
      }),
    )

    await expect(harness.service.connectGithubGist('gist_1')).rejects.toThrow(
      /truncated/i,
    )
    expect(harness.githubClient.updateSyncGist).not.toHaveBeenCalled()
    expect(harness.getMetadata().lastError).toMatchObject({
      kind: 'remote-invalid',
    })
  })

  it('does not overwrite an empty remote sync file when connecting a Gist', async () => {
    const harness = createHarness()
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        remoteVersion: 'remote_1',
        content: '',
      }),
    )

    await expect(harness.service.connectGithubGist('gist_1')).rejects.toThrow(
      /empty/i,
    )
    expect(harness.githubClient.updateSyncGist).not.toHaveBeenCalled()
    expect(harness.getMetadata().lastError).toMatchObject({
      kind: 'remote-invalid',
    })
  })

  it('rejects an invalid existing remote Gist without configuring clean local data', async () => {
    const harness = createHarness()
    harness.setMetadata({
      dirtySinceLastSync: false,
      localDataUpdatedAt: '2026-05-26T12:00:00.000Z',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:20:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify({
          syncEnvelopeVersion: 1,
          app: 'not-cognipace',
          exportedAt: '2026-05-26T12:20:00.000Z',
          dataUpdatedAt: '2026-05-26T12:20:00.000Z',
          backup,
          problems: [],
        }),
      }),
    )

    await expect(harness.service.connectGithubGist('gist_1')).rejects.toThrow(
      /CogniPace sync file/i,
    )
    expect(harness.restoreBackup).not.toHaveBeenCalled()
    expect(harness.githubClient.updateSyncGist).not.toHaveBeenCalled()
    expect(harness.getMetadata()).toMatchObject({
      enabled: false,
      gistId: null,
      lastRemoteVersion: null,
      lastRemoteUpdatedAt: null,
    })
    expect(harness.getMetadata().lastError).toMatchObject({
      kind: 'remote-invalid',
    })
  })

  it('validates an existing remote Gist without restoring or recording clean local data as synced', async () => {
    const harness = createHarness()
    harness.setMetadata({
      dirtySinceLastSync: false,
      localDataUpdatedAt: '2026-05-26T12:00:00.000Z',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:20:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify(
          buildSyncEnvelope({
            backup,
            dataUpdatedAt: '2026-05-26T12:20:00.000Z',
          }),
        ),
      }),
    )

    await expect(harness.service.connectGithubGist('gist_1')).resolves.toEqual(
      expect.objectContaining({
        action: 'connect-gist',
        direction: null,
        outcome: 'success',
        message:
          'GitHub Gist connected. Use Pull latest to update this browser.',
      }),
    )
    expect(harness.restoreBackup).not.toHaveBeenCalled()
    expect(harness.getMetadata()).toMatchObject({
      enabled: true,
      gistId: 'gist_1',
      lastRemoteVersion: null,
      lastRemoteUpdatedAt: null,
      lastSyncDirection: null,
    })
    expect(harness.getMetadata().conflict).toBeNull()

    await expect(harness.service.pullLatest()).resolves.toMatchObject({
      action: 'pull-latest',
      direction: 'pull',
      outcome: 'success',
      message: 'Latest Gist data pulled.',
    })
    expect(harness.restoreBackup).toHaveBeenCalledWith(backup)
  })

  it('falls back to updatedAt when remote versions become available later', async () => {
    const harness = createHarness()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:05:00.000Z',
      lastRemoteVersion: null,
      lastRemoteUpdatedAt: '2026-05-26T12:00:00.000Z',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:00:00.000Z',
        remoteVersion: 'remote_1',
        content: JSON.stringify(
          buildSyncEnvelope({
            backup,
            dataUpdatedAt: '2026-05-26T12:00:00.000Z',
          }),
        ),
      }),
    )
    harness.githubClient.updateSyncGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: currentTime,
        remoteVersion: 'remote_2',
      }),
    )

    await expect(harness.service.pushLocal()).resolves.toMatchObject({
      message: 'Local data pushed to Gist.',
    })
    expect(harness.githubClient.updateSyncGist).toHaveBeenCalled()
    expect(harness.getMetadata().conflict).toBeNull()
  })

  it('serializes disable behind an in-flight push', async () => {
    const harness = createHarness()
    const push = createDeferred<GitHubGistSummary>()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:05:00.000Z',
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:00:00.000Z',
        remoteVersion: 'remote_1',
      }),
    )
    harness.githubClient.updateSyncGist.mockReturnValue(push.promise)

    const syncPromise = harness.service.pushLocal()
    await waitUntil(() => {
      expect(harness.githubClient.updateSyncGist).toHaveBeenCalled()
    })
    const disablePromise = harness.service.setEnabled(false)

    push.resolve(
      createGistSummary({
        id: 'gist_1',
        updatedAt: currentTime,
        remoteVersion: 'remote_2',
      }),
    )

    await syncPromise
    await disablePromise
    expect(harness.getMetadata().enabled).toBe(false)
  })

  it('setEnabled returns auto-sync pause and resume messages', async () => {
    const harness = createHarness()

    await expect(harness.service.setEnabled(false)).resolves.toMatchObject({
      action: 'set-enabled',
      direction: null,
      outcome: 'success',
      message: 'Auto-sync paused.',
      status: {
        enabled: false,
      },
    })
    await expect(harness.service.setEnabled(true)).resolves.toMatchObject({
      action: 'set-enabled',
      direction: null,
      outcome: 'success',
      message: 'Auto-sync resumed.',
      status: {
        enabled: true,
      },
    })
  })

  it('keeps data dirty when local data changes during an in-flight push', async () => {
    const harness = createHarness()
    const push = createDeferred<GitHubGistSummary>()
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:05:00.000Z',
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:00:00.000Z',
        remoteVersion: 'remote_1',
      }),
    )
    harness.githubClient.updateSyncGist.mockReturnValue(push.promise)

    const syncPromise = harness.service.pushLocal()
    await waitUntil(() => {
      expect(harness.githubClient.updateSyncGist).toHaveBeenCalled()
    })
    harness.setMetadata({
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:06:00.000Z',
    })

    push.resolve(
      createGistSummary({
        id: 'gist_1',
        updatedAt: currentTime,
        remoteVersion: 'remote_2',
      }),
    )

    await syncPromise
    expect(harness.getMetadata()).toMatchObject({
      dirtySinceLastSync: true,
      localDataUpdatedAt: '2026-05-26T12:06:00.000Z',
      lastRemoteVersion: 'remote_2',
    })
  })

  it('runs remote pulls through the injected restore coordinator', async () => {
    const runRemoteRestoreCalls: Array<() => Promise<unknown>> = []
    let metadataCleanedBeforeRestoreCoordinatorSettled = false
    let readMetadata: () => SyncMetadata = () => {
      throw new Error('Harness metadata is not available.')
    }
    const runRemoteRestore: NonNullable<
      SyncServiceDependencies['runRemoteRestore']
    > = async (work) => {
      runRemoteRestoreCalls.push(work)
      const result = await work()
      metadataCleanedBeforeRestoreCoordinatorSettled =
        readMetadata().dirtySinceLastSync === false &&
        readMetadata().lastSyncDirection === 'pull'

      return result
    }
    const harness = createHarness({ runRemoteRestore })
    readMetadata = harness.getMetadata
    harness.setMetadata({
      enabled: true,
      gistId: 'gist_1',
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_1',
    })
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({
        id: 'gist_1',
        updatedAt: '2026-05-26T12:10:00.000Z',
        remoteVersion: 'remote_2',
        content: JSON.stringify(
          buildSyncEnvelope({
            backup,
            dataUpdatedAt: '2026-05-26T12:10:00.000Z',
          }),
        ),
      }),
    )

    await harness.service.pullLatest()

    expect(runRemoteRestoreCalls).toHaveLength(1)
    expect(metadataCleanedBeforeRestoreCoordinatorSettled).toBe(true)
    expect(harness.restoreBackup).toHaveBeenCalledWith(backup)
    expect(harness.flushDbSnapshot).toHaveBeenCalled()
    expect(harness.broadcastInvalidation).toHaveBeenCalled()
  })

  it('uses the shared replacement coordinator to recover a failed snapshot without fetching or restoring again', async () => {
    const harness = configuredPullHarness()
    harness.flushDbSnapshot.mockRejectedValueOnce(new Error('disk unavailable'))
    harness.broadcastInvalidation.mockRejectedValueOnce(new Error('transport'))
    const result = await harness.service.pullLatest()
    expect(result).toMatchObject({
      outcome: 'error',
      reason: 'unknown',
      retryable: true,
      message:
        'Gist data was applied in memory but still needs saving. Open Settings > Data Management and choose Retry saving.',
    })
    expect(harness.replacement.getState()).toMatchObject({
      status: 'persistence-pending',
      kind: 'gist-pull',
    })
    expect(harness.broadcastInvalidation).not.toHaveBeenCalled()
    expect(await harness.replacement.retry()).toMatchObject({
      status: 'durable',
      syncMetadataPending: false,
    })
    expect(harness.githubClient.getGist).toHaveBeenCalledTimes(1)
    expect(harness.restoreBackup).toHaveBeenCalledTimes(1)
    expect(harness.flushDbSnapshot).toHaveBeenCalledTimes(2)
    expect(harness.broadcastInvalidation).toHaveBeenCalledTimes(1)
    expect(harness.getMetadata()).toMatchObject({
      dirtySinceLastSync: false,
      lastRemoteVersion: 'remote_2',
      localDataUpdatedAt: '2026-05-26T12:10:00.000Z',
    })
  })

  it('freezes the complete automatic pull patch for metadata-only retry', async () => {
    const harness = configuredPullHarness()
    harness.setMetadata({
      autoSyncRetryAttempt: 4,
      lastAutoSyncAt: '2026-05-26T11:00:00.000Z',
    })
    harness.writeMetadata.mockRejectedValueOnce(
      new Error('storage unavailable'),
    )
    expect(await harness.service.checkRemoteOnOpen()).toMatchObject({
      outcome: 'error',
      retryable: true,
      message:
        'Gist data is saved locally, but sync status still needs saving. Open Settings > Data Management and choose Retry saving.',
    })
    const frozenPatch = { ...harness.writeMetadata.mock.calls[0]![0] }
    expect(frozenPatch).toEqual({
      enabled: true,
      gistId: 'gist_1',
      lastSyncAt: currentTime,
      lastSyncDirection: 'pull',
      lastPullAt: currentTime,
      lastRemoteVersion: 'remote_2',
      lastRemoteUpdatedAt: '2026-05-26T12:10:00.000Z',
      localDataUpdatedAt: '2026-05-26T12:10:00.000Z',
      dirtySinceLastSync: false,
      lastBlockingReason: null,
      conflict: null,
      lastError: null,
      autoSyncRetryAttempt: 0,
      lastAutoSyncAt: currentTime,
    })
    harness.now.mockReturnValue(new Date('2026-05-27T10:00:00.000Z'))
    harness.githubClient.getGist.mockResolvedValue(
      createGistSummary({ id: 'other', remoteVersion: 'newer' }),
    )
    expect(await harness.replacement.retry()).toMatchObject({
      status: 'durable',
      syncMetadataPending: false,
    })
    expect(harness.writeMetadata.mock.calls.at(-1)![0]).toEqual(frozenPatch)
    expect(harness.restoreBackup).toHaveBeenCalledTimes(1)
    expect(harness.flushDbSnapshot).toHaveBeenCalledTimes(1)
    expect(harness.broadcastInvalidation).toHaveBeenCalledTimes(1)
    expect(harness.githubClient.getGist).toHaveBeenCalledTimes(1)
  })

  it.each(['persistence', 'metadata', 'completed'] as const)(
    'returns redacted last-known status when reads and error recording fail after %s application',
    async (stage) => {
      const harness = configuredPullHarness()
      harness.restoreBackup.mockImplementationOnce(() => {
        harness.readMetadata.mockRejectedValue(
          new Error('status unavailable ghp_secret'),
        )
        harness.getTokenStatus.mockRejectedValue(
          new Error('token status unavailable github_pat_secret'),
        )
        if (stage !== 'completed')
          harness.writeMetadata.mockRejectedValue(
            new Error('metadata unavailable'),
          )
        return Promise.resolve(backupSummary)
      })
      if (stage === 'persistence')
        harness.flushDbSnapshot.mockRejectedValueOnce(new Error('disk'))
      const result = await harness.service.pullLatest()
      expect(syncActionResultSchema.parse(result)).toEqual(result)
      expect(result.outcome).toBe(stage === 'completed' ? 'success' : 'error')
      expect(result.status.tokenStatus).toEqual(tokenStatus)
      expect(JSON.stringify(result)).not.toContain('ghp_secret')
      expect(JSON.stringify(result)).not.toContain('github_pat_secret')
      expect(harness.restoreBackup).toHaveBeenCalledTimes(1)
      if (stage !== 'completed') {
        harness.writeMetadata.mockImplementation((patch) =>
          Promise.resolve({ ...defaultSyncMetadata, ...patch }),
        )
        expect(await harness.replacement.retry()).toMatchObject({
          status: 'durable',
          syncMetadataPending: false,
        })
        expect(harness.restoreBackup).toHaveBeenCalledTimes(1)
        expect(harness.githubClient.getGist).toHaveBeenCalledTimes(1)
      }
    },
  )

  it.each([{ updatedAt: 'invalid' }, { id: 12 }, { remoteVersion: 12 }])(
    'preflights complete remote metadata before destructive application: %j',
    async (invalid) => {
      const harness = configuredPullHarness()
      harness.githubClient.getGist.mockResolvedValue({
        ...pullGist(),
        ...invalid,
      } as unknown as GitHubGistSummary)
      expect(await harness.service.pullLatest()).toMatchObject({
        outcome: 'error',
        reason: 'invalid-remote',
      })
      expect(harness.restoreBackup).not.toHaveBeenCalled()
      expect(harness.flushDbSnapshot).not.toHaveBeenCalled()
      expect(harness.replacement.getState()).toEqual({ status: 'idle' })
    },
  )

  it('preflights complete backup identities before runner commit', async () => {
    const harness = configuredPullHarness()
    const invalid = {
      ...backup,
      data: {
        ...backup.data,
        companies: [
          { id: 'same', label: 'One' },
          { id: 'same', label: 'Two' },
        ],
      },
    }
    harness.githubClient.getGist.mockResolvedValue({
      ...pullGist(),
      content: JSON.stringify(
        buildSyncEnvelope({ backup: invalid, dataUpdatedAt: currentTime }),
      ),
    })
    expect(await harness.service.pullLatest()).toMatchObject({
      outcome: 'error',
      reason: 'invalid-remote',
    })
    expect(harness.restoreBackup).not.toHaveBeenCalled()
    expect(harness.flushDbSnapshot).not.toHaveBeenCalled()
  })

  it('propagates explicit manual overwrite confirmation to the runtime apply guard', async () => {
    const guard = vi.fn()
    const runRemoteRestore: NonNullable<
      SyncServiceDependencies['runRemoteRestore']
    > = (apply, context) => {
      guard(apply, context)
      return apply()
    }
    const harness = configuredPullHarness({ runRemoteRestore })
    harness.setMetadata({ dirtySinceLastSync: true })
    await harness.service.pullLatest({ confirmLocalOverwrite: true })
    expect(guard).toHaveBeenCalledWith(expect.any(Function), {
      confirmLocalOverwrite: true,
    })
    const automatic = configuredPullHarness({ runRemoteRestore })
    await automatic.service.checkRemoteOnOpen()
    expect(guard).toHaveBeenLastCalledWith(expect.any(Function), {
      confirmLocalOverwrite: false,
    })
  })

  it('protects an unsynced replacement after a worker restart loses pending callbacks', async () => {
    // A strict local pre-marker survives independently of worker-owned recovery callbacks.
    const harness = configuredPullHarness()
    harness.setMetadata({
      dirtySinceLastSync: true,
      localDataUpdatedAt: currentTime,
    })
    const reopenedCoordinator = createBackupReplacementCoordinator()
    expect(reopenedCoordinator.getState()).toEqual({ status: 'idle' })
    expect(await harness.service.checkRemoteOnOpen()).toMatchObject({
      outcome: 'no-change',
      reason: 'local-dirty',
    })
    expect(harness.githubClient.getGist).not.toHaveBeenCalled()
    expect(harness.restoreBackup).not.toHaveBeenCalled()
  })
})

function pullGist() {
  return createGistSummary({
    id: 'gist_1',
    updatedAt: '2026-05-26T12:10:00.000Z',
    remoteVersion: 'remote_2',
    content: JSON.stringify(
      buildSyncEnvelope({ backup, dataUpdatedAt: '2026-05-26T12:10:00.000Z' }),
    ),
  })
}

function configuredPullHarness(
  overrides: Parameters<typeof createHarness>[0] = {},
) {
  const harness = createHarness(overrides)
  harness.setMetadata({
    enabled: true,
    gistId: 'gist_1',
    lastRemoteVersion: 'remote_1',
  })
  harness.githubClient.getGist.mockResolvedValue(pullGist())
  return harness
}

function createHarness(
  overrides: Partial<
    Pick<SyncServiceDependencies, 'runRemoteRestore' | 'syncCoordinator'>
  > = {},
) {
  let metadata: SyncMetadata = { ...defaultSyncMetadata }
  const restoreBackup = vi
    .fn<(backup: BackupFile) => Promise<BackupSummary>>()
    .mockResolvedValue(backupSummary)
  const exportFullBackup = vi
    .fn<() => Promise<BackupFile>>()
    .mockResolvedValue(backup)
  const flushDbSnapshot = vi
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined)
  const broadcastInvalidation = vi
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined)
  const githubClient = {
    validateToken: vi
      .fn<() => Promise<{ ok: true; login: string }>>()
      .mockResolvedValue({ ok: true, login: 'octocat' }),
    getGist: vi.fn<(gistId: string) => Promise<GitHubGistSummary>>(),
    createSyncGist: vi.fn<(content: string) => Promise<GitHubGistSummary>>(),
    updateSyncGist:
      vi.fn<(gistId: string, content: string) => Promise<GitHubGistSummary>>(),
  }

  const readToken = vi.fn().mockResolvedValue('ghp_secret')
  const saveToken = vi.fn().mockResolvedValue(undefined)
  const writeMetadata = vi.fn((patch: Partial<SyncMetadata>) => {
    metadata = { ...metadata, ...patch }
    return Promise.resolve(metadata)
  })
  const createGitHubClient = vi.fn(() => githubClient)
  const readMetadata = vi.fn(() => Promise.resolve(metadata))
  const getTokenStatus = vi.fn().mockResolvedValue(tokenStatus)
  const replacement = createBackupReplacementCoordinator()
  const now = vi.fn(() => new Date(currentTime))

  const service = createSyncService({
    readToken,
    saveToken,
    deleteToken: vi.fn().mockResolvedValue(undefined),
    getTokenStatus,
    createGitHubClient,
    readMetadata,
    writeMetadata,
    exportFullBackup,
    restoreBackup,
    flushDbSnapshot,
    broadcastInvalidation,
    runReplacement: replacement.run,
    now,
    syncCoordinator:
      overrides.syncCoordinator ?? createSyncOperationCoordinator(),
    ...(overrides.runRemoteRestore
      ? { runRemoteRestore: overrides.runRemoteRestore }
      : {}),
  })

  return {
    service,
    githubClient,
    getMetadata: () => metadata,
    setMetadata: (patch: Partial<SyncMetadata>) => {
      metadata = { ...metadata, ...patch }
    },
    restoreBackup,
    exportFullBackup,
    flushDbSnapshot,
    broadcastInvalidation,
    readToken,
    saveToken,
    writeMetadata,
    createGitHubClient,
    replacement,
    readMetadata,
    getTokenStatus,
    now,
  }
}

function createExternalProgressBackup(): BackupFile {
  return {
    ...backup,
    data: {
      ...backup.data,
      tracks: {
        ...backup.data.tracks,
        tracks: [
          {
            id: 'custom-track',
            slug: 'custom-track',
            title: 'Custom Track',
            description: null,
            dueAt: null,
            allowExternalProgress: true,
            createdAt: backup.exportedAt,
            updatedAt: backup.exportedAt,
          },
        ],
      },
    },
  }
}

function didWritePersistedLastError(harness: ReturnType<typeof createHarness>) {
  return harness.writeMetadata.mock.calls.some(
    ([patch]) => patch.lastError !== undefined && patch.lastError !== null,
  )
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

async function waitUntil(assertion: () => void) {
  let lastError: unknown

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  throw lastError
}

function createGistSummary(
  input: Partial<GitHubGistSummary> & Pick<GitHubGistSummary, 'id'>,
): GitHubGistSummary {
  return {
    id: input.id,
    htmlUrl: input.htmlUrl ?? `https://gist.github.com/${input.id}`,
    updatedAt: input.updatedAt ?? currentTime,
    remoteVersion: input.remoteVersion ?? null,
    content: input.content ?? null,
    contentTruncated: input.contentTruncated ?? false,
    rawUrl: input.rawUrl ?? null,
  }
}
