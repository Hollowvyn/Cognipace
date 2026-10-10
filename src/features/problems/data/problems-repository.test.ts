import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { describe, expect, it } from 'vitest'

import { saveReviewResult } from '@/features/practice/server/practice-service'
import {
  bulkDeleteProblems,
  bulkUpdateProblems,
  createProblem,
  getProblemForEdit,
  getProblemLibrary,
  getProblemLibraryRowsBySlug,
  updateProblem,
  upsertProblemFromPage,
} from '@/features/problems/server/problems-service'
import { updateSettings } from '@/features/settings/server/settings-service'
import type { Db } from '@/platform/db'
import { replaceProblemTopicLabels } from '@/features/problems/data/topic-resolver'
import { createProxyCallback } from '@/platform/db/proxy'
import * as schema from '@/platform/db/schema'
import {
  companies,
  fsrsCards,
  problemCompanies,
  problemPractice,
  problemTopics,
  reviewAttempts,
} from '@/platform/db/schema'
import { createTestDb } from '@/platform/db/test-db'

import { createProblemsRepository } from './problems-repository'

describe('ProblemsRepository library data', () => {
  it('retains the stored opaque card ID in Library state', async () => {
    const { db } = await createTestDb()
    await db.insert(fsrsCards).values({
      id: 'library/opaque',
      problemSlug: 'two-sum',
      cardKind: 'default',
      dueAt: new Date('2026-01-01T12:00:00Z').getTime(),
      stability: 2,
      difficulty: 4,
      elapsedDays: 0,
      scheduledDays: 1,
      learningSteps: 0,
      reps: 1,
      lapses: 0,
      state: 'review',
      lastReviewAt: new Date('2025-12-31T12:00:00Z').getTime(),
      createdAt: 0,
      updatedAt: 0,
    })
    const rows = await createProblemsRepository(db).getLibraryRowsBySlug(
      ['two-sum'],
      { now: new Date('2026-01-02T12:00:00Z') },
    )
    expect(rows[0]?.state.cardId).toBe('library/opaque')
  })
  it('composes Library rows from DB-backed problem, practice, labels, companies, and tracks', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    await handle.db.insert(problemTopics).values({
      problemSlug: 'two-sum',
      topicId: 'array',
    })
    await handle.db.insert(companies).values({
      id: 'netflix',
      label: 'Netflix',
    })
    await handle.db.insert(problemCompanies).values({
      problemSlug: 'two-sum',
      companyId: 'netflix',
    })
    await saveSolvedReview(handle.db)

    const library = await getProblemLibrary(handle.db, {
      surface: 'dashboard',
      at: '2026-01-01T10:01:00.000Z',
    })
    const twoSum = library.rows.find((row) => row.problem.slug === 'two-sum')

    expect(library.summary.totalCount).toBe(library.rows.length)
    expect(library.rows.map((row) => row.problem.slug)).toEqual(
      expect.arrayContaining([
        'two-sum',
        'valid-parentheses',
        'two-sum-ii-input-array-is-sorted',
      ]),
    )
    expect(twoSum).toMatchObject({
      status: 'scheduled',
      lastSolvedAt: solvedAt.toISOString(),
      topics: [{ id: 'array', label: 'Array' }],
      companies: [{ id: 'netflix', label: 'Netflix' }],
    })
    expect(twoSum?.trackMemberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          trackId: 'leetcode-75',
          groupId: 'leetcode-75:arrays-hashing',
        }),
      ]),
    )
  })

  it('publishes alias options and nested effective membership for unused topics', async () => {
    const handle = await createTestDb()

    await createProblem(
      handle.db,
      newProblemInput({
        slugOrUrl: 'bst-rollup',
        title: 'BST Rollup',
        topicLabels: ['BST'],
      }),
    )

    const library = await getProblemLibrary(handle.db, {
      surface: 'dashboard',
      at: '2026-01-01T10:01:00.000Z',
    })
    const row = library.rows.find(
      ({ problem }) => problem.slug === 'bst-rollup',
    )

    expect(row?.topics).toEqual([
      {
        id: 'binary-search-tree',
        label: 'Binary Search Tree',
        parentTopics: [
          { id: 'binary-tree', label: 'Binary Tree' },
          { id: 'tree', label: 'Tree' },
        ],
      },
    ])
    expect(row?.effectiveTopicIds).toEqual([
      'binary-search-tree',
      'binary-tree',
      'tree',
    ])
    expect(library.options.topics).toContainEqual({
      id: 'depth-first-search',
      label: 'Depth-First Search',
      aliases: ['DFS'],
    })
  })

  it('creates user problems and edits seeded or user-created metadata with replacement labels', async () => {
    const handle = await createTestDb()

    const created = await createProblem(
      handle.db,
      newProblemInput({
        topicLabels: ['Array', 'Binary Search'],
        companyLabels: ['Meta'],
      }),
    )
    const edited = await updateProblem(
      handle.db,
      updateProblemInput({
        title: 'Binary Search Updated',
        difficulty: 'medium',
        isPremium: true,
        topicLabels: ['Search'],
        companyLabels: ['Netflix'],
      }),
    )
    const seededDuplicate = await createProblem(
      handle.db,
      newProblemInput({
        slugOrUrl: 'two-sum',
        title: 'Two Sum Custom',
        difficulty: 'hard',
        isPremium: true,
        topicLabels: ['Hash Table'],
        companyLabels: ['Amazon'],
      }),
    )

    expect(created.problem).toMatchObject({
      slug: 'binary-search',
    })
    expect(edited).toMatchObject({
      problem: {
        title: 'Binary Search Updated',
        difficulty: 'medium',
        isPremium: true,
      },
      topics: [{ label: 'Search' }],
      companies: [{ label: 'Netflix' }],
    })
    expect(seededDuplicate.problem).toMatchObject({
      slug: 'two-sum',
      title: 'Two Sum Custom',
    })
  })

  it('resolves topic aliases and auto-creates unknown topics on manual writes', async () => {
    const handle = await createTestDb({
      now: new Date('2026-05-29T12:00:00.000Z'),
    })

    await createProblem(
      handle.db,
      newProblemInput({
        slugOrUrl: 'heap-drill',
        title: 'Heap Drill',
        topicLabels: ['Heaps', 'Priority Queue', 'Brand New Pattern'],
      }),
    )
    const saved = await createProblemsRepository(handle.db).getForEdit(
      'heap-drill',
    )

    expect(saved?.topics.map((topic) => topic.label)).toEqual([
      'Brand New Pattern',
      'Heap (Priority Queue)',
    ])
    const unknownTopicId = saved?.topics.find(
      (topic) => topic.label === 'Brand New Pattern',
    )?.id
    expect(unknownTopicId).toMatch(/^topic-[0-9a-f-]{36}$/u)

    await createProblem(
      handle.db,
      newProblemInput({
        slugOrUrl: 'heap-drill-repeat',
        title: 'Heap Drill Repeat',
        topicLabels: ['Brand New Pattern'],
      }),
    )
    const repeated = await createProblemsRepository(handle.db).getForEdit(
      'heap-drill-repeat',
    )
    expect(
      repeated?.topics.find((topic) => topic.label === 'Brand New Pattern')?.id,
    ).toBe(unknownTopicId)
  })

  it('resolves slash and Unicode labels without inferred assignments', async () => {
    const handle = await createTestDb()

    await writeProblemTopicLabels(handle, 'topic-identity-drill', [
      'Tree / Graph',
      '动态规划',
      'DSU',
      'Union Find',
      'KMP',
    ])
    const saved = await readTopicRowsForProblem(handle, 'topic-identity-drill')

    expect(saved).toHaveLength(4)
    expect(saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dynamic-programming',
          label: 'Dynamic Programming',
        }),
        expect.objectContaining({ id: 'union-find', label: 'Union-Find' }),
        expect.objectContaining({ id: 'kmp', label: 'KMP' }),
        expect.objectContaining({ label: 'Tree / Graph' }),
      ]),
    )
    expect(saved.map((topic) => topic.id)).not.toContain('tree')
    expect(saved.map((topic) => topic.id)).not.toContain('graph-theory')
    expect(saved.find((topic) => topic.id === 'kmp')?.id).not.toBe(
      'string-matching',
    )
  })

  it('rolls back a problem write when a later topic label is invalid', async () => {
    const handle = await createTestDb()

    await expect(
      writeProblemTopicLabels(handle, 'invalid-topic-drill', [
        'Valid New Topic',
        '///',
      ]),
    ).rejects.toThrow(/Unicode letter or number/u)

    expect(
      await handle.db
        .select()
        .from(schema.problems)
        .where(eq(schema.problems.slug, 'invalid-topic-drill')),
    ).toEqual([])
    expect(
      await handle.db
        .select()
        .from(schema.topics)
        .where(eq(schema.topics.label, 'Valid New Topic')),
    ).toEqual([])
  })

  it('keeps manual topic replacement semantics after alias resolution', async () => {
    const handle = await createTestDb()

    await createProblem(
      handle.db,
      newProblemInput({
        slugOrUrl: 'replace-topic-drill',
        title: 'Replace Topic Drill',
        topicLabels: ['Array', 'Heaps'],
      }),
    )
    await updateProblem(
      handle.db,
      updateProblemInput({
        problemSlug: 'replace-topic-drill',
        title: 'Replace Topic Drill',
        topicLabels: ['DP'],
      }),
    )

    const saved = await createProblemsRepository(handle.db).getForEdit(
      'replace-topic-drill',
    )

    expect(saved?.topics.map((topic) => topic.label)).toEqual([
      'Dynamic Programming',
    ])
  })

  it('does not infer parents from applies-to topic relations', async () => {
    const handle = await createTestDb()

    await createProblem(
      handle.db,
      newProblemInput({
        slugOrUrl: 'graph-rollup',
        title: 'Graph Rollup',
        topicLabels: ['BFS'],
      }),
    )

    const saved = await createProblemsRepository(handle.db).getForEdit(
      'graph-rollup',
    )

    expect(saved?.topics).toEqual([
      {
        id: 'breadth-first-search',
        label: 'Breadth-First Search',
        parentTopics: [],
      },
    ])
  })

  it('keeps applies-to relations out of Library parent rollups', async () => {
    const handle = await createTestDb()

    await createProblem(
      handle.db,
      newProblemInput({
        slugOrUrl: 'library-rollup',
        title: 'Library Rollup',
        topicLabels: ['BFS'],
        companyLabels: ['Meta'],
      }),
    )

    const rows = await createProblemsRepository(handle.db).getLibraryRowsBySlug(
      ['library-rollup'],
      { now: new Date('2026-01-01T10:01:00.000Z') },
    )

    expect(rows[0]?.topics).toEqual([
      {
        id: 'breadth-first-search',
        label: 'Breadth-First Search',
        parentTopics: [],
      },
    ])
    expect(rows[0]?.companies).toEqual([{ id: 'meta', label: 'Meta' }])
  })

  it('bulk-updates fields and deletes existing problems', async () => {
    const handle = await createTestDb()

    await createProblem(
      handle.db,
      newProblemInput({
        topicLabels: ['Array'],
        companyLabels: ['Meta'],
      }),
    )

    await bulkUpdateProblems(handle.db, {
      surface: 'dashboard',
      problemSlugs: ['two-sum', 'binary-search', 'missing-problem'],
      set: {
        difficulty: 'hard',
        isPremium: true,
        topicLabels: ['Dynamic Programming'],
        companyLabels: [],
      },
    })
    const twoSum = await getProblemForEdit(handle.db, {
      surface: 'dashboard',
      problemSlug: 'two-sum',
    })
    await saveSolvedReview(handle.db, 'binary-search')
    await bulkDeleteProblems(handle.db, {
      surface: 'dashboard',
      problemSlugs: ['binary-search', 'two-sum', 'missing-problem'],
    })

    expect(twoSum).toMatchObject({
      problem: { difficulty: 'hard', isPremium: true },
      topics: [{ label: 'Dynamic Programming' }],
      companies: [],
    })
    await expect(
      getProblemForEdit(handle.db, {
        surface: 'dashboard',
        problemSlug: 'binary-search',
      }),
    ).rejects.toThrow(/was not found/)
    await expect(
      getProblemForEdit(handle.db, {
        surface: 'dashboard',
        problemSlug: 'two-sum',
      }),
    ).rejects.toThrow(/was not found/)
    expect(
      await handle.db
        .select()
        .from(problemPractice)
        .where(eq(problemPractice.problemSlug, 'binary-search')),
    ).toEqual([])
    expect(
      await handle.db
        .select()
        .from(reviewAttempts)
        .where(eq(reviewAttempts.problemSlug, 'binary-search')),
    ).toEqual([])
  })

  it('upserts page captures by canonical LeetCode slug', async () => {
    const handle = await createTestDb({ seed: false })
    const repository = createProblemsRepository(handle.db)

    await repository.upsertFromLeetCode({
      slug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'easy',
    })

    const saved = await upsertProblemFromPage(handle.db, {
      url: 'https://leetcode.com/problems/two-sum/',
      slug: 'two-sum',
      title: 'Two Sum Updated',
      difficulty: 'Medium',
      isPremium: true,
    })

    expect(saved).toMatchObject({
      slug: 'two-sum',
      title: 'Two Sum Updated',
      difficulty: 'medium',
      isPremium: true,
    })
  })

  it('merges captured LeetCode topics without clearing manual topics', async () => {
    const handle = await createTestDb()

    await upsertProblemFromPage(handle.db, {
      url: 'https://leetcode.com/problems/two-sum/',
      slug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'Easy',
      isPremium: false,
      topicLabels: ['Custom Local Topic'],
    })
    await upsertProblemFromPage(handle.db, {
      url: 'https://leetcode.com/problems/two-sum/',
      slug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'Easy',
      isPremium: false,
      topicLabels: ['Array', 'Hash Map'],
    })

    const merged = await readTopicRowsForProblem(handle, 'two-sum')
    expect(merged).toEqual(
      expect.arrayContaining([
        { id: 'array', label: 'Array' },
        { id: 'hash-map', label: 'Hash Map' },
        expect.objectContaining({ label: 'Custom Local Topic' }),
      ]),
    )
    expect(
      merged.find((topic) => topic.label === 'Custom Local Topic')?.id,
    ).toMatch(/^topic-[0-9a-f-]{36}$/u)
  })

  it('leaves existing topic links unchanged when page topic labels are omitted', async () => {
    const handle = await createTestDb()

    await createProblem(
      handle.db,
      newProblemInput({
        slugOrUrl: 'two-sum',
        title: 'Two Sum',
        topicLabels: ['Custom Local Topic'],
      }),
    )
    await upsertProblemFromPage(handle.db, {
      url: 'https://leetcode.com/problems/two-sum/',
      slug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'Easy',
      isPremium: false,
    })

    const saved = await createProblemsRepository(handle.db).getForEdit(
      'two-sum',
    )

    expect(saved?.topics).toMatchObject([
      {
        label: 'Custom Local Topic',
        parentTopics: [],
      },
    ])
    expect(saved?.topics[0]?.id).toMatch(/^topic-[0-9a-f-]{36}$/u)
  })

  it('returns Library rows only for requested slugs', async () => {
    const handle = await createTestDb()
    const repository = createProblemsRepository(handle.db)

    const rows = await repository.getLibraryRowsBySlug(['valid-parentheses'], {
      now: new Date('2026-01-01T10:01:00.000Z'),
    })

    expect(rows.map((row) => row.problem.slug)).toEqual(['valid-parentheses'])
  })

  it('allows callers to preserve input order by mapping rows back by slug', async () => {
    const handle = await createTestDb()
    const repository = createProblemsRepository(handle.db)
    const requestedSlugs = ['valid-parentheses', 'two-sum'] as const

    const rows = await repository.getLibraryRowsBySlug(requestedSlugs, {
      now: new Date('2026-01-01T10:01:00.000Z'),
    })
    const rowsBySlug = new Map(rows.map((row) => [row.problem.slug, row]))

    expect(rows.map((row) => row.problem.slug)).toEqual([
      'two-sum',
      'valid-parentheses',
    ])
    expect(
      requestedSlugs.map((slug) => rowsBySlug.get(slug)?.problem.slug),
    ).toEqual(['valid-parentheses', 'two-sum'])
  })

  it('includes Library row details for requested slugs', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const repository = createProblemsRepository(handle.db)

    await handle.db.insert(problemTopics).values({
      problemSlug: 'two-sum',
      topicId: 'array',
    })
    await handle.db.insert(companies).values({
      id: 'netflix',
      label: 'Netflix',
    })
    await handle.db.insert(problemCompanies).values({
      problemSlug: 'two-sum',
      companyId: 'netflix',
    })
    await saveSolvedReview(handle.db)

    const rows = await repository.getLibraryRowsBySlug(['two-sum'], {
      now: new Date('2026-01-01T10:01:00.000Z'),
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      problem: { slug: 'two-sum' },
      status: 'scheduled',
      topics: [{ id: 'array', label: 'Array' }],
      companies: [{ id: 'netflix', label: 'Netflix' }],
      state: {
        isStarted: true,
        isDue: false,
        reviewCount: 1,
        lastReviewedAt: solvedAt,
      },
      lastReviewedAt: solvedAt,
      lastSolvedAt: solvedAt,
    })
    expect(rows[0]?.nextReviewAt).toBeInstanceOf(Date)
    expect(rows[0]?.state.dueAt).toEqual(rows[0]?.nextReviewAt)
  })

  it('uses the persisted FSRS due date for service rows after a target-retention change', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    await saveSolvedReview(handle.db)

    const rowAtReviewTime = await getProblemLibraryRowsBySlug(
      handle.db,
      ['two-sum'],
      { now: solvedAt },
    )

    await updateSettings(handle.db, { review: { targetRetention: 0.97 } })

    const rowAfterRetentionChange = await getProblemLibraryRowsBySlug(
      handle.db,
      ['two-sum'],
      { now: serviceRetentionCheckAt },
    )

    expect(rowAtReviewTime[0]?.status).toBe('scheduled')
    expect(rowAfterRetentionChange[0]).toMatchObject({
      status: 'due',
      state: {
        isDue: true,
      },
    })
    expect(rowAfterRetentionChange[0]?.state.dueAt).toEqual(
      rowAtReviewTime[0]?.state.dueAt,
    )
    expect(rowAfterRetentionChange[0]?.state.retrievability).toBeGreaterThan(
      0.9,
    )
    expect(rowAfterRetentionChange[0]?.state.retrievability).toBeLessThan(0.97)
  })

  it('separates overdue and due-today Library statuses from the persisted due date', async () => {
    const handle = await createTestDb({
      now: new Date('2026-09-13T00:00:00.000Z'),
    })

    await saveSolvedReview(handle.db, 'two-sum')
    await saveSolvedReview(handle.db, 'valid-parentheses')

    await handle.db
      .update(fsrsCards)
      .set({ dueAt: new Date('2026-09-02T12:00:00.000Z').getTime() })
      .where(eq(fsrsCards.problemSlug, 'two-sum'))
    await handle.db
      .update(fsrsCards)
      .set({ dueAt: new Date('2026-09-13T12:00:00.000Z').getTime() })
      .where(eq(fsrsCards.problemSlug, 'valid-parentheses'))

    const library = await getProblemLibrary(handle.db, {
      surface: 'dashboard',
      at: '2026-09-13T18:00:00.000Z',
    })

    expect(
      library.rows.find((row) => row.problem.slug === 'two-sum'),
    ).toMatchObject({
      status: 'overdue',
      state: { isDue: true, isOverdue: true },
    })
    expect(
      library.rows.find((row) => row.problem.slug === 'valid-parentheses'),
    ).toMatchObject({
      status: 'due',
      state: { isDue: true, isOverdue: false },
    })
    expect(library.summary.dueCount).toBe(2)
  })

  it('deduplicates duplicate input slugs before querying', async () => {
    const handle = await createTestDb()
    const { db, queries } = createInstrumentedDb(handle)
    const repository = createProblemsRepository(db)

    await repository.getLibraryRowsBySlug(
      [
        ' Two Sum!! ',
        'two-sum',
        'https://leetcode.com/problems/valid-parentheses/',
        'valid-parentheses',
      ],
      { now: new Date('2026-01-01T10:01:00.000Z') },
    )

    const problemSelect = queries.find(
      (query) =>
        query.method === 'all' &&
        query.sql.includes('from "problems"') &&
        query.sql.includes('"problems"."slug" in'),
    )

    expect(problemSelect).toBeDefined()
    if (!problemSelect) {
      throw new Error('Expected the problem slug select query to be captured.')
    }
    expect(
      problemSelect.params.filter((param) => param === 'two-sum'),
    ).toHaveLength(1)
    expect(
      problemSelect.params.filter((param) => param === 'valid-parentheses'),
    ).toHaveLength(1)
  })
})

