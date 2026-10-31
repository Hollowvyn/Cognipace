import {
  validatePracticeStorageData,
  type PracticeStorageReferences,
} from '@/features/practice/domain'
import { buildTopicGraph } from '@/features/problems/domain/topic-graph'
import { reconcileTopicRows } from '@/features/problems/domain/topic-reconciliation'
import { buildTopicLookup } from '@/features/problems/domain/topic-taxonomy'
import { parseFsrsCardSnapshot } from '@/lib/fsrs'
import {
  seedTopics,
  seedTopicAliases,
  seedTopicRelations,
} from '@/platform/db/topic-taxonomy-seed'

import {
  backupDataSchema,
  createBackupSummary,
  parseBackupFileForCurrentApp,
  type BackupData,
  type BackupSummary,
} from '../api/backup-contracts'

export type PreparedBackupRestore = Readonly<{
  data: BackupData
  summary: BackupSummary
}>

/** Every caller, including typed Sync payloads, crosses the same pure boundary. */
export function prepareFullBackupRestore(
  input: unknown,
): PreparedBackupRestore {
  const backup = parseBackupFileForCurrentApp(input)
  const data = prepareCurrentBackupData(backup.data, backup.exportedAt)
  return { data, summary: createBackupSummary({ ...backup, data }) }
}

/** Reconcile the complete current payload before any destructive transaction. */
export function prepareCurrentBackupData(
  input: unknown,
  exportedAt: string,
): BackupData {
  const data = validateCurrentBackupData(input)
  const taxonomy = reconcileTopicRows(
    {
      topics: data.topics,
      topicAliases: data.topicAliases,
      problemTopics: data.problemTopics,
      topicRelations: data.topicRelations,
    },
    {
      legacy: false,
      now: exportedAt,
      catalogue: {
        topics: seedTopics,
        aliases: seedTopicAliases,
        relations: seedTopicRelations,
      },
    },
  )
  return validateCurrentBackupData({ ...data, ...taxonomy })
}

/** Detached full validation used by export and both sides of reconciliation. */
export function validateCurrentBackupData(
  input: unknown,
  options: { requireActiveGenerations?: boolean } = {},
): BackupData {
  const data = backupDataSchema.parse(input)
  validateBackupReferences(data)
  const references: PracticeStorageReferences = {
    problemSlugs: data.problems.map((row) => row.slug),
    practiceProblemSlugs: data.practice.problemPractice.map(
      (row) => row.problemSlug,
    ),
    cards: data.practice.fsrsCards.map((row) => ({
      id: row.id,
      problemSlug: row.problemSlug,
      card: parseFsrsCardSnapshot({
        dueAt: new Date(row.dueAt).toISOString(),
        stability: row.stability,
        difficulty: row.difficulty,
        elapsedDays: row.elapsedDays,
        scheduledDays: row.scheduledDays,
        learningSteps: row.learningSteps,
        reps: row.reps,
        lapses: row.lapses,
        state: row.state,
        lastReviewAt:
          row.lastReviewAt === null
            ? null
            : new Date(row.lastReviewAt).toISOString(),
      }),
    })),
    attempts: data.practice.reviewAttempts.map((row) => ({
      id: row.id,
      cardId: row.cardId,
      problemSlug: row.problemSlug,
      rating: row.rating,
      reviewedAt: new Date(row.reviewedAt).toISOString(),
      fsrsReviewLog: row.fsrsReviewLog,
    })),
  }
  validatePracticeStorageData(
    {
      schedulerProfiles: data.practice.schedulerProfiles,
      reviewEvidence: data.practice.reviewEvidence,
      generations: data.practice.generations,
      commandReceipts: data.practice.commandReceipts,
    },
    references,
    options,
  )
  return data
}

