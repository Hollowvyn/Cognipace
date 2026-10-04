import {
  createDb,
  createSqliteWasmLocator,
  type DbHandle,
} from '@/platform/db/client'
import { serializeDb } from '@/platform/db/snapshot'

import { frozenV9MigrationSql } from './fsrs-remediation-legacy-migrations'

export const preservationNow = new Date('2026-10-03T16:00:00.000Z')
const priorDay = new Date('2026-10-02T16:00:00.000Z').getTime()
const currentDay = preservationNow.getTime()
const twoDaysAgo = new Date('2026-10-01T16:00:00.000Z').getTime()

export const preservationTables = [
  'problems',
  'topics',
  'topic_aliases',
  'topic_relations',
  'companies',
  'problem_topics',
  'problem_companies',
  'problem_practice',
  'fsrs_cards',
  'review_attempts',
  'tracks',
  'track_groups',
  'track_group_problems',
  'track_problem_progress',
  'track_session',
  'settings_kv',
] as const

export function readPreservationRows(handle: DbHandle) {
  return Object.fromEntries(
    preservationTables.map((table) => [
      table,
      handle.rawDb.exec({
        sql: `SELECT * FROM "${table}" ORDER BY rowid`,
        returnValue: 'resultRows',
      }),
    ]),
  )
}

export function readProgressAttempts(handle: DbHandle) {
  const rows = handle.rawDb.exec({
    sql: 'SELECT problem_slug, reviewed_at FROM review_attempts ORDER BY reviewed_at, id',
    returnValue: 'resultRows',
  }) as Array<[string, number]>
  return rows.map(([problemSlug, reviewedAt]) => ({
    problemSlug,
    reviewedAt: new Date(reviewedAt),
  }))
}

