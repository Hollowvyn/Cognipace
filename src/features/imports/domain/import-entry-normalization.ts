import { normalizeTopicLookupKey } from '@/features/problems/domain/topic-taxonomy'

import {
  readImportSlug,
  readProblemIdentity,
  readProblemUrlIdentity,
} from './import-identity'

import type {
  GroupDraft,
  ImportDiagnostic,
  LabelDraft,
  ProblemDraft,
  TrackDraft,
} from './import-types'

export type EntryNormalizer = {
  problem(
    value: unknown,
    path: string,
    diagnostics: ImportDiagnostic[],
  ): ProblemDraft | null
  track(
    value: unknown,
    path: string,
    diagnostics: ImportDiagnostic[],
  ): TrackDraft | null
  group(
    value: unknown,
    path: string,
    diagnostics: ImportDiagnostic[],
  ): GroupDraft | null
  labels(
    value: unknown,
    path: string,
    diagnostics: ImportDiagnostic[],
  ): LabelDraft[]
}

const problemFields = new Set([
  'slug',
  'url',
  'title',
  'difficulty',
  'isPremium',
  'topics',
  'companies',
])
const trackFields = new Set(['slug', 'title', 'description', 'groups'])
const groupFields = new Set(['slug', 'title', 'problems'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fieldPath(path: string, field: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(field)
    ? path === '$'
      ? `$.${field}`
      : `${path}.${field}`
    : `${path}[${JSON.stringify(field)}]`
}

function arrayPath(path: string, index: number): string {
  return `${path}[${index}]`
}

function warn(
  diagnostics: ImportDiagnostic[],
  code: string,
  path: string,
  message: string,
) {
  diagnostics.push({ severity: 'warning', code, path, message })
}

function warnUnknownFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  diagnostics: ImportDiagnostic[],
) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      warn(
        diagnostics,
        'unknown-field',
        fieldPath(path, key),
        'This field is not part of the cognipace-content format.',
      )
    }
  }
}

function invalidEntry(path: string, diagnostics: ImportDiagnostic[]) {
  warn(
    diagnostics,
    'invalid-entry',
    path,
    'Expected an object for this content entry.',
  )
}

function readOptionalText(
  value: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    warn(diagnostics, 'invalid-field', path, 'Expected a string or null.')
    return null
  }

  const text = value.trim()
  return text.length > 0 ? text : null
}

function readDifficulty(
  value: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): ProblemDraft['difficulty'] {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') {
    const difficulty = value.trim().toLowerCase()
    if (
      difficulty === 'easy' ||
      difficulty === 'medium' ||
      difficulty === 'hard' ||
      difficulty === 'unknown'
    ) {
      return difficulty
    }
  }

  warn(
    diagnostics,
    'invalid-difficulty',
    path,
    'Expected easy, medium, hard, unknown, or null.',
  )
  return null
}

function readPremium(
  value: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): boolean | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value
  warn(diagnostics, 'invalid-field', path, 'Expected a boolean or null.')
  return null
}

export function normalizeLabelEntries(
  value: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): LabelDraft[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    warn(diagnostics, 'invalid-field', path, 'Expected an array or null.')
    return []
  }

  const labels: LabelDraft[] = []
  const seen = new Set<string>()

  value.forEach((item: unknown, index: number) => {
    if (item === null) return
    const itemPath = arrayPath(path, index)
    if (typeof item !== 'string') {
      warn(diagnostics, 'invalid-label', itemPath, 'Expected a string or null.')
      return
    }

    const label = item.trim().replace(/\s+/g, ' ')
    const lookupKey = normalizeTopicLookupKey(label)
    if (!label || !lookupKey) {
      warn(
        diagnostics,
        'invalid-label',
        itemPath,
        'Expected a non-empty label.',
      )
      return
    }

    if (seen.has(lookupKey)) return
    seen.add(lookupKey)
    labels.push({ label, path: itemPath })
  })

  return labels
}

function problemIdentity(
  value: Record<string, unknown>,
  path: string,
  diagnostics: ImportDiagnostic[],
): string | null {
  const hasSlug = value.slug !== undefined && value.slug !== null
  const hasUrl = value.url !== undefined && value.url !== null
  const slug = hasSlug ? readImportSlug(value.slug) : null
  const url = hasUrl ? readProblemUrlIdentity(value.url) : null

  if (hasSlug && slug === null) {
    warn(
      diagnostics,
      'invalid-identity',
      fieldPath(path, 'slug'),
      'Expected a valid problem slug.',
    )
    return null
  }
  if (hasUrl && url === null) {
    warn(
      diagnostics,
      'invalid-identity',
      fieldPath(path, 'url'),
      'Expected a valid LeetCode problem URL.',
    )
    return null
  }
  if (slug !== null && url !== null && slug !== url) {
    warn(
      diagnostics,
      'identity-conflict',
      path,
      'The supplied slug and URL identify different problems.',
    )
    return null
  }

  const identity = slug ?? url
  if (identity === null) {
    warn(
      diagnostics,
      'invalid-identity',
      path,
      'A problem slug or URL is required.',
    )
  }
  return identity
}

