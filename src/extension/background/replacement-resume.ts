import { z } from 'zod'
import { prepareFullBackupRestore } from '@/features/backup/domain/backup-preflight'
import { remoteReplacementMetadataSchema } from '@/features/sync/server/sync-service'
import {
  replacementSourceKey,
  type PendingCompositePreparation,
} from '@/platform/db/composite-publication'
import type { LocalIdbStore } from '@/platform/db/local-store-types'
import {
  prepareFullBackupReplacement,
  fullBackupRequestFingerprint,
} from './full-backup-service'
import {
  prepareProblemDataReplacement,
  problemDataRequestFingerprint,
} from './problem-data-service'

const baseRecipe = z.object({
  sourceArchiveGeneration: z.string().min(1),
  sourceCoreSnapshotId: z.string().min(1),
  sourceDatasetToken: z.string().min(1),
})
const recipeSchema = z.discriminatedUnion('owner', [
  baseRecipe
    .extend({
      owner: z.literal('problem-data'),
      input: z.strictObject({
        commandId: z.string().min(1),
        kind: z.enum(['reset', 'problem-reset', 'problem-delete']),
        problemSlugs: z.array(z.string().min(1)),
      }),
    })
    .strict(),
  baseRecipe
    .extend({
      owner: z.literal('full-backup'),
      commandId: z.string().min(1),
      inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
      sourceSchemaVersion: z.number().int().min(1).max(7),
      sourceIdentity: z.string().nullable(),
      preview: z.unknown(),
    })
    .strict(),
])

/** Read-only admission validation: never opens SQLite or submits queue work. */
export async function validatePendingReplacement(
  local: LocalIdbStore,
  record: PendingCompositePreparation,
) {
  const recipe = recipeSchema.parse(record.resume.recipe)
  const { descriptor, resume } = record
  const head = await local.readHead()
  if (
    !head ||
    head.revision !== descriptor.baseRevision ||
    head.coreSnapshotId !== recipe.sourceCoreSnapshotId ||
    head.archiveGeneration !== recipe.sourceArchiveGeneration ||
    head.datasetToken !== recipe.sourceDatasetToken ||
    descriptor.commandKind !== resume.kind
  )
    throw new Error(
      'Recovery required: prepared replacement source base changed.',
    )
  if (recipe.owner === 'problem-data') {
    if (
      recipe.input.commandId !== descriptor.replacementId ||
      recipe.input.kind !== resume.kind ||
      problemDataRequestFingerprint(recipe.input) !==
        descriptor.commandFingerprint ||
      resume.summary !== null ||
      record.sourceReference !== undefined ||
      resume.syncMetadataPatch !== undefined
    )
      throw new Error('Recovery required: prepared problem command changed.')
  } else {
    if (
      (resume.kind !== 'restore' && resume.kind !== 'gist-pull') ||
      recipe.commandId !== descriptor.replacementId ||
      record.sourceReference !== recipe.commandId ||
      JSON.stringify(['restore', recipe.inputDigest]) !==
        descriptor.commandFingerprint
    )
      throw new Error('Recovery required: accepted backup binding changed.')
    const preview = await local.readRecord(['backup-preview', recipe.commandId])
    if (JSON.stringify(preview ?? null) !== JSON.stringify(recipe.preview))
      throw new Error('Recovery required: accepted backup preview changed.')
    if (recipe.preview !== null) {
      const binding = z
        .object({
          inputDigest: z.string(),
          sourceSchemaVersion: z.number(),
          sourceIdentity: z.string().nullable(),
          kind: z.string(),
          revision: z.number(),
        })
        .parse(recipe.preview)
      if (
        binding.inputDigest !== recipe.inputDigest ||
        binding.sourceSchemaVersion !== recipe.sourceSchemaVersion ||
        binding.sourceIdentity !== recipe.sourceIdentity ||
        binding.kind !== resume.kind ||
        binding.revision !== descriptor.baseRevision
      )
        throw new Error(
          'Recovery required: accepted backup source identity changed.',
        )
    }
    if (resume.kind === 'gist-pull')
      remoteReplacementMetadataSchema.parse(resume.syncMetadataPatch)
    else if (resume.syncMetadataPatch !== undefined)
      throw new Error('Recovery required: unexpected restore bookkeeping.')
  }
  return recipe
}

/** Called only by authenticated, serialized generic Retry saving. */
export async function resumePendingReplacement(
  local: LocalIdbStore,
  record: PendingCompositePreparation,
) {
  const recipe = await validatePendingReplacement(local, record)
  if (recipe.owner === 'problem-data')
    return prepareProblemDataReplacement(local, recipe.input)
  const source = await local.readRecord(
    replacementSourceKey(record.sourceReference!),
  )
  if (source === undefined)
    throw new Error('Recovery required: accepted backup source is missing.')
  const prepared = await prepareFullBackupRestore(source)
  if (
    prepared.inputDigest !== recipe.inputDigest ||
    prepared.sourceSchemaVersion !== recipe.sourceSchemaVersion ||
    fullBackupRequestFingerprint(prepared) !==
      record.descriptor.commandFingerprint ||
    JSON.stringify(prepared.summary) !== JSON.stringify(record.resume.summary)
  )
    throw new Error('Recovery required: accepted backup source changed.')
  return prepareFullBackupReplacement(local, {
    prepared,
    commandId: recipe.commandId,
    kind: record.resume.kind as 'restore' | 'gist-pull',
    ...(recipe.sourceIdentity ? { sourceIdentity: recipe.sourceIdentity } : {}),
  })
}
