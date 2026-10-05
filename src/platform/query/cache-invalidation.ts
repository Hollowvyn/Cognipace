import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { queryKeys } from './query-keys'

export const cacheInvalidationTags = [
  'analytics',
  'app-shell',
  'genai',
  'practice',
  'problems',
  'queue',
  'settings',
  'sync',
  'tracks',
] as const

export type CacheInvalidationTag = (typeof cacheInvalidationTags)[number]

const queryKeysByInvalidationTag = {
  analytics: [queryKeys.analytics.all],
  'app-shell': [queryKeys.appShell.all],
  genai: [queryKeys.genai.all, queryKeys.appShell.all],
  practice: [
    queryKeys.practice.all,
    queryKeys.analytics.all,
    queryKeys.queue.all,
    queryKeys.tracks.all,
    queryKeys.problems.all,
    queryKeys.appShell.all,
  ],
  problems: [
    queryKeys.problems.all,
    queryKeys.appShell.all,
    queryKeys.analytics.all,
    queryKeys.practice.all,
    queryKeys.queue.all,
    queryKeys.tracks.all,
  ],
  queue: [queryKeys.queue.all],
  settings: [
    queryKeys.settings.all,
    queryKeys.appShell.all,
    queryKeys.analytics.all,
    queryKeys.practice.all,
    queryKeys.queue.all,
    queryKeys.tracks.all,
    queryKeys.problems.all,
  ],
  sync: [queryKeys.sync.all, queryKeys.backup.pendingReplacement()],
  tracks: [queryKeys.tracks.all, queryKeys.appShell.all],
} satisfies Record<CacheInvalidationTag, readonly QueryKey[]>

export function readQueryKeysForInvalidation(
  tags: readonly CacheInvalidationTag[],
) {
  const seen = new Set<string>()
  const queryKeysToInvalidate: QueryKey[] = []

  for (const tag of tags) {
    for (const queryKey of queryKeysByInvalidationTag[tag]) {
      const key = JSON.stringify(queryKey)

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      queryKeysToInvalidate.push(queryKey)
    }
  }

  return queryKeysToInvalidate
}

export function invalidateTaggedQueries(
  queryClient: QueryClient,
  tags: readonly CacheInvalidationTag[],
): Promise<void> {
  const scheduleInvalidation = () => {
    for (const queryKey of readQueryKeysForInvalidation(tags)) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }
  if (tags.includes('genai')) {
    queryClient.setQueryDefaults(queryKeys.genai.configurationRevision(), {
      gcTime: Infinity,
    })
    queryClient.setQueryData<number>(
      queryKeys.genai.configurationRevision(),
      (revision) => (revision ?? 0) + 1,
    )
    // Initial reads have no cached data and invalidateQueries can reuse them.
    // Cancel before refetch, and return only cancellation/scheduling completion.
    return Promise.all([
      queryClient.cancelQueries({ queryKey: queryKeys.genai.secretPresence() }),
      queryClient.cancelQueries({ queryKey: queryKeys.appShell.all }),
      ...(tags.includes('settings')
        ? [queryClient.cancelQueries({ queryKey: queryKeys.settings.all })]
        : []),
    ]).then(scheduleInvalidation)
  }
  scheduleInvalidation()
  return Promise.resolve()
}
