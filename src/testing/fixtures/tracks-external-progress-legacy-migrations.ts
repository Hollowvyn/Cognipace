import migration0008 from '@/platform/db/migrations/0008_topics_typed_relations.sql?raw'

import { frozenLegacyMigrationEntries } from './topics-legacy-migrations'

export const frozenV8MigrationEntries = [
  ...frozenLegacyMigrationEntries,
  { path: './migrations/0008_topics_typed_relations.sql', sql: migration0008 },
] as const

// Pinned before the external-progress migration. Historical edits must not update this.
export const expectedV8MigrationFingerprint = 'a35941fc'
export const frozenV8MigrationSql = frozenV8MigrationEntries
  .map((entry) => entry.sql)
  .join('\n')
