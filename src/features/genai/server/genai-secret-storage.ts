import {
  deleteSecret,
  getSecretStatus,
  readSecret,
  readSecretSnapshot,
  saveSecret,
  type SecretProviderId,
} from '@/platform/secrets'
import { z } from 'zod'

import {
  aiProviderSecretSchema,
  makeEmptyAiProviderSecretPresence,
  type AiProviderSecret,
  type AiProviderSecretPresence,
} from '../domain/genai-secrets-types'
import { genAiProviderIds, type GenAiProviderId } from '../domain/genai-types'

const secretProviderByGenAiProvider = {
  openai: 'genai:openai',
  anthropic: 'genai:anthropic',
  gemini: 'genai:google',
} as const satisfies Record<GenAiProviderId, SecretProviderId>

export async function getAiProviderSecretPresenceFromTrustedStorage(): Promise<AiProviderSecretPresence> {
  const presence = makeEmptyAiProviderSecretPresence()

  await Promise.all(
    genAiProviderIds.map(async (provider) => {
      const status = await getSecretStatus(
        secretProviderByGenAiProvider[provider],
      )
      presence[provider] = status.configured
    }),
  )

  return presence
}

export async function saveAiProviderSecretToTrustedStorage(
  provider: GenAiProviderId,
  secret: AiProviderSecret,
): Promise<void> {
  const parsed = aiProviderSecretSchema.parse({
    ...secret,
    apiKey: secret.apiKey.trim(),
  })

  await saveSecret(
    secretProviderByGenAiProvider[provider],
    JSON.stringify(parsed),
  )
}

export async function clearAiProviderSecretFromTrustedStorage(
  provider: GenAiProviderId,
): Promise<void> {
  await deleteSecret(secretProviderByGenAiProvider[provider])
}

export async function loadAiProviderSecretFromTrustedStorage(
  provider: GenAiProviderId,
): Promise<AiProviderSecret | null> {
  const stored = await readSecret(secretProviderByGenAiProvider[provider])

  if (stored === null) {
    return null
  }

  return parseStoredAiProviderSecret(stored)
}

export async function loadAiProviderSecretSnapshotFromTrustedStorage(
  provider: GenAiProviderId,
) {
  const stored = await readSecretSnapshot(
    secretProviderByGenAiProvider[provider],
  )
  if (!stored) return null
  const secret = parseStoredAiProviderSecret(stored.value)
  if (!secret) return null
  return {
    secret,
    identity: JSON.stringify([
      stored.updatedAt,
      stored.fingerprint,
      stored.revision,
      stored.value,
    ]),
  }
}

function parseStoredAiProviderSecret(value: string): AiProviderSecret | null {
  try {
    const parsed = z
      .object({
        apiKey: z.string().min(1, 'Required'),
      })
      .passthrough()
      .parse(JSON.parse(value))

    return aiProviderSecretSchema.parse({ apiKey: parsed.apiKey })
  } catch {
    const legacySecret = aiProviderSecretSchema.safeParse({ apiKey: value })

    return legacySecret.success ? legacySecret.data : null
  }
}
