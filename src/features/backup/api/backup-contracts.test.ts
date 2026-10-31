import { describe, expect, it } from 'vitest'

import { defaultUserSettings } from '@/features/settings/domain'

import {
  backupFileSchema,
  backupPayloadRequestSchema,
  backupSchemaVersion,
  createBackupSummary,
  parseBackupFileForCurrentApp,
} from './backup-contracts'

import {
  backupFileV1Schema,
  backupFileV2Schema,
  backupFileV3Schema,
  backupFileV4Schema,
  backupFileV5Schema,
  type BackupFileV1,
  type BackupFileV2,
  type BackupFileV3,
  type BackupFileV4,
  type BackupFileV5,
  type LegacyBackupFile,
} from './backup-legacy-contracts'

const timestamp = '2026-05-25T12:00:00.000Z'

function createValidBackupFixture() {
  return {
    schemaVersion: backupSchemaVersion,
    app: 'cognipace',
    exportedAt: timestamp,
    source: {
      appVersion: '0.0.0',
    },
    data: {
      problems: [
        {
          slug: 'two-sum',
          title: 'Two Sum',
          difficulty: 'easy',
          isPremium: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      topics: [
        {
          id: 'array',
          label: 'Array',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: 'hash-table',
          label: 'Hash Table',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      topicAliases: [
        {
          aliasKey: 'custom hash',
          label: 'Custom Hash',
          topicId: 'hash-table',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      topicRelations: [
        {
          sourceTopicId: 'hash-table',
          targetTopicId: 'array',
          kind: 'broader',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      companies: [{ id: 'meta', label: 'Meta' }],
      problemTopics: [{ problemSlug: 'two-sum', topicId: 'array' }],
      problemCompanies: [{ problemSlug: 'two-sum', companyId: 'meta' }],
      practice: {
        schedulerProfiles: [],
        reviewEvidence: [
          {
            reviewAttemptId: 'attempt-1',
            cardId: 'card-1',
            applicationSequence: 1,
            revision: 0,
            sequenceSource: 'legacy-inferred',
            schedulingEvidenceKind: 'unknown',
            schedulerProfileId: null,
            preCardJson: null,
            assessmentEvidenceJson: null,
          },
        ],
        generations: [],
        commandReceipts: [],
        problemPractice: [
          {
            problemSlug: 'two-sum',
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
          },
        ],
        fsrsCards: [
          {
            id: 'card-1',
            problemSlug: 'two-sum',
            cardKind: 'default',
            dueAt: timestamp,
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
          },
        ],
        reviewAttempts: [
          {
            id: 'attempt-1',
            problemSlug: 'two-sum',
            cardId: 'card-1',
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
            allowExternalProgress: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        groups: [
          {
            id: 'custom-track:arrays',
            trackId: 'custom-track',
            title: 'Arrays',
            position: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
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
            reviewAttemptId: null,
            completedAt: timestamp,
            completedRating: 'good',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        session: [
          {
            id: 'active',
            activeTrackId: 'custom-track',
            activeGroupId: 'custom-track:arrays',
            startedAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      },
      settings: [
        {
          key: 'user-settings',
          value: JSON.stringify(defaultUserSettings),
          updatedAt: timestamp,
        },
      ],
    },
  }
}

describe('backup contracts', () => {
  it.each([
    { targetRecall: 0.825, targetReviewSuccess: 0.955 },
    {
      ...defaultUserSettings.analytics,
      targetFirstAttemptSuccess: 0.29,
      targetFirstAttemptGoodEasy: 1,
    },
  ])('preserves old and current chart preference JSON: %j', (analytics) => {
    const fixture = createValidBackupFixture()
    fixture.data.settings[0]!.value = JSON.stringify({
      ...defaultUserSettings,
      analytics,
    })
    expect(parseBackupFileForCurrentApp(fixture).data.settings).toEqual(
      fixture.data.settings,
    )
  })

  it.each([
    { targetFirstAttemptSuccess: 0.295 },
    { targetFirstAttemptGoodEasy: null },
    { targetRecall: 0.95, targetReviewSuccess: 0.9 },
  ])(
    'rejects invalid imported targets instead of applying local recovery: %j',
    (patch) => {
      const fixture = createValidBackupFixture()
      fixture.data.settings[0]!.value = JSON.stringify({
        ...defaultUserSettings,
        analytics: { ...defaultUserSettings.analytics, ...patch },
      })
      expect(() => parseBackupFileForCurrentApp(fixture)).toThrow(
        'settings value must contain current UserSettings JSON',
      )
    },
  )

  it('parses a valid v5 CogniPace backup and creates summary counts', () => {
    const backup = parseBackupFileForCurrentApp(createValidBackupFixture())

    expect(backup).toEqual(createValidBackupFixture())
    expect(createBackupSummary(backup)).toEqual({
      schemaVersion: backupSchemaVersion,
      exportedAt: timestamp,
      source: { appVersion: '0.0.0' },
      counts: {
        problems: 1,
        topics: 2,
        topicAliases: 1,
        topicRelations: 1,
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
    })
  })

  it('requires an explicit boolean external-progress policy in v5', () => {
    const fixture = createFrozenLegacyFixture(5)
    const track = fixture.data.tracks.tracks[0]!
    const legacyTrack = Object.fromEntries(
      Object.entries(track).filter(([key]) => key !== 'allowExternalProgress'),
    )
    const withTrack = (value: unknown) => ({
      ...fixture,
      schemaVersion: 5,
      data: {
        ...fixture.data,
        tracks: { ...fixture.data.tracks, tracks: [value] },
      },
    })

    expect(
      parseBackupFileForCurrentApp(withTrack(track)).data.tracks.tracks[0],
    ).toMatchObject({ allowExternalProgress: true })
    expect(() => parseBackupFileForCurrentApp(withTrack(legacyTrack))).toThrow()
    expect(() =>
      parseBackupFileForCurrentApp(
        withTrack({ ...track, allowExternalProgress: 1 }),
      ),
    ).toThrow()
  })

  it.each([1, 2, 3, 4] as const)(
    'defaults v%s external progress to false and retains stored progress',
    (schemaVersion) => {
      const legacy = createLegacyBackupFixture(schemaVersion)
      const parsed = parseBackupFileForCurrentApp(legacy)

      expect(parsed.schemaVersion).toBe(6)
      expect(parsed.data.tracks.tracks[0]).toMatchObject({
        id: 'custom-track',
        allowExternalProgress: false,
      })
      expect(parsed.data.tracks.progress[0]).toMatchObject({
        trackId: 'custom-track',
        completedRating: 'good',
        completedAt: timestamp,
      })
      expect(parsed.data.practice.reviewAttempts).toEqual(
        legacy.data.practice.reviewAttempts,
      )
    },
  )

  it.each([1, 2, 3, 4] as const)(
    'keeps the v%s track format strict when a v5 field is supplied',
    (schemaVersion) => {
      const legacy = createLegacyBackupFixture(schemaVersion)
      const track = legacy.data.tracks.tracks[0]!

      expect(() =>
        parseBackupFileForCurrentApp({
          ...legacy,
          data: {
            ...legacy.data,
            tracks: {
              ...legacy.data.tracks,
              tracks: [{ ...track, allowExternalProgress: true }],
            },
          },
        }),
      ).toThrow()
    },
  )

  it('migrates a v3 alias key and legacy false containment into v4 typed relations', () => {
    const fixture = createFrozenLegacyFixture(3)
    const v3Backup = {
      ...fixture,
      schemaVersion: 3,
      data: {
        ...fixture.data,
        tracks: fixture.data.tracks,
        topics: [
          ...fixture.data.topics,
          {
            id: 'tree',
            label: 'Tree',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: 'breadth-first-search',
            label: 'Breadth-First Search',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: 'heap-priority-queue',
            label: 'Heap (Priority Queue)',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        topicAliases: [
          {
            aliasKey: 'priority-queue',
            label: 'Priority Queue',
            topicId: 'heap-priority-queue',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        topicRelations: [
          {
            parentTopicId: 'tree',
            childTopicId: 'breadth-first-search',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      },
    }

    const parsed = parseBackupFileForCurrentApp(v3Backup)

    expect(parsed.schemaVersion).toBe(backupSchemaVersion)
    expect(parsed.data.topicAliases).toContainEqual(
      expect.objectContaining({
        aliasKey: 'priority queue',
        topicId: 'heap-priority-queue',
      }),
    )
    expect(parsed.data.topicRelations).not.toContainEqual(
      expect.objectContaining({
        sourceTopicId: 'breadth-first-search',
        targetTopicId: 'tree',
        kind: 'broader',
      }),
    )
    expect(parsed.data.topicRelations).toContainEqual(
      expect.objectContaining({
        sourceTopicId: 'breadth-first-search',
        targetTopicId: 'tree',
        kind: 'applies-to',
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    )
  })

  it.each([4, 5] as const)(
    'rejects malformed v%s alias keys instead of repairing them',
    (version) => {
      const fixture =
        version === 4
          ? createLegacyBackupFixture(4)
          : createFrozenLegacyFixture(5)
      const malformed = {
        ...fixture,
        data: {
          ...fixture.data,
          topicAliases: (fixture.data.topicAliases ?? []).map((alias) => ({
            ...alias,
            aliasKey: 'hash-map',
          })),
        },
      }

      expect(() => parseBackupFileForCurrentApp(malformed)).toThrow(
        /alias key/i,
      )
    },
  )

  it('preserves hard as a recalled track completion rating', () => {
    const backup = createValidBackupFixture()
    const [progress] = backup.data.tracks.progress

    if (!progress) {
      throw new Error('Expected the backup fixture to include track progress.')
    }

    progress.completedRating = 'hard'

    expect(
      parseBackupFileForCurrentApp(backup).data.tracks.progress[0]
        ?.completedRating,
    ).toBe('hard')
  })

  it('normalizes v2 backups through the v4 topic graph format', () => {
    const fixture = createFrozenLegacyFixture(2)
    const v2Backup = {
      ...fixture,
      schemaVersion: 2,
      data: {
        ...fixture.data,
        tracks: fixture.data.tracks,
        topics: [{ id: 'array', label: 'Array' }],
        topicAliases: undefined,
        topicRelations: undefined,
      },
    }

    const parsed = parseBackupFileForCurrentApp(v2Backup)

    expect(parsed.schemaVersion).toBe(backupSchemaVersion)
    expect(parsed.data.topics.find(({ id }) => id === 'array')).toMatchObject({
      id: 'array',
      label: 'Array',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(parsed.data.topicAliases.length).toBeGreaterThan(0)
    expect(parsed.data.topicRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceTopicId: 'binary-tree',
          targetTopicId: 'tree',
          kind: 'broader',
        }),
      ]),
    )
  })

  it('normalizes v1 track progress rows through the v4 topic graph format', () => {
    const fixture = createFrozenLegacyFixture(1)
    const v1Backup = {
      ...fixture,
      schemaVersion: 1,
      data: {
        ...fixture.data,
        topics: [{ id: 'array', label: 'Array' }],
        tracks: {
          ...fixture.data.tracks,
          progress: [
            {
              trackGroupId: 'custom-track:arrays',
              problemSlug: 'two-sum',
              completedAt: timestamp,
              completedRating: 'good',
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        },
      },
    }

    const parsed = parseBackupFileForCurrentApp(v1Backup)

    expect(parsed.schemaVersion).toBe(backupSchemaVersion)
    expect(parsed.data.tracks.progress[0]).toMatchObject({
      trackId: 'custom-track',
      problemSlug: 'two-sum',
      reviewAttemptId: null,
    })
    expect(parsed.data.topics.find(({ id }) => id === 'array')).toMatchObject({
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    expect(parsed.data.topicAliases.length).toBeGreaterThan(0)
    expect(parsed.data.topicRelations.length).toBeGreaterThan(0)
  })

  it('rejects v1 progress rows that reference a missing track group', () => {
    const fixture = createFrozenLegacyFixture(1)
    const v1Backup = {
      ...fixture,
      schemaVersion: 1,
      data: {
        ...fixture.data,
        topics: [{ id: 'array', label: 'Array' }],
        tracks: {
          ...fixture.data.tracks,
          progress: [
            {
              trackGroupId: 'missing-group',
              problemSlug: 'two-sum',
              completedAt: timestamp,
              completedRating: 'good',
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        },
      },
    }

    expect(() => parseBackupFileForCurrentApp(v1Backup)).toThrow(
      /progress references missing group missing-group/i,
    )
  })

  it('keeps runtime backup payloads loose for service-owned validation', () => {
    const unsupportedBackup = {
      ...createValidBackupFixture(),
      schemaVersion: backupSchemaVersion + 1,
      app: 'other-app',
    }

    expect(
      backupPayloadRequestSchema.parse({
        surface: 'dashboard',
        backup: unsupportedBackup,
      }).backup,
    ).toEqual(unsupportedBackup)
  })

  it('accepts optional app and extension source versions', () => {
    expect(
      backupFileSchema.parse({
        ...createValidBackupFixture(),
        source: { extensionVersion: '1.2.3' },
      }).source,
    ).toEqual({ extensionVersion: '1.2.3' })

    expect(
      backupFileSchema.parse({
        ...createValidBackupFixture(),
        source: {},
      }).source,
    ).toEqual({})
  })

  it('rejects a backup for another app with a friendly error', () => {
    expect(() =>
      parseBackupFileForCurrentApp({
        ...createValidBackupFixture(),
        app: 'other-app',
      }),
    ).toThrow(/not a CogniPace backup/i)
  })

  it('rejects unsupported older and future backup versions', () => {
    expect(() =>
      parseBackupFileForCurrentApp({
        ...createValidBackupFixture(),
        schemaVersion: 0,
      }),
    ).toThrow(/unsupported backup version/i)

    expect(() =>
      parseBackupFileForCurrentApp({
        ...createValidBackupFixture(),
        schemaVersion: backupSchemaVersion + 1,
      }),
    ).toThrow(/unsupported backup version/i)
  })

  it('rejects unknown fields in v2 backups', () => {
    expect(() =>
      backupFileSchema.parse({
        ...createValidBackupFixture(),
        data: {
          ...createValidBackupFixture().data,
          problems: [
            {
              ...createValidBackupFixture().data.problems[0],
              unknownField: true,
            },
          ],
        },
      }),
    ).toThrow()
  })

  it.each([
    {
      label: 'completedAt without completedRating',
      progressPatch: {
        completedAt: timestamp,
        completedRating: null,
      },
    },
    {
      label: 'completedRating without completedAt',
      progressPatch: {
        completedAt: null,
        completedRating: 'good',
      },
    },
  ])('rejects v2 progress with $label', ({ progressPatch }) => {
    const backup = createValidBackupFixture()

    expect(() =>
      backupFileSchema.parse({
        ...backup,
        data: {
          ...backup.data,
          tracks: {
            ...backup.data.tracks,
            progress: [
              {
                ...backup.data.tracks.progress[0],
                ...progressPatch,
              },
            ],
          },
        },
      }),
    ).toThrow(/completedAt and completedRating/i)
  })

  it.each([
    [
      'topic id',
      (backup: ReturnType<typeof createValidBackupFixture>) => {
        backup.data.topics[0]!.id = ' '
      },
    ],
    [
      'company id',
      (backup: ReturnType<typeof createValidBackupFixture>) => {
        backup.data.companies[0]!.id = ' '
      },
    ],
    [
      'problem topic id',
      (backup: ReturnType<typeof createValidBackupFixture>) => {
        backup.data.problemTopics[0]!.topicId = ' '
      },
    ],
    [
      'problem company id',
      (backup: ReturnType<typeof createValidBackupFixture>) => {
        backup.data.problemCompanies[0]!.companyId = ' '
      },
    ],
    [
      'FSRS card id',
      (backup: ReturnType<typeof createValidBackupFixture>) => {
        backup.data.practice.fsrsCards[0]!.id = ' '
      },
    ],
    [
      'FSRS card kind',
      (backup: ReturnType<typeof createValidBackupFixture>) => {
        backup.data.practice.fsrsCards[0]!.cardKind = ' '
      },
    ],
    [
      'review attempt id',
      (backup: ReturnType<typeof createValidBackupFixture>) => {
        backup.data.practice.reviewAttempts[0]!.id = ' '
      },
    ],
    [
      'review attempt card id',
      (backup: ReturnType<typeof createValidBackupFixture>) => {
        backup.data.practice.reviewAttempts[0]!.cardId = ' '
      },
    ],
    [
      'track session id',
      (backup: ReturnType<typeof createValidBackupFixture>) => {
        backup.data.tracks.session[0]!.id = ' '
      },
    ],
  ])('rejects empty durable ID for %s', (_field, mutateBackup) => {
    const backup = createValidBackupFixture()

    mutateBackup(backup)

    expect(() => backupFileSchema.parse(backup)).toThrow()
  })

  it.each(['elapsedDays', 'scheduledDays', 'learningSteps'] as const)(
    'rejects negative FSRS %s',
    (field) => {
      const backup = createValidBackupFixture()

      backup.data.practice.fsrsCards[0]![field] = -1

      expect(() => backupFileSchema.parse(backup)).toThrow()
    },
  )
})

function createLegacyBackupFixture(schemaVersion: 1 | 2 | 3 | 4) {
  return createFrozenLegacyFixture(schemaVersion)
}

function createFrozenLegacyData() {
  const backup: BackupFileV5 = {
    schemaVersion: 5,
    app: 'cognipace',
    exportedAt: timestamp,
    source: {
      appVersion: '0.0.0',
    },
    data: {
      problems: [
        {
          slug: 'two-sum',
          title: 'Two Sum',
          difficulty: 'easy',
          isPremium: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      topics: [
        {
          id: 'array',
          label: 'Array',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: 'hash-table',
          label: 'Hash Table',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      topicAliases: [
        {
          aliasKey: 'custom hash',
          label: 'Custom Hash',
          topicId: 'hash-table',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      topicRelations: [
        {
          sourceTopicId: 'hash-table',
          targetTopicId: 'array',
          kind: 'broader',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      companies: [{ id: 'meta', label: 'Meta' }],
      problemTopics: [{ problemSlug: 'two-sum', topicId: 'array' }],
      problemCompanies: [{ problemSlug: 'two-sum', companyId: 'meta' }],
      practice: {
        problemPractice: [
          {
            problemSlug: 'two-sum',
            status: 'suspended',
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
            isSuspended: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        fsrsCards: [
          {
            id: ' opaque/card:δ ',
            problemSlug: 'two-sum',
            cardKind: 'default',
            dueAt: timestamp,
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
          },
        ],
        reviewAttempts: [
          {
            id: 'attempt-1',
            problemSlug: 'two-sum',
            cardId: ' opaque/card:δ ',
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
            allowExternalProgress: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        groups: [
          {
            id: 'custom-track:arrays',
            trackId: 'custom-track',
            title: 'Arrays',
            position: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
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
            reviewAttemptId: null,
            completedAt: timestamp,
            completedRating: 'good',
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        session: [
          {
            id: 'active',
            activeTrackId: 'custom-track',
            activeGroupId: 'custom-track:arrays',
            startedAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      },
      settings: [
        {
          key: 'user-settings',
          value:
            '{ "schemaVersion": 1, "practice": { "dailyGoal": 5, "mode": "studyPlan", "problemFilters": { "skipPremium": true } }, "review": { "targetRetention": 0.75, "order": "dueFirst" }, "assessment": { "requireSolveTime": false, "strictTiming": false, "timeTargetsMinutes": { "easy": 15, "medium": 30, "hard": 45 } }, "overlay": { "autoDetectSolved": true }, "reminders": { "daily": { "enabled": false, "time": "09:00" } } }',
          updatedAt: timestamp,
        },
      ],
    },
  }
  const practice = backup.data.practice
  const attempt = practice.reviewAttempts[0]!
  practice.reviewAttempts = [
    {
      ...attempt,
      id: 'ä',
      rating: 'hard',
      updatedAt: '2026-06-01T12:00:00.000Z',
      fsrsReviewLog:
        '{ "reviewedAt": "2026-05-25T12:00:00.000Z", "rating": "hard", "state": "new", "dueAt": "2026-05-25T12:00:00.000Z", "stability": 0, "difficulty": 0, "elapsedDays": 0, "lastElapsedDays": 0, "scheduledDays": 0, "learningSteps": 0 }',
    },
    { ...attempt, id: 'z', createdAt: '2026-05-26T12:00:00.000Z' },
    { ...attempt, id: 'A', reviewedAt: '2026-05-24T12:00:00.000Z' },
  ]
  practice.fsrsCards.push({
    ...practice.fsrsCards[0]!,
    id: 'opaque/new:card',
    problemSlug: 'new-problem',
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    lastReviewAt: null,
  })
  backup.data.problems.push({
    ...backup.data.problems[0]!,
    slug: 'new-problem',
  })
  return backup.data
}

// Each object declares its shipped numeric version and Practice has only its
// original three arrays. None is produced from the mutable current builder.
function createFrozenLegacyFixture(version: 1): BackupFileV1
function createFrozenLegacyFixture(version: 2): BackupFileV2
function createFrozenLegacyFixture(version: 3): BackupFileV3
function createFrozenLegacyFixture(version: 4): BackupFileV4
function createFrozenLegacyFixture(version: 5): BackupFileV5
function createFrozenLegacyFixture(version: 1 | 2 | 3 | 4 | 5): LegacyBackupFile
function createFrozenLegacyFixture(
  version: 1 | 2 | 3 | 4 | 5,
): LegacyBackupFile {
  const data = createFrozenLegacyData()
  const track = data.tracks.tracks[0]!
  const legacyTrack = {
    id: track.id,
    slug: track.slug,
    title: track.title,
    description: track.description,
    dueAt: track.dueAt,
    createdAt: track.createdAt,
    updatedAt: track.updatedAt,
  }
  const v2Data = {
    problems: data.problems,
    companies: data.companies,
    problemTopics: data.problemTopics,
    problemCompanies: data.problemCompanies,
    practice: data.practice,
    settings: data.settings,
  }
  const v2 = {
    ...v2Data,
    topics: data.topics.map(({ id, label }) => ({ id, label })),
    tracks: { ...data.tracks, tracks: [legacyTrack] },
  }
  const envelope = {
    app: 'cognipace' as const,
    exportedAt: timestamp,
    source: { appVersion: '0.0.0' },
  }
  switch (version) {
    case 1:
      return {
        ...envelope,
        schemaVersion: 1,
        data: {
          ...v2,
          tracks: {
            ...v2.tracks,
            progress: [
              {
                trackGroupId: 'custom-track:arrays',
                problemSlug: 'two-sum',
                completedAt: timestamp,
                completedRating: 'good',
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            ],
          },
        },
      }
    case 2:
      return { ...envelope, schemaVersion: 2, data: v2 }
    case 3:
      return {
        ...envelope,
        schemaVersion: 3,
        data: {
          ...data,
          tracks: v2.tracks,
          topicRelations: data.topicRelations.map((edge) => ({
            parentTopicId: edge.targetTopicId,
            childTopicId: edge.sourceTopicId,
            createdAt: edge.createdAt,
            updatedAt: edge.updatedAt,
          })),
        },
      }
    case 4:
      return {
        ...envelope,
        schemaVersion: 4,
        data: { ...data, tracks: v2.tracks },
      }
    case 5:
      return { ...envelope, schemaVersion: 5, data }
  }
}

describe('frozen legacy backup normalization', () => {
  it.each([
    [1, backupFileV1Schema],
    [2, backupFileV2Schema],
    [3, backupFileV3Schema],
    [4, backupFileV4Schema],
    [5, backupFileV5Schema],
  ] as const)(
    'keeps the shipped v%s file parser independently strict',
    (version, schema) => {
      const legacy = createFrozenLegacyFixture(version)
      expect(schema.safeParse(legacy).success).toBe(true)
      expect(schema.safeParse({ ...legacy, unknown: true }).success).toBe(false)
      expect(
        schema.safeParse({
          ...legacy,
          data: {
            ...legacy.data,
            practice: {
              ...legacy.data.practice,
              reviewAttempts: legacy.data.practice.reviewAttempts.map(
                (row) => ({ ...row, revision: 0 }),
              ),
            },
          },
        }).success,
      ).toBe(false)
    },
  )

  it('activates v6 as the current strict export format', () => {
    expect(backupSchemaVersion).toBe(6)
  })

  it.each([1, 2, 3, 4, 5] as const)(
    'normalizes genuine v%s into detached deterministic unknown evidence',
    (version) => {
      const legacy = createFrozenLegacyFixture(version)
      const original = structuredClone(legacy)
      const normalized = parseBackupFileForCurrentApp(legacy)
      expect(normalized.schemaVersion).toBe(6)
      expect(normalized.data.practice.problemPractice).toEqual(
        legacy.data.practice.problemPractice,
      )
      expect(normalized.data.practice.fsrsCards).toEqual(
        legacy.data.practice.fsrsCards,
      )
      expect(normalized.data.practice.reviewAttempts).toEqual(
        legacy.data.practice.reviewAttempts,
      )
      expect(normalized.data.settings).toEqual(legacy.data.settings)
      expect(JSON.parse(normalized.data.settings[0]!.value)).toMatchObject({
        review: { targetRetention: 0.75 },
      })
      expect(normalized.data.practice).toMatchObject({
        schedulerProfiles: [],
        generations: [],
        commandReceipts: [],
      })
      expect(normalized.data.practice.reviewEvidence).toEqual(
        ['A', 'z', 'ä'].map((id, index) => ({
          reviewAttemptId: id,
          cardId: ' opaque/card:δ ',
          applicationSequence: index + 1,
          revision: 0,
          sequenceSource: 'legacy-inferred',
          schedulingEvidenceKind: 'unknown',
          schedulerProfileId: null,
          preCardJson: null,
          assessmentEvidenceJson: null,
        })),
      )
      expect(normalized.data.tracks.tracks[0]?.allowExternalProgress).toBe(
        version === 5,
      )
      expect(normalized.data.tracks.progress[0]).toMatchObject({
        trackId: 'custom-track',
        completedAt: timestamp,
        completedRating: 'good',
      })
      expect(normalized).toEqual(parseBackupFileForCurrentApp(legacy))
      expect(legacy).toEqual(original)
      normalized.data.practice.fsrsCards[0]!.id = 'changed'
      normalized.data.practice.reviewAttempts[0]!.notes = 'changed'
      normalized.data.settings[0]!.value = 'changed'
      expect(legacy).toEqual(original)
    },
  )

  it.each([1, 2, 3, 4, 5] as const)(
    'rejects v6 metadata supplied in strict v%s Practice',
    (version) => {
      const legacy = createFrozenLegacyFixture(version)
      for (const name of [
        'schedulerProfiles',
        'reviewEvidence',
        'generations',
        'commandReceipts',
      ]) {
        expect(() =>
          parseBackupFileForCurrentApp({
            ...legacy,
            data: {
              ...legacy.data,
              practice: { ...legacy.data.practice, [name]: [] },
            },
          }),
        ).toThrow()
      }
    },
  )

  it('requires all four metadata arrays in a genuine v6 file', () => {
    const v5 = createFrozenLegacyFixture(5)
    const v6 = {
      ...v5,
      schemaVersion: 6,
      data: {
        ...v5.data,
        practice: {
          ...v5.data.practice,
          schedulerProfiles: [],
          reviewEvidence: [],
          generations: [],
          commandReceipts: [],
        },
      },
    }
    expect(backupFileSchema.safeParse(v6).success).toBe(true)
    for (const name of [
      'schedulerProfiles',
      'reviewEvidence',
      'generations',
      'commandReceipts',
    ]) {
      const missing = structuredClone(v6)
      Reflect.deleteProperty(missing.data.practice, name)
      expect(backupFileSchema.safeParse(missing).success).toBe(false)
    }
  })
})
