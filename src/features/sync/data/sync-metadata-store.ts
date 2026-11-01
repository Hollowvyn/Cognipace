import { readLocalDataHead } from '@/platform/db/instance'
import { z } from 'zod'

import {
  syncActionReasonSchema,
  syncConflictSummarySchema,
  syncErrorSummarySchema,
} from '../api/sync-contracts'

const syncMetadataKey = 'cognipace_sync_metadata_v1'

const syncMetadataSchema = z.strictObject({
  enabled: z.boolean(),
  gistId: z.string().nullable(),
  lastSyncAt: z.iso.datetime().nullable(),
  lastSyncDirection: z.enum(['push', 'pull', 'no-change']).nullable(),
  lastRemoteVersion: z.string().nullable(),
  lastRemoteUpdatedAt: z.iso.datetime().nullable(),
  localDataUpdatedAt: z.iso.datetime().nullable(),
  dirtySinceLastSync: z.boolean(),
  autoSyncRetryAttempt: z.number().int().min(0).default(0),
  lastAutoSyncAt: z.iso.datetime().nullable().default(null),
  lastPullAt: z.iso.datetime().nullable().default(null),
  lastPushAt: z.iso.datetime().nullable().default(null),
  lastBlockingReason: syncActionReasonSchema.nullable().default(null),
  lastError: syncErrorSummarySchema.nullable(),
  conflict: syncConflictSummarySchema.nullable(),
})

export type SyncMetadata = z.infer<typeof syncMetadataSchema>

export const defaultSyncMetadata: SyncMetadata = {
  enabled: false,
  gistId: null,
  lastSyncAt: null,
  lastSyncDirection: null,
  lastRemoteVersion: null,
  lastRemoteUpdatedAt: null,
  localDataUpdatedAt: null,
  dirtySinceLastSync: false,
  autoSyncRetryAttempt: 0,
  lastAutoSyncAt: null,
  lastPullAt: null,
  lastPushAt: null,
  lastBlockingReason: null,
  lastError: null,
  conflict: null,
}

async function readStoredSyncMetadata(): Promise<SyncMetadata> {
  const result = await readChromeLocalStorage().get(syncMetadataKey)
  const parsed = syncMetadataSchema.safeParse(result[syncMetadataKey])

  return parsed.success ? parsed.data : { ...defaultSyncMetadata }
}

export async function readSyncMetadata(): Promise<SyncMetadata> {
  const metadata = await readStoredSyncMetadata()
  const head = await readLocalDataHead()
  if (!head || head.revision <= head.lastVerifiedRevision) return metadata
  return {
    ...metadata,
    dirtySinceLastSync: true,
    localDataUpdatedAt:
      !metadata.localDataUpdatedAt || head.savedAt > metadata.localDataUpdatedAt
        ? head.savedAt
        : metadata.localDataUpdatedAt,
  }
}

export async function writeSyncMetadata(
  patch: Partial<SyncMetadata>,
): Promise<SyncMetadata> {
  const current = await readStoredSyncMetadata()
  const next = syncMetadataSchema.parse({ ...current, ...patch })

  await readChromeLocalStorage().set({ [syncMetadataKey]: next })

  return next
}

export async function clearSyncMetadata(): Promise<void> {
  await readChromeLocalStorage().remove(syncMetadataKey)
}

export function markLocalDataChanged(now = new Date()): Promise<SyncMetadata> {
  return writeSyncMetadata({
    localDataUpdatedAt: now.toISOString(),
    dirtySinceLastSync: true,
    lastBlockingReason: null,
    lastError: null,
  })
}

function readChromeLocalStorage(): ChromeStorageLocal {
  if (
    typeof chrome === 'undefined' ||
    typeof chrome.storage === 'undefined' ||
    typeof chrome.storage.local === 'undefined'
  ) {
    throw new Error('chrome.storage.local is not available.')
  }

  return chrome.storage.local
}

type ChromeStorageLocal = {
  get(keys: string[] | string): Promise<Record<string, unknown>>
  set(values: Record<string, unknown>): Promise<void>
  remove(keys: string[] | string): Promise<void>
}
