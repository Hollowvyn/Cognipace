import { z } from 'zod'

export const secretProviderIdSchema = z.enum([
  'github:gist',
  'genai:openai',
  'genai:anthropic',
  'genai:google',
  'genai:openrouter',
])

export type SecretProviderId = z.infer<typeof secretProviderIdSchema>

export const secretStatusSchema = z.strictObject({
  provider: secretProviderIdSchema,
  configured: z.boolean(),
  updatedAt: z.iso.datetime().nullable(),
  fingerprint: z.string().nullable(),
})

export type SecretStatus = z.infer<typeof secretStatusSchema>

export const storedSecretSchema = z.strictObject({
  provider: secretProviderIdSchema,
  value: z.string().min(1),
  updatedAt: z.iso.datetime(),
  fingerprint: z.string().min(8),
})

export type StoredSecret = z.infer<typeof storedSecretSchema>
