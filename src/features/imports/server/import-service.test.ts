import { asc, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { createTestDb } from '@/platform/db/test-db'
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
  topics,
  trackGroupProblems,
  trackGroups,
  trackProblemProgress,
  trackSession,
  tracks,
} from '@/platform/db/schema'
import { maxImportBytes } from '@/features/imports/api/content-file-contracts'
import type { Db } from '@/platform/db'

import { applyContentImport, previewContentImport } from './import-service'
import {
  existingLocalTrackFixture,
  validTwoQuestionTrackFileText,
} from '../testing/import-fixtures'

const fixedNow = new Date('2026-09-26T12:00:00.000Z')

describe('content import service', () => {
  it('does not write when a file is imported again after its first import', async () => {
    const handle = await createTestDb({ seed: false })
    const fileText = JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      problems: ['two-sum'],
    })

    try {
      const initialPreview = await previewContentImport(handle.db, fileText)
      expect(initialPreview.status).toBe('ready')

      const firstApply = await applyContentImport(
        handle.db,
        fileText,
        initialPreview.fingerprint!,
      )
      expect(firstApply.status).toBe('committed')

      const insertSpy = vi.spyOn(handle.db, 'insert')
      const updateSpy = vi.spyOn(handle.db, 'update')
      const deleteSpy = vi.spyOn(handle.db, 'delete')

      const secondPreview = await previewContentImport(handle.db, fileText)
      const secondApply = await applyContentImport(
        handle.db,
        fileText,
        secondPreview.fingerprint!,
      )

      expect(secondPreview.status).toBe('unchanged')
      expect(secondApply.status).toBe('unchanged')
      expect(insertSpy).not.toHaveBeenCalled()
      expect(updateSpy).not.toHaveBeenCalled()
      expect(deleteSpy).not.toHaveBeenCalled()
    } finally {
      vi.restoreAllMocks()
      handle.rawDb.close()
    }
  })

  it('previews catalog and curriculum additions without writing', async () => {
    const handle = await createTestDb({ seed: false })
    try {
      await insertLocalTrackFixture(handle.db)
      const before = await importTables(handle.db)
      const insertSpy = vi.spyOn(handle.db, 'insert')
      const updateSpy = vi.spyOn(handle.db, 'update')
      const deleteSpy = vi.spyOn(handle.db, 'delete')

      const preview = await previewContentImport(
        handle.db,
        validTwoQuestionTrackFileText,
      )
      const after = await importTables(handle.db)

      expect(preview).toMatchObject({
        status: 'ready',
        additions: {
          problems: 2,
          tracks: 1,
          groups: 1,
          memberships: 2,
        },
      })
      expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/)
      expect(after).toEqual(before)
      expect(insertSpy).not.toHaveBeenCalled()
      expect(updateSpy).not.toHaveBeenCalled()
      expect(deleteSpy).not.toHaveBeenCalled()
    } finally {
      vi.restoreAllMocks()
      handle.rawDb.close()
    }
  })

  it('returns stale when relevant problem titles change after preview', async () => {
    const handle = await createTestDb({ seed: false })
    const fileText = JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      problems: [
        { slug: 'two-sum', title: 'Two Sum' },
        { slug: 'new-problem', title: 'New Problem' },
      ],
    })
    try {
      await insertProblem(handle.db, 'two-sum', 'Two Sum')
      const preview = await previewContentImport(handle.db, fileText)
      await handle.db
        .update(problems)
        .set({ title: 'Changed after preview' })
        .where(eq(problems.slug, 'two-sum'))

      await applyStaleWithoutWrites(handle.db, fileText, preview.fingerprint!)

      expect(await rowsForProblem(handle.db, 'two-sum')).toMatchObject([
        { title: 'Changed after preview' },
      ])
    } finally {
      handle.rawDb.close()
    }
  })

  it('returns stale when relevant track order changes after preview', async () => {
    const handle = await createTestDb({ seed: false })
    const fileText = JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      tracks: [
        {
          slug: 'local-track',
          title: 'Imported title',
          groups: [
            { slug: 'arrays', title: 'Imported arrays', problems: ['two-sum'] },
            { slug: 'strings', title: 'Strings', problems: ['valid-anagram'] },
          ],
        },
      ],
    })
    try {
      await insertLocalTrackFixture(handle.db)
      const preview = await previewContentImport(handle.db, fileText)
      await handle.db
        .update(trackGroups)
        .set({ position: 7 })
        .where(eq(trackGroups.id, 'local-track:arrays'))

      await applyStaleWithoutWrites(handle.db, fileText, preview.fingerprint!)

      expect(preview.status).toBe('ready')
      expect(await handle.db.select().from(trackGroups)).toMatchObject([
        { position: 7 },
      ])
    } finally {
      handle.rawDb.close()
    }
  })

  it('returns stale when a planned problem-topic association is added after preview', async () => {
    const handle = await createTestDb({ seed: false })
    const fileText = JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      problems: [
        { slug: 'two-sum', title: 'Two Sum', topics: ['Arrays'] },
        { slug: 'new-problem', title: 'New Problem' },
      ],
    })
    try {
      await insertProblem(handle.db, 'two-sum', 'Two Sum')
      await handle.db.insert(topics).values({ id: 'arrays', label: 'Arrays' })
      const preview = await previewContentImport(handle.db, fileText)
      await handle.db
        .insert(problemTopics)
        .values({ problemSlug: 'two-sum', topicId: 'arrays' })

      await applyStaleWithoutWrites(handle.db, fileText, preview.fingerprint!)

      expect(await handle.db.select().from(problemTopics)).toEqual([
        { problemSlug: 'two-sum', topicId: 'arrays' },
      ])
    } finally {
      handle.rawDb.close()
    }
  })

  it('returns stale when a relevant topic alias changes after preview', async () => {
    const handle = await createTestDb({ seed: false })
    const fileText = JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      problems: [
        { slug: 'two-sum', title: 'Two Sum', topics: ['Array'] },
        { slug: 'new-problem', title: 'New Problem' },
      ],
    })
    try {
      await handle.db.insert(topics).values([
        { id: 'arrays', label: 'Arrays' },
        { id: 'algorithms', label: 'Algorithms' },
      ])
      await handle.db.insert(topicAliases).values({
        aliasKey: 'array',
        label: 'Array',
        topicId: 'arrays',
        createdAt: 10,
        updatedAt: 11,
      })
      const preview = await previewContentImport(handle.db, fileText)
      await handle.db
        .update(topicAliases)
        .set({ topicId: 'algorithms' })
        .where(eq(topicAliases.aliasKey, 'array'))

      await applyStaleWithoutWrites(handle.db, fileText, preview.fingerprint!)

      expect(await handle.db.select().from(topicAliases)).toMatchObject([
        { aliasKey: 'array', topicId: 'algorithms' },
      ])
    } finally {
      handle.rawDb.close()
    }
  })

  it('keeps the fingerprint stable when unrelated practice state changes', async () => {
    const handle = await createTestDb({ seed: false })
    const fileText = JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      tracks: [
        {
          slug: 'local-track',
          groups: [{ slug: 'arrays', problems: ['two-sum'] }],
        },
      ],
    })
    try {
      await insertProblem(handle.db, 'two-sum', 'Two Sum')
      await insertLocalTrackFixture(handle.db)
      const before = await previewContentImport(handle.db, fileText)
      await handle.db.insert(problemPractice).values({
        problemSlug: 'two-sum',
        status: 'completed',
        firstSeenAt: 100,
        lastSeenAt: 200,
        lastReviewedAt: 200,
        lastRating: 'good',
        solvedCount: 1,
        attemptCount: 1,
        isSuspended: false,
        createdAt: 100,
        updatedAt: 200,
      })

      const after = await previewContentImport(handle.db, fileText)

      expect(after.fingerprint).toBe(before.fingerprint)
      expect(after.status).toBe(before.status)
    } finally {
      handle.rawDb.close()
    }
  })

  it('imports valid rows from a partially invalid file without creating implicit children', async () => {
    const handle = await createTestDb({ seed: false })
    const fileText = JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      problems: [
        { slug: 'two-sum', title: 'Two Sum' },
        42,
        { slug: 'not a slug', title: 'Invalid problem' },
      ],
    })
    try {
      const preview = await previewContentImport(handle.db, fileText)
      const applied = await applyContentImport(
        handle.db,
        fileText,
        preview.fingerprint!,
        fixedNow,
      )

      expect(applied.status).toBe('committed')
      expect(await handle.db.select().from(problems)).toMatchObject([
        { slug: 'two-sum', title: 'Two Sum' },
      ])
      expect(await handle.db.select().from(topics)).toEqual([])
      expect(await handle.db.select().from(companies)).toEqual([])
      expect(await handle.db.select().from(problemTopics)).toEqual([])
      expect(await handle.db.select().from(problemCompanies)).toEqual([])
      expect(await handle.db.select().from(tracks)).toEqual([])
      expect(await handle.db.select().from(trackGroups)).toEqual([])
      expect(await handle.db.select().from(trackGroupProblems)).toEqual([])
      expect(applied.preview.diagnostics.length).toBeGreaterThan(0)
    } finally {
      handle.rawDb.close()
    }
  })

  it('preserves reviewed, completed, suspended, and scalar state during import', async () => {
    const handle = await createTestDb({ seed: false })
    const fileText = JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      problems: [
        { slug: 'reviewed-problem', title: 'Imported replacement title' },
        { slug: 'new-problem', title: 'New Problem' },
      ],
      tracks: [
        {
          slug: 'review-track',
          title: 'Imported replacement track title',
          groups: [
            {
              slug: 'completed',
              title: 'Imported replacement group title',
              problems: ['reviewed-problem'],
            },
          ],
        },
      ],
    })
    try {
      await seedReviewedState(handle.db)
      const before = await sensitiveState(handle.db)
      const importRowsBefore = await importTables(handle.db)
      const preview = await previewContentImport(handle.db, fileText)
      const applied = await applyContentImport(
        handle.db,
        fileText,
        preview.fingerprint!,
        fixedNow,
      )
      const after = await sensitiveState(handle.db)
      const importRowsAfter = await importTables(handle.db)

      expect(applied.status).toBe('committed')
      expect(after).toEqual(before)
      expect(existingImportRows(importRowsBefore, importRowsAfter)).toEqual(
        importRowsBefore,
      )
    } finally {
      handle.rawDb.close()
    }
  })

  it('rolls back catalog and curriculum additions when a late membership insert fails', async () => {
    const handle = await createTestDb({ seed: false })
    const fileText = JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      topics: ['Dynamic Programming'],
      tracks: [
        {
          slug: 'imported-interview-track',
          title: 'Imported Interview Track',
          groups: [
            {
              slug: 'arrays',
              title: 'Arrays',
              problems: ['two-sum', 'valid-anagram'],
            },
          ],
        },
      ],
    })
    try {
      handle.rawDb.exec(
        "CREATE TEMP TRIGGER fail_import_membership BEFORE INSERT ON track_group_problems BEGIN SELECT RAISE(ABORT, 'controlled import failure'); END;",
      )
      const preview = await previewContentImport(handle.db, fileText)

      await expect(
        applyContentImport(handle.db, fileText, preview.fingerprint!, fixedNow),
      ).rejects.toThrow()

      expect(await handle.db.select().from(topics)).toEqual([])
      expect(await handle.db.select().from(problems)).toEqual([])
      expect(await handle.db.select().from(tracks)).toEqual([])
      expect(await handle.db.select().from(trackGroups)).toEqual([])
      expect(await handle.db.select().from(trackGroupProblems)).toEqual([])
    } finally {
      handle.rawDb.close()
    }
  })

  it('reuses canonical URL and slug identities and retains renamed group identity', async () => {
    const handle = await createTestDb({ seed: false })
    const firstFileText = JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      tracks: [
        {
          slug: 'local-track',
          groups: [
            {
              slug: 'arrays',
              title: 'Arrays',
              problems: ['https://leetcode.com/problems/two-sum/', 'two-sum'],
            },
          ],
        },
      ],
    })
    const renamedFileText = JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      tracks: [
        {
          slug: 'local-track',
          groups: [
            { slug: 'arrays', title: 'Renamed Arrays', problems: ['two-sum'] },
          ],
        },
      ],
    })
    try {
      await insertLocalTrackFixture(handle.db)
      const firstPreview = await previewContentImport(handle.db, firstFileText)
      const firstApply = await applyContentImport(
        handle.db,
        firstFileText,
        firstPreview.fingerprint!,
        fixedNow,
      )
      const groupId = (await handle.db.select().from(trackGroups))[0]?.id
      const renamedPreview = await previewContentImport(
        handle.db,
        renamedFileText,
      )
      const renamedApply = await applyContentImport(
        handle.db,
        renamedFileText,
        renamedPreview.fingerprint!,
        fixedNow,
      )

      expect(firstApply.status).toBe('committed')
      expect(firstApply.preview.additions.problems).toBe(1)
      expect(renamedApply.status).toBe('unchanged')
      expect(await handle.db.select().from(problems)).toHaveLength(1)
      expect(await handle.db.select().from(trackGroupProblems)).toHaveLength(1)
      expect(groupId).toBe('local-track:arrays')
      expect(await handle.db.select().from(trackGroups)).toEqual([
        expect.objectContaining({
          id: 'local-track:arrays',
          title: 'My Arrays',
        }),
      ])
    } finally {
      handle.rawDb.close()
    }
  })

  it.each([
    [
      'oversized content',
      JSON.stringify({ format: 'cognipace-content', version: 1 }) +
        ' '.repeat(maxImportBytes),
    ],
    ['bad header', JSON.stringify({ format: 'other-format', version: 1 })],
  ])('blocks %s and performs no writes', async (_label, fileText) => {
    const handle = await createTestDb({ seed: false })
    try {
      const insertSpy = vi.spyOn(handle.db, 'insert')
      const updateSpy = vi.spyOn(handle.db, 'update')
      const deleteSpy = vi.spyOn(handle.db, 'delete')
      const selectSpy = vi.spyOn(handle.db, 'select')
      const preview = await previewContentImport(handle.db, fileText)
      const applied = await applyContentImport(handle.db, fileText, '')

      expect(preview.status).toBe('blocked')
      expect(applied.status).toBe('blocked')
      expect(selectSpy).not.toHaveBeenCalled()
      expect(insertSpy).not.toHaveBeenCalled()
      expect(updateSpy).not.toHaveBeenCalled()
      expect(deleteSpy).not.toHaveBeenCalled()
      expect(await importTables(handle.db)).toEqual(emptyImportStateTables())
    } finally {
      vi.restoreAllMocks()
      handle.rawDb.close()
    }
  })

  it('fingerprints empty documents but refuses to apply them', async () => {
    const handle = await createTestDb({ seed: false })
    const fileText = JSON.stringify({ format: 'cognipace-content', version: 1 })
    try {
      const preview = await previewContentImport(handle.db, fileText)
      const insertSpy = vi.spyOn(handle.db, 'insert')
      const applied = await applyContentImport(
        handle.db,
        fileText,
        preview.fingerprint!,
        fixedNow,
      )

      expect(preview.status).toBe('empty')
      expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/)
      expect(applied).toMatchObject({
        status: 'blocked',
        preview: { status: 'empty' },
      })
      expect(insertSpy).not.toHaveBeenCalled()
    } finally {
      vi.restoreAllMocks()
      handle.rawDb.close()
    }
  })

  it('adds 250 ordered memberships and leaves a second import unchanged', async () => {
    const handle = await createTestDb({ seed: false })
    const slugs = Array.from(
      { length: 250 },
      (_, index) => `question-${String(index + 1).padStart(3, '0')}`,
    )
    const fileText = JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      tracks: [
        {
          slug: 'large-track',
          title: 'Large Track',
          groups: [{ slug: 'ordered', title: 'Ordered', problems: slugs }],
        },
      ],
    })
    try {
      const preview = await previewContentImport(handle.db, fileText)
      const first = await applyContentImport(
        handle.db,
        fileText,
        preview.fingerprint!,
        fixedNow,
      )
      const memberships = await handle.db
        .select()
        .from(trackGroupProblems)
        .orderBy(asc(trackGroupProblems.position))
      const secondPreview = await previewContentImport(handle.db, fileText)
      const second = await applyContentImport(
        handle.db,
        fileText,
        secondPreview.fingerprint!,
        fixedNow,
      )

      expect(first.status).toBe('committed')
      expect(first.preview.additions).toMatchObject({
        problems: 250,
        tracks: 1,
        groups: 1,
        memberships: 250,
      })
      expect(memberships.map(({ problemSlug }) => problemSlug)).toEqual(slugs)
      expect(memberships.map(({ position }) => position)).toEqual(
        Array.from({ length: 250 }, (_, index) => index + 1),
      )
      expect(secondPreview.status).toBe('unchanged')
      expect(second.status).toBe('unchanged')
      expect(
        await handle.db
          .select()
          .from(trackGroupProblems)
          .orderBy(asc(trackGroupProblems.position)),
      ).toEqual(memberships)
    } finally {
      handle.rawDb.close()
    }
  })
})

