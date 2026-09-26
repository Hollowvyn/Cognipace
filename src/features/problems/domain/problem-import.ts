import type { ProblemRow } from '@/platform/db/schema/problems'

export type ImportedProblem = Omit<ProblemRow, 'createdAt' | 'updatedAt'>
export type ImportedLabel = { id: string; label: string }
export type ImportedTopicLink = { problemSlug: string; topicId: string }
export type ImportedCompanyLink = { problemSlug: string; companyId: string }

export interface ProblemImportState {
  problems: ImportedProblem[]
  topics: ImportedLabel[]
  companies: ImportedLabel[]
  aliases: { aliasKey: string; topicId: string }[]
  problemTopics: ImportedTopicLink[]
  problemCompanies: ImportedCompanyLink[]
}

export type ProblemImportChanges = Omit<ProblemImportState, 'aliases'>
