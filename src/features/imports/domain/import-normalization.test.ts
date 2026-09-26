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
      envelope({
        tracks: 'not-an-array',
        problems: ['two-sum'],
        topics: ['Array'],
      }),
    )

    expect(result.status).toBe('valid')
    if (result.status !== 'valid')
      throw new Error('Expected valid sections to be retained')
    expect(result.document).toEqual({
      problems: [
        {
          slug: 'two-sum',
          path: 'problems[0]',
          title: null,
          difficulty: null,
          isPremium: null,
          topics: [],
          companies: [],
        },
      ],
      tracks: [],
      topics: [{ label: 'Array', path: 'topics[0]' }],
      companies: [],
    })
    expect(result.diagnostics).toContainEqual({
      severity: 'error',
      code: 'invalid-section',
      path: 'tracks',
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

it('folds explicit metadata before assigning defaults', () => {
  const result = normalizeImportFile(
    JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      problems: [
        'two-sum',
        {
          slug: 'two-sum',
          title: ' Two Sum ',
          difficulty: ' EASY ',
          topics: [null, ' Array '],
        },
      ],
    }),
  )
  expect(result.status).toBe('valid')
  if (result.status !== 'valid') throw new Error('Expected a valid document')
  expect(result.document.problems).toHaveLength(1)
  expect(result.document.problems[0]).toMatchObject({
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    isPremium: null,
    topics: [{ label: 'Array', path: 'problems[1].topics[1]' }],
  })
  expect(result.diagnostics).toEqual([])
})