async function insertLocalTrackFixture(db: Db) {
  for (const row of existingLocalTrackFixture.tracks) {
    await db.insert(tracks).values({ ...row, createdAt: 100, updatedAt: 101 })
  }
  for (const row of existingLocalTrackFixture.groups) {
    await db
      .insert(trackGroups)
      .values({ ...row, createdAt: 100, updatedAt: 101 })
  }
}

async function insertProblem(db: Db, slug: string, title: string) {
  await db.insert(problems).values({
    slug,
    title,
    difficulty: 'unknown',
    isPremium: false,
    createdAt: 100,
    updatedAt: 101,
  })
}

async function rowsForProblem(db: Db, slug: string) {
  return db.select().from(problems).where(eq(problems.slug, slug))
}

async function importTables(db: Db) {
  const [
    problemRows,
    topicRows,
    companyRows,
    aliases,
    topicLinks,
    companyLinks,
    trackRows,
    groups,
    memberships,
  ] = await Promise.all([
    db.select().from(problems),
    db.select().from(topics),
    db.select().from(companies),
    db.select().from(topicAliases),
    db.select().from(problemTopics),
    db.select().from(problemCompanies),
    db.select().from(tracks),
    db.select().from(trackGroups),
    db.select().from(trackGroupProblems),
  ])
  return {
    problems: problemRows,
    topics: topicRows,
    companies: companyRows,
    aliases,
    problemTopics: topicLinks,
    problemCompanies: companyLinks,
    tracks: trackRows,
    groups,
    memberships,
  }
}