function insert(
  handle: DbHandle,
  table: string,
  values: Record<string, string | number | null>,
) {
  const columns = Object.keys(values)
  handle.rawDb.exec({
    sql: `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    bind: Object.values(values),
  })
}

// This graph proves preservation of populated rows, not authentic FSRS replay provenance.
export async function makeFsrsPreservationSnapshot() {
  const handle = await createDb({
    migrationSql: frozenV9MigrationSql,
    locateWasm: createSqliteWasmLocator(),
  })
  try {
    for (const slug of ['day-a', 'day-b', 'fresh-zero', 'suspended']) {
      insert(handle, 'problems', {
        slug,
        title: slug,
        difficulty: 'medium',
        is_premium: 0,
        created_at: 11,
        updated_at: 12,
      })
    }
    insert(handle, 'topics', {
      id: 'custom-parent',
      label: 'Custom parent',
      created_at: 11,
      updated_at: 12,
    })
    insert(handle, 'topics', {
      id: 'custom-child',
      label: 'Custom child',
      created_at: 13,
      updated_at: 14,
    })
    insert(handle, 'topic_aliases', {
      alias_key: 'custom-alias',
      label: 'Custom alias',
      topic_id: 'custom-child',
      created_at: 15,
      updated_at: 16,
    })
    insert(handle, 'topic_relations', {
      source_topic_id: 'custom-child',
      target_topic_id: 'custom-parent',
      kind: 'broader',
      created_at: 17,
      updated_at: 18,
    })
    insert(handle, 'companies', {
      id: 'custom-company',
      label: 'Custom company',
    })
    insert(handle, 'problem_topics', {
      problem_slug: 'day-a',
      topic_id: 'custom-child',
    })
    insert(handle, 'problem_companies', {
      problem_slug: 'day-a',
      company_id: 'custom-company',
    })

    const cards = [
      {
        id: 'card-custom',
        slug: 'day-a',
        state: 'learning',
        reps: 3,
        lapses: 1,
        last: currentDay,
        due: currentDay + 3600000,
        stability: 2.3,
        difficulty: 5,
        days: 0,
        steps: 1,
      },
      {
        id: 'card-1',
        slug: 'day-b',
        state: 'review',
        reps: 2,
        lapses: 1,
        last: currentDay,
        due: currentDay + 5 * 86400000,
        stability: 7,
        difficulty: 4,
        days: 5,
        steps: 0,
      },
      {
        id: 'fresh-opaque',
        slug: 'fresh-zero',
        state: 'new',
        reps: 0,
        lapses: 0,
        last: null,
        due: priorDay,
        stability: 0,
        difficulty: 0,
        days: 0,
        steps: 0,
      },
      {
        id: 'suspended-opaque',
        slug: 'suspended',
        state: 'relearning',
        reps: 1,
        lapses: 1,
        last: twoDaysAgo,
        due: priorDay,
        stability: 1.2,
        difficulty: 8,
        days: 0,
        steps: 1,
      },
    ]
    for (const card of cards) {
      insert(handle, 'fsrs_cards', {
        id: card.id,
        problem_slug: card.slug,
        card_kind: 'default',
        due_at: card.due,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.reps ? 1 : 0,
        scheduled_days: card.days,
        learning_steps: card.steps,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        last_review_at: card.last,
        created_at: 11,
        updated_at: 12,
      })
      insert(handle, 'problem_practice', {
        problem_slug: card.slug,
        status:
          card.slug === 'suspended'
            ? 'suspended'
            : card.slug === 'day-b'
              ? 'mastered'
              : card.state,
        first_seen_at: twoDaysAgo,
        last_seen_at: card.last,
        last_reviewed_at: card.last,
        last_rating:
          card.reps === 0 ? null : card.slug === 'suspended' ? 'hard' : 'good',
        last_elapsed_seconds: card.reps ? 1200 : null,
        best_elapsed_seconds: card.reps ? 600 : null,
        interview_pattern: 'two pointers',
        time_complexity: 'O(n)',
        space_complexity: 'O(1)',
        languages: 'TypeScript',
        notes: `Retain ${card.slug}`,
        solved_count: card.slug === 'day-a' ? 2 : card.reps ? 1 : 0,
        attempt_count: card.reps,
        is_suspended: card.slug === 'suspended' ? 1 : 0,
        created_at: 11,
        updated_at: 12,
      })
    }
    const attempts = [
      {
        id: 'attempt-a-1',
        slug: 'day-a',
        card: 'card-custom',
        rating: 'good',
        at: priorDay,
        updated: currentDay + 10000,
      },
      {
        id: 'attempt-b-1',
        slug: 'day-b',
        card: 'card-1',
        rating: 'again',
        at: priorDay,
        updated: priorDay,
      },
      {
        id: 'attempt-a-2',
        slug: 'day-a',
        card: 'card-custom',
        rating: 'again',
        at: currentDay,
        updated: currentDay,
      },
      {
        id: 'attempt-a-3',
        slug: 'day-a',
        card: 'card-custom',
        rating: 'good',
        at: currentDay,
        updated: currentDay + 20000,
      },
      {
        id: 'attempt-b-2',
        slug: 'day-b',
        card: 'card-1',
        rating: 'good',
        at: currentDay,
        updated: currentDay,
      },
      {
        id: 'attempt-s-1',
        slug: 'suspended',
        card: 'suspended-opaque',
        rating: 'hard',
        at: twoDaysAgo,
        updated: twoDaysAgo,
      },
    ]
    attempts.forEach((attempt, index) => {
      const at = new Date(attempt.at).toISOString()
      insert(handle, 'review_attempts', {
        id: attempt.id,
        problem_slug: attempt.slug,
        card_id: attempt.card,
        rating: attempt.rating,
        review_mode: index % 2 ? 'manual' : 'leetcode',
        reviewed_at: attempt.at,
        elapsed_seconds: index === 0 ? 600 : 1200,
        is_correct: attempt.rating === 'again' ? 0 : 1,
        interview_pattern: 'two pointers',
        time_complexity: 'O(n)',
        space_complexity: 'O(1)',
        languages: 'TypeScript',
        notes: `Review ${attempt.id}`,
        fsrs_review_log: JSON.stringify({
          rating: attempt.rating,
          state: 'review',
          dueAt: at,
          stability: 2.3,
          difficulty: 5,
          elapsedDays: 1,
          lastElapsedDays: 1,
          scheduledDays: 1,
          learningSteps: 0,
          reviewedAt: at,
        }),
        created_at: attempt.at,
        updated_at: attempt.updated,
      })
    })
    insert(handle, 'tracks', {
      id: 'owned-track',
      slug: 'owned-track',
      title: 'Owned',
      due_at: currentDay + 86400000,
      allow_external_progress: 1,
      created_at: 11,
      updated_at: 12,
    })
    insert(handle, 'track_groups', {
      id: 'owned-group',
      track_id: 'owned-track',
      title: 'Chapter',
      position: 3,
      created_at: 11,
      updated_at: 12,
    })
    for (const [index, slug] of ['day-a', 'day-b'].entries()) {
      insert(handle, 'track_group_problems', {
        track_group_id: 'owned-group',
        track_id: 'owned-track',
        problem_slug: slug,
        position: 7 + index,
      })
      insert(handle, 'track_problem_progress', {
        track_id: 'owned-track',
        problem_slug: slug,
        review_attempt_id: slug === 'day-a' ? 'attempt-a-3' : null,
        completed_at: slug === 'day-a' ? currentDay : priorDay,
        completed_rating: slug === 'day-a' ? 'good' : 'hard',
        created_at: 11,
        updated_at: 12,
      })
    }
    insert(handle, 'track_session', {
      id: 'active',
      active_track_id: 'owned-track',
      active_group_id: 'owned-group',
      started_at: priorDay,
      updated_at: currentDay,
    })
    const settings = {
      schemaVersion: 1,
      analytics: {
        targetRecall: 0.8,
        targetReviewSuccess: 0.85,
        targetFirstAttemptSuccess: 0.7,
        targetFirstAttemptGoodEasy: 0.65,
      },
      appearance: { themeMode: 'dark' },
      practice: {
        dailyGoal: 2,
        mode: 'studyPlan',
        problemFilters: { skipPremium: true },
      },
      review: { targetRetention: 0.75, order: 'dueFirst' },
      assessment: {
        requireSolveTime: true,
        strictTiming: true,
        timeTargetsMinutes: { easy: 20, medium: 35, hard: 50 },
      },
      aiAssessment: { enabled: false, provider: 'openai', model: '' },
      overlay: { autoDetectSolved: false },
      reminders: { daily: { enabled: true, time: '18:30' } },
    }
    insert(handle, 'settings_kv', {
      key: 'user-settings',
      value: JSON.stringify(settings),
      updated_at: 12,
    })
    insert(handle, 'settings_kv', {
      key: 'unrelated-preference',
      value: '{"retain":true}',
      updated_at: 19,
    })
    return {
      bytes: serializeDb(handle),
      rows: readPreservationRows(handle),
      attemptsForProgress: readProgressAttempts(handle),
      settings,
    }
  } finally {
    handle.rawDb.close()
  }
}
