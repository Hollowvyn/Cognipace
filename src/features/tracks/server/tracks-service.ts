import type { Db } from '@/platform/db'

import type { Problem } from '@/features/problems'
import type { SerializedProblem } from '@/features/problems/api/problems-contracts'
import {
  getProblemLibrary,
  getProblemLibraryRowsBySlug,
} from '@/features/problems/server/problems-service'
import { getSettings } from '@/features/settings/server/settings-service'

import { createTracksRepository } from '../data/tracks-repository'
import type { TrackProgress } from '../domain'
import type {
  Track,
  TrackCompletionInput,
  TrackGroup,
  TrackProblemMembership,
  TrackReviewProgressInput,
  TrackSessionState,
} from '../domain/track'
import {
  serializeTrackForEdit,
  serializeTrackWorkspace,
  type TrackProblemRowSerializationInput,
} from '../api/tracks-serializers'
import type {
  TracksCreateTrackRequest,
  TracksClearActiveTrackRequest,
  TracksDeleteTrackRequest,
  TracksGetTrackForEditRequest,
  TracksGetWorkspaceRequest,
  TracksRemoveProblemRequest,
  TracksResetTrackProgressRequest,
  TracksSetActiveGroupRequest,
  TracksSetActiveTrackRequest,
  TracksUpdateTrackRequest,
  TrackForEditResponse,
  TrackWorkspaceResponse,
} from '../api/tracks-contracts'

export async function getActiveTrack(db: Db, now = new Date()) {
  const settings = await getSettings(db)

  if (settings.practice.mode === 'freePractice') {
    return null
  }

  const repository = createTracksRepository(db)
  const guidance = await readActiveTrackGuidance(db, repository, now)

  if (!guidance.activeTrack) {
    return null
  }

  return {
    track: guidance.activeTrack.track,
    activeGroup: guidance.activeTrack.activeGroup,
    progress: guidance.activeTrack.progress,
    nextProblem: guidance.activeTrack.nextProblem
      ? deserializeProblem(guidance.activeTrack.nextProblem)
      : null,
  }
}

export async function getWorkspace(
  db: Db,
  request: TracksGetWorkspaceRequest,
): Promise<TrackWorkspaceResponse> {
  const generatedAt = request.at ? new Date(request.at) : new Date()
  const repository = createTracksRepository(db)
  const [catalog, session] = await Promise.all([
    repository.getTrackCatalog(),
    repository.getSession(),
  ])

  const guidance = await readActiveTrackGuidance(db, repository, generatedAt, {
    catalog,
    session,
  })

  return serializeTrackWorkspace({
    generatedAt,
    activeTrack: guidance.activeTrack,
    tracks: catalog,
    activeTrackGroups: guidance.activeTrackGroups,
    activeTrackRows: guidance.activeTrackRows,
    dueCount: guidance.dueCount,
  })
}

export async function getTrackForEdit(
  db: Db,
  request: TracksGetTrackForEditRequest,
): Promise<TrackForEditResponse> {
  const repository = createTracksRepository(db)
  const problemLibrary = await getProblemLibrary(db, {
    surface: request.surface,
  })
  const externalProgressProblemSlugs =
    await repository.getExternalProgressProblemSlugs(
      problemLibrary.rows.map((row) => row.problem.slug),
    )

  if (!request.trackId) {
    return serializeTrackForEdit({
      track: null,
      groups: [
        {
          title: 'Main',
          position: 1,
          problemSlugs: [],
        },
      ],
      problemRows: problemLibrary.rows,
      externalProgressProblemSlugs,
    })
  }

  const [track, groups, memberships] = await Promise.all([
    repository.getTrackById(request.trackId),
    repository.getGroups(request.trackId),
    repository.getMemberships(request.trackId),
  ])

  if (!track) {
    throw new Error(`Track "${request.trackId}" was not found.`)
  }

  const problemSlugsByGroup = groupMembershipProblemSlugs(memberships)

  return serializeTrackForEdit({
    track,
    groups: groups.map((group) => ({
      ...group,
      problemSlugs: problemSlugsByGroup.get(group.id) ?? [],
    })),
    problemRows: problemLibrary.rows,
    externalProgressProblemSlugs,
  })
}

