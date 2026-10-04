import migration0009 from '@/platform/db/migrations/0009_mushy_beyonder.sql?raw'

import { frozenV8MigrationEntries } from './tracks-external-progress-legacy-migrations'

export const frozenV9MigrationEntries = [
  ...frozenV8MigrationEntries,
  { path: './migrations/0009_mushy_beyonder.sql', sql: migration0009 },
] as const

// Shipped boundary: never update this to accommodate edits to historical SQL.
export const expectedV9MigrationFingerprint = '1144ce07'
export const frozenV9MigrationSql = frozenV9MigrationEntries
  .map((entry) => entry.sql)
  .join('\n')
