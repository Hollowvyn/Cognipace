import type { ImportState } from '@/features/imports/domain/import-types'

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
