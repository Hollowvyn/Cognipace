import { z } from 'zod'

import { aiProviderIds } from '@/lib/ai/types'

export const hintConnectionRequestSchema = z.strictObject({
  surface: z.literal('content-script'),
})

export const hintConnectionStatusSchema = z.strictObject({
  available: z.boolean(),
  provider: z.enum(aiProviderIds),
  revision: z.uuid(),
})

export type HintConnectionRequest = z.infer<typeof hintConnectionRequestSchema>
export type HintConnectionStatus = z.infer<typeof hintConnectionStatusSchema>