const solvedAt = new Date('2026-01-01T10:00:00.000Z')
const serviceRetentionCheckAt = new Date('2026-01-02T10:00:00.000Z')

async function writeProblemTopicLabels(
  handle: Awaited<ReturnType<typeof createTestDb>>,
  problemSlug: string,
  labels: readonly string[],
) {
  await handle.db.transaction(async (tx) => {
    const timestamp = Date.now()

    await tx
      .insert(schema.problems)
      .values({
        slug: problemSlug,
        title: problemSlug,
        difficulty: 'unknown',
        isPremium: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing()

    await replaceProblemTopicLabels(tx, problemSlug, labels)
  })
}

function readTopicRowsForProblem(
  handle: Awaited<ReturnType<typeof createTestDb>>,
  problemSlug: string,
) {
  return handle.db
    .select({ id: schema.topics.id, label: schema.topics.label })
    .from(problemTopics)
    .innerJoin(schema.topics, eq(schema.topics.id, problemTopics.topicId))
    .where(eq(problemTopics.problemSlug, problemSlug))
}

function saveSolvedReview(
  db: Parameters<typeof saveReviewResult>[0],
  problemSlug = 'two-sum',
) {
  return saveReviewResult(db, {
    problemSlug,
    rating: 'good',
    reviewedAt: solvedAt,
    isCorrect: true,
    targetRetention: 0.9,
  })
}

function newProblemInput(
  overrides: Partial<Parameters<typeof createProblem>[1]> = {},
) {
  return {
    surface: 'dashboard',
    slugOrUrl: 'binary-search',
    title: 'Binary Search',
    difficulty: 'easy',
    isPremium: false,
    topicLabels: [],
    companyLabels: [],
    ...overrides,
  } satisfies Parameters<typeof createProblem>[1]
}

function updateProblemInput(
  overrides: Partial<Parameters<typeof updateProblem>[1]> = {},
) {
  return {
    surface: 'dashboard',
    problemSlug: 'binary-search',
    title: 'Binary Search',
    difficulty: 'easy',
    isPremium: false,
    topicLabels: [],
    companyLabels: [],
    ...overrides,
  } satisfies Parameters<typeof updateProblem>[1]
}

function createInstrumentedDb(
  handle: Awaited<ReturnType<typeof createTestDb>>,
) {
  const delegate = createProxyCallback(handle.rawDb)
  const queries: CapturedQuery[] = []
  const db: Db = drizzle(
    (sql, params, method) => {
      queries.push({
        sql,
        params: Array.from(params as readonly unknown[]),
        method,
      })
      return delegate(sql, params, method)
    },
    { schema },
  )

  return { db, queries }
}

interface CapturedQuery {
  sql: string
  params: unknown[]
  method: string
}