function validateBackupReferences(data: BackupData) {
  const problemSlugs = uniqueValues(
    data.problems,
    (row) => row.slug,
    'problem slug',
  )
  const topicIds = uniqueValues(data.topics, (row) => row.id, 'topic id')
  buildTopicLookup(data.topics, data.topicAliases)
  buildTopicGraph(data.topics, data.topicRelations)
  const companyIds = uniqueValues(data.companies, (row) => row.id, 'company id')
  uniqueValues(data.companies, (row) => row.label, 'company label')
  const fsrsCardsById = new Map(
    data.practice.fsrsCards.map((card) => [card.id, card]),
  )
  const reviewAttemptsById = new Map(
    data.practice.reviewAttempts.map((attempt) => [attempt.id, attempt]),
  )
  const fsrsCardIds = uniqueValues(
    data.practice.fsrsCards,
    (row) => row.id,
    'FSRS card id',
  )
  uniqueValues(
    data.practice.fsrsCards,
    (row) => `${row.problemSlug}:${row.cardKind}`,
    'FSRS card problem/kind',
  )
  const reviewAttemptIds = uniqueValues(
    data.practice.reviewAttempts,
    (row) => row.id,
    'review attempt id',
  )
  const trackIds = uniqueValues(data.tracks.tracks, (row) => row.id, 'track id')
  uniqueValues(data.tracks.tracks, (row) => row.slug, 'track slug')
  const trackGroupsById = new Map(
    data.tracks.groups.map((group) => [group.id, group]),
  )
  const trackGroupIds = uniqueValues(
    data.tracks.groups,
    (row) => row.id,
    'track group id',
  )
  uniqueValues(data.settings, (row) => row.key, 'settings key')

  uniqueValues(
    data.problemTopics,
    (row) => `${row.problemSlug}\u0000${row.topicId}`,
    'problem-topic identity',
  )
  uniqueValues(
    data.problemCompanies,
    (row) => `${row.problemSlug}\u0000${row.companyId}`,
    'problem-company identity',
  )
  uniqueValues(
    data.practice.problemPractice,
    (row) => row.problemSlug,
    'problem practice identity',
  )
  uniqueValues(
    data.tracks.memberships,
    (row) => `${row.trackGroupId}\u0000${row.problemSlug}`,
    'track membership identity',
  )
  uniqueValues(
    data.tracks.memberships,
    (row) => {
      const group = trackGroupsById.get(row.trackGroupId)

      return `${group?.trackId ?? 'missing'}\u0000${row.problemSlug}`
    },
    'track problem identity',
  )
  uniqueValues(
    data.tracks.progress,
    (row) => `${row.trackId}\u0000${row.problemSlug}`,
    'track progress identity',
  )
  uniqueValues(data.tracks.session, (row) => row.id, 'track session identity')

  const memberships = new Set(
    data.tracks.memberships.map((row) => {
      const group = trackGroupsById.get(row.trackGroupId)

      return `${group?.trackId ?? 'missing'}\u0000${row.problemSlug}`
    }),
  )

  for (const row of data.problemTopics) {
    requireReference(problemSlugs, row.problemSlug, 'problemTopic', 'problem')
    requireReference(topicIds, row.topicId, 'problemTopic', 'topic')
  }

  for (const row of data.problemCompanies) {
    requireReference(problemSlugs, row.problemSlug, 'problemCompany', 'problem')
    requireReference(companyIds, row.companyId, 'problemCompany', 'company')
  }

  for (const row of data.practice.problemPractice) {
    requireReference(
      problemSlugs,
      row.problemSlug,
      'problemPractice',
      'problem',
    )
  }

  for (const row of data.practice.fsrsCards) {
    requireReference(problemSlugs, row.problemSlug, 'fsrsCard', 'problem')
  }

  for (const row of data.practice.reviewAttempts) {
    requireReference(problemSlugs, row.problemSlug, 'reviewAttempt', 'problem')
    requireReference(fsrsCardIds, row.cardId, 'reviewAttempt', 'card')

    const card = fsrsCardsById.get(row.cardId)

    if (card !== undefined && card.problemSlug !== row.problemSlug) {
      throw new Error(
        `Invalid backup: reviewAttempt ${row.id} references card ${row.cardId} belongs to problem ${card.problemSlug}, not ${row.problemSlug}.`,
      )
    }
  }

  for (const row of data.tracks.groups) {
    requireReference(trackIds, row.trackId, 'trackGroup', 'track')
  }

  for (const row of data.tracks.memberships) {
    requireReference(trackGroupIds, row.trackGroupId, 'membership', 'group')
    requireReference(problemSlugs, row.problemSlug, 'membership', 'problem')
  }

  for (const row of data.tracks.progress) {
    requireReference(trackIds, row.trackId, 'progress', 'track')
    requireReference(problemSlugs, row.problemSlug, 'progress', 'problem')
    requireReference(
      memberships,
      `${row.trackId}\u0000${row.problemSlug}`,
      'progress',
      'membership',
    )

    if (row.reviewAttemptId !== null) {
      requireReference(
        reviewAttemptIds,
        row.reviewAttemptId,
        'progress',
        'review attempt',
      )

      const attempt = reviewAttemptsById.get(row.reviewAttemptId)

      if (attempt !== undefined && attempt.problemSlug !== row.problemSlug) {
        throw new Error(
          `Invalid backup: progress ${row.problemSlug} references review attempt ${row.reviewAttemptId} for problem ${attempt.problemSlug}.`,
        )
      }
    }
  }

  if (data.tracks.session.length > 1) {
    throw new Error(
      'Invalid backup: expected at most one active track session.',
    )
  }

  for (const row of data.tracks.session) {
    if (row.id !== 'active') {
      throw new Error(`Invalid backup: unsupported track session id ${row.id}.`)
    }

    if (row.activeTrackId !== null) {
      requireReference(trackIds, row.activeTrackId, 'session', 'active track')
    }

    if (row.activeTrackId === null && row.activeGroupId !== null) {
      throw new Error(
        `Invalid backup: session ${row.id} cannot have an active group without an active track.`,
      )
    }

    if (row.activeGroupId !== null) {
      requireReference(
        trackGroupIds,
        row.activeGroupId,
        'session',
        'active group',
      )
    }

    if (row.activeTrackId !== null && row.activeGroupId !== null) {
      const activeGroup = trackGroupsById.get(row.activeGroupId)

      if (activeGroup?.trackId !== row.activeTrackId) {
        throw new Error(
          `Invalid backup: session ${row.id} active group ${row.activeGroupId} does not belong to active track ${row.activeTrackId}.`,
        )
      }
    }
  }
}

function uniqueValues<Row>(
  rows: readonly Row[],
  getValue: (row: Row) => string,
  label: string,
) {
  const values = new Set<string>()

  for (const row of rows) {
    const value = getValue(row)

    if (values.has(value)) {
      throw new Error(`Invalid backup: duplicate ${label} ${value}.`)
    }

    values.add(value)
  }

  return values
}

function requireReference(
  values: ReadonlySet<string>,
  value: string,
  rowLabel: string,
  referenceLabel: string,
) {
  if (!values.has(value)) {
    throw new Error(
      `Invalid backup: ${rowLabel} references missing ${referenceLabel} ${value}.`,
    )
  }
}
