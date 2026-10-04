import {
  secretStatusSchema,
  storedSecretSchema,
  type SecretProviderId,
  type SecretStatus,
} from './secret-contracts'
import { createSecretFingerprint } from './secret-redaction'

const secretKeyPrefix = 'cognipace_secret_v1:'
const secretRevisions = new Map<SecretProviderId, number>()

// Memoize by the storage area so every operation shares trusted readiness.
const storageReadiness = new WeakMap<ChromeStorageLocal, Promise<void>>()

export async function restrictSecretStorageAccess() {
  const localStorage = readChromeLocalStorage()
  let ready = storageReadiness.get(localStorage)

  if (!ready) {
    ready = Promise.resolve()
      .then(async () => {
        if (typeof localStorage.setAccessLevel !== 'function') {
          throw new Error(
            'Trusted secret storage is unavailable. Please retry.',
          )
        }
        await localStorage.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
      })
      .catch(() => {
        storageReadiness.delete(localStorage)
        throw new Error(
          'Trusted secret storage could not be initialized. Please retry.',
        )
      })
    storageReadiness.set(localStorage, ready)
  }

  await ready
}

export async function saveSecret(
  provider: SecretProviderId,
  value: string,
  now = new Date(),
) {
  await restrictSecretStorageAccess()
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    throw new Error('Secret value is required.')
  }

  const storedSecret = storedSecretSchema.parse({
    provider,
    value: normalizedValue,
    updatedAt: now.toISOString(),
    fingerprint: await createSecretFingerprint(normalizedValue),
  })

  await readChromeLocalStorage().set({
    [createSecretStorageKey(provider)]: storedSecret,
  })
  secretRevisions.set(provider, (secretRevisions.get(provider) ?? 0) + 1)
}

// Internal trusted snapshot; never serialize this into a runtime response.
export async function readSecretSnapshot(provider: SecretProviderId) {
  const revision = secretRevisions.get(provider) ?? 0
  const stored = await readStoredSecret(provider)
  return stored ? { ...stored, revision } : null
}

export async function readSecret(provider: SecretProviderId) {
  const stored = await readStoredSecret(provider)
  return stored?.value ?? null
}

export async function deleteSecret(provider: SecretProviderId) {
  await restrictSecretStorageAccess()
  await readChromeLocalStorage().remove(createSecretStorageKey(provider))
  secretRevisions.set(provider, (secretRevisions.get(provider) ?? 0) + 1)
}

export async function getSecretStatus(
  provider: SecretProviderId,
): Promise<SecretStatus> {
  const stored = await readStoredSecret(provider)

  return secretStatusSchema.parse({
    provider,
    configured: Boolean(stored),
    updatedAt: stored?.updatedAt ?? null,
    fingerprint: stored?.fingerprint ?? null,
  })
}

async function readStoredSecret(provider: SecretProviderId) {
  await restrictSecretStorageAccess()
  const result = await readChromeLocalStorage().get(
    createSecretStorageKey(provider),
  )
  const value = result[createSecretStorageKey(provider)]
  const parsed = storedSecretSchema.safeParse(value)

  if (!parsed.success || parsed.data.provider !== provider) {
    return null
  }

  return parsed.data
}

function createSecretStorageKey(provider: SecretProviderId) {
  return `${secretKeyPrefix}${provider}`
}

function readChromeLocalStorage(): ChromeStorageLocal {
  if (
    typeof chrome === 'undefined' ||
    typeof chrome.storage === 'undefined' ||
    typeof chrome.storage.local === 'undefined'
  ) {
    throw new Error('chrome.storage.local is not available.')
  }

  return chrome.storage.local
}

type ChromeStorageLocal = {
  get(keys: string[] | string): Promise<Record<string, unknown>>
  set(values: Record<string, unknown>): Promise<void>
  remove(keys: string[] | string): Promise<void>
  setAccessLevel?:
    | ((options: { accessLevel: 'TRUSTED_CONTEXTS' }) => Promise<void>)
    | undefined
}
