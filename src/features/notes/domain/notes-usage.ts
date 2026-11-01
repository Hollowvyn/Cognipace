import { z } from 'zod'
export const notesArchiveUsageSchema = z.strictObject({
  active: z.strictObject({
    notes: z.number().int().nonnegative(),
    submissions: z.number().int().nonnegative(),
    assessments: z.number().int().nonnegative(),
    savedAiNotes: z.number().int().nonnegative(),
    payloads: z.number().int().nonnegative(),
    logicalPayloadBytes: z.number().int().nonnegative(),
  }),
  recoveryLogicalPayloadBytes: z.number().int().nonnegative(),
  technicalRecords: z.number().int().nonnegative(),
  browserStorageEstimate: z
    .strictObject({
      usageBytes: z.number().nonnegative().optional(),
      quotaBytes: z.number().nonnegative().optional(),
    })
    .nullable(),
})
