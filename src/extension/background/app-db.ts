import { createLocalIdbStore } from '@/platform/db/local-idb'
import type { ReplacementContinuation } from '@/platform/db/snapshot-idb'
import { serializeDb } from '@/platform/db/snapshot'
import { reconcileTopicTaxonomy } from '@/features/problems/data/topic-reconciliation'
import {
  preparePracticeStorage,
  validatePracticeStorage,
} from '@/features/practice/server/practice-storage-service'
import { legacyFsrsMigrationFingerprint } from '@/platform/db/snapshot-upgrade'
import {
  seedTopicAliases,
  seedTopicRelations,
  seedTopics,
} from '@/platform/db/topic-taxonomy-seed'
import {
  acquireCurrentAppDb,
  type Db,
  withCurrentAppDb,
  type DbHandle,
  type AppDbOptions,
  getAppDb,
} from '@/platform/db'

const backgroundOptions: AppDbOptions = {
  beforePublish: async (handle, context) => {
    const preserveTaxonomy =
      context.kind === 'upgrade' &&
      context.fromFingerprint === legacyFsrsMigrationFingerprint
    if (!preserveTaxonomy)
      await reconcileTopicTaxonomy(handle.db, {
        legacy: context.kind === 'upgrade',
        now: new Date(),
        catalogue: {
          topics: seedTopics,
          aliases: seedTopicAliases,
          relations: seedTopicRelations,
        },
      })
    await preparePracticeStorage(handle.db)
  },
  validateCurrentData: (handle) => validatePracticeStorage(handle.db),
}

export function getBackgroundDb() {
  return getAppDb(backgroundOptions)
}

export function withBackgroundDb<T>(work: (handle: DbHandle) => Promise<T>) {
  return withCurrentAppDb(work, backgroundOptions)
}

// Provider work obtains its lease lazily after ownership/deadline admission. Each
// database load resolves the current handle; all reads survive until work settles.
export async function withBackgroundDbLoader<T>(
  work: (loadDb: () => Promise<Db>) => Promise<T>,
) {
  const leases: Awaited<ReturnType<typeof acquireCurrentAppDb>>[] = []
  let finished = false
  try {
    return await work(async () => {
      const lease = await acquireCurrentAppDb(backgroundOptions)
      if (finished) {
        lease.release()
        throw new Error('Database reader has finished.')
      }
      leases.push(lease)
      return lease.handle.db
    })
  } finally {
    finished = true
    leases.forEach((lease) => lease.release())
  }
}

/** Reconstructed bookkeeping must verify the opened handle against the active
 * core/archive head before the coordinator can admit paired readers. */
export function verifyBackgroundReplacementAdoption(
  record: ReplacementContinuation,
) {
  return withBackgroundDb(async (handle) => {
    if (typeof indexedDB === 'undefined')
      throw new Error('Replacement storage is unavailable.')
    const local = createLocalIdbStore(indexedDB)
    const head = await local.readHead()
    if (
      !head ||
      head.replacementId !== record.replacementId ||
      head.revision < record.committedRevision
    )
      throw new Error(
        'Replacement active pair does not match its continuation.',
      )
    const bytes = await local.readCore(head.coreSnapshotId)
    const current = serializeDb(handle)
    if (
      !bytes ||
      bytes.length !== current.length ||
      !bytes.every((byte, index) => byte === current[index])
    )
      throw new Error(
        'Replacement current handle does not match its active core snapshot.',
      )
    const verified = await local.readHead()
    if (
      !verified ||
      verified.revision !== head.revision ||
      verified.coreSnapshotId !== head.coreSnapshotId ||
      verified.archiveGeneration !== head.archiveGeneration ||
      verified.datasetToken !== head.datasetToken ||
      verified.fingerprint !== head.fingerprint ||
      verified.replacementId !== head.replacementId
    )
      throw new Error(
        'Replacement active pair changed during handle verification.',
      )
  })
}
