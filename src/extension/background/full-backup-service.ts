import { z } from 'zod'
import {
  abortDbReplacement,
  adoptPublishedCoreCandidate,
  createDetachedCoreCandidate,
  prepareDbReplacement,
  flushDbSnapshot,
} from '@/platform/db'
import { createCompositePublication } from '@/platform/db/composite-publication'
import type { LocalHead, LocalIdbStore } from '@/platform/db/local-store-types'
import {
  replacementCommandKey,
  replacementCommandRecordSchema,
} from '@/platform/db/snapshot-idb'
import {
  assertDatabaseIntegrity,
  validateSnapshotSchema,
} from '@/platform/db/snapshot-upgrade'
import { migrationSql } from '@/platform/db/migration-sql'
import { validatePracticeStorage } from '@/features/practice/server/practice-storage-service'
import { listProblemSlugs } from '@/features/problems/server/problems-service'
import { createArchiveGenerationRepository } from '@/features/notes/data/archive-generation-repository'
import { assertArchiveReferences } from '@/features/notes/domain/archive-validation'
import {
  exportFullBackup,
  restorePreparedFullBackup,
} from '@/features/backup/server/backup-service'
import {
  prepareFullBackupRestore,
  type PreparedBackupRestore,
} from '@/features/backup/domain/backup-preflight'
import { backupRestorePreviewSchema } from '@/features/backup/api/backup-contracts'
import { getBackgroundDb } from './app-db'
import type { PreparedReplacement } from './backup-replacement'

export function fullBackupRequestFingerprint(prepared: PreparedBackupRestore) {
  return JSON.stringify(['restore', prepared.inputDigest])
}

/** Queue-free primitive. The caller must hold the FULL mutation gate throughout. */
export async function exportDurableFullBackup(local: LocalIdbStore) {
  await getBackgroundDb()
  await flushDbSnapshot()
  const head = await local.readHead()
  if (!head) throw new Error('Active local data is unavailable.')
  const { db } = await getBackgroundDb()
  const notesArchive = await createArchiveGenerationRepository(
    local,
  ).readArchiveGeneration(head.archiveGeneration)
  const backup = await exportFullBackup(db, { notesArchive })
  const after = await local.readHead()
  if (
    after?.revision !== head.revision ||
    after.coreSnapshotId !== head.coreSnapshotId ||
    after.archiveGeneration !== head.archiveGeneration
  )
    throw new Error('Local data changed during backup export. Try again.')
  return { backup, revision: head.revision }
}

const previewRecordSchema = z.strictObject({
  inputDigest: z.string(),
  revision: z.number().int(),
  sourceSchemaVersion: z.number().int(),
  kind: z.enum(['restore', 'gist-pull']),
  sourceIdentity: z.string().nullable(),
})
/** Selected input and current local pair are bound by a private persisted capability. */
export async function createFullBackupPreview(
  local: LocalIdbStore,
  input: unknown,
  options: { kind?: 'restore' | 'gist-pull'; sourceIdentity?: string } = {},
) {
  await getBackgroundDb()
  await flushDbSnapshot()
  const head = await local.readHead()
  if (!head) throw new Error('Active local data is unavailable.')
  const archive = await createArchiveGenerationRepository(
    local,
  ).readArchiveGeneration(head.archiveGeneration)
  const currentArchiveHasData =
    archive.notes.length +
      archive.submissions.length +
      archive.assessments.length +
      archive.savedAiNotes.length >
    0
  const prepared = await prepareFullBackupRestore(input, {
    currentArchiveHasData,
  })
  const confirmationToken = crypto.randomUUID()
  await local.transact(['records'], 'readwrite', (stores, done) => {
    stores.records.put(
      {
        inputDigest: prepared.inputDigest,
        revision: head.revision,
        sourceSchemaVersion: prepared.sourceSchemaVersion,
        kind: options.kind ?? 'restore',
        sourceIdentity: options.sourceIdentity ?? null,
      },
      ['backup-preview', confirmationToken],
    )
    done(undefined)
  })
  return backupRestorePreviewSchema.parse({
    ...prepared.summary,
    confirmationToken,
    sourceSchemaVersion: prepared.sourceSchemaVersion,
    archiveAbsent: prepared.archiveAbsent,
    removesCurrentArchive: prepared.removesCurrentArchive,
  })
}
export async function validateFullBackupConfirmation(
  local: LocalIdbStore,
  input: unknown,
  confirmationToken: string | undefined,
  options: { kind?: 'restore' | 'gist-pull'; sourceIdentity?: string } = {},
) {
  if (!confirmationToken)
    throw new Error(
      'Refresh required: select the backup again for a new preview before restoring.',
    )
  const prepared = await prepareFullBackupRestore(input)
  const preview = previewRecordSchema.safeParse(
    await local.readRecord(['backup-preview', confirmationToken]),
  )
  if (
    !preview.success ||
    preview.data.inputDigest !== prepared.inputDigest ||
    preview.data.sourceSchemaVersion !== prepared.sourceSchemaVersion ||
    preview.data.kind !== (options.kind ?? 'restore') ||
    preview.data.sourceIdentity !== (options.sourceIdentity ?? null)
  )
    throw new Error(
      'Backup preview no longer matches the selected file. Select it again.',
    )
  const completed = await local.readRecord(
    replacementCommandKey(confirmationToken),
  )
  if (completed !== undefined) {
    const command = replacementCommandRecordSchema.parse(completed)
    if (
      command.kind !== (options.kind ?? 'restore') ||
      command.requestFingerprint !== fullBackupRequestFingerprint(prepared)
    )
      throw new Error(
        'Backup preview command identity conflicts. Select the file again.',
      )
    return prepared
  }
  await flushDbSnapshot()
  if ((await local.readHead())?.revision !== preview.data.revision)
    throw new Error(
      'Local data changed. Select the backup again and review a fresh preview before restoring.',
    )
  return prepared
}

