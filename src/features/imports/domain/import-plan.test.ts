import { expect, it } from 'vitest'

import { emptyImportState } from '../testing/import-fixtures'
import type { NormalizationResult } from './import-types'
import { normalizeImportFile } from './import-normalization'
import { buildImportPlan } from './import-plan'

function parse(document: unknown): NormalizationResult {
  return normalizeImportFile(JSON.stringify(document))
}

const envelope = { format: 'cognipace-content', version: 1 }

it('retains stored metadata and plans only missing label joins', () => {
  const state = emptyImportState()
  state.catalog.problems.push({
    slug: 'two-sum',
    title: 'My title',
    difficulty: 'hard',
    isPremium: true,
  })
  const input = normalizeImportFile(
    JSON.stringify({
      format: 'cognipace-content',
      version: 1,
      problems: [
        {
          slug: 'two-sum',
          title: 'Incoming title',
          difficulty: 'easy',
          topics: ['Array'],
        },
      ],
    }),
  )
  const plan = buildImportPlan(input, state)
  expect(plan.changes.catalog.problems).toEqual([])
  expect(plan.changes.catalog.topics).toEqual([{ id: 'array', label: 'Array' }])
  expect(plan.changes.catalog.problemTopics).toEqual([
    { problemSlug: 'two-sum', topicId: 'array' },
  ])
  expect(state.catalog.problems[0]?.title).toBe('My title')
  expect(plan.preview.additions.problems).toBe(0)
})

it('plans a large curriculum in source order without practice operations', () => {
  const problems = Array.from({ length: 250 }, (_, index) => `problem-${index}`)
  const plan = buildImportPlan(
    parse({
      ...envelope,
      tracks: [
        {
          slug: 'neetcode-250',
          groups: [{ slug: 'all', problems }],
        },
      ],
    }),
    emptyImportState(),
  )

  expect(plan.changes.catalog.problems).toHaveLength(250)
  expect(plan.changes.curriculum.memberships).toHaveLength(250)
  expect(plan.changes.curriculum.groups[0]?.position).toBe(1)
  expect(plan.changes.curriculum.memberships[0]?.position).toBe(1)
  expect(
    plan.changes.curriculum.memberships.map(({ problemSlug }) => problemSlug),
  ).toEqual(problems)
  expect(
    new Set(plan.changes.catalog.problems.map(({ slug }) => slug)).size,
  ).toBe(250)
  expect(plan.changes.curriculum).not.toHaveProperty('practice')
})

