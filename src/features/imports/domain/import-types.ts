import type {
  ProblemImportChanges,
  ProblemImportState,
} from '@/features/problems/domain/problem-import'
import type {
  TrackImportChanges,
  TrackImportState,
} from '@/features/tracks/domain/track-import'
import type { ImportPreviewResponse } from '@/features/imports/api/import-runtime-contracts'

export type ImportDiagnostic = ImportPreviewResponse['diagnostics'][number]

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

export type ImportCounts = ImportPreviewResponse['additions']
export type ImportItem = ImportPreviewResponse['items'][number]
export type ImportPreview = ImportPreviewResponse

export type ImportPlan = {
  changes: ImportChanges
  preview: ImportPreview
  fingerprintInput: string
}
