import { and, asc, eq, inArray } from 'drizzle-orm'

import { normalizeProblemDifficulty, type Problem } from '@/features/problems'
import {
  normalizeLeetCodeSlug,
  parseLeetCodeProblemInput,
} from '@/lib/leetcode'
import type { Db } from '@/platform/db'
import {
  problems,
  problemPractice,
  trackGroupProblems,
  trackGroups,
  trackProblemProgress,
  tracks,
  trackSession,
  type TrackGroupRow,
  type TrackRow,
} from '@/platform/db/schema'

import type {
  ActiveTrack,
  CreateTrackInput,
  Track,
  TrackCatalogItem,
  TrackCompletedRating,
  TrackCompletionInput,
  TrackGroup,
  TrackGroupInput,
  TrackProblemCompletion,
  TrackProblemMembership,
  TrackProgress,
  TrackReviewProgressInput,
  TrackSessionState,
  UpdateTrackInput,
} from '../domain/track'
import {
  readSuccessfulReviews,
  resolveTrackCompletion,
} from './track-progress-read-model'

export function createTracksRepository(db: Db) {
  return new TracksRepository(db)
}

export class TracksRepository {
  constructor(private readonly db: Db) {}

  async getActiveTrack(): Promise<ActiveTrack | null> {
    const session = await this.getSession()

    if (!session.activeTrack) {
      return null
    }

    const preferredGroup =
      session.activeGroup ??
      (await readFirstGroup(this.db, session.activeTrack.id))
    const next = await this.getNextProblemInTrack(
      session.activeTrack.id,
      preferredGroup,
    )
    const progressByTrack = await this.getProgressByTrack([
      session.activeTrack.id,
    ])

    return {
      track: session.activeTrack,
      activeGroup: next.group,
      progress: progressByTrack.get(session.activeTrack.id) ?? emptyProgress(),
      nextProblem: next.problem,
    }
  }

  async getTrackCatalog(): Promise<TrackCatalogItem[]> {
    const trackRows = await this.db
      .select()
      .from(tracks)
      .orderBy(asc(tracks.createdAt), asc(tracks.title))
    const session = await this.getSession()
    const progressByTrack = await this.getProgressByTrack(
      trackRows.map((track) => track.id),
    )

    return trackRows.map((trackRow) => ({
      track: mapTrack(trackRow),
      progress: progressByTrack.get(trackRow.id) ?? emptyProgress(),
      isActive: session.activeTrack?.id === trackRow.id,
      activeGroupId:
        session.activeTrack?.id === trackRow.id
          ? (session.activeGroup?.id ?? null)
          : null,
    }))
  }

  async getTrackById(trackId: string): Promise<Track | null> {
    return readTrackById(this.db, trackId)
  }

  async getSession(): Promise<TrackSessionState> {
    return readSessionState(this.db)
  }

  async getGroups(trackId: string): Promise<TrackGroup[]> {
    return readGroups(this.db, trackId)
  }

  async getMemberships(trackId: string): Promise<TrackProblemMembership[]> {
    return readMemberships(this.db, [trackId.trim()])
  }

  async getExternalProgressProblemSlugs(
    problemSlugs: readonly string[],
  ): Promise<string[]> {
    return [...(await readSuccessfulReviews(this.db, problemSlugs)).keys()]
  }

  async getProgressByTrack(
    trackIds: readonly string[],
  ): Promise<Map<string, TrackProgress>> {
    const requestedTrackIds = uniqueNonEmptyStrings(trackIds)
    const progressByTrack = new Map<string, TrackProgressAccumulator>()

    for (const trackId of requestedTrackIds) {
      progressByTrack.set(trackId, {
        completedCount: 0,
        totalCount: 0,
      })
    }

    if (requestedTrackIds.length === 0) {
      return new Map()
    }

    const rows = await readMemberships(this.db, requestedTrackIds)

    for (const row of rows) {
      const progress = progressByTrack.get(row.trackId)

      if (!progress) {
        continue
      }

      progress.totalCount += 1

      if (row.completion.status === 'completed') {
        progress.completedCount += 1
      }
    }

    return new Map(
      requestedTrackIds.map((trackId) => [
        trackId,
        toTrackProgress(progressByTrack.get(trackId) ?? emptyAccumulator()),
      ]),
    )
  }

