import type { TrackGroupRow } from '@/platform/db/schema/track-groups'
import type { TrackRow } from '@/platform/db/schema/tracks'

export type ImportedTrack = Omit<TrackRow, 'createdAt' | 'updatedAt'>
export type ImportedGroup = Omit<TrackGroupRow, 'createdAt' | 'updatedAt'>
export type ImportedMembership = {
  trackId: string
  trackGroupId: string
  problemSlug: string
  position: number
}

export interface TrackImportState {
  tracks: ImportedTrack[]
  groups: ImportedGroup[]
  memberships: ImportedMembership[]
}

export type TrackImportChanges = TrackImportState
