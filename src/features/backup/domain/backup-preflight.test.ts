import { backupFileSchema } from '../api/backup-contracts'
import { assertArchiveReferences } from '@/features/notes/domain/archive-validation'
import { expect, it } from 'vitest'
import {
  makeNotesArchive,
  makeNotesPayload,
} from '@/features/notes/testing/notes-fixtures'
import { createFrozenV6BackupFixture } from '../testing/backup-v6-fixture'
import { prepareFullBackupRestore } from './backup-preflight'

async function fixture() {
  return {
    ...createFrozenV6BackupFixture(),
    schemaVersion: 7,
    notesArchive: await makeNotesArchive(),
  }
}
it.each(['digest', 'dangling', 'duplicate', 'ownership', 'practice'])(
  'rejects %s before preparing restore',
  async (fault) => {
    const backup = await fixture()
    if (fault === 'digest')
      backup.notesArchive.payloads[0]!.sha256 = '0'.repeat(64)
    if (fault === 'dangling')
      backup.notesArchive.submissions[0]!.codePayloadId = 'absent'
    if (fault === 'duplicate')
      backup.notesArchive.notes.push(backup.notesArchive.notes[0]!)
    if (fault === 'ownership')
      backup.notesArchive.notes[0]!.problemSlug = 'absent'
    if (fault === 'practice')
      backup.data.practice.reviewEvidence[0]!.cardId = 'absent'
    await expect(prepareFullBackupRestore(backup)).rejects.toThrow()
  },
)
it('preserves original digest-bound report bytes and detaches input before await', async () => {
  const backup = await fixture()
  const before = structuredClone(backup)
  const pending = prepareFullBackupRestore(backup)
  backup.notesArchive.payloads[0]!.body = 'changed'
  const prepared = await pending
  expect(prepared.notesArchive).toEqual(before.notesArchive)
  expect(prepared.inputDigest).toMatch(/^[a-f0-9]{64}$/)
})

it('preserves reordered and trim-sensitive report serialization through current file shape parsing', async () => {
  const backup = await fixture()
  const payload = backup.notesArchive.payloads.find(
    (row) => row.kind === 'feedback-v1',
  )!
  if (payload.kind !== 'feedback-v1') throw new Error('Missing report fixture')
  const body = Object.fromEntries(
    Object.entries(payload.body).reverse(),
  ) as typeof payload.body
  body.summary = '  original summary bytes  '
  const replacement = await makeNotesPayload('feedback-v1', body, payload.id)
  backup.notesArchive.payloads[backup.notesArchive.payloads.indexOf(payload)] =
    replacement
  const parsed = backupFileSchema.parse(backup)
  expect(
    JSON.stringify(
      parsed.notesArchive.payloads.find((row) => row.id === payload.id)!.body,
    ),
  ).toBe(JSON.stringify(body))
  await expect(
    assertArchiveReferences(parsed.notesArchive, ['two-sum']),
  ).resolves.toBeUndefined()
  const prepared = await prepareFullBackupRestore(parsed)
  expect(prepared.notesArchive.payloads).toEqual(backup.notesArchive.payloads)
})
