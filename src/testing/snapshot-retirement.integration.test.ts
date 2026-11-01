import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, it, vi } from 'vitest'
import {
  getAppDb,
  resetAppDbForTesting,
  flushDbSnapshot,
} from '@/platform/db/instance'
import { createLocalIdbStore } from '@/platform/db/local-idb'
import { createSnapshotIdbStore } from '@/platform/db/snapshot-idb'
afterEach(() => {
  resetAppDbForTesting()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it.each([false, true])(
  'bounds standard 5000-review Library suspension storage (completed replacement: %s)',
  async (completedReplacement) => {
    const { createFsrsScalingFixture } =
      await import('@/testing/fsrs-scaling-fixtures')
    const { computeFingerprint } = await import('@/platform/db/snapshot')
    const { migrationSql } = await import('@/platform/db/migration-sql')
    const { setPracticeSuspended } =
      await import('@/features/practice/server/practice-service')

    resetAppDbForTesting()
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: () => Promise.resolve({}),
          set: async () => {},
          remove: async () => {},
        },
      },
    })
    vi.stubGlobal('indexedDB', new IDBFactory())
    vi.stubGlobal('IDBKeyRange', IDBKeyRange)
    const fixture = await createFsrsScalingFixture('standard')
    const store = createSnapshotIdbStore(indexedDB)
    const local = createLocalIdbStore(indexedDB)
    await store.commitSnapshot(
      fixture.snapshot,
      computeFingerprint(migrationSql),
      new Date(),
    )
    let recoveryCoreId: string | undefined
    if (completedReplacement) {
      const { createCompositePublication } =
        await import('@/platform/db/composite-publication')
      const { createArchiveGenerationRepository } =
        await import('@/features/notes/data/archive-generation-repository')
      const head = (await local.readHead())!
      recoveryCoreId = head.coreSnapshotId
      const candidate = {
        handle: fixture.handle,
        descriptor: {
          baseRevision: head.revision,
          coreSnapshotId: 'replacement-core',
          archiveGeneration: 'replacement-archive',
          datasetToken: 'replacement-dataset',
          replacementId: 'completed',
          commandKind: 'restore' as const,
          commandFingerprint: 'accepted',
        },
      }
      const publication = createCompositePublication(local, head.fingerprint)
      await publication.prepare(candidate, () =>
        createArchiveGenerationRepository(local).stageArchiveGeneration({
          sourceGeneration: head.archiveGeneration,
          nextGeneration: candidate.descriptor.archiveGeneration,
          excludedProblemSlugs: [],
        }),
      )
      await publication.publishCompositeCandidate(candidate, {
        kind: 'restore',
        replacementId: 'completed',
        commandFingerprint: 'accepted',
      })
      await store.markInvalidated('completed')
      await store.markSyncMetadataComplete('completed')
      await store.completeContinuation('completed')
    }
    // Library defaults to 20 rows (use-problem-library-table.ts); its bulk action
    // calls practice.setSuspended per row. The handler invokes this service then
    // flushes the snapshot before publishing invalidations.
    const selected = fixture.backup.data.practice.problemPractice
      .filter((row) => !row.isSuspended)
      .slice(0, 20)
    const handle = await getAppDb()
    for (const row of selected) {
      await setPracticeSuspended(handle.db, {
        problemSlug: row.problemSlug,
        suspended: true,
      })
      await flushDbSnapshot()
    }
    const sizes = await local.transact<number[], 'coreSnapshots'>(
      ['coreSnapshots'],
      'readonly',
      (s, done) => {
        const request = s.coreSnapshots.openCursor()
        const sizes: number[] = []
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) {
            done(sizes)
            return
          }
          if (typeof cursor.key === 'string')
            sizes.push((cursor.value as Uint8Array).byteLength)
          cursor.continue()
        }
      },
    )
    const finalHead = (await local.readHead())!
    if (completedReplacement) {
      expect(await local.readCore('replacement-core')).toBeNull()
      expect(await local.readCore(recoveryCoreId!)).not.toBeNull()
    }
    const retainedBytes = sizes.reduce((a, b) => a + b, 0)
    // A completed replacement retains its intentional paired recovery core;
    // the exact committed fence discharges the former prepared candidate.
    expect(sizes.length).toBeLessThanOrEqual(completedReplacement ? 2 : 1)
    expect(retainedBytes).toBeLessThanOrEqual(
      fixture.snapshot.byteLength * (completedReplacement ? 2 : 1),
    )
    const { writeFile, mkdir } = await import('node:fs/promises')
    await mkdir('test-results/idb-scaling', { recursive: true })
    await writeFile(
      `test-results/idb-scaling/retirement-${String(completedReplacement)}.json`,
      JSON.stringify({
        profileProblems: fixture.counts.problems,
        profileReviews: fixture.counts.reviews,
        saves: selected.length,
        completedReplacement,
        cores: sizes.length,
        retainedBytes,
        activeBytes: fixture.snapshot.byteLength,
        retainedRoots: [
          { coreSnapshotId: finalHead.coreSnapshotId, reason: 'active' },
          ...(recoveryCoreId
            ? [
                {
                  coreSnapshotId: recoveryCoreId,
                  reason: 'paired replacement recovery',
                },
              ]
            : []),
        ],
      }),
    )
    fixture.handle.rawDb.close()
  },
  30000,
)
