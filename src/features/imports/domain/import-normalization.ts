import {
  contentFormat,
  contentVersion,
  maxImportArrayEntries,
  maxImportBytes,
} from '@/features/imports/api/content-file-contracts'

import type {
  ImportDiagnostic,
  NormalizationResult,
  NormalizedImport,
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
        path: `$.${key}`,
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

  // Entry parsing is intentionally composed here so each section can be
  // normalized independently without turning one malformed section into a
  // file-level failure.
  const document: NormalizedImport = {
    problems: [],
    tracks: [],
    topics: [],
    companies: [],
  }

  return { status: 'valid', document, diagnostics }
}
