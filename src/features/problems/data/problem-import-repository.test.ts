import { asc } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { createTestDb } from '@/platform/db/test-db'
import {
  companies,
  problemCompanies,
  problemPractice,
  problemTopics,
  problems,
  topicAliases,
  topics,
} from '@/platform/db/schema'

import type { ProblemImportChanges } from '../domain/problem-import'
import {
  insertProblemImportChanges,
  readProblemImportState,
} from './problem-import-repository'

const now = new Date('2026-09-26T12:00:00.000Z')

describe('problem import repository', () => {
  it('projects only catalog fields needed by import planning', async () => {
    const handle = await createTestDb({ seed: false })

    try {
      await handle.db.insert(topics).values({ id: 'arrays', label: 'Arrays' })
      await handle.db.insert(topicAliases).values({
        aliasKey: 'array',
        label: 'Array',
        topicId: 'arrays',
        createdAt: 10,
        updatedAt: 11,
      })
      await handle.db.insert(companies).values({ id: 'acme', label: 'Acme' })
      await handle.db.insert(problems).values({
        slug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
        createdAt: 12,
        updatedAt: 13,
      })
      await handle.db
        .insert(problemTopics)
        .values({ problemSlug: 'two-sum', topicId: 'arrays' })
      await handle.db
        .insert(problemCompanies)
        .values({ problemSlug: 'two-sum', companyId: 'acme' })
      await handle.db.insert(problemPractice).values({
        problemSlug: 'two-sum',
        status: 'in_progress',
        firstSeenAt: 14,
        lastSeenAt: 14,
        lastReviewedAt: null,
        isSuspended: false,
        createdAt: 14,
        updatedAt: 14,
      })

      const state = await readProblemImportState(handle.db)

      expect(state).toEqual({
        problems: [
          {
            slug: 'two-sum',
            title: 'Two Sum',
            difficulty: 'easy',
            isPremium: false,
          },
        ],
        topics: [{ id: 'arrays', label: 'Arrays' }],
        companies: [{ id: 'acme', label: 'Acme' }],
        aliases: [{ aliasKey: 'array', label: 'Array', topicId: 'arrays' }],
        problemTopics: [{ problemSlug: 'two-sum', topicId: 'arrays' }],
        problemCompanies: [{ problemSlug: 'two-sum', companyId: 'acme' }],
      })
    } finally {
      handle.rawDb.close()
    }
  })

  it('leaves existing data untouched and makes no insert for empty changes', async () => {
    const handle = await createTestDb({ seed: false })

    try {
      await handle.db.insert(problems).values({
        slug: 'two-sum',
        title: 'Existing title',
        difficulty: 'medium',
        isPremium: true,
        createdAt: 100,
        updatedAt: 200,
      })
      const before = await handle.db.select().from(problems)
      const insertSpy = vi.spyOn(handle.db, 'insert')

      await insertProblemImportChanges(handle.db, emptyChanges(), now)

      expect(insertSpy).not.toHaveBeenCalled()
      expect(await handle.db.select().from(problems)).toEqual(before)
    } finally {
      handle.rawDb.close()
    }
  })

  it('inserts all catalog collections in foreign-key-safe order and stamps owned rows', async () => {
    const handle = await createTestDb({ seed: false })

    try {
      const insertSpy = vi.spyOn(handle.db, 'insert')

      await insertProblemImportChanges(
        handle.db,
        {
          topics: [{ id: 'arrays', label: 'Arrays' }],
          companies: [{ id: 'acme', label: 'Acme' }],
          problems: [
            {
              slug: 'two-sum',
              title: 'Two Sum',
              difficulty: 'easy',
              isPremium: false,
            },
          ],
          problemTopics: [{ problemSlug: 'two-sum', topicId: 'arrays' }],
          problemCompanies: [{ problemSlug: 'two-sum', companyId: 'acme' }],
        },
        now,
      )

      expect(insertSpy.mock.calls.map(([table]) => table)).toEqual([
        topics,
        companies,
        problems,
        problemTopics,
        problemCompanies,
      ])
      expect(await handle.db.select().from(topics)).toEqual([
        {
          id: 'arrays',
          label: 'Arrays',
          createdAt: now.getTime(),
          updatedAt: now.getTime(),
        },
      ])
      expect(await handle.db.select().from(problems)).toEqual([
        {
          slug: 'two-sum',
          title: 'Two Sum',
          difficulty: 'easy',
          isPremium: false,
          createdAt: now.getTime(),
          updatedAt: now.getTime(),
        },
      ])
      expect(await handle.db.select().from(companies)).toEqual([
        { id: 'acme', label: 'Acme' },
      ])
      expect(await handle.db.select().from(problemTopics)).toEqual([
        { problemSlug: 'two-sum', topicId: 'arrays' },
      ])
      expect(await handle.db.select().from(problemCompanies)).toEqual([
        { problemSlug: 'two-sum', companyId: 'acme' },
      ])
    } finally {
      handle.rawDb.close()
    }
  })

  it('skips empty catalog collections and propagates duplicate and foreign-key failures', async () => {
    const handle = await createTestDb({ seed: false })

    try {
      const insertSpy = vi.spyOn(handle.db, 'insert')
      await insertProblemImportChanges(
        handle.db,
        {
          topics: [],
          companies: [{ id: 'acme', label: 'Acme' }],
          problems: [],
          problemTopics: [],
          problemCompanies: [],
        },
        now,
      )
      expect(insertSpy.mock.calls.map(([table]) => table)).toEqual([companies])

      await expect(
        insertProblemImportChanges(
          handle.db,
          {
            ...emptyChanges(),
            companies: [
              { id: 'acme', label: 'Acme' },
              { id: 'acme', label: 'Duplicate Acme' },
            ],
          },
          now,
        ),
      ).rejects.toThrow()

      await expect(
        insertProblemImportChanges(
          handle.db,
          {
            ...emptyChanges(),
            problemTopics: [{ problemSlug: 'missing', topicId: 'missing' }],
          },
          now,
        ),
      ).rejects.toThrow()
    } finally {
      handle.rawDb.close()
    }
  })

  it('inserts catalog batches of at most one hundred rows', async () => {
    const handle = await createTestDb({ seed: false })

    try {
      const insertSpy = vi.spyOn(handle.db, 'insert')
      const topicsToInsert = Array.from({ length: 201 }, (_, index) => ({
        id: `topic-${index}`,
        label: `Topic ${index}`,
      }))

      await insertProblemImportChanges(
        handle.db,
        { ...emptyChanges(), topics: topicsToInsert },
        now,
      )

      expect(insertSpy).toHaveBeenCalledTimes(3)
      expect(
        await handle.db
          .select({ id: topics.id })
          .from(topics)
          .orderBy(asc(topics.id)),
      ).toHaveLength(201)
    } finally {
      handle.rawDb.close()
    }
  })
})

function emptyChanges(): ProblemImportChanges {
  return {
    topics: [],
    companies: [],
    problems: [],
    problemTopics: [],
    problemCompanies: [],
  }
}
