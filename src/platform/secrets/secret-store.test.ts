import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deleteSecret,
  getSecretStatus,
  readSecret,
  restrictSecretStorageAccess,
  saveSecret,
} from './secret-store'

const storage = new Map<string, unknown>()
const setAccessLevel = vi.fn()

beforeEach(() => {
  storage.clear()
  setAccessLevel.mockReset()
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get(keys: string[] | string) {
          const output: Record<string, unknown> = {}
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            output[key] = storage.get(key)
          }
          return Promise.resolve(output)
        },
        set(values: Record<string, unknown>) {
          for (const [key, value] of Object.entries(values)) {
            storage.set(key, value)
          }
          return Promise.resolve()
        },
        remove(keys: string[] | string) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            storage.delete(key)
          }
          return Promise.resolve()
        },
        setAccessLevel,
      },
    },
  })
})

describe('secret store', () => {
  it('stores and reads provider secrets from chrome local storage', async () => {
    await saveSecret('github:gist', 'ghp_secret')

    await expect(readSecret('github:gist')).resolves.toBe('ghp_secret')
  })

  it('returns status without exposing raw secret values', async () => {
    await saveSecret('github:gist', 'ghp_secret')

    const status = await getSecretStatus('github:gist')

    expect(status).toMatchObject({
      provider: 'github:gist',
      configured: true,
    })
    expect(typeof status.updatedAt).toBe('string')
    expect(typeof status.fingerprint).toBe('string')
    expect(JSON.stringify(status)).not.toContain('ghp_secret')
  })

  it('deletes secrets and clears configured status', async () => {
    await saveSecret('github:gist', 'ghp_secret')
    await deleteSecret('github:gist')

    await expect(readSecret('github:gist')).resolves.toBeNull()
    await expect(getSecretStatus('github:gist')).resolves.toMatchObject({
      configured: false,
      fingerprint: null,
    })
  })

  it('ignores stored secrets whose provider does not match the storage key', async () => {
    storage.set('cognipace_secret_v1:github:gist', {
      provider: 'genai:openai',
      value: 'sk_secret',
      updatedAt: new Date().toISOString(),
      fingerprint: '12345678',
    })

    await expect(readSecret('github:gist')).resolves.toBeNull()
    await expect(getSecretStatus('github:gist')).resolves.toMatchObject({
      configured: false,
      fingerprint: null,
    })
  })

  it('waits for one restriction attempt before any concurrent secret access', async () => {
    let ready!: () => void
    setAccessLevel.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve
        }),
    )
    const get = vi.spyOn(chrome.storage.local, 'get')
    const removeFromStorage = vi.spyOn(chrome.storage.local, 'remove')
    const read = readSecret('github:gist')
    const save = saveSecret('genai:openai', 'sk-test')
    const remove = deleteSecret('genai:anthropic')
    await Promise.resolve()
    expect(setAccessLevel).toHaveBeenCalledTimes(1)
    expect(storage.size).toBe(0)
    expect(get).not.toHaveBeenCalled()
    expect(removeFromStorage).not.toHaveBeenCalled()
    ready()
    await Promise.all([read, save, remove])
    expect(storage.size).toBe(1)
  })

  it('fails closed and retries a failed storage restriction', async () => {
    setAccessLevel.mockRejectedValueOnce(new Error('restriction failed'))
    await expect(saveSecret('github:gist', 'ghp_secret')).rejects.toThrow()
    expect(storage.size).toBe(0)
    await saveSecret('github:gist', 'ghp_secret')
    expect(setAccessLevel).toHaveBeenCalledTimes(2)
    await expect(readSecret('github:gist')).resolves.toBe('ghp_secret')
  })

  it('restricts local storage to trusted extension contexts', async () => {
    await restrictSecretStorageAccess()

    expect(setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    })
  })
})

it.each(['read', 'status', 'save', 'delete'] as const)(
  'fails closed before %s storage access when restriction fails',
  async (operation) => {
    setAccessLevel.mockRejectedValueOnce(new Error('restriction failed'))
    const get = vi.spyOn(chrome.storage.local, 'get')
    const set = vi.spyOn(chrome.storage.local, 'set')
    const remove = vi.spyOn(chrome.storage.local, 'remove')
    const execute = {
      read: () => readSecret('genai:openai'),
      status: () => getSecretStatus('genai:openai'),
      save: () => saveSecret('genai:openai', 'fake-private-key'),
      delete: () => deleteSecret('genai:openai'),
    }[operation]
    await expect(execute()).rejects.toThrow(/trusted secret storage/i)
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  },
)

it('keeps the OpenRouter secret independent and exposes presence without its value', async () => {
  await saveSecret('genai:openai', 'openai-private-key')
  await saveSecret('genai:openrouter', 'openrouter-private-key')
  await expect(readSecret('genai:openrouter')).resolves.toBe(
    'openrouter-private-key',
  )
  const status = await getSecretStatus('genai:openrouter')
  expect(status).toMatchObject({
    provider: 'genai:openrouter',
    configured: true,
  })
  expect(JSON.stringify(status)).not.toContain('openrouter-private-key')
  await deleteSecret('genai:openrouter')
  await expect(readSecret('genai:openrouter')).resolves.toBeNull()
  await expect(readSecret('genai:openai')).resolves.toBe('openai-private-key')
})
