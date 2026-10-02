import { asc } from 'drizzle-orm'

import type { Db } from '@/platform/db'
import { trackGroupProblems, trackGroups, tracks } from '@/platform/db/schema'

import type {
  TrackImportChanges,
  TrackImportState,
} from '../domain/track-import'

const insertBatchSize = 100

export async function readTrackImportState(db: Db): Promise<TrackImportState> {
  const [trackRows, groupRows, membershipRows] = await Promise.all([
    db
      .select({
        id: tracks.id,
        slug: tracks.slug,
        title: tracks.title,
        description: tracks.description,
        dueAt: tracks.dueAt,
        allowExternalProgress: tracks.allowExternalProgress,
      })
      .from(tracks)
      .orderBy(asc(tracks.id)),
    db
      .select({
        id: trackGroups.id,
        trackId: trackGroups.trackId,
        title: trackGroups.title,
        position: trackGroups.position,
      })
      .from(trackGroups)
      .orderBy(asc(trackGroups.trackId), asc(trackGroups.id)),
    db
      .select({
        trackId: trackGroupProblems.trackId,
        trackGroupId: trackGroupProblems.trackGroupId,
        problemSlug: trackGroupProblems.problemSlug,
        position: trackGroupProblems.position,
      })
      .from(trackGroupProblems)
      .orderBy(
        asc(trackGroupProblems.trackId),
        asc(trackGroupProblems.trackGroupId),
        asc(trackGroupProblems.problemSlug),
      ),
  ])

  return {
    tracks: trackRows,
    groups: groupRows,
    memberships: membershipRows,
  }
}

export async function insertTrackImportChanges(
  db: Db,
  changes: TrackImportChanges,
  now: Date,
): Promise<void> {
  const timestamp = now.getTime()

  for (const batch of batches(changes.tracks)) {
    await db.insert(tracks).values(
      batch.map((row) => ({
        ...row,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    )
  }

  for (const batch of batches(changes.groups)) {
    await db.insert(trackGroups).values(
      batch.map((row) => ({
        ...row,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    )
  }

  for (const batch of batches(changes.memberships)) {
    await db.insert(trackGroupProblems).values(batch)
  }
}

function batches<T>(rows: readonly T[]): T[][] {
  const result: T[][] = []

  for (let offset = 0; offset < rows.length; offset += insertBatchSize) {
    result.push(rows.slice(offset, offset + insertBatchSize))
  }

  return result
}
