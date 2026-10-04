import { afterEach, describe, expect, it } from 'vitest'

import { createDb, createSqliteWasmLocator } from '@/platform/db'
import { migrationEntries } from '@/platform/db/migration-sql'
import {
  assertDatabaseIntegrity,
  legacyTopicMigrationFingerprint,
  legacyTopicMigrationSql,
  selectSnapshotBaselineSql,
  selectUpgradeSql,
  validateSnapshotSchema,
} from '@/platform/db/snapshot-upgrade'
import {
  expectedLegacyMigrationFingerprint,
  frozenLegacyMigrationEntries,
} from '@/testing/fixtures/topics-legacy-migrations'
import { computeFingerprint, deserializeDb, serializeDb } from './snapshot'
import {
  expectedV8MigrationFingerprint,
  frozenV8MigrationEntries,
  frozenV8MigrationSql,
} from '@/testing/fixtures/tracks-external-progress-legacy-migrations'
import {
  expectedV9MigrationFingerprint,
  frozenV9MigrationEntries,
  frozenV9MigrationSql,
} from '@/testing/fixtures/fsrs-remediation-legacy-migrations'

const handles: Awaited<ReturnType<typeof createDb>>[] = []

async function makeDb(migrationSql?: string) {
  const handle = await createDb({
    ...(migrationSql ? { migrationSql } : {}),
    locateWasm: createSqliteWasmLocator(),
  })
  handles.push(handle)
  return handle
}

afterEach(() => {
  while (handles.length > 0) handles.pop()?.rawDb.close()
})

describe('supported topic snapshot upgrade', () => {
  it('freezes the shipped v8 prefix and selects only its appended migration', () => {
    const suffix =
      'ALTER TABLE tracks ADD allow_external_progress integer DEFAULT false NOT NULL;'
    const entries = [
      ...frozenV8MigrationEntries,
      { path: './migrations/0009_external_progress.sql', sql: suffix },
    ]

    expect(migrationEntries.slice(0, 9)).toEqual(frozenV8MigrationEntries)
    expect(computeFingerprint(frozenV8MigrationSql)).toBe(
      expectedV8MigrationFingerprint,
    )
    expect(selectUpgradeSql(expectedV8MigrationFingerprint, entries)).toBe(
      suffix,
    )
    expect(() =>
      selectUpgradeSql(expectedV8MigrationFingerprint, [
        ...entries.slice(0, 8),
        { ...entries[8]!, sql: `${entries[8]!.sql}\n-- changed` },
        entries[9]!,
      ]),
    ).toThrow('The supported migration prefix has changed.')
  })

  it('defaults new and upgraded tracks to independent progress', async () => {
    const old = await makeDb(frozenV8MigrationSql)
    old.rawDb.exec(
      "INSERT INTO tracks (id, slug, title, created_at, updated_at) VALUES ('retained-track', 'retained-track', 'Retained', 11, 12)",
    )
    const staged = await makeDb()
    deserializeDb(staged, serializeDb(old))
    await validateSnapshotSchema(staged, frozenV8MigrationSql)
    staged.rawDb.exec(selectUpgradeSql(expectedV8MigrationFingerprint))
    assertDatabaseIntegrity(staged)
    expect(
      staged.rawDb.exec({
        sql: 'SELECT id, allow_external_progress, created_at, updated_at FROM tracks',
        returnValue: 'resultRows',
      }),
    ).toEqual([['retained-track', 0, 11, 12]])
  })

  it('freezes the eight historical SQL files and their baseline fingerprint', () => {
    expect(migrationEntries.slice(0, 8)).toEqual(frozenLegacyMigrationEntries)
    expect(computeFingerprint(legacyTopicMigrationSql)).toBe(
      expectedLegacyMigrationFingerprint,
    )
    expect(legacyTopicMigrationFingerprint).toBe(
      expectedLegacyMigrationFingerprint,
    )
  })

  it('accepts only the known baseline and selects only the appended suffix', () => {
    const suffix = 'CREATE TABLE appended_test (id TEXT PRIMARY KEY);'
    const entries = [
      ...frozenLegacyMigrationEntries,
      { path: './migrations/appended_test.sql', sql: suffix },
    ]

    expect(selectUpgradeSql(expectedLegacyMigrationFingerprint, entries)).toBe(
      suffix,
    )
    expect(() => selectUpgradeSql('deadbeef', entries)).toThrow(
      'This database version requires recovery; its original data was retained.',
    )
    expect(() =>
      selectUpgradeSql(expectedLegacyMigrationFingerprint, [
        { ...entries[0]!, sql: `${entries[0]!.sql}\n-- changed` },
        ...entries.slice(1),
      ]),
    ).toThrow('The supported migration prefix has changed.')
    expect(() =>
      selectUpgradeSql(expectedLegacyMigrationFingerprint, [
        entries[1]!,
        entries[0]!,
        ...entries.slice(2),
      ]),
    ).toThrow('The supported migration prefix has changed.')
  })

  it('validates schema and SQLite integrity on a real serialized snapshot', async () => {
    const old = await makeDb(legacyTopicMigrationSql)
    old.rawDb.exec(
      "INSERT INTO topics (id, label) VALUES ('topics-proof', 'Topics proof')",
    )
    assertDatabaseIntegrity(old)

    const restored = await makeDb()
    deserializeDb(restored, serializeDb(old))
    await validateSnapshotSchema(restored, legacyTopicMigrationSql)
    assertDatabaseIntegrity(restored)
    expect(
      restored.rawDb.exec({
        sql: "SELECT label FROM topics WHERE id = 'topics-proof'",
        returnValue: 'resultRows',
      }),
    ).toEqual([['Topics proof']])

    await expect(
      validateSnapshotSchema(
        restored,
        `${legacyTopicMigrationSql}\nCREATE TABLE unexpected (id TEXT)`,
      ),
    ).rejects.toThrow(
      'The stored database schema does not match its supported version.',
    )
  })

  it('rejects a stored foreign-key violation before an upgrade suffix can run', async () => {
    const corrupted = await makeDb(legacyTopicMigrationSql)
    corrupted.rawDb.exec('PRAGMA foreign_keys = OFF')
    corrupted.rawDb.exec(`
      INSERT INTO problems (slug, title, difficulty, is_premium, created_at, updated_at)
      VALUES ('orphan-child', 'Orphan child', 'easy', false, 1, 1);
      INSERT INTO track_groups (id, track_id, title, position, created_at, updated_at)
      VALUES ('orphan-group', 'missing-track', 'Orphan', 1, 1, 1);
    `)
    expect(() => assertDatabaseIntegrity(corrupted)).toThrow(
      'The stored database failed its foreign key check.',
    )
  })

  it('rejects a malformed stored schema from integrity_check', async () => {
    const corrupted = await makeDb(legacyTopicMigrationSql)
    corrupted.rawDb.exec(`
      PRAGMA writable_schema = ON;
      UPDATE sqlite_schema SET sql = 'CREATE TABLE problems (' WHERE name = 'problems';
      PRAGMA schema_version = 1000;
    `)

    expect(() => assertDatabaseIntegrity(corrupted)).toThrow(
      'The stored database failed its integrity check.',
    )
  })

  it('does not apply a failing selected suffix to the original snapshot bytes', async () => {
    const old = await makeDb(legacyTopicMigrationSql)
    old.rawDb.exec(
      "INSERT INTO topics (id, label) VALUES ('retained', 'Retained')",
    )
    const originalBytes = serializeDb(old)
    const suffix = 'CREATE TABLE broken (id TEXT); INVALID SQL;'
    const selected = selectUpgradeSql(expectedLegacyMigrationFingerprint, [
      ...frozenLegacyMigrationEntries,
      { path: './migrations/failing_test.sql', sql: suffix },
    ])
    const staged = await makeDb()
    deserializeDb(staged, originalBytes)

    expect(() => staged.rawDb.exec(selected)).toThrow()
    expect(serializeDb(old)).toEqual(originalBytes)
    expect(
      old.rawDb.exec({
        sql: "SELECT id FROM topics WHERE id = 'retained'",
        returnValue: 'resultRows',
      }),
    ).toEqual([['retained']])
  })
})