it('rebuilds to no additions after applying the planned rows in memory', () => {
  const state = emptyImportState()
  const input = parse({
    ...envelope,
    tracks: [
      {
        slug: 'essentials',
        groups: [{ slug: 'arrays', problems: ['two-sum'] }],
      },
    ],
  })
  const first = buildImportPlan(input, state)
  state.catalog.problems.push(...first.changes.catalog.problems)
  state.catalog.topics.push(...first.changes.catalog.topics)
  state.catalog.companies.push(...first.changes.catalog.companies)
  state.catalog.problemTopics.push(...first.changes.catalog.problemTopics)
  state.catalog.problemCompanies.push(...first.changes.catalog.problemCompanies)
  state.curriculum.tracks.push(...first.changes.curriculum.tracks)
  state.curriculum.groups.push(...first.changes.curriculum.groups)
  state.curriculum.memberships.push(...first.changes.curriculum.memberships)

  const second = buildImportPlan(input, state)
  expect([
    second.changes.catalog.problems.length,
    second.changes.catalog.topics.length,
    second.changes.catalog.companies.length,
    second.changes.catalog.problemTopics.length,
    second.changes.catalog.problemCompanies.length,
    second.changes.curriculum.tracks.length,
    second.changes.curriculum.groups.length,
    second.changes.curriculum.memberships.length,
  ]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
})

it('keeps existing unknown metadata unchanged when detailed values arrive', () => {
  const state = emptyImportState()
  state.catalog.problems.push({
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'unknown',
    isPremium: false,
  })
  const plan = buildImportPlan(
    parse({
      ...envelope,
      problems: [
        {
          slug: 'two-sum',
          title: 'Two Sum',
          difficulty: 'easy',
          isPremium: true,
        },
      ],
    }),
    state,
  )

  expect(plan.changes.catalog.problems).toEqual([])
  expect(plan.changes.catalog.problems).toHaveLength(0)
  expect(plan.preview.diagnostics.map(({ code }) => code)).toContain(
    'existing-value-preserved',
  )
})

it('reuses existing track and group identities while preserving their titles', () => {
  const state = emptyImportState()
  state.curriculum.tracks.push({
    id: 'local-track-id',
    slug: 'essentials',
    title: 'My Track',
    description: 'Local description',
    dueAt: 42,
  })
  state.curriculum.groups.push({
    id: 'local-track-id:arrays',
    trackId: 'local-track-id',
    title: 'My Arrays',
    position: 4,
  })
  const plan = buildImportPlan(
    parse({
      ...envelope,
      tracks: [
        {
          slug: 'essentials',
          title: 'Incoming Track',
          description: 'Incoming description',
          groups: [{ slug: 'arrays', title: 'Incoming Arrays', problems: [] }],
        },
      ],
    }),
    state,
  )

  expect(plan.changes.curriculum.tracks).toEqual([])
  expect(plan.changes.curriculum.groups).toEqual([])
  expect(plan.preview.items).toContainEqual(
    expect.objectContaining({ kind: 'tracks', identity: 'local-track-id' }),
  )
  expect(state.curriculum.tracks[0]?.title).toBe('My Track')
  expect(state.curriculum.groups[0]?.title).toBe('My Arrays')
})

it('appends new groups and memberships after local maximum positions', () => {
  const state = emptyImportState()
  state.curriculum.tracks.push({
    id: 'custom-id',
    slug: 'essentials',
    title: 'Local',
    description: null,
    dueAt: null,
  })
  state.curriculum.groups.push(
    {
      id: 'custom-id:existing',
      trackId: 'custom-id',
      title: 'Existing',
      position: 8,
    },
    {
      id: 'custom-id:other',
      trackId: 'custom-id',
      title: 'Other',
      position: 2,
    },
  )
  state.curriculum.memberships.push({
    trackId: 'custom-id',
    trackGroupId: 'custom-id:existing',
    problemSlug: 'old-problem',
    position: 13,
  })
  const plan = buildImportPlan(
    parse({
      ...envelope,
      tracks: [
        {
          slug: 'essentials',
          groups: [
            { slug: 'new', problems: ['new-problem'] },
            { slug: 'existing', problems: ['another-problem'] },
          ],
        },
      ],
    }),
    state,
  )

  expect(plan.changes.curriculum.groups).toEqual([
    {
      id: 'custom-id:new',
      trackId: 'custom-id',
      title: 'New',
      position: 9,
    },
  ])
  expect(plan.changes.curriculum.memberships).toEqual([
    {
      trackId: 'custom-id',
      trackGroupId: 'custom-id:new',
      problemSlug: 'new-problem',
      position: 1,
    },
    {
      trackId: 'custom-id',
      trackGroupId: 'custom-id:existing',
      problemSlug: 'another-problem',
      position: 14,
    },
  ])
  expect(state.curriculum.groups.map(({ position }) => position)).toEqual([
    8, 2,
  ])
})

it('preserves an existing problem placement requested in a different group', () => {
  const state = emptyImportState()
  state.catalog.problems.push({
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    isPremium: false,
  })
  state.curriculum.tracks.push({
    id: 'essentials',
    slug: 'essentials',
    title: 'Essentials',
    description: null,
    dueAt: null,
  })
  state.curriculum.groups.push(
    {
      id: 'essentials:arrays',
      trackId: 'essentials',
      title: 'Arrays',
      position: 0,
    },
    {
      id: 'essentials:strings',
      trackId: 'essentials',
      title: 'Strings',
      position: 1,
    },
  )
  state.curriculum.memberships.push({
    trackId: 'essentials',
    trackGroupId: 'essentials:arrays',
    problemSlug: 'two-sum',
    position: 0,
  })
  const plan = buildImportPlan(
    parse({
      ...envelope,
      tracks: [
        {
          slug: 'essentials',
          groups: [{ slug: 'strings', problems: ['two-sum'] }],
        },
      ],
    }),
    state,
  )

  expect(plan.changes.curriculum.memberships).toEqual([])
  expect(plan.preview.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'placement-preserved' }),
  )
})

