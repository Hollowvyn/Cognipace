import type { Db } from '@/platform/db'

import {
  backupFileSchema,
  backupSchemaVersion,
  type BackupFile,
  type BackupSummary,
} from '../api/backup-contracts'
import {
  clearAndRestoreBackupData,
  createBackupRepository,
  resetLocalDataToFreshInstall,
} from '../data/backup-repository'
import { prepareFullBackupRestore } from '../domain/backup-preflight'
export { prepareFullBackupRestore } from '../domain/backup-preflight'
export type { BackupReplacementWork } from './backup-replacement-work'

type ExportFullBackupOptions = {
  exportedAt?: Date
  appVersion?: string
  extensionVersion?: string
}

export async function exportFullBackup(
  db: Db,
  options: ExportFullBackupOptions = {},
): Promise<BackupFile> {
  const exportedAt = options.exportedAt ?? new Date()
  const appVersion = options.appVersion ?? '0.0.0'
  const source: BackupFile['source'] = { appVersion }

  if (options.extensionVersion !== undefined) {
    source.extensionVersion = options.extensionVersion
  }

  const data = await createBackupRepository(db).readBackupData()

  return backupFileSchema.parse({
    schemaVersion: backupSchemaVersion,
    app: 'cognipace',
    exportedAt: exportedAt.toISOString(),
    source,
    data,
  })
}

export function validateFullBackup(input: unknown): BackupSummary {
  return prepareFullBackupRestore(input).summary
}

export async function restoreFullBackup(
  db: Db,
  input: unknown,
): Promise<BackupSummary> {
  const prepared = prepareFullBackupRestore(input)
  return restorePreparedFullBackup(db, prepared)
}

export async function restorePreparedFullBackup(
  db: Db,
  prepared: ReturnType<typeof prepareFullBackupRestore>,
): Promise<BackupSummary> {
  await clearAndRestoreBackupData(db, prepared)
  return prepared.summary
}

export async function restoreValidatedBackupData(
  db: Db,
  backup: BackupFile,
): Promise<BackupSummary> {
  return restoreFullBackup(db, backup)
}

export async function resetLocalData(db: Db, now = new Date()): Promise<null> {
  await resetLocalDataToFreshInstall(db, now)
  return null
}
