import { describe, expect, it } from 'vitest'

import { defaultUserSettings } from '@/features/settings/domain'

import {
  backupFileSchema,
  backupPayloadRequestSchema,
  backupSchemaVersion,
  createBackupSummary,
  parseBackupFileForCurrentApp,
} from './backup-contracts'

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
    const fixture = createValidBackupFixture()
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

      expect(parsed.schemaVersion).toBe(5)
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
    const fixture = createValidBackupFixture()
    const v3Backup = {
      ...fixture,
      schemaVersion: 3,
      data: {
        ...fixture.data,
        tracks: createLegacyTrackData(fixture),
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
          : createValidBackupFixture()
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
    const fixture = createValidBackupFixture()
    const v2Backup = {
      ...fixture,
      schemaVersion: 2,
      data: {
        ...fixture.data,
        tracks: createLegacyTrackData(fixture),
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
    const fixture = createValidBackupFixture()
    const v1Backup = {
      ...fixture,
      schemaVersion: 1,
      data: {
        ...createLegacyBackupData(fixture),
        topics: [{ id: 'array', label: 'Array' }],
        tracks: {
          ...createLegacyTrackData(fixture),
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
    const fixture = createValidBackupFixture()
    const v1Backup = {
      ...fixture,
      schemaVersion: 1,
      data: {
        ...createLegacyBackupData(fixture),
        topics: [{ id: 'array', label: 'Array' }],
        tracks: {
          ...createLegacyTrackData(fixture),
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

function createLegacyBackupData(
  backup: ReturnType<typeof createValidBackupFixture>,
) {
  return {
    problems: backup.data.problems,
    topics: backup.data.topics.map(({ id, label }) => ({ id, label })),
    companies: backup.data.companies,
    problemTopics: backup.data.problemTopics,
    problemCompanies: backup.data.problemCompanies,
    practice: backup.data.practice,
    tracks: createLegacyTrackData(backup),
    settings: backup.data.settings,
  }
}

function createLegacyTrackData(
  backup: ReturnType<typeof createValidBackupFixture>,
) {
  return {
    ...backup.data.tracks,
    tracks: backup.data.tracks.tracks.map((track) =>
      Object.fromEntries(
        Object.entries(track).filter(
          ([key]) => key !== 'allowExternalProgress',
        ),
      ),
    ),
  }
}

function createLegacyBackupFixture(schemaVersion: 1 | 2 | 3 | 4) {
  const fixture = createValidBackupFixture()
  const data = {
    ...fixture.data,
    tracks: createLegacyTrackData(fixture),
    ...(schemaVersion <= 2
      ? {
          topics: fixture.data.topics.map(({ id, label }) => ({ id, label })),
          topicAliases: undefined,
          topicRelations: undefined,
        }
      : schemaVersion === 3
        ? {
            topicRelations: fixture.data.topicRelations.map((edge) => ({
              parentTopicId: edge.targetTopicId,
              childTopicId: edge.sourceTopicId,
              createdAt: edge.createdAt,
              updatedAt: edge.updatedAt,
            })),
          }
        : {}),
  }

  return {
    ...fixture,
    schemaVersion,
    data: {
      ...data,
      tracks: {
        ...data.tracks,
        progress:
          schemaVersion === 1
            ? fixture.data.tracks.progress.map((row) => ({
                trackGroupId: 'custom-track:arrays',
                problemSlug: row.problemSlug,
                completedAt: row.completedAt,
                completedRating: row.completedRating,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
              }))
            : data.tracks.progress,
      },
    },
  }
}
