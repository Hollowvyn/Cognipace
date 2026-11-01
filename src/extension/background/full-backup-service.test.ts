import { prepareGistFullBackupReplacement } from './full-backup-service'
import * as archiveOwner from '@/features/notes/data/archive-generation-repository'
import * as backupOwner from '@/features/backup/server/backup-service'
import { abortDbReplacement } from '@/platform/db/instance'
import { createCompositePublication } from '@/platform/db/composite-publication'
import { fullBackupRequestFingerprint } from './full-backup-service'
import { assertArchiveReferences } from '@/features/notes/domain/archive-validation'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, it, vi } from 'vitest'
import {
  getAppDb,
  resetAppDbForTesting,
  flushDbSnapshot,
} from '@/platform/db/instance'
import { createLocalIdbStore } from '@/platform/db/local-idb'
import { createSnapshotIdbStore } from '@/platform/db/snapshot-idb'
import { preparePracticeStorage } from '@/features/practice/server/practice-storage-service'
import { createArchiveGenerationRepository } from '@/features/notes/data/archive-generation-repository'
import { createNotesRepository } from '@/features/notes/data/notes-repository'
import {
  makeNotesArchive,
  makeNotesPayload,
} from '@/features/notes/testing/notes-fixtures'
import { createFrozenV6BackupFixture } from '@/features/backup/testing/backup-v6-fixture'
import { prepareFullBackupRestore } from '@/features/backup/domain/backup-preflight'
import { createBackupReplacementCoordinator } from './backup-replacement'
import { prepareProblemDataReplacement } from './problem-data-service'
import {
  exportDurableFullBackup,
  prepareFullBackupReplacement,
  createFullBackupPreview,
  validateFullBackupConfirmation,
} from './full-backup-service'
afterEach(() => {
  resetAppDbForTesting()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function fixture() {
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
  await getAppDb({ beforePublish: ({ db }) => preparePracticeStorage(db) })
  return createLocalIdbStore(indexedDB)
}
async function run(
  local: Awaited<ReturnType<typeof fixture>>,
  prepared: Awaited<ReturnType<typeof prepareFullBackupRestore>>,
  commandId: string,
) {
  return createBackupReplacementCoordinator({
    store: createSnapshotIdbStore(indexedDB),
  }).run({
    kind: 'restore',
    prepare: () => prepareFullBackupReplacement(local, { prepared, commandId }),
    onDurable: async () => {},
    finishSyncMetadata: async () => {},
  })
}
it('publishes a full pair, rotates all catalog scopes, and exports only active reachable bodies after problem reset', async () => {
  const local = await fixture()
  const archive = await makeNotesArchive()
  const report = archive.payloads.find((row) => row.kind === 'feedback-v1')!
  if (report.kind !== 'feedback-v1') throw new Error('Missing report')
  const body = Object.fromEntries(
    Object.entries(report.body).reverse(),
  ) as typeof report.body
  body.summary = '  original report  '
  archive.payloads[archive.payloads.indexOf(report)] = await makeNotesPayload(
    'feedback-v1',
    body,
    report.id,
  )
  const input = {
    ...createFrozenV6BackupFixture(),
    schemaVersion: 7,
    notesArchive: archive,
  }
  const priorScope = await createNotesRepository(local).acquireScope('two-sum')
  expect(
    (await run(local, await prepareFullBackupRestore(input), 'restore-1'))
      .status,
  ).toBe('durable')
  const head = (await local.readHead())!
  const scopes = await createArchiveGenerationRepository(
    local,
  ).readProblemScopes(head.archiveGeneration)
  expect(scopes.length).toBeGreaterThan(1)
  expect(
    await createNotesRepository(local).acquireScope('two-sum'),
  ).not.toEqual(priorScope)
  const before = await exportDurableFullBackup(local)
  expect(before.revision).toBe(head.revision)
  expect(before.backup.notesArchive).toEqual(archive)
  await assertArchiveReferences(before.backup.notesArchive, ['two-sum'])
  expect(
    JSON.stringify(
      before.backup.notesArchive.payloads.find((row) => row.id === report.id)!
        .body,
    ),
  ).toBe(JSON.stringify(body))
  const coordinator = createBackupReplacementCoordinator({
    store: createSnapshotIdbStore(indexedDB),
  })
  await coordinator.run({
    kind: 'problem-reset',
    prepare: () =>
      prepareProblemDataReplacement(local, {
        kind: 'problem-reset',
        commandId: 'reset-1',
        problemSlugs: ['two-sum'],
      }),
    onDurable: async () => {},
    finishSyncMetadata: async () => {},
  })
  const after = await exportDurableFullBackup(local)
  expect(after.backup.notesArchive).toMatchObject({
    notes: [],
    submissions: [],
    assessments: [],
    savedAiNotes: [],
    payloads: [],
  })
  expect(
    (
      await createArchiveGenerationRepository(local).readArchiveGeneration(
        head.archiveGeneration,
      )
    ).payloads.length,
  ).toBe(3)
})
it('binds a legacy confirmation to exact input digest and local revision', async () => {
  const local = await fixture()
  const input = createFrozenV6BackupFixture()
  const preview = await createFullBackupPreview(local, input)
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken),
  ).resolves.toMatchObject({ sourceSchemaVersion: 6 })
  await expect(
    validateFullBackupConfirmation(
      local,
      { ...input, exportedAt: '2026-10-30T12:00:00.000Z' },
      preview.confirmationToken,
    ),
  ).rejects.toThrow(/preview/i)
  const handle = await getAppDb()
  handle.rawDb.exec(
    "UPDATE problems SET title = 'changed' WHERE slug = 'two-sum'",
  )
  await flushDbSnapshot()
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken),
  ).rejects.toThrow(/preview/i)
})

