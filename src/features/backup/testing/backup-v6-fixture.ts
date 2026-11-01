const timestamp = '2026-05-25T12:00:00.000Z'

// Frozen before activating v7; this builder must never depend on current aliases.
export function createFrozenV6BackupFixture() {
  return {
    schemaVersion: 6 as const,
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
          value:
            '{"schemaVersion":1,"practice":{"dailyGoal":5,"mode":"studyPlan","problemFilters":{"skipPremium":true}},"review":{"targetRetention":0.75,"order":"dueFirst"},"assessment":{"requireSolveTime":false,"strictTiming":false,"timeTargetsMinutes":{"easy":15,"medium":30,"hard":45}},"overlay":{"autoDetectSolved":true},"reminders":{"daily":{"enabled":false,"time":"09:00"}}}',
          updatedAt: timestamp,
        },
      ],
    },
  }
}
