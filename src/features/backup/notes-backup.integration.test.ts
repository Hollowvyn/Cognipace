import { readFile, writeFile } from 'node:fs/promises'
import { format } from 'prettier'
import { assertArchiveReferences } from '@/features/notes/domain/archive-validation'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, it, vi } from 'vitest'
import { createTestDb } from '@/platform/db/test-db'
import { createLocalIdbStore } from '@/platform/db/local-idb'
import { createArchiveGenerationRepository } from '@/features/notes/data/archive-generation-repository'
import {
  makeNotesArchive,
  makeNotesPayload,
} from '@/features/notes/testing/notes-fixtures'
import { preparePracticeStorage } from '@/features/practice/server/practice-storage-service'
import { exportFullBackup, restoreFullBackup } from './server/backup-service'
import { createBackupRepository } from './data/backup-repository'
import { createFrozenV6BackupFixture } from './testing/backup-v6-fixture'
import { prepareFullBackupRestore } from './domain/backup-preflight'

afterEach(() => vi.unstubAllGlobals())

it('round trips the logical learning dataset into a different core and archive database', async () => {
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  const source = await createTestDb()
  const target = await createTestDb()
  const sourceLocal = createLocalIdbStore(new IDBFactory())
  const targetLocal = createLocalIdbStore(new IDBFactory())
  await restoreFullBackup(source.db, createFrozenV6BackupFixture())
  await preparePracticeStorage(target.db)
  const archive = await makeNotesArchive()
  const report = archive.payloads.find((row) => row.kind === 'feedback-v1')!
  if (report.kind !== 'feedback-v1') throw new Error('Missing report')
  const body = Object.fromEntries(
    Object.entries(report.body).reverse(),
  ) as typeof report.body
  body.summary = '  byte-bound report  '
  archive.payloads[archive.payloads.indexOf(report)] = await makeNotesPayload(
    'feedback-v1',
    body,
    report.id,
  )
  archive.notes[0]!.document = {
    formatVersion: 1,
    revision: 3,
    markdown: '反省\nverbatim ',
    updatedAt: '2026-10-31T12:00:00.000Z',
  }
  archive.submissions[0]!.reflection = {
    ...archive.notes[0]!.document,
    markdown: 'reflection',
  }
  await createArchiveGenerationRepository(sourceLocal).stageImportedArchive({
    nextGeneration: 'source',
    archive,
  })
  const backup = await exportFullBackup(source.db, {
    notesArchive:
      await createArchiveGenerationRepository(
        sourceLocal,
      ).readArchiveGeneration('source'),
  })
  expect(backup.schemaVersion).toBe(7)
  await assertArchiveReferences(backup.notesArchive, ['two-sum'])
  expect(
    JSON.stringify(
      backup.notesArchive.payloads.find((row) => row.id === report.id)!.body,
    ),
  ).toBe(JSON.stringify(body))
  const prepared = await prepareFullBackupRestore(backup)
  await restoreFullBackup(target.db, backup)
  await createArchiveGenerationRepository(targetLocal).stageImportedArchive({
    nextGeneration: 'target',
    archive: prepared.notesArchive,
  })
  const readLogicalLearningDataset = async (
    db: typeof source.db,
    local: typeof sourceLocal,
    generation: string,
  ) => {
    const data = await createBackupRepository(db).readBackupData()
    const practice = { ...data.practice }
    Reflect.deleteProperty(practice, 'generations')
    Reflect.deleteProperty(practice, 'commandReceipts')
    return {
      ...data,
      practice,
      notesArchive:
        await createArchiveGenerationRepository(local).readArchiveGeneration(
          generation,
        ),
    }
  }
  expect(
    await readLogicalLearningDataset(target.db, targetLocal, 'target'),
  ).toEqual(await readLogicalLearningDataset(source.db, sourceLocal, 'source'))
  source.rawDb.close()
  target.rawDb.close()
})

it('retains original v6 source metadata and explicitly previews archive replacement', async () => {
  const prepared = await prepareFullBackupRestore(
    createFrozenV6BackupFixture(),
    { currentArchiveHasData: true },
  )
  expect(prepared).toMatchObject({
    sourceSchemaVersion: 6,
    archiveAbsent: true,
    removesCurrentArchive: true,
    notesArchive: { notes: [], payloads: [] },
  })
})

it('reproduces the synthetic Phase 1 human smoke backup through the owning serializer', async () => {
  const fixturePath = 'docs/superpowers/fixtures/notes-phase-1-v7.json'
  const now = new Date('2026-10-31T12:00:00.000Z')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  let nextId = 0
  const uuid = vi
    .spyOn(crypto, 'randomUUID')
    .mockImplementation(
      () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`,
    )
  const serialize = async () => {
    nextId = 0
    const source = await createTestDb()
    try {
      await restoreFullBackup(source.db, createFrozenV6BackupFixture())
      const archive = await makeNotesArchive()
      archive.notes[0]!.document = {
        formatVersion: 1,
        revision: 3,
        markdown:
          '# Synthetic study note\n\n反省: preserve trailing space.  \n',
        updatedAt: now.toISOString(),
      }
      archive.submissions[0]!.reflection = {
        formatVersion: 1,
        revision: 2,
        markdown: 'Check duplicate complements.  \n',
        updatedAt: now.toISOString(),
      }
      const backup = await exportFullBackup(source.db, {
        exportedAt: now,
        appVersion: '2.3.1',
        notesArchive: archive,
      })
      const prepared = await prepareFullBackupRestore(backup)
      expect(prepared.sourceSchemaVersion).toBe(7)
      expect(prepared.notesArchive).toEqual(archive)
      return format(JSON.stringify(backup), { parser: 'json' })
    } finally {
      source.rawDb.close()
    }
  }
  try {
    const first = await serialize()
    expect(await serialize()).toBe(first)
    if (process.env.NOTES_WRITE_SMOKE_FIXTURE === '1') {
      await writeFile(fixturePath, first)
    }
    expect(await readFile(fixturePath, 'utf8')).toBe(first)
    await prepareFullBackupRestore(JSON.parse(first))
  } finally {
    uuid.mockRestore()
    vi.useRealTimers()
  }
})