function expectDiagnosticPaths(
  result: ReturnType<typeof normalizeImportFile>,
  expected: { code: string; path: string }[],
) {
  expect(result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual(
    expected,
  )
}

function expectValid(text: string) {
  const result = normalizeImportFile(text)
  expect(result.status).toBe('valid')
  if (result.status !== 'valid') throw new Error('Expected a valid document')
  return result
}

describe('normalizeImportFile entries and duplicate folding', () => {
  it.each([
    {
      name: 'accepts a null slug with a valid URL',
      entry: {
        slug: null,
        url: 'https://leetcode.com/problems/two-sum/',
      },
      problems: [
        {
          slug: 'two-sum',
          path: 'problems[0]',
          title: null,
          difficulty: null,
          isPremium: null,
          topics: [],
          companies: [],
        },
      ],
      diagnostics: [],
    },
    {
      name: 'rejects a raw slug in the strict URL property',
      entry: { slug: 'two-sum', url: 'two-sum' },
      problems: [],
      diagnostics: [{ code: 'invalid-identity', path: 'problems[0].url' }],
    },
    {
      name: 'rejects an invalid supplied slug even when URL is valid',
      entry: {
        slug: 'Two Sum',
        url: 'https://leetcode.com/problems/two-sum/',
      },
      problems: [],
      diagnostics: [{ code: 'invalid-identity', path: 'problems[0].slug' }],
    },
    {
      name: 'rejects disagreeing valid slug and URL identities',
      entry: {
        slug: 'two-sum',
        url: 'https://leetcode.com/problems/three-sum/',
      },
      problems: [],
      diagnostics: [{ code: 'identity-conflict', path: 'problems[0]' }],
    },
  ])('$name', ({ entry, problems, diagnostics }) => {
    const result = expectValid(envelope({ problems: [entry] }))
    expect(result.document.problems).toEqual(problems)
    expectDiagnosticPaths(result, diagnostics)
  })

  it('keeps an unknown difficulty question and warns at its field', () => {
    const result = expectValid(
      envelope({
        problems: [
          {
            slug: 'two-sum',
            title: 'Two Sum',
            difficulty: 'extreme',
            topics: ['Array'],
          },
        ],
      }),
    )
    expect(result.document.problems).toMatchObject([
      {
        slug: 'two-sum',
        title: 'Two Sum',
        difficulty: null,
        topics: [{ label: 'Array', path: 'problems[0].topics[0]' }],
      },
    ])
    expectDiagnosticPaths(result, [
      { code: 'invalid-difficulty', path: 'problems[0].difficulty' },
    ])
  })

  it('warns for malformed title without discarding valid sibling fields', () => {
    const result = expectValid(
      envelope({
        problems: [
          {
            slug: 'two-sum',
            title: 42,
            difficulty: 'hard',
            topics: ['Array'],
          },
        ],
      }),
    )
    expect(result.document.problems).toMatchObject([
      {
        slug: 'two-sum',
        title: null,
        difficulty: 'hard',
        topics: [{ label: 'Array', path: 'problems[0].topics[0]' }],
      },
    ])
    expectDiagnosticPaths(result, [
      { code: 'invalid-field', path: 'problems[0].title' },
    ])
  })

  it('does not coerce an invalid premium value', () => {
    const result = expectValid(
      envelope({
        problems: [
          {
            slug: 'two-sum',
            title: 'Two Sum',
            difficulty: 'easy',
            topics: ['Array'],
            isPremium: 'false',
          },
        ],
      }),
    )
    expect(result.document.problems).toMatchObject([
      {
        slug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        topics: [{ label: 'Array', path: 'problems[0].topics[0]' }],
        isPremium: null,
      },
    ])
    expectDiagnosticPaths(result, [
      { code: 'invalid-field', path: 'problems[0].isPremium' },
    ])
  })

  it.each([
    ['null and empty labels', null, []],
    ['empty label lists', [], []],
  ])(
    'treats %s as no label additions or deletions',
    (_name, labels, expected) => {
      const result = expectValid(
        envelope({
          problems: [{ slug: 'two-sum', topics: labels, companies: labels }],
          topics: labels,
          companies: labels,
        }),
      )
      expect(result.document.problems[0]?.topics).toEqual(expected)
      expect(result.document.problems[0]?.companies).toEqual(expected)
      expect(result.document.topics).toEqual(expected)
      expect(result.document.companies).toEqual(expected)
      expect(result.diagnostics).toEqual([])
    },
  )

  it('preserves valid label and reference siblings with exact bad-item paths', () => {
    const result = expectValid(
      envelope({
        problems: [
          {
            slug: 'two-sum',
            topics: [' Array   And   Hashing ', 4, '!!!'],
          },
        ],
        tracks: [
          {
            slug: 'essentials',
            groups: [
              {
                slug: 'arrays',
                problems: ['two-sum', 4, 'Two Sum'],
              },
            ],
          },
        ],
      }),
    )
    expect(result.document.problems[0]?.topics).toEqual([
      { label: 'Array And Hashing', path: 'problems[0].topics[0]' },
    ])
    expect(result.document.tracks[0]?.groups[0]?.problems).toEqual([
      { slug: 'two-sum', path: 'tracks[0].groups[0].problems[0]' },
    ])
    expectDiagnosticPaths(result, [
      { code: 'invalid-label', path: 'problems[0].topics[1]' },
      { code: 'invalid-label', path: 'problems[0].topics[2]' },
      { code: 'invalid-reference', path: 'tracks[0].groups[0].problems[1]' },
      { code: 'invalid-reference', path: 'tracks[0].groups[0].problems[2]' },
    ])
  })

  it('does not parse references from a group with an invalid identity', () => {
    const result = expectValid(
      envelope({
        tracks: [
          {
            slug: 'essentials',
            groups: [{ slug: 'array group', problems: ['two-sum'] }],
          },
        ],
      }),
    )
    expect(result.document.tracks).toEqual([])
    expect(result.document.problems).toEqual([])
    expectDiagnosticPaths(result, [
      { code: 'invalid-identity', path: 'tracks[0].groups[0].slug' },
    ])
  })

  it('drops an invalid track identity and its otherwise valid child references', () => {
    const result = expectValid(
      envelope({
        tracks: [
          {
            slug: 'Invalid Track!',
            groups: [{ slug: 'arrays', problems: ['two-sum'] }],
          },
        ],
      }),
    )
    expect(result.document.tracks).toEqual([])
    expect(result.document.problems).toEqual([])
    expectDiagnosticPaths(result, [
      { code: 'invalid-identity', path: 'tracks[0].slug' },
    ])
  })

  it('retains explicitly empty groups and drops a group when all refs are invalid', () => {
    const result = expectValid(
      envelope({
        tracks: [
          {
            slug: 'essentials',
            groups: [
              { slug: 'empty', problems: null },
              { slug: 'invalid', problems: ['Two Sum', 4] },
            ],
          },
        ],
      }),
    )
    expect(result.document.tracks).toMatchObject([
      { slug: 'essentials', groups: [{ slug: 'empty', problems: [] }] },
    ])
    expectDiagnosticPaths(result, [
      { code: 'invalid-reference', path: 'tracks[0].groups[1].problems[0]' },
      { code: 'invalid-reference', path: 'tracks[0].groups[1].problems[1]' },
    ])

    const allInvalid = expectValid(
      envelope({
        tracks: [
          {
            slug: 'essentials',
            groups: [{ slug: 'invalid', problems: ['Two Sum'] }],
          },
        ],
      }),
    )
    expect(allInvalid.document.tracks).toEqual([])
    expectDiagnosticPaths(allInvalid, [
      { code: 'invalid-reference', path: 'tracks[0].groups[0].problems[0]' },
    ])
  })

  it('skips groups whose problems field has the wrong type', () => {
    const result = expectValid(
      envelope({
        tracks: [
          {
            slug: 'essentials',
            groups: [
              { slug: 'wrong-type', problems: 'two-sum' },
              { slug: 'empty', problems: [] },
            ],
          },
        ],
      }),
    )
    expect(result.document.tracks).toMatchObject([
      { groups: [{ slug: 'empty', problems: [] }] },
    ])
    expectDiagnosticPaths(result, [
      { code: 'invalid-field', path: 'tracks[0].groups[0].problems' },
    ])
  })

  it('does not synthesize question drafts from track references', () => {
    const result = expectValid(
      envelope({
        tracks: [
          {
            slug: 'essentials',
            groups: [{ slug: 'arrays', problems: ['two-sum'] }],
          },
        ],
      }),
    )
    expect(result.document.problems).toEqual([])
    expect(result.document.tracks[0]?.groups[0]?.problems).toEqual([
      { slug: 'two-sum', path: 'tracks[0].groups[0].problems[0]' },
    ])
    expect(result.diagnostics).toEqual([])
  })

  it('folds duplicate track and group identities, keeping first explicit scalars', () => {
    const result = expectValid(
      envelope({
        tracks: [
          {
            slug: 'essentials',
            title: ' Essentials ',
            groups: [
              {
                slug: 'arrays',
                title: ' Array Basics ',
                problems: ['two-sum'],
              },
            ],
          },
          {
            slug: 'essentials',
            title: 'Renamed',
            description: ' Added later ',
            groups: [
              { slug: 'arrays', title: 'Arrays', problems: ['three-sum'] },
            ],
          },
        ],
      }),
    )
    expect(result.document.tracks).toEqual([
      {
        slug: 'essentials',
        path: 'tracks[0]',
        title: 'Essentials',
        description: 'Added later',
        groups: [
          {
            slug: 'arrays',
            path: 'tracks[0].groups[0]',
            title: 'Array Basics',
            problems: [
              { slug: 'two-sum', path: 'tracks[0].groups[0].problems[0]' },
              { slug: 'three-sum', path: 'tracks[1].groups[0].problems[0]' },
            ],
          },
        ],
      },
    ])
    expectDiagnosticPaths(result, [
      { code: 'conflicting-value', path: 'tracks[1].title' },
      { code: 'conflicting-value', path: 'tracks[1].groups[0].title' },
    ])
  })

  it('keeps first question scalars and first group placement across duplicates', () => {
    const result = expectValid(
      envelope({
        problems: [
          'two-sum',
          {
            slug: 'two-sum',
            title: 'Two Sum',
            difficulty: 'easy',
            isPremium: false,
            topics: ['Array'],
            companies: ['Acme'],
          },
          {
            slug: 'two-sum',
            title: 'Renamed',
            difficulty: 'hard',
            isPremium: true,
            topics: ['array', 'Dynamic Programming'],
            companies: ['ACME', 'Beta'],
          },
          {
            slug: 'three-sum',
            title: 'Renamed',
            difficulty: 'hard',
            isPremium: true,
          },
        ],
        tracks: [
          {
            slug: 'essentials',
            groups: [
              { slug: 'arrays', problems: ['two-sum'] },
              { slug: 'review', problems: ['two-sum'] },
              { slug: 'arrays', problems: ['three-sum'] },
            ],
          },
        ],
      }),
    )
    expect(result.document.problems).toEqual([
      {
        slug: 'two-sum',
        path: 'problems[0]',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
        topics: [
          { label: 'Array', path: 'problems[1].topics[0]' },
          {
            label: 'Dynamic Programming',
            path: 'problems[2].topics[1]',
          },
        ],
        companies: [
          { label: 'Acme', path: 'problems[1].companies[0]' },
          { label: 'Beta', path: 'problems[2].companies[1]' },
        ],
      },
      {
        slug: 'three-sum',
        path: 'problems[3]',
        title: 'Renamed',
        difficulty: 'hard',
        isPremium: true,
        topics: [],
        companies: [],
      },
    ])
    expect(
      result.document.tracks[0]?.groups.map((group) => group.slug),
    ).toEqual(['arrays', 'review'])
    expect(result.document.tracks[0]?.groups[0]?.problems).toEqual([
      { slug: 'two-sum', path: 'tracks[0].groups[0].problems[0]' },
      { slug: 'three-sum', path: 'tracks[0].groups[2].problems[0]' },
    ])
    expect(result.document.tracks[0]?.groups[1]?.problems).toEqual([])
    expectDiagnosticPaths(result, [
      { code: 'conflicting-value', path: 'problems[2].title' },
      { code: 'conflicting-value', path: 'problems[2].difficulty' },
      { code: 'conflicting-value', path: 'problems[2].isPremium' },
      { code: 'placement-preserved', path: 'tracks[0].groups[1].problems[0]' },
    ])
  })

  it('treats unknown difficulty as an explicit value when folding duplicates', () => {
    const result = expectValid(
      envelope({
        problems: [
          { slug: 'two-sum', difficulty: 'unknown' },
          { slug: 'two-sum', difficulty: 'easy' },
        ],
      }),
    )
    expect(result.document.problems).toMatchObject([
      { slug: 'two-sum', difficulty: 'unknown' },
    ])
    expectDiagnosticPaths(result, [
      { code: 'conflicting-value', path: 'problems[1].difficulty' },
    ])
  })

  it('treats blank optional text as absent so a later explicit value can fill it', () => {
    const result = expectValid(
      envelope({
        problems: [
          { slug: 'two-sum', title: '   ' },
          { slug: 'two-sum', title: ' Two Sum ' },
        ],
      }),
    )
    expect(result.document.problems).toMatchObject([
      { slug: 'two-sum', title: 'Two Sum' },
    ])
    expect(result.diagnostics).toEqual([])
  })

  it('warns on unknown root and nested keys while retaining known values', () => {
    const result = expectValid(
      envelope({
        surprise: true,
        'strange.key': true,
        problems: [
          {
            slug: 'two-sum',
            mystery: true,
            'more.data': true,
            title: 'Two Sum',
          },
        ],
        tracks: [
          {
            slug: 'essentials',
            extra: true,
            groups: [{ slug: 'arrays', extra: true, problems: ['two-sum'] }],
          },
        ],
      }),
    )
    expect(result.document.problems).toMatchObject([
      { slug: 'two-sum', title: 'Two Sum' },
    ])
    expect(result.document.tracks).toMatchObject([
      { slug: 'essentials', groups: [{ slug: 'arrays' }] },
    ])
    expectDiagnosticPaths(result, [
      { code: 'unknown-field', path: '$.surprise' },
      { code: 'unknown-field', path: '$["strange.key"]' },
      { code: 'unknown-field', path: 'problems[0].mystery' },
      { code: 'unknown-field', path: 'problems[0]["more.data"]' },
      { code: 'unknown-field', path: 'tracks[0].extra' },
      { code: 'unknown-field', path: 'tracks[0].groups[0].extra' },
    ])
  })

  it('unions labels by the existing normalized topic key', () => {
    const result = expectValid(
      envelope({
        topics: [
          'Array And Hashing',
          'array and hashing',
          'Array   And   Hashing',
        ],
        companies: ['Acme, Inc.', 'acme inc'],
      }),
    )
    expect(result.document.topics).toEqual([
      { label: 'Array And Hashing', path: 'topics[0]' },
    ])
    expect(result.document.companies).toEqual([
      { label: 'Acme, Inc.', path: 'companies[0]' },
    ])
  })
})
