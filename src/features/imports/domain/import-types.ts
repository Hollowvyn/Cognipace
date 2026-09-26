import type {
  ProblemImportChanges,
  ProblemImportState,
} from '@/features/problems/domain/problem-import'
import type {
  TrackImportChanges,
  TrackImportState,
} from '@/features/tracks/domain/track-import'

export type ImportDiagnostic = {
  severity: 'warning' | 'error'
  code: string
  path: string
  message: string
}

export type LabelDraft = { label: string; path: string }

export type ProblemDraft = {
  slug: string
  path: string
  title: string | null
  difficulty: 'easy' | 'medium' | 'hard' | 'unknown' | null
  isPremium: boolean | null
  topics: LabelDraft[]
  companies: LabelDraft[]
}

export type GroupDraft = {
  slug: string
  path: string
  title: string | null
  problems: { slug: string; path: string }[]
}

export type TrackDraft = {
  slug: string
  path: string
  title: string | null
  description: string | null
  groups: GroupDraft[]
}

export type NormalizedImport = {
  problems: ProblemDraft[]
  tracks: TrackDraft[]
  topics: LabelDraft[]
  companies: LabelDraft[]
}

export type NormalizationResult =
  | { status: 'blocked'; diagnostics: ImportDiagnostic[] }
  | {
      status: 'valid'
      document: NormalizedImport
      diagnostics: ImportDiagnostic[]
    }

export type ImportState = {
  catalog: ProblemImportState
  curriculum: TrackImportState
}

export type ImportChanges = {
  catalog: ProblemImportChanges
  curriculum: TrackImportChanges
}

export type ImportCounts = {
  problems: number
  topics: number
  companies: number
  problemTopics: number
  problemCompanies: number
  tracks: number
  groups: number
  memberships: number
}

export type ImportItem = {
  kind: keyof ImportCounts
  identity: string
  label: string
  action: 'add' | 'retain'
  path: string
}

export type ImportPreview = {
  status: 'ready' | 'unchanged' | 'empty' | 'blocked'
  fingerprint: string | null
  additions: ImportCounts
  items: ImportItem[]
  diagnostics: ImportDiagnostic[]
}

export type ImportPlan = {
  changes: ImportChanges
  preview: ImportPreview
  fingerprintInput: string
}
