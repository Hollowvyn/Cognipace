import type {
  ImportPreview,
  ImportState,
} from '@/features/imports/domain/import-types'
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

export const readyPreview: ImportPreview = {
  status: 'ready',
  fingerprint: 'a'.repeat(64),
  additions: {
    problems: 1,
    topics: 0,
    companies: 0,
    problemTopics: 0,
    problemCompanies: 0,
    tracks: 0,
    groups: 0,
    memberships: 0,
  },
  items: [
    {
      kind: 'problems',
      identity: 'two-sum',
      label: 'Two Sum',
      action: 'add',
      path: '$.problems[0]',
    },
  ],
  diagnostics: [],
}

export const secondPreview: ImportPreview = {
  ...readyPreview,
  fingerprint: 'b'.repeat(64),
  additions: {
    ...readyPreview.additions,
    problems: 2,
  },
  items: [
    {
      kind: 'problems',
      identity: 'valid-anagram',
      label: 'Valid Anagram',
      action: 'add',
      path: '$.problems[1]',
    },
  ],
}

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
