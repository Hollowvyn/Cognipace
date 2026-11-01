import {
  assertDatabaseIntegrity,
  validateSnapshotSchema,
} from '@/platform/db/snapshot-upgrade'
import { migrationSql } from '@/platform/db/migration-sql'
import { validatePracticeStorage } from '@/features/practice/server/practice-storage-service'
import {
  replacementCommandKey,
  replacementCommandRecordSchema,
} from '@/platform/db/snapshot-idb'
import { z } from 'zod'
import {
  abortDbReplacement,
  adoptPublishedCoreCandidate,
  createDetachedCoreCandidate,
  prepareDbReplacement,
} from '@/platform/db'
import type { LocalHead, LocalIdbStore } from '@/platform/db/local-store-types'
import { createCompositePublication } from '@/platform/db/composite-publication'
import { createArchiveGenerationRepository } from '@/features/notes/data/archive-generation-repository'
import {
  emptyNotesArchive,
  assertArchiveReferences,
} from '@/features/notes/domain/archive-validation'
import { resetPracticeSchedule } from '@/features/practice/server/practice-service'
import {
  bulkDeleteProblems,
  listProblemSlugs,
} from '@/features/problems/server/problems-service'
import { resetLocalData } from '@/features/backup/server/backup-service'
import { getBackgroundDb } from './app-db'
import type { PreparedReplacement } from './backup-replacement'

const inputSchema = z
  .strictObject({
    kind: z.enum(['problem-reset', 'problem-delete', 'reset']),
    commandId: z.string().trim().min(1),
    problemSlugs: z.array(z.string().trim().min(1)),
  })
  .refine((value) => value.kind === 'reset' || value.problemSlugs.length > 0)
export function problemDataRequestFingerprint(
  input: Pick<z.infer<typeof inputSchema>, 'kind' | 'problemSlugs'>,
) {
  return JSON.stringify([
    input.kind,
    [...new Set(input.problemSlugs.map((slug) => slug.trim()))].sort(),
  ])
}
export type ProblemDataReplacementInput = z.infer<typeof inputSchema>