it('does not infer child questions from a colliding group but keeps top-level problems', () => {
  const state = emptyImportState()
  state.curriculum.tracks.push({
    id: 'legacy',
    slug: 'legacy',
    title: 'Legacy',
    description: null,
    dueAt: null,
  })
  state.curriculum.groups.push({
    id: 'new-track:arrays',
    trackId: 'legacy',
    title: 'Legacy Arrays',
    position: 0,
  })
  const plan = buildImportPlan(
    parse({
      ...envelope,
      problems: ['top-level-problem'],
      tracks: [
        {
          slug: 'new-track',
          groups: [{ slug: 'arrays', problems: ['implicit-problem'] }],
        },
      ],
    }),
    state,
  )

  expect(plan.changes.catalog.problems.map(({ slug }) => slug)).toEqual([
    'top-level-problem',
  ])
  expect(plan.changes.curriculum.tracks).toEqual([])
  expect(plan.preview.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'identity-conflict' }),
  )
})

it('blocks a new track whose slug is already another track ID', () => {
  const state = emptyImportState()
  state.curriculum.tracks.push({
    id: 'neetcode-250',
    slug: 'my-local-track',
    title: 'My Local Track',
    description: null,
    dueAt: null,
  })
  const plan = buildImportPlan(
    parse({
      ...envelope,
      tracks: [
        {
          slug: 'neetcode-250',
          groups: [{ slug: 'all', problems: ['implicit-problem'] }],
        },
      ],
    }),
    state,
  )

  expect(plan.changes.curriculum.tracks).toEqual([])
  expect(plan.changes.curriculum.groups).toEqual([])
  expect(plan.changes.curriculum.memberships).toEqual([])
  expect(plan.changes.catalog.problems).toEqual([])
  expect(plan.preview.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'identity-conflict' }),
  )
})

it('does not guess a group identity from a matching existing display title', () => {
  const state = emptyImportState()
  state.curriculum.tracks.push({
    id: 'custom-track',
    slug: 'essentials',
    title: 'Essentials',
    description: null,
    dueAt: null,
  })
  state.curriculum.groups.push({
    id: 'custom-track:legacy-arrays',
    trackId: 'custom-track',
    title: 'Arrays',
    position: 0,
  })
  const plan = buildImportPlan(
    parse({
      ...envelope,
      tracks: [
        {
          slug: 'essentials',
          groups: [{ slug: 'arrays', problems: ['implicit-problem'] }],
        },
      ],
    }),
    state,
  )

  expect(plan.changes.curriculum.groups).toEqual([])
  expect(plan.changes.curriculum.memberships).toEqual([])
  expect(plan.changes.catalog.problems).toEqual([])
  expect(plan.preview.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'identity-conflict' }),
  )
})

it('links a topic alias to its canonical topic without creating another topic', () => {
  const state = emptyImportState()
  state.catalog.topics.push({ id: 'array', label: 'Arrays' })
  state.catalog.aliases.push({ aliasKey: 'sequence', topicId: 'array' })
  const plan = buildImportPlan(
    parse({
      ...envelope,
      problems: [{ slug: 'two-sum', topics: ['Sequence'] }],
    }),
    state,
  )

  expect(plan.changes.catalog.topics).toEqual([])
  expect(plan.changes.catalog.problemTopics).toEqual([
    { problemSlug: 'two-sum', topicId: 'array' },
  ])
})

