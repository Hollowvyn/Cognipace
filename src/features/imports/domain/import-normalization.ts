import {
  contentFormat,
  contentVersion,
  maxImportArrayEntries,
  maxImportBytes,
} from '@/features/imports/api/content-file-contracts'
import { normalizeTopicLookupKey } from '@/features/problems/domain/topic-taxonomy'

import {
  normalizeLabelEntries,
  normalizeProblemEntry,
  normalizeTrackEntry,
} from './import-entry-normalization'

import type {
  GroupDraft,
  ImportDiagnostic,
  LabelDraft,
  NormalizationResult,
  NormalizedImport,
  ProblemDraft,
  TrackDraft,
} from './import-types'

const recognizedSections = [
  'problems',
  'tracks',
  'companies',
  'topics',
] as const
const knownFields = new Set<string>([
  '$schema',
  'format',
  'version',
  ...recognizedSections,
])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fieldPath(path: string, field: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(field)
    ? path === '$'
      ? `$.${field}`
      : `${path}.${field}`
    : `${path}[${JSON.stringify(field)}]`
}

function fatal(code: string, message: string): NormalizationResult {
  return {
    status: 'blocked',
    diagnostics: [{ severity: 'error', code, path: '$', message }],
  }
}

export function exceedsArrayEntryLimit(root: unknown, limit: number): boolean {
  const pending: unknown[] = [root]
  let count = 0

  while (pending.length > 0) {
    const value = pending.pop()
    if (Array.isArray(value)) {
      count += value.length
      if (count > limit) return true
      for (const child of value) pending.push(child)
    } else if (value !== null && typeof value === 'object') {
      for (const child of Object.values(value)) pending.push(child)
    }
  }

  return false
}

function takeFirst<T>(
  current: T | null,
  incoming: T | null,
  path: string,
  diagnostics: ImportDiagnostic[],
): T | null {
  if (current === null) return incoming
  if (incoming !== null && incoming !== current) {
    diagnostics.push({
      severity: 'warning',
      code: 'conflicting-value',
      path,
      message: 'An earlier value for this identity is retained.',
    })
  }
  return current
}

function appendLabels(
  current: LabelDraft[],
  incoming: LabelDraft[],
  seen: Set<string>,
): void {
  for (const label of incoming) {
    const key = normalizeTopicLookupKey(label.label)
    if (seen.has(key)) continue
    seen.add(key)
    current.push(label)
  }
}

type ProblemAccumulator = {
  draft: ProblemDraft
  topicKeys: Set<string>
  companyKeys: Set<string>
}

function createProblemAccumulator(draft: ProblemDraft): ProblemAccumulator {
  return {
    draft,
    topicKeys: new Set(
      draft.topics.map(({ label }) => normalizeTopicLookupKey(label)),
    ),
    companyKeys: new Set(
      draft.companies.map(({ label }) => normalizeTopicLookupKey(label)),
    ),
  }
}

function foldProblems(
  values: unknown[],
  diagnostics: ImportDiagnostic[],
): ProblemDraft[] {
  const folded: ProblemDraft[] = []
  const indexes = new Map<string, ProblemAccumulator>()

  values.forEach((value, index) => {
    const incoming = normalizeProblemEntry(
      value,
      `problems[${index}]`,
      diagnostics,
    )
    if (incoming === null) return

    const accumulator = indexes.get(incoming.slug)
    if (accumulator === undefined) {
      indexes.set(incoming.slug, createProblemAccumulator(incoming))
      folded.push(incoming)
      return
    }

    const current = accumulator.draft
    current.title = takeFirst(
      current.title,
      incoming.title,
      fieldPath(incoming.path, 'title'),
      diagnostics,
    )
    current.difficulty = takeFirst(
      current.difficulty,
      incoming.difficulty,
      fieldPath(incoming.path, 'difficulty'),
      diagnostics,
    )
    current.isPremium = takeFirst(
      current.isPremium,
      incoming.isPremium,
      fieldPath(incoming.path, 'isPremium'),
      diagnostics,
    )
    appendLabels(current.topics, incoming.topics, accumulator.topicKeys)
    appendLabels(current.companies, incoming.companies, accumulator.companyKeys)
  })

  return folded
}

function placementDiagnostic(path: string, diagnostics: ImportDiagnostic[]) {
  diagnostics.push({
    severity: 'warning',
    code: 'placement-preserved',
    path,
    message: 'The first group placement for this problem is retained.',
  })
}