async function applyStaleWithoutWrites(
  db: Db,
  fileText: string,
  expectedFingerprint: string,
) {
  const before = await importTables(db)
  const insertSpy = vi.spyOn(db, 'insert')
  const updateSpy = vi.spyOn(db, 'update')
  const deleteSpy = vi.spyOn(db, 'delete')

  try {
    const applied = await applyContentImport(
      db,
      fileText,
      expectedFingerprint,
      fixedNow,
    )
    const after = await importTables(db)

    expect(applied.status).toBe('stale')
    expect(applied.preview.fingerprint).not.toBe(expectedFingerprint)
    expect(after).toEqual(before)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()
    return applied
  } finally {
    vi.restoreAllMocks()
  }
}

function existingImportRows(
  before: Awaited<ReturnType<typeof importTables>>,
  after: Awaited<ReturnType<typeof importTables>>,
) {
  return {
    problems: existingRows(before.problems, after.problems, (row) => row.slug),
    topics: existingRows(before.topics, after.topics, (row) => row.id),
    companies: existingRows(before.companies, after.companies, (row) => row.id),
    aliases: existingRows(before.aliases, after.aliases, (row) => row.aliasKey),
    problemTopics: existingRows(
      before.problemTopics,
      after.problemTopics,
      (row) => JSON.stringify([row.problemSlug, row.topicId]),
    ),
    problemCompanies: existingRows(
      before.problemCompanies,
      after.problemCompanies,
      (row) => JSON.stringify([row.problemSlug, row.companyId]),
    ),
    tracks: existingRows(before.tracks, after.tracks, (row) => row.id),
    groups: existingRows(before.groups, after.groups, (row) => row.id),
    memberships: existingRows(before.memberships, after.memberships, (row) =>
      JSON.stringify([row.trackId, row.trackGroupId, row.problemSlug]),
    ),
  }
}

