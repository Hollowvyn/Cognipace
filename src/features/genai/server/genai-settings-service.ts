import { getSettings } from '@/features/settings/server/settings-service'
import type { Db } from '@/platform/db'

import type {
  AiProviderSecret,
  AiProviderSecretPresence,
} from '../domain/genai-secrets-types'
import type {
  GenAiProviderConfig,
  GenAiProviderId,
} from '../domain/genai-types'
import {
  clearAiProviderSecretFromTrustedStorage,
  getAiProviderSecretPresenceFromTrustedStorage,
  loadAiProviderSecretSnapshotFromTrustedStorage,
  saveAiProviderSecretToTrustedStorage,
} from './genai-secret-storage'

export async function getAiProviderSecretPresence(): Promise<AiProviderSecretPresence> {
  return getAiProviderSecretPresenceFromTrustedStorage()
}

export async function setAiProviderSecret(
  provider: GenAiProviderId,
  secret: AiProviderSecret,
  afterPersist?: () => Promise<void>,
): Promise<AiProviderSecretPresence> {
  await saveAiProviderSecretToTrustedStorage(provider, secret)
  await afterPersist?.()
  return getAiProviderSecretPresenceFromTrustedStorage()
}

export async function clearAiProviderSecret(
  provider: GenAiProviderId,
  afterPersist?: () => Promise<void>,
): Promise<AiProviderSecretPresence> {
  await clearAiProviderSecretFromTrustedStorage(provider)
  await afterPersist?.()
  return getAiProviderSecretPresenceFromTrustedStorage()
}

export async function loadActiveProviderConfig(
  db: Db,
): Promise<GenAiProviderConfig | null> {
  return (await loadActiveProviderConfigSnapshot(db))?.config ?? null
}

/** Trusted memory only: identity may contain credential material. Never serialize it. */
export async function loadActiveProviderConfigSnapshot(
  db: Db,
): Promise<{ config: GenAiProviderConfig; identity: string } | null> {
  const settings = await getSettings(db)
  const ai = settings.aiAssessment
  const model = ai.model.trim()
  if (!ai.enabled || !model) return null

  const saved = await loadAiProviderSecretSnapshotFromTrustedStorage(
    ai.provider,
  )
  if (!saved) return null

  return {
    config: { provider: ai.provider, model, apiKey: saved.secret.apiKey },
    identity: JSON.stringify([ai.provider, model, saved.identity]),
  }
}

export async function isAiAssessmentAvailable(db: Db): Promise<boolean> {
  return (await loadActiveProviderConfig(db)) !== null
}