/** Detached owner composition; caller holds the shared mutation queue. */
export async function prepareFullBackupReplacement(
  local: LocalIdbStore,
  input: {
    prepared: PreparedBackupRestore
    commandId: string
    kind?: 'restore' | 'gist-pull'
  },
): Promise<PreparedReplacement> {
  const fingerprint = fullBackupRequestFingerprint(input.prepared)
  const previewCapability = await local.readRecord([
    'backup-preview',
    input.commandId,
  ])
  const commandKind =
    input.kind ??
    (previewCapability === undefined
      ? 'restore'
      : previewRecordSchema.parse(previewCapability).kind)
  const completed = await local.readRecord(
    replacementCommandKey(input.commandId),
  )
  if (completed !== undefined)
    throw new Error(
      'This backup restore was already committed. Refresh to see current data.',
    )
  await getBackgroundDb()
  await prepareDbReplacement()
  let handle:
    | Awaited<ReturnType<typeof createDetachedCoreCandidate>>
    | undefined
  try {
    const head = await local.readHead()
    if (!head) throw new Error('Active local data is unavailable.')
    const publication = createCompositePublication(local, head.fingerprint)
    const stored = await publication.loadPrepared(input.commandId, fingerprint)
    const bytes = stored?.bytes ?? (await local.readCore(head.coreSnapshotId))
    if (!bytes) throw new Error('Active core snapshot is unavailable.')
    handle = await createDetachedCoreCandidate(
      new Uint8Array(bytes),
      stored
        ? undefined
        : async ({ db }) => {
            await restorePreparedFullBackup(db, input.prepared)
          },
    )
    if (stored) {
      await validateSnapshotSchema(handle, migrationSql)
      assertDatabaseIntegrity(handle)
      await validatePracticeStorage(handle.db)
    }
    const problemSlugs = (await listProblemSlugs(handle.db)).sort()
    const descriptor = stored?.descriptor ?? {
      baseRevision: head.revision,
      coreSnapshotId: crypto.randomUUID(),
      archiveGeneration: crypto.randomUUID(),
      datasetToken: crypto.randomUUID(),
      replacementId: input.commandId,
      commandFingerprint: fingerprint,
      commandKind,
      initializedProblemScopes: problemSlugs.map((problemSlug) => ({
        problemSlug,
        problemToken: crypto.randomUUID(),
      })),
    }
    if (
      descriptor.datasetToken === head.datasetToken ||
      JSON.stringify(
        descriptor.initializedProblemScopes
          ?.map((scope) => scope.problemSlug)
          .sort(),
      ) !== JSON.stringify(problemSlugs)
    )
      throw new Error(
        'Recovery required: prepared full replacement scopes are incomplete.',
      )
    const candidate = { handle, descriptor }
    const archive = createArchiveGenerationRepository(local)
    let published: LocalHead | undefined
    return {
      replacementId: input.commandId,
      summary: input.prepared.summary,
      publish: async (publicationInput) => {
        await publication.prepare(candidate, async () => {
          await archive.stageImportedArchive({
            nextGeneration: descriptor.archiveGeneration,
            archive: input.prepared.notesArchive,
          })
          await archive.stageProblemScopes({
            nextGeneration: descriptor.archiveGeneration,
            datasetToken: descriptor.datasetToken,
            rotated: [],
            initialized: descriptor.initializedProblemScopes!,
          })
        })
        await assertArchiveReferences(
          await archive.readArchiveGeneration(descriptor.archiveGeneration),
          problemSlugs,
        )
        published = await publication.publishCompositeCandidate(candidate, {
          ...publicationInput,
          commandFingerprint: fingerprint,
        })
      },
      adopt: async () => {
        published ??= (await local.readHead()) ?? undefined
        if (!published) throw new Error('Published replacement is unavailable.')
        await adoptPublishedCoreCandidate(candidate, published, local)
      },
    }
  } catch (error) {
    handle?.rawDb.close()
    abortDbReplacement()
    throw error
  }
}

/** The surrounding remote-restore queue guard owns dirty-local/overwrite admission.
 * An unchanged durable base resumes its prior candidate; a new explicit pull
 * after a later admitted local revision is a separate replacement operation. */
export async function prepareGistFullBackupReplacement(
  local: LocalIdbStore,
  prepared: PreparedBackupRestore,
): Promise<PreparedReplacement> {
  await getBackgroundDb()
  await flushDbSnapshot()
  const head = await local.readHead()
  if (!head) throw new Error('Active local data is unavailable.')
  return prepareFullBackupReplacement(local, {
    prepared,
    commandId: `gist-${prepared.inputDigest}-${head.revision}`,
    kind: 'gist-pull',
  })
}