export async function setActiveTrack(
  db: Db,
  request: TracksSetActiveTrackRequest,
): Promise<void> {
  await createTracksRepository(db).setActiveTrack(request.trackId)
}

export async function clearActiveTrack(
  db: Db,
  request: TracksClearActiveTrackRequest,
): Promise<void> {
  if (request.surface === 'dashboard') {
    await createTracksRepository(db).clearActiveTrack()
  }
}

export async function setActiveGroup(
  db: Db,
  request: TracksSetActiveGroupRequest,
): Promise<void> {
  const repository = createTracksRepository(db)
  const session = await repository.getSession()

  if (session.activeTrack?.id !== request.trackId) {
    throw new Error('Cannot set a group outside the requested active track.')
  }

  await repository.setActiveGroup(request.groupId)
}

export async function createTrack(
  db: Db,
  request: TracksCreateTrackRequest,
): Promise<TrackForEditResponse> {
  assertTrackHasGroups(request.groups)

  const now = new Date()
  const createdTrack = await db.transaction(async (transactionDb) => {
    const repository = createTracksRepository(transactionDb as unknown as Db)
    const track = await repository.createTrack(
      {
        title: request.title,
        allowExternalProgress: request.allowExternalProgress,
        description: request.description,
        dueAt: request.dueAt,
        groups: request.groups,
      },
      now,
    )

    if (request.setActive === true) {
      await repository.setActiveTrack(track.id, now)
    }

    return track
  })

  return getTrackForEdit(db, {
    surface: request.surface,
    trackId: createdTrack.id,
  })
}

export async function updateTrack(
  db: Db,
  request: TracksUpdateTrackRequest,
): Promise<TrackForEditResponse> {
  assertTrackHasGroups(request.groups)

  await createTracksRepository(db).updateTrack({
    trackId: request.trackId,
    title: request.title,
    allowExternalProgress: request.allowExternalProgress,
    description: request.description,
    dueAt: request.dueAt,
    groups: request.groups,
  })

  return getTrackForEdit(db, {
    surface: request.surface,
    trackId: request.trackId,
  })
}

export async function removeTrackProblem(
  db: Db,
  request: TracksRemoveProblemRequest,
): Promise<void> {
  await createTracksRepository(db).removeProblem(
    request.trackId,
    request.problemSlug,
  )
}

export async function deleteTrack(
  db: Db,
  request: TracksDeleteTrackRequest,
): Promise<void> {
  const repository = createTracksRepository(db)

  await assertTrackExists(repository, request.trackId)
  await repository.deleteTrack(request.trackId)
}

export async function resetTrackProgress(
  db: Db,
  request: TracksResetTrackProgressRequest,
): Promise<void> {
  const repository = createTracksRepository(db)

  await assertTrackExists(repository, request.trackId)
  await repository.resetTrackProgress(request.trackId)
}

export async function resetTrackProblemProgressForProblem(
  db: Db,
  problemSlug: string,
): Promise<void> {
  await createTracksRepository(db).resetProblemProgress(problemSlug)
}

export async function recordActiveTrackProblemReview(
  db: Db,
  input: TrackReviewProgressInput,
): Promise<boolean> {
  return createTracksRepository(db).recordActiveTrackProblemReview(input)
}

export async function recordActiveTrackProblemCompletion(
  db: Db,
  input: TrackCompletionInput,
): Promise<boolean> {
  return createTracksRepository(db).recordActiveTrackProblemCompletion(input)
}

export async function reconcileActiveTrackProblemReviewOverride(
  db: Db,
  input: TrackReviewProgressInput,
): Promise<boolean> {
  return createTracksRepository(db).reconcileActiveTrackProblemReviewOverride(
    input,
  )
}

type ActiveTrackGuidanceInput = {
  catalog?: readonly { track: Track; progress: TrackProgress }[]
  session?: TrackSessionState
}

type ActiveTrackGuidance = {
  activeTrack: {
    track: Track
    activeGroup: TrackGroup | null
    progress: TrackProgress
    nextProblem: SerializedProblem | null
  } | null
  activeTrackGroups: TrackGroup[]
  activeTrackRows: TrackProblemRowSerializationInput[]
  dueCount: number
}

