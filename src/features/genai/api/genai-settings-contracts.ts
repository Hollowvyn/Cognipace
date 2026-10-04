import { z } from 'zod'

import { aiProviderSecretSchema } from '../domain/genai-secrets-types'
import { genAiErrorCodes, genAiProviderIds } from '../domain/genai-types'

const surfaceSchema = z.enum(['popup', 'dashboard'])

export const getAiProviderSecretPresenceRequestSchema = z
  .object({
    surface: surfaceSchema,
  })
  .strict()

export const setAiProviderSecretRequestSchema = z
  .object({
    surface: surfaceSchema,
    provider: z.enum(genAiProviderIds),
    secret: aiProviderSecretSchema,
  })
  .strict()

export const clearAiProviderSecretRequestSchema = z
  .object({
    surface: surfaceSchema,
    provider: z.enum(genAiProviderIds),
  })
  .strict()

export type GetAiProviderSecretPresenceRequest = z.infer<
  typeof getAiProviderSecretPresenceRequestSchema
>
export type SetAiProviderSecretRequest = z.infer<
  typeof setAiProviderSecretRequestSchema
>
export type ClearAiProviderSecretRequest = z.infer<
  typeof clearAiProviderSecretRequestSchema
>

export const testAiConnectionRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
  provider: z.enum(genAiProviderIds),
  model: z.string().trim().min(1).max(120),
})

const connectionIdentity = {
  provider: z.enum(genAiProviderIds),
  model: z.string().min(1).max(120),
  durationMs: z.number().finite().min(0),
}

export const testAiConnectionResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('success'), ...connectionIdentity }),
  z.strictObject({
    status: z.literal('error'),
    ...connectionIdentity,
    code: z.enum([...genAiErrorCodes, 'stale-configuration']),
    message: z.string().min(1).max(500),
  }),
])

export type TestAiConnectionRequest = z.infer<
  typeof testAiConnectionRequestSchema
>
export type TestAiConnectionResponse = z.infer<
  typeof testAiConnectionResponseSchema
>