it('skips an ambiguous normalized topic match instead of selecting a row by return order', () => {
  const state = emptyImportState()
  state.catalog.topics.push(
    { id: 'topic-one', label: 'Special Topic' },
    { id: 'topic-two', label: 'special-topic' },
  )
  const plan = buildImportPlan(
    parse({
      ...envelope,
      problems: [{ slug: 'two-sum', topics: ['Special Topic'] }],
    }),
    state,
  )

  expect(plan.changes.catalog.topics).toEqual([])
  expect(plan.changes.catalog.problemTopics).toEqual([])
  expect(plan.changes.catalog.problems.map(({ slug }) => slug)).toEqual([
    'two-sum',
  ])
  expect(plan.preview.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'ambiguous-topic' }),
  )
})

it('imports top-level taxonomy labels without requiring problem records', () => {
  const plan = buildImportPlan(
    parse({
      ...envelope,
      topics: ['Dynamic Programming'],
      companies: ['Example Co'],
    }),
    emptyImportState(),
  )

  expect(plan.changes.catalog.topics).toEqual([
    { id: 'dynamic-programming', label: 'Dynamic Programming' },
  ])
  expect(plan.changes.catalog.companies).toEqual([
    { id: 'example-co', label: 'Example Co' },
  ])
})

it('skips ambiguous normalized company labels without losing other labels', () => {
  const state = emptyImportState()
  state.catalog.companies.push(
    { id: 'company-one', label: 'Example Corp' },
    { id: 'company-two', label: 'example-corp' },
  )
  const plan = buildImportPlan(
    parse({
      ...envelope,
      problems: [
        {
          slug: 'two-sum',
          companies: ['Example Corp', 'Other Company'],
        },
      ],
    }),
    state,
  )

  expect(plan.changes.catalog.companies).toEqual([
    { id: 'other-company', label: 'Other Company' },
  ])
  expect(plan.changes.catalog.problemCompanies).toEqual([
    { problemSlug: 'two-sum', companyId: 'other-company' },
  ])
  expect(plan.preview.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'ambiguous-company' }),
  )
})

it('is deterministic when unordered database projections return in reverse order', () => {
  const state = emptyImportState()
  state.catalog.problems.push(
    {
      slug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'easy',
      isPremium: false,
    },
    {
      slug: 'valid-anagram',
      title: 'Valid Anagram',
      difficulty: 'easy',
      isPremium: false,
    },
  )
  state.catalog.topics.push(
    { id: 'array', label: 'Array' },
    { id: 'hash-table', label: 'Hash Table' },
  )
  state.catalog.problemTopics.push(
    { problemSlug: 'two-sum', topicId: 'array' },
    { problemSlug: 'valid-anagram', topicId: 'hash-table' },
  )
  const input = parse({
    ...envelope,
    problems: [
      { slug: 'two-sum', topics: ['Array', 'Hash Table'] },
      { slug: 'valid-anagram', topics: ['Hash Table', 'Array'] },
    ],
  })
  const first = buildImportPlan(input, state)
  const reversed = {
    catalog: {
      problems: [...state.catalog.problems].reverse(),
      topics: [...state.catalog.topics].reverse(),
      companies: [...state.catalog.companies].reverse(),
      aliases: [...state.catalog.aliases].reverse(),
      problemTopics: [...state.catalog.problemTopics].reverse(),
      problemCompanies: [...state.catalog.problemCompanies].reverse(),
    },
    curriculum: {
      tracks: [...state.curriculum.tracks].reverse(),
      groups: [...state.curriculum.groups].reverse(),
      memberships: [...state.curriculum.memberships].reverse(),
    },
  }
  const second = buildImportPlan(input, reversed)

  expect(second).toEqual(first)
  expect(second.fingerprintInput).toBe(first.fingerprintInput)
})

