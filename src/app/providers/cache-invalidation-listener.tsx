import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { cacheInvalidationEventSchema, onMessage } from '@/extension/messaging'
import {
  invalidateTaggedQueries,
  type CacheInvalidationTag,
} from '@/platform/query/cache-invalidation'

const dataReplacementTags = [
  'settings',
  'genai',
  'problems',
  'practice',
  'queue',
  'tracks',
  'app-shell',
] as const satisfies readonly CacheInvalidationTag[]

export function CacheInvalidationListener() {
  const queryClient = useQueryClient()

  useEffect(() => {
    return onMessage('cache.invalidate', ({ data }) => {
      const event = cacheInvalidationEventSchema.parse(data)

      const resetsLocalData =
        event.source === 'dashboard' &&
        event.reason === 'problem-catalog-updated' &&
        dataReplacementTags.every((tag) => event.tags.includes(tag))

      if (resetsLocalData) {
        void invalidateTaggedQueries(queryClient, event.tags, {
          resetHintConnection: true,
        })
      } else {
        void invalidateTaggedQueries(queryClient, event.tags)
      }

      return null
    })
  }, [queryClient])

  return null
}
