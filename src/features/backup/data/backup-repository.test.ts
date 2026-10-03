import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { setAiProviderSecret } from '@/features/genai/server/genai-settings-service'
import { defaultUserSettings } from '@/features/settings/domain'
import { createSettingsRepository } from '@/features/settings/data/settings-repository'
import {
  companies,
  fsrsCards,
  problemCompanies,
  problemPractice,
  problems,
  problemTopics,
  reviewAttempts,
  settingsKv,
  topicAliases,
  topicRelations,
  topics,
  trackGroupProblems,
  trackGroups,
  trackProblemProgress,
  trackSession,
  tracks,
} from '@/platform/db/schema'
import { createTestDb } from '@/platform/db/test-db'

import type { BackupData } from '../api/backup-contracts'
import {
  clearAndRestoreBackupData,
  createBackupRepository,
  resetLocalDataToFreshInstall,
} from './backup-repository'

const now = new Date('2026-05-25T12:00:00.000Z')
const timestamp = now.getTime()
const settingsValue = JSON.stringify({
  ...defaultUserSettings,
  analytics: {
    targetRecall: 0.8,
    targetReviewSuccess: 0.95,
    targetFirstAttemptSuccess: 0.29,
    targetFirstAttemptGoodEasy: 1,
  },
  review: { ...defaultUserSettings.review, targetRetention: 0.75 },
  practice: {
    ...defaultUserSettings.practice,
    dailyGoal: 5,
  },
})

describe('backup repository', () => {
  it('exports all durable local data categories after inserting custom state', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)

    const backupData = await createBackupRepository(db).readBackupData()

    expect(backupData.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'custom-problem',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
      ]),
    )
    expect(backupData.topics).toContainEqual({
      id: 'custom-topic',
      label: 'Custom Topic',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    expect(backupData.topicAliases).toContainEqual({
      aliasKey: 'custom alias',
      label: 'Custom Alias',
      topicId: 'custom-topic',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    expect(backupData.topicRelations).toContainEqual({
      sourceTopicId: 'custom-topic',
      targetTopicId: 'custom-parent',
      kind: 'broader',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    expect(backupData.companies).toContainEqual({
      id: 'custom-company',
      label: 'Custom Company',
    })
    expect(backupData.problemTopics).toContainEqual({
      problemSlug: 'custom-problem',
      topicId: 'custom-topic',
    })
    expect(backupData.problemCompanies).toContainEqual({
      problemSlug: 'custom-problem',
      companyId: 'custom-company',
    })
    expect(backupData.practice.problemPractice).toEqual([
      expect.objectContaining({
        problemSlug: 'custom-problem',
        firstSeenAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        lastReviewedAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }),
    ])
    expect(backupData.practice.fsrsCards).toEqual([
      expect.objectContaining({
        id: 'card-custom',
        dueAt: new Date(timestamp + 86_400_000).toISOString(),
        lastReviewAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }),
    ])
    expect(backupData.practice.reviewAttempts).toEqual([
      expect.objectContaining({
        id: 'attempt-custom',
        reviewedAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }),
    ])
    expect(backupData.tracks.tracks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'custom-track' })]),
    )
    expect(backupData.tracks.groups).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'custom-group' })]),
    )
    expect(backupData.tracks.memberships).toContainEqual({
      trackGroupId: 'custom-group',
      problemSlug: 'custom-problem',
      position: 1,
    })
    expect(backupData.tracks.progress).toEqual([
      expect.objectContaining({
        trackId: 'custom-track',
        problemSlug: 'custom-problem',
        reviewAttemptId: 'attempt-custom',
        completedAt: now.toISOString(),
      }),
    ])
    expect(backupData.tracks.session).toEqual([
      expect.objectContaining({
        id: 'active',
        activeTrackId: 'custom-track',
        activeGroupId: 'custom-group',
        updatedAt: now.toISOString(),
      }),
    ])
    expect(backupData.settings).toEqual([
      {
        key: 'user-settings',
        value: settingsValue,
        updatedAt: now.toISOString(),
      },
    ])
  })

  it('replaces existing rows with backup rows and reseeds defaults', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)
    const backupData = await createBackupRepository(db).readBackupData()

    await db.delete(reviewAttempts)
    await db.delete(fsrsCards)
    await db.delete(problemPractice)
    await db.delete(trackProblemProgress)
    await db.delete(trackGroupProblems)
    await db.delete(trackSession)
    await db.delete(trackGroups)
    await db.delete(tracks)
    await db.delete(problemTopics)
    await db.delete(topicRelations)
    await db.delete(topicAliases)
    await db.delete(problemCompanies)
    await db.delete(problems)
    await db.delete(topics)
    await db.delete(companies)
    await db.delete(settingsKv)

    await clearAndRestoreBackupData(db, backupData, now)
    await expect(createSettingsRepository(db).getSettings()).resolves.toEqual(
      JSON.parse(settingsValue),
    )

    expect(await db.select().from(reviewAttempts)).toHaveLength(1)
    expect(await db.select().from(settingsKv)).toHaveLength(1)
    expect(await db.select().from(topicAliases)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ aliasKey: 'custom alias' }),
      ]),
    )
    expect(await db.select().from(topicRelations)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceTopicId: 'custom-topic',
          targetTopicId: 'custom-parent',
          kind: 'broader',
        }),
      ]),
    )
    expect(
      await db.select().from(problems).where(eq(problems.slug, 'two-sum')),
    ).toHaveLength(1)
    expect(
      await db
        .select()
        .from(problems)
        .where(eq(problems.slug, 'custom-problem')),
    ).toHaveLength(1)
  })

  it.each([
    '{"practice":{"dailyGoal":"invalid"}}',
    JSON.stringify({
      ...defaultUserSettings,
      analytics: {
        ...defaultUserSettings.analytics,
        targetFirstAttemptSuccess: 0.295,
      },
    }),
  ])(
    'rejects invalid settings before changing existing rows: %s',
    async (value) => {
      const { db } = await createTestDb({ now })
      await insertCustomState(db)
      const invalidSettings = [
        {
          key: 'user-settings',
          value,
          updatedAt: now.toISOString(),
        },
      ] satisfies BackupData['settings']
      const invalidBackupData = {
        ...(await createBackupRepository(db).readBackupData()),
        settings: invalidSettings,
      }

      await expect(
        clearAndRestoreBackupData(db, invalidBackupData, now),
      ).rejects.toThrow(/settings value must contain current UserSettings JSON/)

      expect(
        await db
          .select()
          .from(problems)
          .where(eq(problems.slug, 'custom-problem')),
      ).toHaveLength(1)
      expect(await db.select().from(settingsKv)).toEqual([
        {
          key: 'user-settings',
          value: settingsValue,
          updatedAt: timestamp,
        },
      ])
    },
  )

  it('resets to fresh install data, clears custom data, and clears settings', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)

    await resetLocalDataToFreshInstall(db, now)

    expect(await db.select().from(settingsKv)).toHaveLength(0)
    expect(await db.select().from(reviewAttempts)).toHaveLength(0)
    expect(
      await db
        .select()
        .from(problems)
        .where(eq(problems.slug, 'custom-problem')),
    ).toHaveLength(0)
    expect(
      await db.select().from(problems).where(eq(problems.slug, 'two-sum')),
    ).toHaveLength(1)
    expect(await db.select().from(trackSession)).toEqual([
      expect.objectContaining({ id: 'active' }),
    ])
  })

  it('excludes genai-secrets from the exported backup payload', async () => {
    const { db } = await createTestDb({ now })
    await insertCustomState(db)

    // Store a real AI provider secret so backup export covers secret exclusion.
    await setAiProviderSecret(db, 'openai', { apiKey: 'sk-test' })

    // Export must not throw and must never include trusted secret material.
    const backupData = await createBackupRepository(db).readBackupData()

    // The payload must not contain the secret value or the genai-secrets key
    const serialized = JSON.stringify(backupData)
    expect(serialized).not.toContain('sk-test')
    expect(serialized).not.toContain('genai-secrets')

    // The settings array must only contain the user-settings row
    expect(
      backupData.settings.every((row) => row.key === 'user-settings'),
    ).toBe(true)
  })
})

