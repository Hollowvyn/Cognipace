import type { ImportState } from '@/features/imports/domain/import-types'
import type { TrackImportState } from '@/features/tracks/domain/track-import'

export const validTwoQuestionTrackFileText = JSON.stringify({
  format: 'cognipace-content',
  version: 1,
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

export const existingLocalTrackFixture: TrackImportState = {
  tracks: [
    {
      id: 'local-track',
      slug: 'local-track',
      title: 'My Local Track',
      description: 'Locally created and owned',
      dueAt: null,
    },
  ],
  groups: [
    {
      id: 'local-track:arrays',
      trackId: 'local-track',
      title: 'My Arrays',
      position: 1,
    },
  ],
  memberships: [],
}

export function emptyImportState(): ImportState {
  return {
    catalog: {
      problems: [],
      topics: [],
      companies: [],
      aliases: [],
      problemTopics: [],
      problemCompanies: [],
    },
    curriculum: {
      tracks: [],
      groups: [],
      memberships: [],
    },
  }
}
