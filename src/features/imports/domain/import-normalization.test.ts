import { describe, expect, it } from 'vitest'

import {
  contentFormat,
  contentVersion,
  maxImportArrayEntries,
  maxImportBytes,
} from '@/features/imports/api/content-file-contracts'

import { normalizeImportFile } from './import-normalization'

const envelope = (sections: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: contentFormat,
    version: contentVersion,
    ...sections,
  })

function expectFatal(text: string, code: string) {
  const result = normalizeImportFile(text)
  expect(result.status).toBe('blocked')
  if (result.status !== 'blocked')
    throw new Error('Expected import to be blocked')
  expect(result).not.toHaveProperty('document')
  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]).toMatchObject({
    severity: 'error',
    code,
    path: '$',
  })
}

describe('normalizeImportFile envelope and resource checks', () => {
  it('blocks invalid JSON at the root', () => {
    expectFatal('{', 'invalid-json')
  })

  it.each([
    ['array root', '[]'],
    ['scalar root', JSON.stringify('text')],
    [
      'backup discriminator',
      JSON.stringify({ format: 'cognipace-backup', version: 1 }),
    ],
    ['missing format', JSON.stringify({ version: 1 })],
  ])('blocks an invalid envelope for %s', (_label, text) => {
    expectFatal(text, 'invalid-envelope')
  })

  it('blocks unsupported versions at the root', () => {
    expectFatal(
      JSON.stringify({ format: contentFormat, version: 2 }),
      'unsupported-version',
    )
  })

  it('rejects multibyte input using its UTF-8 byte size', () => {
    const text = envelope({
      topics: ['🧭'.repeat(Math.ceil(maxImportBytes / 4))],
    })
    expect(text.length).toBeLessThan(maxImportBytes)
    expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(
      maxImportBytes,
    )
    expectFatal(text, 'file-too-large')
  })

  it('counts nested array entries together and stops above the limit', () => {
    const firstNestedArrayLength = Math.floor((maxImportArrayEntries - 1) / 2)
    const secondNestedArrayLength = Math.ceil((maxImportArrayEntries - 1) / 2)
    const text = envelope({
      problems: [
        Array(firstNestedArrayLength).fill(null),
        Array(secondNestedArrayLength).fill(null),
      ],
    })
    expectFatal(text, 'too-many-entries')
  })

  it('reports a malformed optional section without blocking another section', () => {
    const result = normalizeImportFile(
      envelope({ problems: 'not-an-array', topics: ['Array'] }),
    )

    expect(result.status).toBe('valid')
    if (result.status !== 'valid')
      throw new Error('Expected valid sections to be retained')
    expect(result.document).toEqual({
      problems: [],
      tracks: [],
      topics: [],
      companies: [],
    })
    expect(result.diagnostics).toContainEqual({
      severity: 'error',
      code: 'invalid-section',
      path: 'problems',
      message: 'Expected an array or null.',
    })
  })

  it('ignores null optional sections', () => {
    const result = normalizeImportFile(envelope({ problems: null }))

    expect(result.status).toBe('valid')
    expect(result.diagnostics).toEqual([])
  })

  it('warns for unknown root fields', () => {
    const result = normalizeImportFile(envelope({ surprise: true }))

    expect(result.status).toBe('valid')
    expect(result.diagnostics).toContainEqual({
      severity: 'warning',
      code: 'unknown-field',
      path: '$.surprise',
      message: 'This field is not part of the cognipace-content format.',
    })
  })
})
