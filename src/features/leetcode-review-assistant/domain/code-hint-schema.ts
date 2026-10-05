import { z } from 'zod'

export const hintBatchSchema = z
  .strictObject({
    hints: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
  })
  .superRefine(({ hints }, ctx) => {
    if (new Set(hints).size !== hints.length) {
      ctx.addIssue({ code: 'custom', message: 'Pointers must be distinct.' })
    }
  })

export type HintBatch = z.infer<typeof hintBatchSchema>
