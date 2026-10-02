import type {
  SerializedActiveTrack,
  SerializedTrack,
  SerializedTrackGroup,
  TrackForEditResponse,
  TrackProblemRow,
  TrackWorkspaceResponse,
} from '@/features/tracks/api/tracks-contracts'

import { createSerializedNormalizedPracticeState } from './practice-fixtures'
import { createSerializedProblem } from './problem-fixtures'

export function createSerializedTrack(
  overrides: Partial<SerializedTrack> = {},
): SerializedTrack {
  return {
    id: 'leetcode-75',
    slug: 'leetcode-75',
    title: 'LeetCode 75',
    description: 'Core interview practice.',
    dueAt: null,
    allowExternalProgress: false,
    ...overrides,
  }
}

export function createSerializedTrackGroup(
  overrides: Partial<SerializedTrackGroup> = {},
): SerializedTrackGroup {
  return {
    id: 'leetcode-75:arrays-hashing',
    trackId: 'leetcode-75',
    title: 'Arrays and Hashing',
    position: 1,
    ...overrides,
  }
}

export function createSerializedActiveTrack(
  overrides: Partial<NonNullable<SerializedActiveTrack>> = {},
): SerializedActiveTrack {
  return {
    track: createSerializedTrack(),
    activeGroup: createSerializedTrackGroup(),
    progress: {
      completedCount: 0,
      totalCount: 1,
      percent: 0,
    },
    nextProblem: createSerializedProblem({ slug: 'two-sum', title: 'Two Sum' }),
    ...overrides,
  }
}

export function createTrackProblemRow(
  overrides: Partial<TrackProblemRow> = {},
): TrackProblemRow {
  return {
    problem: createSerializedProblem({ slug: 'two-sum', title: 'Two Sum' }),
    status: 'not-started',
    state: createSerializedNormalizedPracticeState(),
    nextReviewAt: null,
    lastReviewedAt: null,
    lastSolvedAt: null,
    topics: [],
    effectiveTopicIds: [],
    companies: [],
    trackMemberships: [],
    membership: {
      trackId: 'leetcode-75',
      groupId: 'leetcode-75:arrays-hashing',
      groupTitle: 'Arrays and Hashing',
      groupPosition: 1,
      problemPosition: 1,
      completion: { status: 'incomplete', reviewAttemptId: null },
    },
    ...overrides,
  }
}

export function createTrackWorkspaceResponse(
  overrides: Partial<TrackWorkspaceResponse> = {},
): TrackWorkspaceResponse {
  return {
    generatedAt: '2026-01-01T10:00:00.000Z',
    activeTrack: createSerializedActiveTrack(),
    tracks: [
      {
        track: createSerializedTrack(),
        progress: {
          completedCount: 0,
          totalCount: 1,
          percent: 0,
        },
      },
    ],
    activeTrackGroups: [createSerializedTrackGroup()],
    activeTrackRows: [createTrackProblemRow()],
    dueCount: 0,
    ...overrides,
  }
}

export function createTrackForEditResponse(
  overrides: Partial<TrackForEditResponse> = {},
): TrackForEditResponse {
  return {
    externalProgressProblemSlugs: [],
    track: createSerializedTrack(),
    groups: [
      {
        ...createSerializedTrackGroup(),
        problemSlugs: ['two-sum'],
      },
    ],
    problemRows: [createTrackProblemRow()],
    ...overrides,
  }
}
