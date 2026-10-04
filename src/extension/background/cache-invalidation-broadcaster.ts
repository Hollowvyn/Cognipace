import { browser } from 'wxt/browser'

import {
  cacheInvalidationEventSchema,
  sendMessage,
  type CacheInvalidationEvent,
} from '@/extension/messaging'
import type { CacheInvalidationTag } from '@/platform/query/cache-invalidation'

import { abortLeetCodeAnalyses } from './leetcode-analysis-operations'

type CacheInvalidationReason = CacheInvalidationEvent['reason']

type BroadcastCacheInvalidationInput = {
  problemSlug?: string
  reason: CacheInvalidationReason
  source: CacheInvalidationEvent['source']
  tags: readonly CacheInvalidationTag[]
}

const leetcodeProblemUrlMatches = [
  'https://leetcode.com/problems/*',
  'https://www.leetcode.com/problems/*',
]

export async function broadcastCacheInvalidation(
  input: BroadcastCacheInvalidationInput,
) {
  const event = cacheInvalidationEventSchema.parse({
    ...input,
    emittedAt: new Date().toISOString(),
  })

  if (event.tags.includes('genai')) abortLeetCodeAnalyses()

  await Promise.all([
    sendRuntimeCacheInvalidation(event),
    sendLeetCodeTabCacheInvalidations(event),
  ])

  return event
}

async function sendRuntimeCacheInvalidation(event: CacheInvalidationEvent) {
  try {
    await sendMessage('cache.invalidate', event)
  } catch {
    // Extension pages are often closed; cache sync is best-effort per surface.
  }
}

async function sendLeetCodeTabCacheInvalidations(
  event: CacheInvalidationEvent,
) {
  let tabs: Array<{ id?: number | undefined }>

  try {
    tabs = await browser.tabs.query({ url: leetcodeProblemUrlMatches })
  } catch {
    return
  }

  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) {
        return
      }

      try {
        await sendMessage('cache.invalidate', event, tab.id)
      } catch {
        // Some matching tabs may not have the CogniPace content script mounted.
      }
    }),
  )
}
