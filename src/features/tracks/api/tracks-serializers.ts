import { serializeProblem } from '@/features/problems/api/problems-serializers'
import type {
  ProblemLibraryRow,
  SerializedProblem,
} from '@/features/problems/api/problems-contracts'

import type { ActiveTrack, Track, TrackGroup, TrackProgress } from '../domain'
import type { TrackProblemMembership } from '../domain/track'
import {
  serializedActiveTrackSchema,
  serializedTrackGroupSchema,
  serializedTrackProgressSchema,
  serializedTrackSchema,
  trackForEditResponseSchema,
  trackProblemRowSchema,
  trackWorkspaceResponseSchema,
  type SerializedActiveTrack,
  type SerializedTrack,
  type SerializedTrackGroup,
  type SerializedTrackProgress,
  type TrackForEditResponse,
  type TrackProblemRow,
  type TrackWorkspaceResponse,
} from './tracks-contracts'

export function serializeTrack(track: Track): SerializedTrack {
  return serializedTrackSchema.parse({
    ...track,
    dueAt: track.dueAt?.toISOString() ?? null,
  })
}

export function serializeTrackGroup(group: TrackGroup): SerializedTrackGroup {
  return serializedTrackGroupSchema.parse(group)
}

export function serializeTrackProgress(
  progress: TrackProgress,
): SerializedTrackProgress {
  return serializedTrackProgressSchema.parse(progress)
}

export function serializeActiveTrack(
  activeTrack: ActiveTrack | null,
): SerializedActiveTrack {
  return serializedActiveTrackSchema.parse(
    activeTrack
      ? {
          track: serializeTrack(activeTrack.track),
          activeGroup: activeTrack.activeGroup
            ? serializeTrackGroup(activeTrack.activeGroup)
            : null,
          progress: serializeTrackProgress(activeTrack.progress),
          nextProblem: activeTrack.nextProblem
            ? serializeProblem(activeTrack.nextProblem)
            : null,
        }
      : null,
  )
}

export function serializeTrackProblemRow(
  row: TrackProblemRowSerializationInput,
): TrackProblemRow {
  return trackProblemRowSchema.parse({
    ...row,
    membership: {
      trackId: row.membership.trackId,
      groupId: row.membership.groupId,
      groupTitle: row.membership.groupTitle,
      groupPosition: row.membership.groupPosition,
      problemPosition: row.membership.problemPosition,
      completion:
        row.membership.completion.status === 'completed'
          ? {
              status: 'completed',
              completedAt: row.membership.completion.completedAt.toISOString(),
              completedRating: row.membership.completion.completedRating,
              reviewAttemptId: row.membership.completion.reviewAttemptId,
              ...(row.membership.completion.source
                ? { source: row.membership.completion.source }
                : {}),
            }
          : row.membership.completion,
    },
  })
}

export function serializeTrackWorkspace(
  workspace: TrackWorkspaceSerializationInput,
): TrackWorkspaceResponse {
  return trackWorkspaceResponseSchema.parse({
    generatedAt: workspace.generatedAt.toISOString(),
    activeTrack: workspace.activeTrack
      ? {
          track: serializeTrack(workspace.activeTrack.track),
          activeGroup: workspace.activeTrack.activeGroup
            ? serializeTrackGroup(workspace.activeTrack.activeGroup)
            : null,
          progress: serializeTrackProgress(workspace.activeTrack.progress),
          nextProblem: workspace.activeTrack.nextProblem,
        }
      : null,
    tracks: workspace.tracks.map((trackRow) => ({
      track: serializeTrack(trackRow.track),
      progress: serializeTrackProgress(trackRow.progress),
    })),
    activeTrackGroups: workspace.activeTrackGroups.map(serializeTrackGroup),
    activeTrackRows: workspace.activeTrackRows.map(serializeTrackProblemRow),
    dueCount: workspace.dueCount,
  })
}

export function serializeTrackForEdit(
  edit: TrackForEditSerializationInput,
): TrackForEditResponse {
  return trackForEditResponseSchema.parse({
    track: edit.track ? serializeTrack(edit.track) : null,
    groups: edit.groups.map((group) => ({
      ...(group.id ? { id: group.id } : {}),
      ...(group.trackId ? { trackId: group.trackId } : {}),
      title: group.title,
      position: group.position,
      problemSlugs: group.problemSlugs,
    })),
    problemRows: edit.problemRows,
    externalProgressProblemSlugs: edit.externalProgressProblemSlugs ?? [],
  })
}

export interface TrackProblemRowSerializationInput extends ProblemLibraryRow {
  membership: TrackProblemMembership
}

export interface TrackWorkspaceSerializationInput {
  generatedAt: Date
  activeTrack: {
    track: Track
    activeGroup: TrackGroup | null
    progress: TrackProgress
    nextProblem: SerializedProblem | null
  } | null
  tracks: readonly {
    track: Track
    progress: TrackProgress
  }[]
  activeTrackGroups: readonly TrackGroup[]
  activeTrackRows: readonly TrackProblemRowSerializationInput[]
  dueCount: number
}

export interface TrackGroupForEditSerializationInput {
  id?: string | undefined
  trackId?: string | undefined
  title: string
  position: number
  problemSlugs: string[]
}

export interface TrackForEditSerializationInput {
  externalProgressProblemSlugs?: readonly string[]
  track: Track | null
  groups: readonly TrackGroupForEditSerializationInput[]
  problemRows: readonly ProblemLibraryRow[]
}
