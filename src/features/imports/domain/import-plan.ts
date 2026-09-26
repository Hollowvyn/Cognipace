import type { ProblemImportState } from '@/features/problems/domain/problem-import'
import type { TrackImportState } from '@/features/tracks/domain/track-import'

import { planImportProblems } from './plan-import-problems'
import { planImportTracks } from './plan-import-tracks'

import type {
  ImportChanges,
  ImportCounts,
  ImportPlan,
  ImportState,
  NormalizationResult,
} from './import-types'

function emptyProblemState(): ProblemImportState {
  return {
    problems: [],
    topics: [],
    companies: [],
    aliases: [],
    problemTopics: [],
    problemCompanies: [],
  }
}

function emptyTrackState(): TrackImportState {
  return { tracks: [], groups: [], memberships: [] }
}

function emptyChanges(): ImportChanges {
  return {
    catalog: {
      problems: [],
      topics: [],
      companies: [],
      problemTopics: [],
      problemCompanies: [],
    },
    curriculum: { tracks: [], groups: [], memberships: [] },
  }
}

function countsFor(changes: ImportChanges): ImportCounts {
  return {
    problems: changes.catalog.problems.length,
    topics: changes.catalog.topics.length,
    companies: changes.catalog.companies.length,
    problemTopics: changes.catalog.problemTopics.length,
    problemCompanies: changes.catalog.problemCompanies.length,
    tracks: changes.curriculum.tracks.length,
    groups: changes.curriculum.groups.length,
    memberships: changes.curriculum.memberships.length,
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  )
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value))
}

function emptyRelevantState() {
  return { catalog: emptyProblemState(), curriculum: emptyTrackState() }
}

export function buildImportPlan(
  input: NormalizationResult,
  state: ImportState,
): ImportPlan {
  if (input.status === 'blocked') {
    const changes = emptyChanges()
    const diagnostics = input.diagnostics.map((diagnostic) => ({
      ...diagnostic,
    }))
    return {
      changes,
      preview: {
        status: 'blocked',
        fingerprint: null,
        additions: countsFor(changes),
        items: [],
        diagnostics,
      },
      fingerprintInput: canonicalJson({
        normalizedInput: input,
        relevantState: emptyRelevantState(),
        changes,
        plannerDiagnostics: [],
      }),
    }
  }

  const plannedTracks = planImportTracks(
    input.document.tracks,
    state.curriculum,
  )
  const plannedProblems = planImportProblems(
    input.document,
    plannedTracks.references,
    state.catalog,
  )
  const changes: ImportChanges = {
    catalog: plannedProblems.changes,
    curriculum: plannedTracks.changes,
  }
  const diagnostics = [
    ...input.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    ...plannedTracks.diagnostics,
    ...plannedProblems.diagnostics,
  ]
  const items = [...plannedProblems.items, ...plannedTracks.items]
  const additions = countsFor(changes)
  const additionTotal = Object.values(additions).reduce(
    (total, count) => total + count,
    0,
  )
  const status =
    additionTotal > 0 ? 'ready' : items.length > 0 ? 'unchanged' : 'empty'
  const relevantState = {
    catalog: plannedProblems.relevantState,
    curriculum: plannedTracks.relevantState,
  }

  return {
    changes,
    preview: {
      status,
      fingerprint: null,
      additions,
      items,
      diagnostics,
    },
    fingerprintInput: canonicalJson({
      normalizedInput: input,
      relevantState,
      changes,
      plannerDiagnostics: diagnostics,
    }),
  }
}