export function normalizeProblemEntry(
  value: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): ProblemDraft | null {
  if (typeof value === 'string') {
    const slug = readProblemIdentity(value)
    if (slug === null) {
      warn(
        diagnostics,
        'invalid-identity',
        path,
        'Expected a problem slug or LeetCode problem URL.',
      )
      return null
    }
    return {
      slug,
      path,
      title: null,
      difficulty: null,
      isPremium: null,
      topics: [],
      companies: [],
    }
  }

  if (!isRecord(value)) {
    invalidEntry(path, diagnostics)
    return null
  }

  warnUnknownFields(value, problemFields, path, diagnostics)
  const slug = problemIdentity(value, path, diagnostics)
  if (slug === null) return null

  return {
    slug,
    path,
    title: readOptionalText(value.title, fieldPath(path, 'title'), diagnostics),
    difficulty: readDifficulty(
      value.difficulty,
      fieldPath(path, 'difficulty'),
      diagnostics,
    ),
    isPremium: readPremium(
      value.isPremium,
      fieldPath(path, 'isPremium'),
      diagnostics,
    ),
    topics: normalizeLabelEntries(
      value.topics,
      fieldPath(path, 'topics'),
      diagnostics,
    ),
    companies: normalizeLabelEntries(
      value.companies,
      fieldPath(path, 'companies'),
      diagnostics,
    ),
  }
}

export function normalizeGroupEntry(
  value: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): GroupDraft | null {
  if (!isRecord(value)) {
    invalidEntry(path, diagnostics)
    return null
  }

  warnUnknownFields(value, groupFields, path, diagnostics)
  const slug = readImportSlug(value.slug)
  if (slug === null) {
    warn(
      diagnostics,
      'invalid-identity',
      fieldPath(path, 'slug'),
      'A valid group slug is required.',
    )
    return null
  }

  const problemsPath = fieldPath(path, 'problems')
  let problems: GroupDraft['problems'] = []
  if (value.problems !== undefined && value.problems !== null) {
    if (!Array.isArray(value.problems)) {
      warn(
        diagnostics,
        'invalid-field',
        problemsPath,
        'Expected an array or null.',
      )
      return null
    }

    problems = value.problems.flatMap((reference: unknown, index: number) => {
      const referencePath = arrayPath(problemsPath, index)
      if (typeof reference !== 'string') {
        warn(
          diagnostics,
          'invalid-reference',
          referencePath,
          'Expected a problem slug or LeetCode problem URL.',
        )
        return []
      }

      const problemSlug = readProblemIdentity(reference)
      if (problemSlug === null) {
        warn(
          diagnostics,
          'invalid-reference',
          referencePath,
          'Expected a problem slug or LeetCode problem URL.',
        )
        return []
      }

      return [{ slug: problemSlug, path: referencePath }]
    })

    if (value.problems.length > 0 && problems.length === 0) return null
  }

  return {
    slug,
    path,
    title: readOptionalText(value.title, fieldPath(path, 'title'), diagnostics),
    problems,
  }
}

export function normalizeTrackEntry(
  value: unknown,
  path: string,
  diagnostics: ImportDiagnostic[],
): TrackDraft | null {
  if (!isRecord(value)) {
    invalidEntry(path, diagnostics)
    return null
  }

  warnUnknownFields(value, trackFields, path, diagnostics)
  const slug = readImportSlug(value.slug)
  if (slug === null) {
    warn(
      diagnostics,
      'invalid-identity',
      fieldPath(path, 'slug'),
      'A valid track slug is required.',
    )
    return null
  }

  const groupsPath = fieldPath(path, 'groups')
  if (!Array.isArray(value.groups)) {
    warn(
      diagnostics,
      'invalid-field',
      groupsPath,
      'Expected an array of groups.',
    )
    return null
  }

  const groups = value.groups.flatMap((group: unknown, index: number) => {
    const normalized = normalizeGroupEntry(
      group,
      arrayPath(groupsPath, index),
      diagnostics,
    )
    return normalized === null ? [] : [normalized]
  })
  if (groups.length === 0) {
    warn(
      diagnostics,
      'no-valid-groups',
      groupsPath,
      'A track requires at least one accepted group.',
    )
    return null
  }

  return {
    slug,
    path,
    title: readOptionalText(value.title, fieldPath(path, 'title'), diagnostics),
    description: readOptionalText(
      value.description,
      fieldPath(path, 'description'),
      diagnostics,
    ),
    groups,
  }
}