type TrackAccumulator = {
  draft: TrackDraft
  groupsBySlug: Map<string, GroupDraft>
  placements: Map<string, string>
}

function createTrackAccumulator(draft: TrackDraft): TrackAccumulator {
  return { draft, groupsBySlug: new Map(), placements: new Map() }
}

function appendTrackGroups(
  accumulator: TrackAccumulator,
  incomingGroups: GroupDraft[],
  diagnostics: ImportDiagnostic[],
) {
  const { draft, groupsBySlug, placements } = accumulator

  for (const incoming of incomingGroups) {
    let group = groupsBySlug.get(incoming.slug)
    if (!group) {
      group = { ...incoming, problems: [] }
      draft.groups.push(group)
      groupsBySlug.set(group.slug, group)
    } else {
      group.title = takeFirst(
        group.title,
        incoming.title,
        fieldPath(incoming.path, 'title'),
        diagnostics,
      )
    }

    for (const problem of incoming.problems) {
      const existingPlacement = placements.get(problem.slug)
      if (existingPlacement !== undefined) {
        if (existingPlacement !== group.slug) {
          placementDiagnostic(problem.path, diagnostics)
        }
        continue
      }

      placements.set(problem.slug, group.slug)
      group.problems.push(problem)
    }
  }
}

function foldTracks(
  values: unknown[],
  diagnostics: ImportDiagnostic[],
): TrackDraft[] {
  const folded: TrackDraft[] = []
  const indexes = new Map<string, TrackAccumulator>()

  values.forEach((value, index) => {
    const incoming = normalizeTrackEntry(value, `tracks[${index}]`, diagnostics)
    if (incoming === null) return

    const accumulator = indexes.get(incoming.slug)
    if (accumulator === undefined) {
      const current: TrackDraft = { ...incoming, groups: [] }
      const first = createTrackAccumulator(current)
      indexes.set(incoming.slug, first)
      appendTrackGroups(first, incoming.groups, diagnostics)
      folded.push(current)
      return
    }

    const current = accumulator.draft
    current.title = takeFirst(
      current.title,
      incoming.title,
      fieldPath(incoming.path, 'title'),
      diagnostics,
    )
    current.description = takeFirst(
      current.description,
      incoming.description,
      fieldPath(incoming.path, 'description'),
      diagnostics,
    )
    appendTrackGroups(accumulator, incoming.groups, diagnostics)
  })

  return folded
}

export function normalizeImportFile(fileText: string): NormalizationResult {
  if (new TextEncoder().encode(fileText).byteLength > maxImportBytes) {
    return fatal('file-too-large', 'The content file exceeds the 5 MiB limit.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fileText) as unknown
  } catch {
    return fatal('invalid-json', 'The content file is not valid JSON.')
  }

  if (!isPlainRecord(parsed) || parsed.format !== contentFormat) {
    return fatal('invalid-envelope', 'Expected a cognipace-content object.')
  }
  if (parsed.version !== contentVersion) {
    return fatal(
      'unsupported-version',
      'Only content format version 1 is supported.',
    )
  }
  if ('$schema' in parsed && typeof parsed.$schema !== 'string') {
    return fatal(
      'invalid-envelope',
      'The $schema field must be a string when supplied.',
    )
  }
  if (exceedsArrayEntryLimit(parsed, maxImportArrayEntries)) {
    return fatal(
      'too-many-entries',
      'The content file exceeds the 50,000 array-entry limit.',
    )
  }

  const diagnostics: ImportDiagnostic[] = []
  for (const key of Object.keys(parsed)) {
    if (!knownFields.has(key)) {
      diagnostics.push({
        severity: 'warning',
        code: 'unknown-field',
        path: fieldPath('$', key),
        message: 'This field is not part of the cognipace-content format.',
      })
    }
  }

  for (const section of recognizedSections) {
    const value = parsed[section]
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-section',
        path: section,
        message: 'Expected an array or null.',
      })
    }
  }

  const document: NormalizedImport = {
    problems: Array.isArray(parsed.problems)
      ? foldProblems(parsed.problems, diagnostics)
      : [],
    tracks: Array.isArray(parsed.tracks)
      ? foldTracks(parsed.tracks, diagnostics)
      : [],
    topics: Array.isArray(parsed.topics)
      ? normalizeLabelEntries(parsed.topics, 'topics', diagnostics)
      : [],
    companies: Array.isArray(parsed.companies)
      ? normalizeLabelEntries(parsed.companies, 'companies', diagnostics)
      : [],
  }

  return { status: 'valid', document, diagnostics }
}