it.each(['restore', 'gist-pull'] as const)(
  'hydrates the same prepared %s identity after staging interruption without rerunning SQL or minting scopes',
  async (kind) => {
    const local = await fixture()
    const prepared = await prepareFullBackupRestore({
      ...createFrozenV6BackupFixture(),
      schemaVersion: 7,
      notesArchive: await makeNotesArchive(),
    })
    const head = (await local.readHead())!
    const actual = archiveOwner.createArchiveGenerationRepository
    const fault = vi
      .spyOn(archiveOwner, 'createArchiveGenerationRepository')
      .mockImplementation((store) => ({
        ...actual(store),
        stageImportedArchive: () => Promise.reject(new Error('staging fault')),
      }))
    const restore = vi.spyOn(backupOwner, 'restorePreparedFullBackup')
    const prepare = () =>
      kind === 'gist-pull'
        ? prepareGistFullBackupReplacement(local, prepared)
        : prepareFullBackupReplacement(local, {
            prepared,
            commandId: 'interrupted-restore',
          })
    const first = await prepare()
    const commandId = first.replacementId
    await expect(
      first.publish({ kind, replacementId: commandId }),
    ).rejects.toThrow('staging fault')
    const publication = createCompositePublication(local, head.fingerprint)
    const original = await publication.loadPrepared(
      commandId,
      fullBackupRequestFingerprint(prepared),
    )
    expect(restore).toHaveBeenCalledTimes(1)
    fault.mockRestore()
    abortDbReplacement()
    await expect(
      createBackupReplacementCoordinator({
        store: createSnapshotIdbStore(indexedDB),
      }).run({
        kind,
        prepare,
        onDurable: async () => {},
        finishSyncMetadata: async () => {},
      }),
    ).resolves.toMatchObject({ status: 'durable', syncMetadataPending: false })
    expect(restore).toHaveBeenCalledTimes(1)
    const active = (await local.readHead())!
    expect(active).toMatchObject({
      coreSnapshotId: original!.descriptor.coreSnapshotId,
      archiveGeneration: original!.descriptor.archiveGeneration,
      datasetToken: original!.descriptor.datasetToken,
    })
    expect(
      await createArchiveGenerationRepository(local).readProblemScopes(
        active.archiveGeneration,
      ),
    ).toEqual(
      original!.descriptor.initializedProblemScopes!.map((scope) => ({
        ...scope,
        datasetToken: active.datasetToken,
      })),
    )
    const current = await local.readHead()
    await expect(
      prepareFullBackupReplacement(local, { prepared, commandId }),
    ).rejects.toThrow(/already committed/)
    expect(await local.readHead()).toEqual(current)
  },
)

it('binds a remote preview to the original selected source as well as input and current base', async () => {
  const local = await fixture()
  const input = createFrozenV6BackupFixture()
  const preview = await createFullBackupPreview(local, input, {
    kind: 'gist-pull',
    sourceIdentity: 'gist-1-envelope-v1',
  })
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken, {
      kind: 'gist-pull',
      sourceIdentity: 'gist-1-envelope-v2',
    }),
  ).rejects.toThrow(/preview/i)
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken, {
      kind: 'restore',
    }),
  ).rejects.toThrow(/preview/i)
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken, {
      kind: 'gist-pull',
      sourceIdentity: 'gist-1-envelope-v1',
    }),
  ).resolves.toMatchObject({ sourceSchemaVersion: 6 })
  const handle = await getAppDb()
  handle.rawDb.exec(
    "UPDATE problems SET title = 'new local data' WHERE slug = 'two-sum'",
  )
  await flushDbSnapshot()
  const before = await local.readHead()
  await expect(
    validateFullBackupConfirmation(local, input, preview.confirmationToken, {
      kind: 'gist-pull',
      sourceIdentity: 'gist-1-envelope-v1',
    }),
  ).rejects.toThrow(/Local data changed/)
  expect(await local.readHead()).toEqual(before)
})

it.each(['future', 'digest', 'duplicate', 'dangling', 'practice'] as const)(
  'rejects %s input before minting a preview or staging replacement state',
  async (fault) => {
    const local = await fixture()
    const input = {
      ...createFrozenV6BackupFixture(),
      schemaVersion: fault === 'future' ? 8 : 7,
      notesArchive: await makeNotesArchive(),
    }
    if (fault === 'digest')
      input.notesArchive.payloads[0]!.sha256 = '0'.repeat(64)
    if (fault === 'duplicate')
      input.notesArchive.notes.push(input.notesArchive.notes[0]!)
    if (fault === 'dangling')
      input.notesArchive.submissions[0]!.codePayloadId = 'missing'
    if (fault === 'practice')
      input.data.practice.reviewEvidence[0]!.cardId = 'missing'
    const before = await local.readHead()
    const transact = vi.spyOn(local, 'transact')
    await expect(createFullBackupPreview(local, input)).rejects.toThrow(
      fault === 'future' ? /Unsupported backup version 8/ : undefined,
    )
    expect(transact.mock.calls.every(([, mode]) => mode === 'readonly')).toBe(
      true,
    )
    expect(await local.readHead()).toEqual(before)
  },
)