  async setActiveTrack(
    trackId: string,
    now = new Date(),
  ): Promise<TrackSessionState> {
    return this.db.transaction(async (transactionDb) => {
      const track = await readTrackById(transactionDb, trackId)

      if (!track) {
        throw new Error(`Cannot activate missing track "${trackId}".`)
      }

      const firstGroup = await readFirstGroup(transactionDb, track.id)
      const timestamp = now.getTime()

      await transactionDb
        .insert(trackSession)
        .values({
          id: activeTrackSessionId,
          activeTrackId: track.id,
          activeGroupId: firstGroup?.id ?? null,
          startedAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: trackSession.id,
          set: {
            activeTrackId: track.id,
            activeGroupId: firstGroup?.id ?? null,
            startedAt: timestamp,
            updatedAt: timestamp,
          },
        })

      return {
        activeTrack: track,
        activeGroup: firstGroup,
        startedAt: new Date(timestamp),
        updatedAt: new Date(timestamp),
      }
    })
  }

  async clearActiveTrack(now = new Date()): Promise<TrackSessionState> {
    return this.db.transaction(async (transactionDb) => {
      const timestamp = now.getTime()

      await transactionDb
        .insert(trackSession)
        .values({
          id: activeTrackSessionId,
          activeTrackId: null,
          activeGroupId: null,
          startedAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: trackSession.id,
          set: {
            activeTrackId: null,
            activeGroupId: null,
            updatedAt: timestamp,
          },
        })

      return {
        activeTrack: null,
        activeGroup: null,
        startedAt: new Date(timestamp),
        updatedAt: new Date(timestamp),
      }
    })
  }

  async setActiveGroup(
    groupId: string,
    now = new Date(),
  ): Promise<TrackSessionState> {
    return this.db.transaction(async (transactionDb) => {
      const sessionRows = await transactionDb
        .select()
        .from(trackSession)
        .where(eq(trackSession.id, activeTrackSessionId))
        .limit(1)
      const session = sessionRows[0]

      if (!session?.activeTrackId) {
        throw new Error('Cannot set an active group without an active track.')
      }

      const group = await readGroupByIdForTrack(
        transactionDb,
        groupId,
        session.activeTrackId,
      )

      if (!group) {
        throw new Error(
          'Cannot set an active group outside the current active track.',
        )
      }

      await transactionDb
        .update(trackSession)
        .set({
          activeGroupId: group.id,
          updatedAt: now.getTime(),
        })
        .where(eq(trackSession.id, activeTrackSessionId))

      return readSessionState(transactionDb)
    })
  }

  async createTrack(input: CreateTrackInput, now = new Date()): Promise<Track> {
    return this.db.transaction(async (transactionDb) => {
      const timestamp = now.getTime()
      const normalizedTrack = normalizeTrackMutationInput(input)
      const slug = normalizeLeetCodeSlug(normalizedTrack.title)

      if (!slug) {
        throw new Error('Cannot create a track without a slug.')
      }

      const trackId = createTrackId(slug)
      const existingTrack = await readTrackById(transactionDb, trackId)

      if (existingTrack) {
        throw new Error(`Track "${trackId}" already exists.`)
      }

      await transactionDb.insert(tracks).values({
        id: trackId,
        slug,
        title: normalizedTrack.title,
        description: normalizedTrack.description,
        dueAt: normalizedTrack.dueAt,
        allowExternalProgress: normalizedTrack.allowExternalProgress,
        createdAt: timestamp,
        updatedAt: timestamp,
      })

      const normalizedGroups = normalizeGroupInputs({
        trackId,
        groups: normalizedTrack.groups,
        existingGroupIds: new Set(),
        useDefaultMainGroup: true,
      })

      await writeNewGroups(transactionDb, trackId, normalizedGroups, timestamp)

      const createdTrack = await readTrackById(transactionDb, trackId)

      if (!createdTrack) {
        throw new Error(`Failed to read created track "${trackId}".`)
      }

      return createdTrack
    })
  }

