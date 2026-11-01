import { z } from 'zod'

import {
  parseBackupFileForCurrentApp,
  type BackupFile,
} from '@/features/backup/api/backup-contracts'

export const syncEnvelopeVersion = 1

const syncEnvelopePayloadSchema = z.strictObject({
  syncEnvelopeVersion: z.literal(syncEnvelopeVersion),
  app: z.literal('cognipace'),
  exportedAt: z.iso.datetime(),
  dataUpdatedAt: z.iso.datetime(),
  backup: z.unknown(),
})

const sourceInputs = new WeakMap<object, unknown>()
export const syncEnvelopeSchema = syncEnvelopePayloadSchema.transform(
  (envelope) => {
    const result = {
      ...envelope,
      backup: parseBackupFileForCurrentApp(envelope.backup),
    }
    sourceInputs.set(result, envelope.backup)
    return result
  },
)
/** Original format survives normalization without duplicating it in transport JSON. */
export function syncEnvelopeBackupInput(envelope: SyncEnvelope): unknown {
  return sourceInputs.get(envelope) ?? envelope.backup
}

export type SyncEnvelope = z.infer<typeof syncEnvelopeSchema>

const envelopePreflightSchema = z.object({
  syncEnvelopeVersion: z.number().int(),
  app: z.string(),
})

export function buildSyncEnvelope(input: {
  backup: BackupFile
  exportedAt?: Date | undefined
  dataUpdatedAt: string
}): SyncEnvelope {
  const exportedAt = input.exportedAt ?? new Date()

  return syncEnvelopeSchema.parse({
    syncEnvelopeVersion,
    app: 'cognipace',
    exportedAt: exportedAt.toISOString(),
    dataUpdatedAt: input.dataUpdatedAt,
    backup: input.backup,
  })
}

export function parseSyncEnvelopeForCurrentApp(input: unknown): SyncEnvelope {
  const envelope = envelopePreflightSchema.parse(input)

  if (envelope.app !== 'cognipace') {
    throw new Error('Selected Gist file is not a CogniPace sync file.')
  }

  if (envelope.syncEnvelopeVersion !== syncEnvelopeVersion) {
    throw new Error(
      `Unsupported sync envelope version ${envelope.syncEnvelopeVersion}.`,
    )
  }

  return syncEnvelopeSchema.parse(input)
}