type TestDb = Awaited<ReturnType<typeof createTestDb>>['db']

async function insertCustomState(db: TestDb) {
  await db.insert(topics).values([
    {
      id: 'custom-topic',
      label: 'Custom Topic',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'custom-parent',
      label: 'Custom Parent',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ])
  await db.insert(topicAliases).values({
    aliasKey: 'custom alias',
    label: 'Custom Alias',
    topicId: 'custom-topic',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(topicRelations).values({
    sourceTopicId: 'custom-topic',
    targetTopicId: 'custom-parent',
    kind: 'broader',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(companies).values({
    id: 'custom-company',
    label: 'Custom Company',
  })
  await db.insert(problems).values({
    slug: 'custom-problem',
    title: 'Custom Problem',
    difficulty: 'medium',
    isPremium: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(problemTopics).values({
    problemSlug: 'custom-problem',
    topicId: 'custom-topic',
  })
  await db.insert(problemCompanies).values({
    problemSlug: 'custom-problem',
    companyId: 'custom-company',
  })
  await db.insert(problemPractice).values({
    problemSlug: 'custom-problem',
    status: 'review',
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    lastReviewedAt: timestamp,
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
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(fsrsCards).values({
    id: 'card-custom',
    problemSlug: 'custom-problem',
    cardKind: 'default',
    dueAt: timestamp + 86_400_000,
    stability: 2.5,
    difficulty: 4.5,
    elapsedDays: 0,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
    state: 'review',
    lastReviewAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(reviewAttempts).values({
    id: 'attempt-custom',
    problemSlug: 'custom-problem',
    cardId: 'card-custom',
    rating: 'good',
    reviewMode: 'manual',
    reviewedAt: timestamp,
    elapsedSeconds: 600,
    isCorrect: true,
    interviewPattern: 'hash-map',
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(n)',
    languages: 'TypeScript',
    notes: 'review note',
    fsrsReviewLog: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(tracks).values({
    id: 'custom-track',
    slug: 'custom-track',
    title: 'Custom Track',
    description: 'Track description',
    dueAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(trackGroups).values({
    id: 'custom-group',
    trackId: 'custom-track',
    title: 'Custom Group',
    position: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db.insert(trackGroupProblems).values({
    trackGroupId: 'custom-group',
    trackId: 'custom-track',
    problemSlug: 'custom-problem',
    position: 1,
  })
  await db.insert(trackProblemProgress).values({
    trackId: 'custom-track',
    problemSlug: 'custom-problem',
    reviewAttemptId: 'attempt-custom',
    completedAt: timestamp,
    completedRating: 'good',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await db
    .update(trackSession)
    .set({
      activeTrackId: 'custom-track',
      activeGroupId: 'custom-group',
      updatedAt: timestamp,
    })
    .where(eq(trackSession.id, 'active'))
  await db.insert(settingsKv).values({
    key: 'user-settings',
    value: settingsValue,
    updatedAt: timestamp,
  })
}