describe('shipped FSRS snapshot baseline', () => {
  it('pins all ten shipped files and selects only appended SQL', () => {
    const suffix = 'CREATE TABLE fsrs_upgrade_probe (id TEXT PRIMARY KEY);'
    const entries = [
      ...frozenV9MigrationEntries,
      { path: './migrations/0010_fsrs_upgrade_probe.sql', sql: suffix },
    ]

    expect(frozenV9MigrationEntries).toHaveLength(10)
    expect(frozenV9MigrationEntries.at(-1)?.path).toBe(
      './migrations/0009_mushy_beyonder.sql',
    )
    expect(migrationEntries.slice(0, 10)).toEqual(frozenV9MigrationEntries)
    expect(computeFingerprint(frozenV9MigrationSql)).toBe('1144ce07')
    expect(selectSnapshotBaselineSql(expectedV9MigrationFingerprint)).toBe(
      frozenV9MigrationSql,
    )
    expect(selectUpgradeSql(expectedV9MigrationFingerprint, entries)).toBe(
      suffix,
    )
    expect(
      selectUpgradeSql(
        expectedV9MigrationFingerprint,
        frozenV9MigrationEntries,
      ),
    ).toBe('')
  })

  it('rejects changed, reordered and missing shipped prefixes', () => {
    const changed = frozenV9MigrationEntries.map((entry, index) =>
      index === 9 ? { ...entry, sql: `${entry.sql}\n-- changed` } : entry,
    )
    const reordered = [
      frozenV9MigrationEntries[1],
      frozenV9MigrationEntries[0],
      ...frozenV9MigrationEntries.slice(2),
    ]
    for (const entries of [
      changed,
      reordered,
      frozenV9MigrationEntries.slice(0, 9),
    ]) {
      expect(() =>
        selectUpgradeSql(expectedV9MigrationFingerprint, entries),
      ).toThrow('The supported migration prefix has changed.')
    }
    expect(() => selectSnapshotBaselineSql('deadbeef')).toThrow(
      'This database version requires recovery; its original data was retained.',
    )
  })
})
