import { expect, it } from 'vitest'
import { backupFileV6Schema } from '../api/backup-legacy-contracts'
import { parseBackupFileForCurrentApp } from '../api/backup-contracts'
import { createFrozenV6BackupFixture } from '../testing/backup-v6-fixture'
import { emptyNotesArchive } from '@/features/notes/domain/archive-validation'
import { legacyArchiveDisposition } from './backup-normalization'
it('keeps the exact shipped v6 reader strict and normalizes an explicit empty archive', () => {
  const input = createFrozenV6BackupFixture()
  expect(backupFileV6Schema.safeParse(input).success).toBe(true)
  expect(
    backupFileV6Schema.safeParse({
      ...input,
      notesArchive: emptyNotesArchive(),
    }).success,
  ).toBe(false)
  const parsed = parseBackupFileForCurrentApp(input)
  expect(parsed.schemaVersion).toBe(7)
  expect(parsed.data).toEqual(input.data)
  expect(parsed.notesArchive).toEqual(emptyNotesArchive())
})
it.each([1, 2, 3, 4, 5, 6, 7])(
  'reports archive disposition for original version %s',
  (version) => {
    expect(legacyArchiveDisposition(version, true)).toEqual({
      sourceSchemaVersion: version,
      archiveAbsent: version < 7,
      removesCurrentArchive: version < 7,
    })
  },
)