function existingRows<Row>(
  before: Row[],
  after: Row[],
  identity: (row: Row) => string,
) {
  const existingIdentities = new Set(before.map(identity))
  return after.filter((row) => existingIdentities.has(identity(row)))
}

function emptyImportStateTables() {
  return {
    problems: [],
    topics: [],
    companies: [],
    aliases: [],
    problemTopics: [],
    problemCompanies: [],
    tracks: [],
    groups: [],
    memberships: [],
  }
}

async function seedReviewedState(db: Db) {
  await insertProblem(db, 'reviewed-problem', 'Locally reviewed title')
  await db.insert(tracks).values({
    id: 'review-track',
    slug: 'review-track',
    title: 'Review Track',
    description: null,
    dueAt: 321,
    createdAt: 10,
    updatedAt: 11,
  })
  await db.insert(trackGroups).values({
    id: 'review-track:completed',
    trackId: 'review-track',
    title: 'Completed',
    position: 1,
    createdAt: 12,
    updatedAt: 13,
  })
  await db.insert(trackGroupProblems).values({
    trackId: 'review-track',
    trackGroupId: 'review-track:completed',
    problemSlug: 'reviewed-problem',
    position: 1,
  })
  await db.insert(problemPractice).values({
    problemSlug: 'reviewed-problem',
    status: 'completed',
    firstSeenAt: 20,
    lastSeenAt: 21,
    lastReviewedAt: 22,
    lastRating: 'easy',
    lastElapsedSeconds: 33,
    bestElapsedSeconds: 30,
    interviewPattern: 'two-pointers',
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(1)',
    languages: '["typescript"]',
    notes: 'keep exact notes',
    solvedCount: 3,
    attemptCount: 4,
    isSuspended: true,
    createdAt: 23,
    updatedAt: 24,
  })
  await db.insert(fsrsCards).values({
    id: 'review-card',
    problemSlug: 'reviewed-problem',
    cardKind: 'default',
    dueAt: 30,
    stability: 4.5,
    difficulty: 5.25,
    elapsedDays: 6,
    scheduledDays: 7,
    learningSteps: 1,
    reps: 8,
    lapses: 2,
    state: 'review',
    lastReviewAt: 22,
    createdAt: 25,
    updatedAt: 26,
  })
  await db.insert(reviewAttempts).values({
    id: 'review-attempt',
    problemSlug: 'reviewed-problem',
    cardId: 'review-card',
    rating: 'easy',
    reviewMode: 'practice',
    reviewedAt: 22,
    elapsedSeconds: 33,
    isCorrect: true,
    interviewPattern: 'two-pointers',
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(1)',
    languages: '["typescript"]',
    notes: 'attempt notes',
    fsrsReviewLog: '{"review":true}',
    createdAt: 27,
    updatedAt: 28,
  })
  await db.insert(trackProblemProgress).values({
    trackId: 'review-track',
    problemSlug: 'reviewed-problem',
    reviewAttemptId: 'review-attempt',
    completedAt: 29,
    completedRating: 'easy',
    createdAt: 30,
    updatedAt: 31,
  })
  await db.insert(trackSession).values({
    id: 'active-session',
    activeTrackId: 'review-track',
    activeGroupId: 'review-track:completed',
    startedAt: 32,
    updatedAt: 33,
  })
  await db.insert(settingsKv).values({
    key: 'user-settings',
    value: '{"keep":"exact"}',
    updatedAt: 34,
  })
}

async function sensitiveState(db: Db) {
  const [practice, cards, attempts, progress, sessions, settings] =
    await Promise.all([
      db.select().from(problemPractice),
      db.select().from(fsrsCards),
      db.select().from(reviewAttempts),
      db.select().from(trackProblemProgress),
      db.select().from(trackSession),
      db.select().from(settingsKv),
    ])
  return { practice, cards, attempts, progress, sessions, settings }
}
