import { describe, expect, it } from 'vitest'

import {
  createSerializedActiveTrack,
  createTrackProblemRow,
} from '@/testing/track-fixtures'

import {
  serializedActiveTrackSchema,
  trackCompletedRatingSchema,
  trackProblemRowSchema,
  tracksClearActiveTrackRequestSchema,
  tracksCreateTrackRequestSchema,
  tracksDeleteTrackRequestSchema,
  tracksGetWorkspaceRequestSchema,
  tracksRemoveProblemRequestSchema,
  tracksResetTrackProgressRequestSchema,
  tracksSetActiveTrackRequestSchema,
  tracksUpdateTrackRequestSchema,
} from './tracks-contracts'

describe('tracks runtime contracts', () => {
  it('requires a dashboard track and problem for membership removal', () => {
    const request = {
      surface: 'dashboard',
      trackId: 'leetcode-75',
      problemSlug: 'two-sum',
    }
    expect(tracksRemoveProblemRequestSchema.safeParse(request).success).toBe(
      true,
    )
    for (const patch of [
      { surface: 'popup' },
      { trackId: '' },
      { problemSlug: '' },
    ]) {
      expect(
        tracksRemoveProblemRequestSchema.safeParse({ ...request, ...patch })
          .success,
      ).toBe(false)
    }
  })

  it('accepts a valid active track response without legacy active flags', () => {
    const parsed = serializedActiveTrackSchema.parse(
      createSerializedActiveTrack(),
    )

    expect(parsed?.track).not.toHaveProperty('isActive')
  })

  it('rejects progress with an inconsistent percent', () => {
    const response = createSerializedActiveTrack({
      progress: {
        completedCount: 1,
        totalCount: 2,
        percent: 99,
      },
    })

    expect(serializedActiveTrackSchema.safeParse(response).success).toBe(false)
  })

  it('only accepts dashboard workspace requests', () => {
    expect(
      tracksGetWorkspaceRequestSchema.safeParse({
        surface: 'dashboard',
      }).success,
    ).toBe(true)
    expect(
      tracksGetWorkspaceRequestSchema.safeParse({
        surface: 'popup',
      }).success,
    ).toBe(false)
  })

  it('rejects create and update requests without groups', () => {
    expect(
      tracksCreateTrackRequestSchema.safeParse({
        surface: 'dashboard',
        title: 'Interview Track',
        description: null,
        dueAt: null,
        groups: [],
      }).success,
    ).toBe(false)
    expect(
      tracksUpdateTrackRequestSchema.safeParse({
        surface: 'dashboard',
        trackId: 'leetcode-75',
        title: 'Interview Track',
        description: null,
        dueAt: null,
        groups: [],
      }).success,
    ).toBe(false)
  })

  it('accepts setActive on create requests', () => {
    expect(
      tracksCreateTrackRequestSchema.safeParse({
        surface: 'dashboard',
        title: 'Interview Track',
        description: null,
        dueAt: null,
        groups: [{ title: 'Arrays', problemSlugs: ['two-sum'] }],
        setActive: true,
      }).success,
    ).toBe(true)
  })

  it('rejects duplicate problem slugs across groups for create and update requests', () => {
    expect(
      tracksCreateTrackRequestSchema.safeParse({
        surface: 'dashboard',
        title: 'Interview Track',
        description: null,
        dueAt: null,
        groups: [
          { title: 'Arrays', problemSlugs: ['two-sum'] },
          { title: 'Hash Maps', problemSlugs: ['Two Sum'] },
        ],
      }).success,
    ).toBe(false)
    expect(
      tracksUpdateTrackRequestSchema.safeParse({
        surface: 'dashboard',
        trackId: 'leetcode-75',
        title: 'Interview Track',
        description: null,
        dueAt: null,
        groups: [
          { title: 'Arrays', problemSlugs: ['two-sum'] },
          { title: 'Hash Maps', problemSlugs: ['two-sum'] },
        ],
      }).success,
    ).toBe(false)
  })

  it('only accepts recalled ratings that can complete track progress', () => {
    expect(trackCompletedRatingSchema.safeParse('hard').success).toBe(true)
    expect(trackCompletedRatingSchema.safeParse('good').success).toBe(true)
    expect(trackCompletedRatingSchema.safeParse('easy').success).toBe(true)
    expect(trackCompletedRatingSchema.safeParse('again').success).toBe(false)
  })

  it('accepts serialized track problem completion states', () => {
    const incompleteRow = createTrackProblemRow({
      membership: {
        trackId: 'leetcode-75',
        groupId: 'leetcode-75:arrays-hashing',
        groupTitle: 'Arrays and Hashing',
        groupPosition: 1,
        problemPosition: 1,
        completion: { status: 'incomplete', reviewAttemptId: null },
      },
    })
    const completedRow = createTrackProblemRow({
      membership: {
        trackId: 'leetcode-75',
        groupId: 'leetcode-75:arrays-hashing',
        groupTitle: 'Arrays and Hashing',
        groupPosition: 1,
        problemPosition: 2,
        completion: {
          status: 'completed',
          completedAt: '2026-01-01T00:00:00.000Z',
          completedRating: 'hard',
          reviewAttemptId: 'review-two-sum-1',
        },
      },
    })

    expect(
      trackProblemRowSchema.parse(incompleteRow).membership.completion,
    ).toEqual({
      status: 'incomplete',
      reviewAttemptId: null,
    })
    expect(
      trackProblemRowSchema.parse(completedRow).membership.completion,
    ).toEqual({
      status: 'completed',
      completedAt: '2026-01-01T00:00:00.000Z',
      completedRating: 'hard',
      reviewAttemptId: 'review-two-sum-1',
    })
  })

  it('requires dashboard surface and a non-empty track id for active, delete, and reset requests', () => {
    for (const schema of [
      tracksSetActiveTrackRequestSchema,
      tracksDeleteTrackRequestSchema,
      tracksResetTrackProgressRequestSchema,
    ]) {
      expect(
        schema.safeParse({
          surface: 'dashboard',
          trackId: 'leetcode-75',
        }).success,
      ).toBe(true)
      expect(
        schema.safeParse({
          surface: 'popup',
          trackId: 'leetcode-75',
        }).success,
      ).toBe(false)
      expect(
        schema.safeParse({
          surface: 'dashboard',
          trackId: '',
        }).success,
      ).toBe(false)
    }
  })

  it('requires dashboard surface when clearing the active track', () => {
    expect(
      tracksClearActiveTrackRequestSchema.safeParse({
        surface: 'dashboard',
      }).success,
    ).toBe(true)
    expect(
      tracksClearActiveTrackRequestSchema.safeParse({
        surface: 'popup',
      }).success,
    ).toBe(false)
  })
})
