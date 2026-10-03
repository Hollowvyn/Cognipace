import type { Problem } from '@/features/problems'

export interface Track {
  id: string
  slug: string
  title: string
  description: string | null
  dueAt: Date | null
  allowExternalProgress: boolean
}

export interface TrackGroup {
  id: string
  trackId: string
  title: string
  position: number
}

export interface TrackProgress {
  completedCount: number
  totalCount: number
  percent: number
}

export interface TrackCatalogItem {
  track: Track
  progress: TrackProgress
}

export interface TrackSessionState {
  activeTrack: Track | null
}

export type TrackCompletedRating = 'hard' | 'good' | 'easy'

export type TrackProblemCompletion =
  | { status: 'incomplete'; reviewAttemptId: string | null }
  | {
      status: 'completed'
      completedAt: Date
      completedRating: TrackCompletedRating
      reviewAttemptId: string | null
      source?: 'track' | 'external'
    }

export interface TrackReviewProgressInput {
  problemSlug: string
  rating: 'again' | 'hard' | 'good' | 'easy'
  reviewedAt: Date
  reviewAttemptId: string
}

export interface TrackCompletionInput {
  problemSlug: string
  rating: TrackCompletedRating
  completedAt: Date
}

export interface TrackProblemMembership {
  trackId: string
  groupId: string
  groupTitle: string
  groupPosition: number
  problemSlug: string
  problemPosition: number
  completion: TrackProblemCompletion
}

export interface TrackProblemMembershipInput {
  problemSlug: string
}

export interface TrackGroupInput {
  id?: string | undefined
  title: string
  problemSlugs: string[]
}

export interface TrackMutationInput {
  allowExternalProgress?: boolean
  title: string
  description: string | null
  dueAt: Date | string | null
  groups: TrackGroupInput[]
}

export type CreateTrackInput = TrackMutationInput

export interface UpdateTrackInput extends TrackMutationInput {
  trackId: string
}

export interface ActiveTrack {
  track: Track
  activeGroup: TrackGroup | null
  progress: TrackProgress
  nextProblem: Problem | null
}
