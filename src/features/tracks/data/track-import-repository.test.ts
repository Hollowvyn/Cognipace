import { asc } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { createTestDb } from '@/platform/db/test-db'
import {
  problemPractice,
  problems,
  trackGroupProblems,
  trackGroups,
  tracks,
} from '@/platform/db/schema'

import type { TrackImportChanges } from '../domain/track-import'
import {
  insertTrackImportChanges,
  readTrackImportState,
} from './track-import-repository'

const now = new Date('2026-09-26T12:00:00.000Z')

describe('track import repository', () => {
  it('projects only curriculum fields needed by import planning', async () => {
    const handle = await createTestDb({ seed: false })

    try {
      await handle.db.insert(problems).values({
        slug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
        createdAt: 10,
        updatedAt: 11,
      })
      await handle.db.insert(tracks).values({
        id: 'track-1',
        slug: 'interview-75',
        title: 'Interview 75',
        description: 'A curriculum',
        dueAt: 100,
        createdAt: 12,
        updatedAt: 13,
      })
      await handle.db.insert(trackGroups).values({
        id: 'track-1:arrays',
        trackId: 'track-1',
        title: 'Arrays',
        position: 1,
        createdAt: 14,
        updatedAt: 15,
      })
      await handle.db.insert(trackGroupProblems).values({
        trackGroupId: 'track-1:arrays',
        trackId: 'track-1',
        problemSlug: 'two-sum',
        position: 1,
      })
      await handle.db.insert(problemPractice).values({
        problemSlug: 'two-sum',
        status: 'in_progress',
        firstSeenAt: 16,
        lastSeenAt: 16,
        lastReviewedAt: null,
        isSuspended: false,
        createdAt: 16,
        updatedAt: 16,
      })

      const state = await readTrackImportState(handle.db)

      expect(state).toEqual({
        tracks: [
          {
            id: 'track-1',
            slug: 'interview-75',
            title: 'Interview 75',
            description: 'A curriculum',
            dueAt: 100,
          },
        ],
        groups: [
          {
            id: 'track-1:arrays',
            trackId: 'track-1',
            title: 'Arrays',
            position: 1,
          },
        ],
        memberships: [
          {
            trackId: 'track-1',
            trackGroupId: 'track-1:arrays',
            problemSlug: 'two-sum',
            position: 1,
          },
        ],
      })
    } finally {
      handle.rawDb.close()
    }
  })

  it('skips empty curriculum changes without inserting', async () => {
    const handle = await createTestDb({ seed: false })

    try {
      await handle.db.insert(tracks).values({
        id: 'existing-track',
        slug: 'existing-track',
        title: 'Existing Track',
        description: null,
        dueAt: null,
        createdAt: 100,
        updatedAt: 200,
      })
      const before = await handle.db.select().from(tracks)
      const insertSpy = vi.spyOn(handle.db, 'insert')

      await insertTrackImportChanges(handle.db, emptyChanges(), now)

      expect(insertSpy).not.toHaveBeenCalled()
      expect(await handle.db.select().from(tracks)).toEqual(before)
    } finally {
      handle.rawDb.close()
    }
  })

  it('inserts all curriculum collections in foreign-key-safe order and stamps owned rows', async () => {
    const handle = await createTestDb({ seed: false })

    try {
      await handle.db.insert(problems).values({
        slug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
        createdAt: 1,
        updatedAt: 1,
      })
      const insertSpy = vi.spyOn(handle.db, 'insert')

      await insertTrackImportChanges(
        handle.db,
        {
          tracks: [
            {
              id: 'track-1',
              slug: 'interview-75',
              title: 'Interview 75',
              description: 'A curriculum',
              dueAt: null,
            },
          ],
          groups: [
            {
              id: 'track-1:arrays',
              trackId: 'track-1',
              title: 'Arrays',
              position: 1,
            },
          ],
          memberships: [
            {
              trackId: 'track-1',
              trackGroupId: 'track-1:arrays',
              problemSlug: 'two-sum',
              position: 1,
            },
          ],
        },
        now,
      )

      expect(insertSpy.mock.calls.map(([table]) => table)).toEqual([
        tracks,
        trackGroups,
        trackGroupProblems,
      ])
      expect(await handle.db.select().from(tracks)).toEqual([
        {
          id: 'track-1',
          slug: 'interview-75',
          title: 'Interview 75',
          description: 'A curriculum',
          dueAt: null,
          createdAt: now.getTime(),
          updatedAt: now.getTime(),
        },
      ])
      expect(await handle.db.select().from(trackGroups)).toEqual([
        {
          id: 'track-1:arrays',
          trackId: 'track-1',
          title: 'Arrays',
          position: 1,
          createdAt: now.getTime(),
          updatedAt: now.getTime(),
        },
      ])
      expect(await handle.db.select().from(trackGroupProblems)).toEqual([
        {
          trackId: 'track-1',
          trackGroupId: 'track-1:arrays',
          problemSlug: 'two-sum',
          position: 1,
        },
      ])
    } finally {
      handle.rawDb.close()
    }
  })

  it('skips empty collections and propagates duplicate and foreign-key failures', async () => {
    const handle = await createTestDb({ seed: false })

    try {
      const insertSpy = vi.spyOn(handle.db, 'insert')
      await insertTrackImportChanges(
        handle.db,
        {
          tracks: [
            {
              id: 'track-1',
              slug: 'track-1',
              title: 'Track 1',
              description: null,
              dueAt: null,
            },
          ],
          groups: [],
          memberships: [],
        },
        now,
      )
      expect(insertSpy.mock.calls.map(([table]) => table)).toEqual([tracks])

      await expect(
        insertTrackImportChanges(
          handle.db,
          {
            tracks: [
              {
                id: 'duplicate',
                slug: 'duplicate',
                title: 'Duplicate',
                description: null,
                dueAt: null,
              },
              {
                id: 'duplicate',
                slug: 'duplicate-again',
                title: 'Duplicate Again',
                description: null,
                dueAt: null,
              },
            ],
            groups: [],
            memberships: [],
          },
          now,
        ),
      ).rejects.toThrow()

      await expect(
        insertTrackImportChanges(
          handle.db,
          {
            tracks: [],
            groups: [
              {
                id: 'missing:group',
                trackId: 'missing',
                title: 'Group',
                position: 1,
              },
            ],
            memberships: [],
          },
          now,
        ),
      ).rejects.toThrow()
    } finally {
      handle.rawDb.close()
    }
  })

  it('inserts curriculum batches of at most one hundred rows', async () => {
    const handle = await createTestDb({ seed: false })

    try {
      const insertSpy = vi.spyOn(handle.db, 'insert')
      const tracksToInsert = Array.from({ length: 201 }, (_, index) => ({
        id: `track-${index}`,
        slug: `track-${index}`,
        title: `Track ${index}`,
        description: null,
        dueAt: null,
      }))

      await insertTrackImportChanges(
        handle.db,
        { tracks: tracksToInsert, groups: [], memberships: [] },
        now,
      )

      expect(insertSpy).toHaveBeenCalledTimes(3)
      expect(
        await handle.db
          .select({ id: tracks.id })
          .from(tracks)
          .orderBy(asc(tracks.id)),
      ).toHaveLength(201)
    } finally {
      handle.rawDb.close()
    }
  })
})

function emptyChanges(): TrackImportChanges {
  return { tracks: [], groups: [], memberships: [] }
}