  async updateTrack(input: UpdateTrackInput, now = new Date()): Promise<Track> {
    return this.db.transaction(async (transactionDb) => {
      const timestamp = now.getTime()
      const existingTrack = await readTrackById(transactionDb, input.trackId)

      if (!existingTrack) {
        throw new Error(`Cannot update missing track "${input.trackId}".`)
      }

      const normalizedTrack = normalizeTrackMutationInput(input)
      const existingGroups = await readGroups(transactionDb, existingTrack.id)
      const existingGroupIds = new Set(existingGroups.map((group) => group.id))
      const normalizedGroups = normalizeGroupInputs({
        trackId: existingTrack.id,
        groups: normalizedTrack.groups,
        existingGroupIds,
        useDefaultMainGroup: false,
      })
      const retainedGroupIds = new Set(
        normalizedGroups
          .filter((group) => existingGroupIds.has(group.id))
          .map((group) => group.id),
      )
      const omittedGroups = existingGroups.filter(
        (group) => !retainedGroupIds.has(group.id),
      )

      await assertOmittedGroupMembershipsAreMoved(
        transactionDb,
        existingTrack.id,
        normalizedGroups,
        omittedGroups,
      )

      await transactionDb
        .update(tracks)
        .set({
          title: normalizedTrack.title,
          description: normalizedTrack.description,
          dueAt: normalizedTrack.dueAt,
          allowExternalProgress: normalizedTrack.allowExternalProgress,
          updatedAt: timestamp,
        })
        .where(eq(tracks.id, existingTrack.id))

      for (const group of normalizedGroups) {
        if (existingGroupIds.has(group.id)) {
          await transactionDb
            .update(trackGroups)
            .set({
              title: group.title,
              position: group.position,
              updatedAt: timestamp,
            })
            .where(eq(trackGroups.id, group.id))
        } else {
          await transactionDb.insert(trackGroups).values({
            id: group.id,
            trackId: existingTrack.id,
            title: group.title,
            position: group.position,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
        }
      }

      await moveExistingMembershipsToDesiredGroups(
        transactionDb,
        existingTrack.id,
        normalizedGroups,
      )

      if (omittedGroups.length > 0) {
        await transactionDb.delete(trackGroups).where(
          inArray(
            trackGroups.id,
            omittedGroups.map((group) => group.id),
          ),
        )
      }

      for (const group of normalizedGroups) {
        await syncGroupMemberships(transactionDb, group)
      }

      const updatedTrack = await readTrackById(transactionDb, existingTrack.id)

      if (!updatedTrack) {
        throw new Error(`Failed to read updated track "${existingTrack.id}".`)
      }

      return updatedTrack
    })
  }

  async removeProblem(
    trackId: string,
    problemSlug: string,
    now = new Date(),
  ): Promise<void> {
    await this.db.transaction(async (transactionDb) => {
      const track = await readTrackById(transactionDb, trackId)
      if (!track) {
        throw new Error(`Cannot update missing track "${trackId}".`)
      }
      const membership = (
        await readMemberships(transactionDb, [track.id])
      ).find((row) => row.problemSlug === problemSlug)
      if (!membership) return

      await transactionDb
        .delete(trackGroupProblems)
        .where(
          and(
            eq(trackGroupProblems.trackId, track.id),
            eq(trackGroupProblems.problemSlug, problemSlug),
          ),
        )
      const remaining = await transactionDb
        .select()
        .from(trackGroupProblems)
        .where(eq(trackGroupProblems.trackGroupId, membership.groupId))
        .orderBy(asc(trackGroupProblems.position))
      for (const [index, row] of remaining.entries()) {
        await transactionDb
          .update(trackGroupProblems)
          .set({ position: index + 1 })
          .where(
            and(
              eq(trackGroupProblems.trackGroupId, membership.groupId),
              eq(trackGroupProblems.problemSlug, row.problemSlug),
            ),
          )
      }
      await transactionDb
        .update(tracks)
        .set({ updatedAt: now.getTime() })
        .where(eq(tracks.id, track.id))
    })
  }

  async deleteTrack(trackId: string, now = new Date()): Promise<void> {
    await this.db.transaction(async (transactionDb) => {
      const sessionRows = await transactionDb
        .select()
        .from(trackSession)
        .where(eq(trackSession.id, activeTrackSessionId))
        .limit(1)
      const session = sessionRows[0]

      if (session?.activeTrackId === trackId) {
        await transactionDb
          .update(trackSession)
          .set({
            activeTrackId: null,
            activeGroupId: null,
            updatedAt: now.getTime(),
          })
          .where(eq(trackSession.id, activeTrackSessionId))
      }

      await transactionDb.delete(tracks).where(eq(tracks.id, trackId))
    })
  }

  async resetTrackProgress(trackId: string, now = new Date()): Promise<void> {
    await this.db.transaction(async (transactionDb) => {
      await transactionDb
        .delete(trackProblemProgress)
        .where(eq(trackProblemProgress.trackId, trackId))
      await transactionDb
        .update(tracks)
        .set({ allowExternalProgress: false, updatedAt: now.getTime() })
        .where(eq(tracks.id, trackId))
    })
  }

  async resetProblemProgress(problemSlug: string): Promise<void> {
    const normalizedProblemSlug = normalizeProblemInput(problemSlug)

    await this.db.transaction(async (transactionDb) => {
      await transactionDb
        .delete(trackProblemProgress)
        .where(eq(trackProblemProgress.problemSlug, normalizedProblemSlug))
    })
  }

  async recordActiveTrackProblemReview(
    input: TrackReviewProgressInput,
  ): Promise<boolean> {
    return this.recordActiveTrackProblemProgress({
      problemSlug: input.problemSlug,
      rating: input.rating,
      reviewedAt: input.reviewedAt,
      reviewAttemptId: input.reviewAttemptId,
    })
  }

  async recordActiveTrackProblemCompletion(
    input: TrackCompletionInput,
  ): Promise<boolean> {
    return this.recordActiveTrackProblemProgress({
      problemSlug: input.problemSlug,
      rating: input.rating,
      reviewedAt: input.completedAt,
      reviewAttemptId: null,
    })
  }

  async reconcileActiveTrackProblemReviewOverride(
    input: TrackReviewProgressInput,
  ): Promise<boolean> {
    const problemSlug = normalizeProblemInput(input.problemSlug)
    const completion = createCompletionWrite(input)

    const updatedRows = await this.db
      .update(trackProblemProgress)
      .set({
        completedAt: completion.completedAt,
        completedRating: completion.completedRating,
        updatedAt: completion.updatedAt,
      })
      .where(
        and(
          eq(trackProblemProgress.problemSlug, problemSlug),
          eq(trackProblemProgress.reviewAttemptId, input.reviewAttemptId),
        ),
      )
      .returning({
        trackId: trackProblemProgress.trackId,
      })

    return updatedRows.length > 0
  }

  private async recordActiveTrackProblemProgress(
    input: TrackProgressWriteInput,
  ): Promise<boolean> {
    const problemSlug = normalizeProblemInput(input.problemSlug)
    const completion = createCompletionWrite(input)

    return this.db.transaction(async (transactionDb) => {
      const sessionRows = await transactionDb
        .select()
        .from(trackSession)
        .where(eq(trackSession.id, activeTrackSessionId))
        .limit(1)
      const session = sessionRows[0]

      if (!session?.activeTrackId) {
        return false
      }

      const membershipRows = await transactionDb
        .select({
          trackId: trackGroupProblems.trackId,
          problemSlug: trackGroupProblems.problemSlug,
        })
        .from(trackGroupProblems)
        .where(
          and(
            eq(trackGroupProblems.trackId, session.activeTrackId),
            eq(trackGroupProblems.problemSlug, problemSlug),
          ),
        )
        .limit(1)
      const membership = membershipRows[0]

      if (!membership) {
        return false
      }

      if (completion.completedAt === null) {
        const existingProgressRows = await transactionDb
          .select({
            completedAt: trackProblemProgress.completedAt,
          })
          .from(trackProblemProgress)
          .where(
            and(
              eq(trackProblemProgress.trackId, membership.trackId),
              eq(trackProblemProgress.problemSlug, membership.problemSlug),
            ),
          )
          .limit(1)
        const existingProgress = existingProgressRows[0]

        if (existingProgress && existingProgress.completedAt !== null) {
          return true
        }

        if (existingProgress) {
          await transactionDb
            .update(trackProblemProgress)
            .set({
              reviewAttemptId: input.reviewAttemptId,
              completedAt: null,
              completedRating: null,
              updatedAt: completion.updatedAt,
            })
            .where(
              and(
                eq(trackProblemProgress.trackId, membership.trackId),
                eq(trackProblemProgress.problemSlug, membership.problemSlug),
              ),
            )

          return true
        }
      }

      await transactionDb
        .insert(trackProblemProgress)
        .values({
          trackId: membership.trackId,
          problemSlug: membership.problemSlug,
          reviewAttemptId: input.reviewAttemptId,
          completedAt: completion.completedAt,
          completedRating: completion.completedRating,
          createdAt: completion.updatedAt,
          updatedAt: completion.updatedAt,
        })
        .onConflictDoUpdate({
          target: [
            trackProblemProgress.trackId,
            trackProblemProgress.problemSlug,
          ],
          set: {
            reviewAttemptId: input.reviewAttemptId,
            completedAt: completion.completedAt,
            completedRating: completion.completedRating,
            updatedAt: completion.updatedAt,
          },
        })

      return true
    })
  }

  private async getNextProblemInTrack(
    trackId: string,
    preferredGroup: TrackGroup | null,
  ): Promise<{
    group: TrackGroup | null
    problem: Problem | null
  }> {
    const groups = await readGroups(this.db, trackId)

    if (groups.length === 0) {
      return { group: null, problem: null }
    }

    const memberships = await this.getMemberships(trackId)
    const incomplete = memberships.filter(
      (membership) => membership.completion.status === 'incomplete',
    )
    if (incomplete.length > 0) {
      const candidates = await this.db
        .select({ problem: problems, isSuspended: problemPractice.isSuspended })
        .from(problems)
        .leftJoin(
          problemPractice,
          eq(problemPractice.problemSlug, problems.slug),
        )
        .where(
          inArray(
            problems.slug,
            incomplete.map((membership) => membership.problemSlug),
          ),
        )
      const bySlug = new Map(candidates.map((row) => [row.problem.slug, row]))
      for (const membership of incomplete) {
        const candidate = bySlug.get(membership.problemSlug)
        if (candidate && !candidate.isSuspended) {
          return {
            group:
              groups.find((group) => group.id === membership.groupId) ?? null,
            problem: mapProblem(candidate.problem),
          }
        }
      }
    }

    return {
      group: preferredGroup ?? groups[0] ?? null,
      problem: null,
    }
  }
}

async function readTrackById(
  db: TracksReadDb,
  trackId: string,
): Promise<Track | null> {
  const rows = await db
    .select()
    .from(tracks)
    .where(eq(tracks.id, trackId.trim()))
    .limit(1)

  return rows[0] ? mapTrack(rows[0]) : null
}

async function readSessionState(db: TracksReadDb): Promise<TrackSessionState> {
  const sessionRows = await db
    .select()
    .from(trackSession)
    .where(eq(trackSession.id, activeTrackSessionId))
    .limit(1)
  const session = sessionRows[0]

  if (!session) {
    return {
      activeTrack: null,
      activeGroup: null,
      startedAt: new Date(0),
      updatedAt: new Date(0),
    }
  }

  const activeTrack = session.activeTrackId
    ? await readTrackById(db, session.activeTrackId)
    : null
  const activeGroup =
    activeTrack && session.activeGroupId
      ? await readGroupByIdForTrack(db, session.activeGroupId, activeTrack.id)
      : null

  return {
    activeTrack,
    activeGroup,
    startedAt: new Date(session.startedAt),
    updatedAt: new Date(session.updatedAt),
  }
}

async function readGroupByIdForTrack(
  db: TracksReadDb,
  groupId: string,
  trackId: string,
): Promise<TrackGroup | null> {
  const rows = await db
    .select()
    .from(trackGroups)
    .where(
      and(eq(trackGroups.id, groupId.trim()), eq(trackGroups.trackId, trackId)),
    )
    .limit(1)

  return rows[0] ? mapTrackGroup(rows[0]) : null
}

async function readFirstGroup(
  db: TracksReadDb,
  trackId: string,
): Promise<TrackGroup | null> {
  const rows = await db
    .select()
    .from(trackGroups)
    .where(eq(trackGroups.trackId, trackId))
    .orderBy(asc(trackGroups.position))
    .limit(1)

  return rows[0] ? mapTrackGroup(rows[0]) : null
}

async function readGroups(
  db: TracksReadDb,
  trackId: string,
): Promise<TrackGroup[]> {
  const rows = await db
    .select()
    .from(trackGroups)
    .where(eq(trackGroups.trackId, trackId.trim()))
    .orderBy(asc(trackGroups.position))

  return rows.map(mapTrackGroup)
}

async function readMemberships(
  db: TracksReadDb,
  trackIds: readonly string[],
): Promise<TrackProblemMembership[]> {
  if (trackIds.length === 0) return []
  const rows = await db
    .select({
      group: trackGroups,
      problemSlug: trackGroupProblems.problemSlug,
      problemPosition: trackGroupProblems.position,
      reviewAttemptId: trackProblemProgress.reviewAttemptId,
      completedAt: trackProblemProgress.completedAt,
      completedRating: trackProblemProgress.completedRating,
      allowExternalProgress: tracks.allowExternalProgress,
    })
    .from(trackGroupProblems)
    .innerJoin(trackGroups, eq(trackGroups.id, trackGroupProblems.trackGroupId))
    .innerJoin(tracks, eq(tracks.id, trackGroups.trackId))
    .leftJoin(
      trackProblemProgress,
      and(
        eq(trackProblemProgress.trackId, trackGroupProblems.trackId),
        eq(trackProblemProgress.problemSlug, trackGroupProblems.problemSlug),
      ),
    )
    .where(inArray(trackGroups.trackId, [...trackIds]))
    .orderBy(
      asc(trackGroups.trackId),
      asc(trackGroups.position),
      asc(trackGroupProblems.position),
    )

  const externalReviews = await readSuccessfulReviews(
    db,
    rows
      .filter((row) => row.allowExternalProgress)
      .map((row) => row.problemSlug),
  )

  return rows.map((row) => {
    const completedRating = parseTrackCompletedRating(row.completedRating)
    const completedAt =
      row.completedAt === null ? null : new Date(row.completedAt)

    return {
      trackId: row.group.trackId,
      groupId: row.group.id,
      groupTitle: row.group.title,
      groupPosition: row.group.position,
      problemSlug: row.problemSlug,
      problemPosition: row.problemPosition,
      completion: resolveTrackCompletion(
        mapTrackProblemCompletion({
          completedAt,
          completedRating,
          reviewAttemptId: row.reviewAttemptId,
        }),
        row.allowExternalProgress,
        externalReviews.get(row.problemSlug),
      ),
    }
  })
}

async function writeNewGroups(
  db: TracksWriteDb,
  trackId: string,
  groups: readonly NormalizedTrackGroupInput[],
  timestamp: number,
) {
  if (groups.length === 0) {
    return
  }

  await db.insert(trackGroups).values(
    groups.map((group) => ({
      id: group.id,
      trackId,
      title: group.title,
      position: group.position,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  )

  for (const group of groups) {
    await syncGroupMemberships(db, group)
  }
}

async function syncGroupMemberships(
  db: TracksWriteDb,
  group: NormalizedTrackGroupInput,
) {
  const existingRows = await db
    .select({
      problemSlug: trackGroupProblems.problemSlug,
    })
    .from(trackGroupProblems)
    .where(eq(trackGroupProblems.trackGroupId, group.id))
  const existingSlugs = new Set(existingRows.map((row) => row.problemSlug))
  const desiredSlugs = new Set(
    group.problemSlugs.map((membership) => membership.problemSlug),
  )

  for (const existingSlug of existingSlugs) {
    if (desiredSlugs.has(existingSlug)) {
      continue
    }

    await db
      .delete(trackGroupProblems)
      .where(
        and(
          eq(trackGroupProblems.trackGroupId, group.id),
          eq(trackGroupProblems.problemSlug, existingSlug),
        ),
      )
  }

  for (const membership of group.problemSlugs) {
    if (existingSlugs.has(membership.problemSlug)) {
      await db
        .update(trackGroupProblems)
        .set({
          position: membership.position,
        })
        .where(
          and(
            eq(trackGroupProblems.trackGroupId, group.id),
            eq(trackGroupProblems.problemSlug, membership.problemSlug),
          ),
        )
    } else {
      await db.insert(trackGroupProblems).values({
        trackGroupId: group.id,
        trackId: group.trackId,
        problemSlug: membership.problemSlug,
        position: membership.position,
      })
    }
  }
}

async function assertOmittedGroupMembershipsAreMoved(
  db: TracksReadDb,
  trackId: string,
  desiredGroups: readonly NormalizedTrackGroupInput[],
  omittedGroups: readonly TrackGroup[],
): Promise<void> {
  const omittedGroupIds = new Set(omittedGroups.map((group) => group.id))

  if (omittedGroupIds.size === 0) {
    return
  }

  const desiredProblemSlugs = new Set(
    desiredGroups.flatMap((group) =>
      group.problemSlugs.map((problem) => problem.problemSlug),
    ),
  )
  const omittedGroupTitles = new Map(
    omittedGroups.map((group) => [group.id, group.title]),
  )
  const existingMemberships = await db
    .select({
      groupId: trackGroups.id,
      problemSlug: trackGroupProblems.problemSlug,
    })
    .from(trackGroupProblems)
    .innerJoin(trackGroups, eq(trackGroups.id, trackGroupProblems.trackGroupId))
    .where(
      and(
        eq(trackGroups.trackId, trackId),
        inArray(trackGroups.id, [...omittedGroupIds]),
      ),
    )

  for (const membership of existingMemberships) {
    if (!desiredProblemSlugs.has(membership.problemSlug)) {
      throw new Error(
        `Cannot remove non-empty group "${omittedGroupTitles.get(
          membership.groupId,
        )}" without first moving its memberships.`,
      )
    }
  }
}

async function moveExistingMembershipsToDesiredGroups(
  db: TracksWriteDb,
  trackId: string,
  desiredGroups: readonly NormalizedTrackGroupInput[],
): Promise<void> {
  const desiredMembershipByProblem = new Map<string, DesiredTrackMembership>()

  for (const membership of flattenDesiredMemberships(desiredGroups)) {
    desiredMembershipByProblem.set(membership.problemSlug, membership)
  }

  if (desiredMembershipByProblem.size === 0) {
    return
  }

  const existingMemberships = await db
    .select({
      groupId: trackGroupProblems.trackGroupId,
      problemSlug: trackGroupProblems.problemSlug,
    })
    .from(trackGroupProblems)
    .where(eq(trackGroupProblems.trackId, trackId))

  for (const existingMembership of existingMemberships) {
    const desiredMembership = desiredMembershipByProblem.get(
      existingMembership.problemSlug,
    )

    if (
      !desiredMembership ||
      desiredMembership.groupId === existingMembership.groupId
    ) {
      continue
    }

    await db
      .update(trackGroupProblems)
      .set({
        trackGroupId: desiredMembership.groupId,
        position: desiredMembership.problemPosition,
      })
      .where(
        and(
          eq(trackGroupProblems.trackGroupId, existingMembership.groupId),
          eq(trackGroupProblems.problemSlug, existingMembership.problemSlug),
        ),
      )
  }
}

function flattenDesiredMemberships(
  groups: readonly NormalizedTrackGroupInput[],
): DesiredTrackMembership[] {
  return groups.flatMap((group) =>
    group.problemSlugs.map((problem) => ({
      groupId: group.id,
      problemSlug: problem.problemSlug,
      problemPosition: problem.position,
    })),
  )
}

function normalizeTrackMutationInput(
  input: CreateTrackInput | UpdateTrackInput,
): NormalizedTrackMutationInput {
  return {
    title: normalizeRequiredLabel(input.title, 'track title'),
    description: normalizeDescription(input.description),
    dueAt: normalizeDueAt(input.dueAt),
    allowExternalProgress: input.allowExternalProgress ?? false,
    groups: input.groups,
  }
}

function normalizeGroupInputs(options: {
  trackId: string
  groups: readonly TrackGroupInput[]
  existingGroupIds: Set<string>
  useDefaultMainGroup: boolean
}): NormalizedTrackGroupInput[] {
  const sourceGroups =
    options.groups.length > 0 || !options.useDefaultMainGroup
      ? options.groups
      : [{ title: 'Main', problemSlugs: [] }]
  const unavailableGroupIds = new Set(options.existingGroupIds)
  const usedProblemSlugs = new Set<string>()
  const usedGroupIds = new Set<string>()

  return sourceGroups.map((group, groupIndex) => {
    const title = normalizeRequiredLabel(group.title, 'track group title')
    const explicitGroupId = group.id?.trim()
    const id = explicitGroupId
      ? explicitGroupId
      : createTrackGroupId(options.trackId, title, unavailableGroupIds)

    if (!id) {
      throw new Error('Cannot create a track group without an id.')
    }

    if (usedGroupIds.has(id)) {
      throw new Error(`Duplicate track group id "${id}".`)
    }

    usedGroupIds.add(id)

    return {
      id,
      trackId: options.trackId,
      title,
      position: groupIndex + 1,
      problemSlugs: normalizeProblemInputs(
        group.problemSlugs,
        usedProblemSlugs,
      ),
    }
  })
}

function normalizeProblemInputs(
  problemInputs: readonly string[],
  usedProblemSlugs: Set<string>,
): NormalizedTrackProblemInput[] {
  const problemSlugs: NormalizedTrackProblemInput[] = []

  for (const problemInput of problemInputs) {
    const problemSlug = normalizeProblemInput(problemInput)

    if (usedProblemSlugs.has(problemSlug)) {
      throw new Error(
        `Problem "${problemSlug}" can only appear once in a track.`,
      )
    }

    usedProblemSlugs.add(problemSlug)
    problemSlugs.push({
      problemSlug,
      position: problemSlugs.length + 1,
    })
  }

  return problemSlugs
}

function normalizeProblemInput(problemInput: string) {
  const parsedInput = parseLeetCodeProblemInput(problemInput)

  if (!parsedInput) {
    throw new Error('Cannot use a blank problem slug in a track group.')
  }

  return parsedInput.slug
}

function createCompletionWrite(input: TrackProgressWriteInput) {
  const updatedAt = input.reviewedAt.getTime()
  const completedRating = parseTrackCompletedRating(input.rating)

  if (!completedRating) {
    return {
      completedAt: null,
      completedRating: null,
      updatedAt,
    }
  }

  return {
    completedAt: updatedAt,
    completedRating,
    updatedAt,
  }
}

function mapTrackProblemCompletion(input: {
  completedAt: Date | null
  completedRating: TrackCompletedRating | null
  reviewAttemptId: string | null
}): TrackProblemCompletion {
  if (input.completedAt && input.completedRating) {
    return {
      status: 'completed',
      completedAt: input.completedAt,
      completedRating: input.completedRating,
      reviewAttemptId: input.reviewAttemptId,
    }
  }

  return {
    status: 'incomplete',
    reviewAttemptId: input.reviewAttemptId,
  }
}

function normalizeRequiredLabel(label: string, fieldName: string) {
  const normalizedLabel = label.trim().replace(/\s+/g, ' ')

  if (!normalizedLabel) {
    throw new Error(`Cannot save a track without a ${fieldName}.`)
  }

  return normalizedLabel
}

function normalizeDescription(description: string | null) {
  const normalizedDescription = description?.trim()

  return normalizedDescription ? normalizedDescription : null
}

function normalizeDueAt(dueAt: Date | string | null) {
  if (dueAt === null) {
    return null
  }

  const date = dueAt instanceof Date ? dueAt : new Date(dueAt)
  const timestamp = date.getTime()

  if (Number.isNaN(timestamp)) {
    throw new Error('Cannot save a track with an invalid due date.')
  }

  return timestamp
}

function parseTrackCompletedRating(
  rating: string | null,
): TrackCompletedRating | null {
  if (rating === 'hard' || rating === 'good' || rating === 'easy') {
    return rating
  }

  return null
}

function createTrackId(slug: string) {
  return slug
}

function createTrackGroupId(
  trackId: string,
  title: string,
  existingIds: Set<string>,
) {
  const base = `${trackId}:${normalizeLeetCodeSlug(title) || 'group'}`
  let id = base
  let suffix = 2

  while (existingIds.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }

  existingIds.add(id)
  return id
}

function uniqueNonEmptyStrings(values: readonly string[]) {
  const seen = new Set<string>()
  const uniqueValues: string[] = []

  for (const value of values) {
    const normalizedValue = value.trim()

    if (!normalizedValue || seen.has(normalizedValue)) {
      continue
    }

    seen.add(normalizedValue)
    uniqueValues.push(normalizedValue)
  }

  return uniqueValues
}

function toTrackProgress(accumulator: TrackProgressAccumulator): TrackProgress {
  if (accumulator.totalCount === 0) {
    return emptyProgress()
  }

  return {
    completedCount: accumulator.completedCount,
    totalCount: accumulator.totalCount,
    percent: Math.round(
      (accumulator.completedCount / accumulator.totalCount) * 100,
    ),
  }
}

function emptyAccumulator(): TrackProgressAccumulator {
  return {
    completedCount: 0,
    totalCount: 0,
  }
}

function emptyProgress(): TrackProgress {
  return {
    completedCount: 0,
    totalCount: 0,
    percent: 0,
  }
}

function mapTrack(row: TrackRow): Track {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    dueAt: row.dueAt === null ? null : new Date(row.dueAt),
    allowExternalProgress: row.allowExternalProgress,
  }
}

function mapTrackGroup(row: TrackGroupRow): TrackGroup {
  return {
    id: row.id,
    trackId: row.trackId,
    title: row.title,
    position: row.position,
  }
}

function mapProblem(row: typeof problems.$inferSelect): Problem {
  return {
    slug: row.slug,
    title: row.title,
    difficulty: normalizeProblemDifficulty(row.difficulty),
    isPremium: row.isPremium,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }
}

const activeTrackSessionId = 'active'

type TracksReadDb = Pick<Db, 'select'>
type TracksWriteDb = Pick<Db, 'delete' | 'insert' | 'select' | 'update'>

interface NormalizedTrackMutationInput {
  allowExternalProgress: boolean
  title: string
  description: string | null
  dueAt: number | null
  groups: readonly TrackGroupInput[]
}

interface NormalizedTrackGroupInput {
  id: string
  trackId: string
  title: string
  position: number
  problemSlugs: NormalizedTrackProblemInput[]
}

interface NormalizedTrackProblemInput {
  problemSlug: string
  position: number
}

interface DesiredTrackMembership {
  groupId: string
  problemSlug: string
  problemPosition: number
}

interface TrackProgressWriteInput {
  problemSlug: string
  rating: 'again' | 'hard' | 'good' | 'easy'
  reviewedAt: Date
  reviewAttemptId: string | null
}

interface TrackProgressAccumulator {
  completedCount: number
  totalCount: number
}