/** Caller holds the single background mutation queue until preparation/publication completes. */
export async function prepareProblemDataReplacement(
  local: LocalIdbStore,
  raw: ProblemDataReplacementInput,
): Promise<PreparedReplacement> {
  const input = inputSchema.parse(raw)
  const completed = await local.readRecord(
    replacementCommandKey(input.commandId),
  )
  if (completed !== undefined) {
    const command = replacementCommandRecordSchema.parse(completed)
    if (command.requestFingerprint !== problemDataRequestFingerprint(input))
      throw new Error(
        'Problem data command identity conflict. Refresh and try again.',
      )
    throw new Error(
      'Problem data command was already committed. Refresh to see current data.',
    )
  }
  await getBackgroundDb()
  await prepareDbReplacement()
  let handle:
    | Awaited<ReturnType<typeof createDetachedCoreCandidate>>
    | undefined
  try {
    const head = await local.readHead()
    if (!head)
      throw new Error('Local data is unavailable. Refresh and try again.')
    const fingerprint = problemDataRequestFingerprint(input)
    const publication = createCompositePublication(local, head.fingerprint)
    const stored = await publication.loadPrepared(input.commandId, fingerprint)
    const slugs = [...new Set(input.problemSlugs)].sort()
    const bytes = stored?.bytes ?? (await local.readCore(head.coreSnapshotId))
    if (!bytes) throw new Error('Active core snapshot is unavailable.')
    try {
      handle = await createDetachedCoreCandidate(
        new Uint8Array(bytes),
        stored
          ? undefined
          : async ({ db }) => {
              if (input.kind === 'reset') await resetLocalData(db)
              else {
                const existing = new Set(await listProblemSlugs(db))
                if (slugs.some((slug) => !existing.has(slug)))
                  throw new Error(
                    'Problem data changed. Refresh before resetting or deleting.',
                  )
                if (input.kind === 'problem-delete')
                  await bulkDeleteProblems(db, {
                    surface: 'dashboard',
                    problemSlugs: slugs,
                    commandId: input.commandId,
                  })
                else
                  for (const problemSlug of slugs)
                    await resetPracticeSchedule(db, {
                      problemSlug,
                      keepLog: false,
                      clearSuspension: true,
                    })
              }
            },
      )
      if (stored) {
        await validateSnapshotSchema(handle, migrationSql)
        assertDatabaseIntegrity(handle)
        await validatePracticeStorage(handle.db)
      }
    } catch (error) {
      if (stored)
        throw new Error(
          'Recovery required: prepared replacement core failed validation.',
          { cause: error },
        )
      throw error
    }
    const candidateProblemSlugs = await listProblemSlugs(handle.db)
    const archive = createArchiveGenerationRepository(local)
    const existingScopes = new Map(
      (await archive.readProblemScopes(head.archiveGeneration)).map((scope) => [
        scope.problemSlug,
        scope,
      ]),
    )
    const missingScopeSlugs = candidateProblemSlugs
      .filter(
        (slug) =>
          !slugs.includes(slug) &&
          (input.kind === 'reset' ||
            existingScopes.get(slug)?.datasetToken !== head.datasetToken),
      )
      .sort()
    const descriptor = stored?.descriptor ?? {
      baseRevision: head.revision,
      coreSnapshotId: crypto.randomUUID(),
      archiveGeneration: crypto.randomUUID(),
      datasetToken:
        input.kind === 'reset' ? crypto.randomUUID() : head.datasetToken,
      replacementId: input.commandId,
      commandFingerprint: fingerprint,
      commandKind: input.kind,
      targetProblemScopes: slugs.map((problemSlug) => ({
        problemSlug,
        problemToken: crypto.randomUUID(),
      })),
      initializedProblemScopes: missingScopeSlugs.map((problemSlug) => ({
        problemSlug,
        problemToken: crypto.randomUUID(),
      })),
    }
    if (
      (input.kind === 'reset') ===
      (descriptor.datasetToken === head.datasetToken)
    )
      throw new Error(
        'Recovery required: prepared dataset scope does not match this operation.',
      )
    const scopes = descriptor.targetProblemScopes
    if (
      !scopes ||
      JSON.stringify(scopes.map((scope) => scope.problemSlug).sort()) !==
        JSON.stringify(slugs)
    )
      throw new Error(
        'Recovery required: prepared problem scopes are incomplete.',
      )
    const initializedScopes = descriptor.initializedProblemScopes
    if (
      !initializedScopes ||
      JSON.stringify(
        initializedScopes.map((scope) => scope.problemSlug).sort(),
      ) !== JSON.stringify(missingScopeSlugs)
    )
      throw new Error(
        'Recovery required: prepared initial problem scopes are incomplete.',
      )
    const candidate = { handle, descriptor }
    let published: LocalHead | undefined
    return {
      replacementId: input.commandId,
      summary: null,
      publish: async (publicationInput) => {
        await publication.prepare(candidate, async () => {
          if (input.kind === 'reset')
            await archive.stageImportedArchive({
              nextGeneration: candidate.descriptor.archiveGeneration,
              archive: emptyNotesArchive(),
            })
          else {
            await archive.stageArchiveGeneration({
              sourceGeneration: head.archiveGeneration,
              nextGeneration: candidate.descriptor.archiveGeneration,
              excludedProblemSlugs: slugs,
            })
          }
          await archive.stageProblemScopes({
            nextGeneration: candidate.descriptor.archiveGeneration,
            datasetToken: candidate.descriptor.datasetToken,
            rotated: scopes,
            initialized: initializedScopes,
          })
        })
        // Hydrated/copy staging must still prove complete logical ownership and
        // immutable body integrity before changing the active pair.
        await assertArchiveReferences(
          await archive.readArchiveGeneration(
            candidate.descriptor.archiveGeneration,
          ),
          candidateProblemSlugs,
        )
        published = await publication.publishCompositeCandidate(candidate, {
          ...publicationInput,
          commandFingerprint: problemDataRequestFingerprint(input),
        })
      },
      adopt: async () => {
        // A lost acknowledgement may have been reconciled by the coordinator.
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
