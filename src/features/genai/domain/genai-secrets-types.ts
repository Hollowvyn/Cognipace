import { z } from 'zod'

import { genAiProviderIds } from './genai-types'

export const aiProviderSecretSchema = z
  .object({
    apiKey: z.string().min(1, 'Required'),
  })
  .strict()

export type AiProviderSecret = z.infer<typeof aiProviderSecretSchema>

export const aiProviderSecretsSchema = z
  .object({
    openai: aiProviderSecretSchema.optional(),
    anthropic: aiProviderSecretSchema.optional(),
    gemini: aiProviderSecretSchema.optional(),
  })
  .strict()

export type AiProviderSecrets = z.infer<typeof aiProviderSecretsSchema>

export const aiProviderSecretPresenceSchema = z.strictObject({
  openai: z.boolean(),
  anthropic: z.boolean(),
  gemini: z.boolean(),
})

export type AiProviderSecretPresence = z.infer<
  typeof aiProviderSecretPresenceSchema
>

export const emptyAiProviderSecrets: AiProviderSecrets = {}

export function makeEmptyAiProviderSecretPresence(): AiProviderSecretPresence {
  return Object.fromEntries(
    genAiProviderIds.map((id) => [id, false]),
  ) as AiProviderSecretPresence
}