it('changes its fingerprint input when relevant stored identities or ordering change', () => {
  const state = emptyImportState()
  state.curriculum.tracks.push({
    id: 'essentials',
    slug: 'essentials',
    title: 'Essentials',
    description: null,
    dueAt: null,
  })
  state.curriculum.groups.push({
    id: 'essentials:arrays',
    trackId: 'essentials',
    title: 'Arrays',
    position: 0,
  })
  state.catalog.topics.push({ id: 'array', label: 'Array' })
  state.catalog.aliases.push({ aliasKey: 'sequence', topicId: 'array' })
  const input = parse({
    ...envelope,
    problems: [{ slug: 'two-sum', topics: ['Sequence'] }],
    tracks: [
      {
        slug: 'essentials',
        groups: [{ slug: 'arrays', problems: ['two-sum'] }],
      },
    ],
  })
  const original = buildImportPlan(input, state).fingerprintInput
  state.curriculum.tracks[0]!.title = 'Changed title'
  state.curriculum.groups[0]!.position = 9
  state.catalog.aliases[0]!.topicId = 'different-topic'

  expect(buildImportPlan(input, state).fingerprintInput).not.toBe(original)
})

it('returns empty for null or empty sections and blocked with no writes for fatal input', () => {
  const empty = buildImportPlan(
    parse({
      ...envelope,
      problems: null,
      tracks: [],
      companies: null,
      topics: [],
    }),
    emptyImportState(),
  )
  expect(empty.preview.status).toBe('empty')

  const blocked = buildImportPlan(
    {
      status: 'blocked',
      diagnostics: [
        { severity: 'error', code: 'invalid-json', path: '$', message: 'bad' },
      ],
    },
    emptyImportState(),
  )
  expect(blocked.preview.status).toBe('blocked')
  expect(
    [
      blocked.changes.catalog.problems,
      blocked.changes.catalog.topics,
      blocked.changes.catalog.companies,
      blocked.changes.catalog.problemTopics,
      blocked.changes.catalog.problemCompanies,
      blocked.changes.curriculum.tracks,
      blocked.changes.curriculum.groups,
      blocked.changes.curriculum.memberships,
    ].every((rows) => rows.length === 0),
  ).toBe(true)
})

it('counts exactly the eight change arrays and leaves unchanged input objects alone', () => {
  const state = emptyImportState()
  const input = parse({ ...envelope, problems: ['two-sum'] })
  const before = JSON.stringify({ state, input })
  const plan = buildImportPlan(input, state)

  expect(plan.preview.additions).toEqual({
    problems: plan.changes.catalog.problems.length,
    topics: plan.changes.catalog.topics.length,
    companies: plan.changes.catalog.companies.length,
    problemTopics: plan.changes.catalog.problemTopics.length,
    problemCompanies: plan.changes.catalog.problemCompanies.length,
    tracks: plan.changes.curriculum.tracks.length,
    groups: plan.changes.curriculum.groups.length,
    memberships: plan.changes.curriculum.memberships.length,
  })
  expect(JSON.stringify({ state, input })).toBe(before)
})

it('keeps input retained labels and reports existing scalar values without updating them', () => {
  const state = emptyImportState()
  state.catalog.problems.push({
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'hard',
    isPremium: true,
  })
  state.catalog.topics.push({ id: 'array', label: 'Array' })
  state.catalog.problemTopics.push({ problemSlug: 'two-sum', topicId: 'array' })
  const plan = buildImportPlan(
    parse({
      ...envelope,
      problems: [{ slug: 'two-sum', title: 'Different', topics: ['Array'] }],
    }),
    state,
  )

  expect(plan.changes.catalog.problems).toEqual([])
  expect(plan.changes.catalog.problemTopics).toEqual([])
  expect(plan.preview.items).toContainEqual(
    expect.objectContaining({
      kind: 'problems',
      identity: 'two-sum',
      action: 'retain',
    }),
  )
  expect(plan.preview.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'existing-value-preserved' }),
  )
})

it('distinguishes empty, unchanged, and ready plans', () => {
  const unchangedState = emptyImportState()
  unchangedState.catalog.problems.push({
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'unknown',
    isPremium: false,
  })
  expect(
    buildImportPlan(
      parse({ ...envelope, problems: ['two-sum'] }),
      unchangedState,
    ).preview.status,
  ).toBe('unchanged')
  expect(
    buildImportPlan(
      parse({ ...envelope, problems: ['two-sum'] }),
      emptyImportState(),
    ).preview.status,
  ).toBe('ready')
})
