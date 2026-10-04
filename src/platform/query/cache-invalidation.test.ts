import { QueryClient, QueryObserver } from '@tanstack/react-query'

import { describe, expect, it, vi } from 'vitest'

import {
  invalidateTaggedQueries,
  readQueryKeysForInvalidation,
} from './cache-invalidation'
import { queryKeys } from './query-keys'

describe('cache invalidation query-key mapping', () => {
  it('maps feature tags to every mounted query family they can affect', () => {
    expect(readQueryKeysForInvalidation(['app-shell'])).toEqual([
      ['app-shell-data'],
    ])
    expect(readQueryKeysForInvalidation(['queue'])).toEqual([['today-queue']])
    expect(readQueryKeysForInvalidation(['settings'])).toEqual([
      ['settings'],
      ['app-shell-data'],
      ['analytics'],
      ['practice-details'],
      ['today-queue'],
      ['tracks'],
      ['problems'],
    ])
    expect(readQueryKeysForInvalidation(['tracks'])).toEqual([
      ['tracks'],
      ['app-shell-data'],
    ])
    expect(readQueryKeysForInvalidation(['problems'])).toEqual([
      ['problems'],
      ['app-shell-data'],
      ['analytics'],
      ['practice-details'],
      ['today-queue'],
      ['tracks'],
    ])
  })

  it('invalidates Analytics after problem topic metadata changes', () => {
    expect(readQueryKeysForInvalidation(['problems'])).toContainEqual(
      queryKeys.analytics.all,
    )
  })

  it('deduplicates query families when multiple tags overlap', () => {
    expect(
      readQueryKeysForInvalidation(['settings', 'practice', 'queue']),
    ).toEqual([
      ['settings'],
      ['app-shell-data'],
      ['analytics'],
      ['practice-details'],
      ['today-queue'],
      ['tracks'],
      ['problems'],
    ])
  })

  it('keeps track and problem invalidation linked for shared track rows', () => {
    expect(readQueryKeysForInvalidation(['tracks'])).toContainEqual(['tracks'])
    expect(readQueryKeysForInvalidation(['tracks'])).toContainEqual([
      'app-shell-data',
    ])
    expect(readQueryKeysForInvalidation(['problems'])).toContainEqual([
      'tracks',
    ])
  })

  it('practice tag alone covers every practice-derived read model', () => {
    expect(readQueryKeysForInvalidation(['practice'])).toEqual([
      ['practice-details'],
      ['analytics'],
      ['today-queue'],
      ['tracks'],
      ['problems'],
      ['app-shell-data'],
    ])
  })
})

it('increments a volatile GenAI revision synchronously and targets availability', () => {
  const client = new QueryClient()
  expect(readQueryKeysForInvalidation(['genai'])).toEqual([
    ['genai'],
    ['app-shell-data'],
  ])
  void invalidateTaggedQueries(client, ['genai', 'genai'])
  expect(client.getQueryData(queryKeys.genai.configurationRevision())).toBe(1)
  void invalidateTaggedQueries(client, ['settings'])
  expect(client.getQueryData(queryKeys.genai.configurationRevision())).toBe(1)
  void invalidateTaggedQueries(client, ['genai'])
  expect(client.getQueryData(queryKeys.genai.configurationRevision())).toBe(2)
  client.clear()
})

it('retains the volatile revision even with short query garbage collection', async () => {
  vi.useFakeTimers()
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 1 } } })
  try {
    void invalidateTaggedQueries(client, ['genai'])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(client.getQueryData(queryKeys.genai.configurationRevision())).toBe(1)
    void invalidateTaggedQueries(client, ['genai'])
    expect(client.getQueryData(queryKeys.genai.configurationRevision())).toBe(2)
  } finally {
    client.clear()
    vi.useRealTimers()
  }
})

it.each([
  ['presence', queryKeys.genai.secretPresence(), ['genai']],
  ['availability', queryKeys.appShell.dashboard(), ['genai']],
  ['settings', queryKeys.settings.all, ['settings', 'genai']],
] as const)(
  'cancels an initial remote %s read before refetching saved state',
  async (_label, queryKey, tags) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    let finishOld!: (value: boolean) => void
    const read = vi
      .fn<() => Promise<boolean>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve
          }),
      )
      .mockResolvedValue(true)
    const observer = new QueryObserver(client, { queryKey, queryFn: read })
    const unsubscribe = observer.subscribe(() => {})
    try {
      expect(read).toHaveBeenCalledTimes(1)
      const invalidation = invalidateTaggedQueries(client, tags)
      expect(client.getQueryData(queryKeys.genai.configurationRevision())).toBe(
        1,
      )
      await invalidation
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2))
      finishOld(false)
      await vi.waitFor(() => expect(client.getQueryData(queryKey)).toBe(true))
    } finally {
      unsubscribe()
      client.clear()
    }
  },
)
