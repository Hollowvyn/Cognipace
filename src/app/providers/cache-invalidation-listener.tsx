import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { cacheInvalidationEventSchema, onMessage } from '@/extension/messaging'
import { invalidateTaggedQueries } from '@/platform/query/cache-invalidation'

export function CacheInvalidationListener() {
  const queryClient = useQueryClient()

  useEffect(() => {
    return onMessage('cache.invalidate', ({ data }) => {
      const event = cacheInvalidationEventSchema.parse(data)

      void invalidateTaggedQueries(queryClient, event.tags)

      return null
    })
  }, [queryClient])

  return null
}
