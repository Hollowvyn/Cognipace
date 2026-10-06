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
import { getAppDb } from '@/platform/db'

export function getBackgroundDb() {
  return getAppDb({
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
  })
}