async function readActiveTrackGuidance(
  db: Db,
  repository: ReturnType<typeof createTracksRepository>,
  generatedAt: Date,
  input: ActiveTrackGuidanceInput = {},
): Promise<ActiveTrackGuidance> {
  const [catalog, session] = await Promise.all([
    input.catalog ?? repository.getTrackCatalog(),
    input.session ?? repository.getSession(),
  ])

  if (!session.activeTrack) {
    return {
      activeTrack: null,
      activeTrackGroups: [],
      activeTrackRows: [],
      dueCount: 0,
    }
  }

  const [activeTrackGroups, activeTrackMemberships] = await Promise.all([
    repository.getGroups(session.activeTrack.id),
    repository.getMemberships(session.activeTrack.id),
  ])
  const activeTrackRows = await readTrackProblemRows(
    db,
    activeTrackMemberships,
    generatedAt,
  )
  const { nextRow, dueCount } = selectActiveTrackNextRow(activeTrackRows)

  return {
    activeTrack: {
      track: session.activeTrack,
      activeGroup: session.activeGroup ?? activeTrackGroups[0] ?? null,
      progress: readCatalogProgress(catalog, session.activeTrack.id),
      nextProblem: nextRow?.problem ?? null,
    },
    activeTrackGroups,
    activeTrackRows,
    dueCount,
  }
}

function selectActiveTrackNextRow(
  rows: readonly TrackProblemRowSerializationInput[],
) {
  const incompleteRows = rows.filter(
    (row) => row.membership.completion.status !== 'completed',
  )
  const nextRow =
    incompleteRows.find((row) => row.status !== 'suspended') ?? null

  return {
    nextRow,
    dueCount: incompleteRows.filter((row) => isDueTrackStatus(row.status))
      .length,
  }
}

function isDueTrackStatus(status: TrackProblemRowSerializationInput['status']) {
  return status === 'overdue' || status === 'due'
}

function deserializeProblem(problem: SerializedProblem): Problem {
  return {
    ...problem,
    createdAt: new Date(problem.createdAt),
    updatedAt: new Date(problem.updatedAt),
  }
}

async function readTrackProblemRows(
  db: Db,
  memberships: readonly TrackProblemMembership[],
  now: Date,
): Promise<TrackProblemRowSerializationInput[]> {
  if (memberships.length === 0) {
    return []
  }

  const problemRows = await getProblemLibraryRowsBySlug(
    db,
    memberships.map((membership) => membership.problemSlug),
    { now },
  )
  const problemRowsBySlug = new Map(
    problemRows.map((row) => [row.problem.slug, row]),
  )

  return memberships.map((membership) => {
    const problemRow = problemRowsBySlug.get(membership.problemSlug)

    if (!problemRow) {
      throw new Error(
        `Problem "${membership.problemSlug}" was not found for track "${membership.trackId}".`,
      )
    }

    return {
      ...problemRow,
      membership,
    }
  })
}

function groupMembershipProblemSlugs(
  memberships: readonly TrackProblemMembership[],
) {
  const problemSlugsByGroup = new Map<string, string[]>()

  for (const membership of memberships) {
    const problemSlugs = problemSlugsByGroup.get(membership.groupId) ?? []

    problemSlugs.push(membership.problemSlug)
    problemSlugsByGroup.set(membership.groupId, problemSlugs)
  }

  return problemSlugsByGroup
}

function readCatalogProgress(
  catalog: readonly { track: { id: string }; progress: TrackProgress }[],
  trackId: string,
) {
  return (
    catalog.find((catalogItem) => catalogItem.track.id === trackId)?.progress ??
    emptyProgress()
  )
}

function assertTrackHasGroups(groups: readonly unknown[]) {
  if (groups.length === 0) {
    throw new Error('A track must have at least one group.')
  }
}

async function assertTrackExists(
  repository: ReturnType<typeof createTracksRepository>,
  trackId: string,
) {
  const track = await repository.getTrackById(trackId)

  if (!track) {
    throw new Error(`Track "${trackId}" was not found.`)
  }
}

function emptyProgress(): TrackProgress {
  return {
    completedCount: 0,
    totalCount: 0,
    percent: 0,
  }
}
