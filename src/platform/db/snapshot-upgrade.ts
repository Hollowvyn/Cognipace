import { createDb, createSqliteWasmLocator, type DbHandle } from './client'
import { migrationEntries } from './migration-sql'
import { execProxy } from './proxy'
import { computeFingerprint } from './snapshot'

export const legacyTopicMigrationPaths = [
  './migrations/0000_initial.sql',
  './migrations/0001_lively_namor.sql',
  './migrations/0002_add_track_due_at.sql',
  './migrations/0003_problem_slugs_and_constraints.sql',
  './migrations/0004_tracks_phase_3.sql',
  './migrations/0005_concerned_jubilee.sql',
  './migrations/0006_polite_vindicator.sql',
  './migrations/0007_track_simple_recall.sql',
] as const

export const legacyTrackMigrationPaths = [
  ...legacyTopicMigrationPaths,
  './migrations/0008_topics_typed_relations.sql',
] as const

export const legacyFsrsMigrationPaths = [
  ...legacyTrackMigrationPaths,
  './migrations/0009_mushy_beyonder.sql',
] as const

function readBaselineSql(paths: readonly string[]) {
  return paths
    .map((path) => {
      const entry = migrationEntries.find(
        (candidate) => candidate.path === path,
      )
      if (!entry) throw new Error(`Missing supported legacy migration: ${path}`)
      return entry.sql
    })
    .join('\n')
}

export const legacyTopicMigrationSql = readBaselineSql(
  legacyTopicMigrationPaths,
)
export const legacyTrackMigrationSql = readBaselineSql(
  legacyTrackMigrationPaths,
)
export const legacyFsrsMigrationSql = readBaselineSql(legacyFsrsMigrationPaths)

// Shipped SQL fingerprints are fixed compatibility boundaries.
export const legacyTopicMigrationFingerprint = 'b1c2b4d7'
export const legacyTrackMigrationFingerprint = 'a35941fc'
export const legacyFsrsMigrationFingerprint = '1144ce07'

const supportedBaselines = [
  {
    fingerprint: legacyTopicMigrationFingerprint,
    paths: legacyTopicMigrationPaths,
    sql: legacyTopicMigrationSql,
  },
  {
    fingerprint: legacyTrackMigrationFingerprint,
    paths: legacyTrackMigrationPaths,
    sql: legacyTrackMigrationSql,
  },
  {
    fingerprint: legacyFsrsMigrationFingerprint,
    paths: legacyFsrsMigrationPaths,
    sql: legacyFsrsMigrationSql,
  },
] as const

const schemaQuery = `SELECT type, name, tbl_name, sql FROM sqlite_schema
  WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`

export function selectUpgradeSql(
  fromFingerprint: string,
  entries: readonly { path: string; sql: string }[] = migrationEntries,
): string {
  const baseline = getSupportedBaseline(fromFingerprint, entries)
  return entries
    .slice(baseline.paths.length)
    .map((entry) => entry.sql)
    .join('\n')
}

export function selectSnapshotBaselineSql(fromFingerprint: string): string {
  return getSupportedBaseline(fromFingerprint, migrationEntries).sql
}

function getSupportedBaseline(
  fromFingerprint: string,
  entries: readonly { path: string; sql: string }[],
) {
  const baseline = supportedBaselines.find(
    (candidate) => candidate.fingerprint === fromFingerprint,
  )
  if (!baseline) {
    throw new Error(
      'This database version requires recovery; its original data was retained.',
    )
  }
  const prefix = entries.slice(0, baseline.paths.length)
  if (
    prefix.length !== baseline.paths.length ||
    prefix.some((entry, index) => entry.path !== baseline.paths[index]) ||
    computeFingerprint(prefix.map((entry) => entry.sql).join('\n')) !==
      baseline.fingerprint
  ) {
    throw new Error('The supported migration prefix has changed.')
  }
  return baseline
}

export async function validateSnapshotSchema(
  handle: DbHandle,
  expectedSql: string,
) {
  const reference = await createDb({
    migrationSql: expectedSql,
    locateWasm: createSqliteWasmLocator(),
  })

  try {
    const actual = execProxy(handle.rawDb, schemaQuery, [], 'all')
    const expected = execProxy(reference.rawDb, schemaQuery, [], 'all')
    if (JSON.stringify(actual.rows) !== JSON.stringify(expected.rows)) {
      throw new Error(
        'The stored database schema does not match its supported version.',
      )
    }
  } finally {
    reference.rawDb.close()
  }
}

export function assertDatabaseIntegrity(handle: DbHandle) {
  const integrity = execProxy(handle.rawDb, 'PRAGMA integrity_check', [], 'all')
  const integrityRows = integrity.rows as unknown as unknown[][]
  if (integrityRows.length !== 1 || integrityRows[0]?.[0] !== 'ok') {
    throw new Error('The stored database failed its integrity check.')
  }

  const foreignKeys = execProxy(
    handle.rawDb,
    'PRAGMA foreign_key_check',
    [],
    'all',
  )
  if ((foreignKeys.rows as unknown as unknown[][]).length > 0) {
    throw new Error('The stored database failed its foreign key check.')
  }
}
