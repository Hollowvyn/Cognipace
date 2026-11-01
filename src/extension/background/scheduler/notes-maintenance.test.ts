import { expect, it, vi } from 'vitest'
import { createAlarmScheduler, type AlarmAdapter } from './alarm-scheduler'
import {
  notesMaintenanceAlarm,
  registerNotesMaintenance,
} from './notes-maintenance'
function fixture() {
  let listener: ((alarm: { name: string }) => void | Promise<void>) | undefined
  const alarms: AlarmAdapter = {
    clear: vi.fn(() => Promise.resolve(true)),
    create: vi.fn(() => Promise.resolve(undefined)),
    get: vi.fn(() => Promise.resolve(undefined)),
    onAlarm: (callback) => {
      listener = callback
      return () => {
        listener = undefined
      }
    },
  }
  const scheduler = createAlarmScheduler({ alarms })
  return {
    alarms,
    scheduler,
    tick: async () => {
      await listener?.({ name: notesMaintenanceAlarm })
    },
  }
}
it('registers and repairs the daily job, yielding one bounded pass then rescheduling foreground postponement', async () => {
  const { scheduler, alarms, tick } = fixture()
  const runBatch = vi
    .fn<() => Promise<{ hasMore: boolean } | null>>()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ hasMore: true })
    .mockResolvedValueOnce({ hasMore: false })
  const job = registerNotesMaintenance(scheduler, runBatch)
  await scheduler.repairStartupAlarms()
  expect(alarms.create).toHaveBeenCalledWith(notesMaintenanceAlarm, {
    delayInMinutes: 1,
    periodInMinutes: 1440,
  })
  await tick()
  expect(runBatch).toHaveBeenCalledTimes(1)
  await tick()
  expect(runBatch).toHaveBeenCalledTimes(2)
  const count = vi.mocked(alarms.create).mock.calls.length
  await tick()
  expect(alarms.create).toHaveBeenCalledTimes(count)
  await job.request()
  expect(alarms.create).toHaveBeenCalledTimes(count + 1)
})
it('contains batch and scheduling failures so durable saves do not fail', async () => {
  const { scheduler, alarms, tick } = fixture()
  vi.mocked(alarms.create).mockRejectedValue(new Error('alarms unavailable'))
  const job = registerNotesMaintenance(scheduler, () =>
    Promise.reject(new Error('controlled maintenance failure')),
  )
  await expect(tick()).resolves.toBeUndefined()
  await expect(job.request()).resolves.toBeUndefined()
})
it('repairs after scheduler restart and continues a persisted mark retaining exact recovery bodies', async () => {
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb')
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const { createLocalIdbStore } = await import('@/platform/db/local-idb')
  const { createSnapshotIdbStore } = await import('@/platform/db/snapshot-idb')
  const { createArchiveGenerationRepository } =
    await import('@/features/notes/data/archive-generation-repository')
  const { makeNotesArchive } =
    await import('@/features/notes/testing/notes-fixtures')
  const { createNotesMaintenanceService } =
    await import('@/features/notes/server/notes-maintenance-service')
  const factory = new IDBFactory(),
    local = createLocalIdbStore(factory)
  await createSnapshotIdbStore(factory).commitSnapshot(
    new Uint8Array([1]),
    'test',
    new Date(),
  )
  const head = (await local.readHead())!,
    archive = await makeNotesArchive()
  archive.notes[0]!.document.markdown = 'Never expire.'
  await createArchiveGenerationRepository(local).stageImportedArchive({
    nextGeneration: 'prior',
    archive,
  })
  await local.transact(['records', 'coreSnapshots'], 'readwrite', (s, done) => {
    s.records.put(
      {
        ...head,
        key: 'replacement',
        replacementId: 'restore',
        archiveGeneration: 'prior',
      },
      'recovery',
    )
    s.coreSnapshots.put(
      {
        kind: 'paired',
        coreSnapshotId: head.coreSnapshotId,
        archiveGeneration: 'prior',
        datasetToken: head.datasetToken,
      },
      ['recordReference', 'recovery'],
    )
    done(undefined)
  })
  const first = fixture()
  registerNotesMaintenance(first.scheduler, () =>
    createNotesMaintenanceService({ local, batchSize: 1 }).collectBatch(),
  )
  await first.tick()
  first.scheduler.dispose()
  const restarted = fixture()
  registerNotesMaintenance(restarted.scheduler, () =>
    createNotesMaintenanceService({
      local: createLocalIdbStore(factory),
    }).collectBatch(),
  )
  await restarted.scheduler.repairStartupAlarms()
  for (let n = 0; n < 40; n++) await restarted.tick()
  expect(
    await createArchiveGenerationRepository(local).readArchiveGeneration(
      'prior',
    ),
  ).toEqual(archive)
  vi.unstubAllGlobals()
})
