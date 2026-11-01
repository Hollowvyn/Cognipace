import { z } from 'zod'
import { archiveStoreNames } from './local-idb-schema'
import type { LocalStores } from './local-store-types'

// Readiness proves publication provenance, not an immutable content digest.
// Active Notes writes legitimately change a previously imported generation.
export const archiveGenerationProgressSchema = z
  .object({
    identity: z.string().min(1),
    status: z.enum(['staging', 'ready']),
    storeIndex: z.number().int().min(0).max(5),
    lastKey: z.custom<IDBValidKey>().optional(),
  })
  .refine((value) => value.status !== 'ready' || value.storeIndex === 5)
export const initialArchiveMarker = {
  identity: 'initial:empty',
  status: 'ready',
  storeIndex: 5,
} as const
export function assertReadyArchive(value: unknown) {
  const marker = archiveGenerationProgressSchema.safeParse(value)
  if (!marker.success || marker.data.status !== 'ready')
    throw new Error(
      'Recovery required: archive generation readiness is missing or invalid.',
    )
}
export function readReadyArchive(
  records: IDBObjectStore,
  generation: string,
  ready: () => void,
  fail: (error: unknown) => void,
) {
  const request = records.get(['archive-generation', generation])
  request.onsuccess = () => {
    try {
      assertReadyArchive(request.result)
      ready()
    } catch (error) {
      fail(error)
    }
  }
}
// Missing active is fresh only if no core/archive/domain evidence survives.
// Historical opaque Chrome recovery records alone do not establish a v2 head.
export function assertFreshLocalStores(
  stores: LocalStores,
  ready: () => void,
  fail: (error: unknown) => void,
) {
  const names = ['coreSnapshots', ...archiveStoreNames]
  let remaining = names.length + 1
  const next = () => {
    if (--remaining === 0) ready()
  }
  for (const name of names) {
    const request = stores[name]!.count()
    request.onsuccess = () => {
      if (request.result)
        fail(
          new Error(
            'Recovery required: active head is missing with surviving local data.',
          ),
        )
      else next()
    }
  }
  const records = stores.records!.openKeyCursor()
  records.onsuccess = () => {
    const cursor = records.result
    if (!cursor) {
      next()
      return
    }
    const key = cursor.key
    if (
      (Array.isArray(key) &&
        typeof key[0] === 'string' &&
        [
          'archive-generation',
          'composite-candidate',
          'notes-command',
          'notes-ai-command',
          'notes-outbox',
          'notes-edit-lease',
        ].includes(key[0])) ||
      key === 'recovery' ||
      key === 'replacement-continuation'
    ) {
      fail(
        new Error(
          'Recovery required: active head is missing with surviving local roots.',
        ),
      )
      return
    }
    cursor.continue()
  }
}
