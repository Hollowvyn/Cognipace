import { getSettings } from '@/features/settings/server/settings-service'
import type { Db } from '@/platform/db'

import type { HintConnectionStatus } from '../api/hint-connection-contracts'
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

let hintConnectionRevisions = new WeakMap<
  Db,
  {
    issuedRead: number
    committedRead: number
    observation: { identity: string; revision: string } | null
  }
>()

export function resetAiHintConnectionRevisions(): void {
  hintConnectionRevisions = new WeakMap()
}

/** Trusted memory only: keep identity private; public revisions are unrelated UUIDs. */
export async function readAiHintConnectionSnapshot(db: Db): Promise<{
  config: GenAiProviderConfig | null
  identity: string
  status: HintConnectionStatus
}> {
  const registry = hintConnectionRevisions
  let state = registry.get(db)
  if (!state) {
    state = { issuedRead: 0, committedRead: 0, observation: null }
    registry.set(db, state)
  }
  const readOrder = ++state.issuedRead
  const settings = await getSettings(db)
  const ai = settings.aiAssessment
  const model = ai.model.trim()
  const saved = await loadAiProviderSecretSnapshotFromTrustedStorage(
    ai.provider,
  )
  const identity = JSON.stringify([ai.provider, model, saved?.identity ?? null])
  const observed = state.observation
  const revision =
    observed?.identity === identity ? observed.revision : crypto.randomUUID()
  // Late reads retain their own snapshot without replacing newer observations.
  // Reads begun before reset cannot write into the replacement registry.
  if (registry === hintConnectionRevisions && readOrder > state.committedRead) {
    state.committedRead = readOrder
    state.observation = { identity, revision }
  }
  const config: GenAiProviderConfig | null =
    model && saved
      ? { provider: ai.provider, model, apiKey: saved.secret.apiKey }
      : null
  const status: HintConnectionStatus = {
    available: config !== null,
    provider: ai.provider,
    revision,
  }

  return { config, identity, status }
}

export async function getAiHintConnectionStatus(
  db: Db,
): Promise<HintConnectionStatus> {
  return (await readAiHintConnectionSnapshot(db)).status
}
