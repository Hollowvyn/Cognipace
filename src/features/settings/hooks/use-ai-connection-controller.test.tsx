import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import { invalidateTaggedQueries } from '@/platform/query/cache-invalidation'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import { settingsUpdateRequestSchema } from '../api/settings-contracts'
import {
  defaultUserSettings,
  mergeUserSettings,
  type UserSettings,
} from '../domain'
import { useAiConnectionController } from './use-ai-connection-controller'
import { useSettingsDraft } from './use-settings-draft'
import { useSettingsOperationGate } from './use-settings-operation-gate'

vi.mock('@/extension/messaging', () => ({ sendMessage: vi.fn() }))

const testSuccess = {
  status: 'success' as const,
  provider: 'openai' as const,
  model: 'saved-model',
  durationMs: 12,
}

function createFixture(
  initial: UserSettings = {
    ...defaultUserSettings,
    aiAssessment: { enabled: false, provider: 'openai', model: 'saved-model' },
  },
) {
  let stored = initial
  let presence = {
    openai: true,
    anthropic: false,
    gemini: false,
    openrouter: false,
  }
  vi.mocked(sendMessage).mockImplementation((method, payload) => {
    if (method === 'settings.getSettings') return Promise.resolve(stored)
    if (method === 'genai.getAiProviderSecretPresence')
      return Promise.resolve(presence)
    if (method === 'settings.updateSettings') {
      stored = mergeUserSettings(
        stored,
        settingsUpdateRequestSchema.parse(payload).patch,
      )
      return Promise.resolve(stored)
    }
    if (method === 'genai.setAiProviderSecret') {
      presence = { ...presence, gemini: true }
      return Promise.resolve(presence)
    }
    if (method === 'genai.clearAiProviderSecret') {
      presence = { ...presence, openai: false }
      return Promise.resolve(presence)
    }
    if (method === 'genai.testConnection') return Promise.resolve(testSuccess)
    return Promise.reject(new Error(`Unexpected method ${method}`))
  })
  const harness = createQueryTestHarness()
  const hook = renderHook(
    () => {
      const gate = useSettingsOperationGate()
      const ai = useAiConnectionController(gate)
      return { ai, preferences: useSettingsDraft(gate, ai.actions.reset), gate }
    },
    { wrapper: harness.wrapper },
  )
  return { ...harness, ...hook, getStored: () => stored }
}

async function ready(fixture: ReturnType<typeof createFixture>) {
  await waitFor(() => expect(fixture.result.current.ai.canSubmit).toBe(true))
}

describe('useAiConnectionController', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preserves saved custom models, changes to real provider defaults, and clears unsaved secrets', async () => {
    const fixture = createFixture()
    await ready(fixture)
    expect(fixture.result.current.ai.model).toBe('saved-model')
    act(() => fixture.result.current.ai.actions.setKeyInput('temporary-key'))
    act(() => fixture.result.current.ai.actions.setProvider('gemini'))
    expect(fixture.result.current.ai.model).toBe('gemini-3.5-flash-lite')
    expect(fixture.result.current.ai.keyInput).toBe('')
    expect(fixture.result.current.ai.enabled).toBe(false)
    act(() => fixture.result.current.ai.actions.discard())
    expect(fixture.result.current.ai.model).toBe('saved-model')
    expect(fixture.result.current.ai.provider).toBe('openai')
  })

  it('tests unchanged saved configuration while assessment is off and never writes Settings', async () => {
    const fixture = createFixture()
    await ready(fixture)
    await act(async () => fixture.result.current.ai.actions.submit())
    expect(fixture.result.current.ai.connectionStatus).toBe('Connected')
    expect(sendMessage).not.toHaveBeenCalledWith(
      'settings.updateSettings',
      expect.anything(),
    )
    expect(sendMessage).not.toHaveBeenCalledWith(
      'genai.setAiProviderSecret',
      expect.anything(),
    )
  })

  it.each(['connected', 'pending'] as const)(
    'invalidates a %s test on external key replacement with unchanged presence',
    async (when) => {
      const fixture = createFixture()
      await ready(fixture)
      let finish: (() => void) | undefined
      if (when === 'pending') {
        vi.mocked(sendMessage).mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () => resolve(testSuccess)
            }),
        )
      }
      let completion: Promise<void> | undefined
      await act(async () => {
        completion = fixture.result.current.ai.actions.submit()
        if (when === 'connected') await completion
      })
      act(() => {
        void invalidateTaggedQueries(fixture.queryClient, ['genai'])
      })
      await act(async () => {
        finish?.()
        await completion
      })
      expect(fixture.result.current.ai.connectionStatus).toBe(
        'Saved key · not tested',
      )
      expect(fixture.result.current.ai.feedback).toBeNull()
    },
  )

  it('retains dirty provider/model after a key succeeds and Settings fails', async () => {
    const fixture = createFixture()
    await ready(fixture)
    act(() => fixture.result.current.ai.actions.setProvider('gemini'))
    act(() => fixture.result.current.ai.actions.setKeyInput('local-key'))
    const original = vi.mocked(sendMessage).getMockImplementation()!
    vi.mocked(sendMessage).mockImplementation((method, payload) =>
      method === 'settings.updateSettings'
        ? Promise.reject(new Error('private storage error'))
        : original(method, payload),
    )
    await act(async () => fixture.result.current.ai.actions.submit())
    expect(fixture.result.current.ai.keyInput).toBe('')
    expect(fixture.result.current.ai.provider).toBe('gemini')
    expect(fixture.result.current.ai.hasChanges).toBe(true)
    expect(fixture.result.current.ai.feedback?.message).toMatch(
      /Key saved; provider and model could not be saved/,
    )
    expect(sendMessage).not.toHaveBeenCalledWith(
      'genai.testConnection',
      expect.anything(),
    )
  })

  it('retains the key draft when its durable write fails', async () => {
    const fixture = createFixture()
    await ready(fixture)
    act(() => fixture.result.current.ai.actions.setKeyInput('local-key'))
    vi.mocked(sendMessage).mockRejectedValueOnce(
      new Error('private storage error'),
    )
    await act(async () => fixture.result.current.ai.actions.submit())
    expect(fixture.result.current.ai.keyInput).toBe('local-key')
    expect(fixture.result.current.ai.feedback?.message).toBe(
      'Could not save the connection. Your changes are ready to retry.',
    )
    expect(fixture.result.current.gate.isBusy()).toBe(false)
  })

  it('shows configuration saved when testing fails and keeps it ready for Test connection', async () => {
    const fixture = createFixture()
    await ready(fixture)
    vi.mocked(sendMessage).mockResolvedValueOnce({
      ...testSuccess,
      status: 'error',
      code: 'auth',
      message: 'The saved key was rejected.',
    })
    await act(async () => fixture.result.current.ai.actions.submit())
    expect(fixture.result.current.ai.feedback?.message).toBe(
      'Configuration saved; connection test failed. The saved key was rejected.',
    )
    expect(fixture.result.current.ai.hasChanges).toBe(false)
    expect(fixture.result.current.ai.canSubmit).toBe(true)
  })

  it('blocks duplicate tests and general persistence synchronously while allowing local preference edits', async () => {
    const fixture = createFixture()
    await ready(fixture)
    let finish: (() => void) | undefined
    vi.mocked(sendMessage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(testSuccess)
        }),
    )
    let completion: Promise<void> | undefined
    act(() => {
      completion = fixture.result.current.ai.actions.submit()
      void fixture.result.current.ai.actions.submit()
      void fixture.result.current.preferences.actions.resetDefaults()
    })
    await waitFor(() =>
      expect(
        vi
          .mocked(sendMessage)
          .mock.calls.filter(([method]) => method === 'genai.testConnection'),
      ).toHaveLength(1),
    )
    expect(fixture.result.current.preferences.canSave).toBe(false)
    expect(fixture.result.current.preferences.canResetDefaults).toBe(false)
    act(() =>
      fixture.result.current.preferences.actions.setNumberInput(
        'dailyGoal',
        '9',
      ),
    )
    expect(fixture.result.current.preferences.numberInputs.dailyGoal).toBe('9')
    await act(async () => {
      finish?.()
      await completion
    })
    expect(fixture.result.current.preferences.canSave).toBe(true)
  })

  it('removes a key but still permits disabling an enabled assessment', async () => {
    const fixture = createFixture({
      ...defaultUserSettings,
      aiAssessment: { enabled: true, provider: 'openai', model: '' },
    })
    await waitFor(() => expect(fixture.result.current.ai.enabled).toBe(true))
    await waitFor(() => expect(fixture.result.current.ai.hasKey).toBe(true))
    await act(async () => fixture.result.current.ai.actions.clearKey())
    expect(fixture.result.current.ai.hasKey).toBe(false)
    await act(async () =>
      fixture.result.current.ai.actions.setAssessmentEnabled(false),
    )
    expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
      surface: 'dashboard',
      patch: { aiAssessment: { enabled: false } },
    })
    expect(fixture.result.current.ai.enabled).toBe(false)
  })

  it('uses only saved configuration when enabling assessment and writes one scoped setting', async () => {
    const fixture = createFixture()
    await ready(fixture)
    act(() => fixture.result.current.ai.actions.setProvider('gemini'))
    await act(async () =>
      fixture.result.current.ai.actions.setAssessmentEnabled(true),
    )
    expect(fixture.getStored().aiAssessment).toEqual({
      enabled: true,
      provider: 'openai',
      model: 'saved-model',
    })
    expect(fixture.result.current.ai.provider).toBe('gemini')
    expect(fixture.result.current.ai.hasChanges).toBe(true)
  })

  it('reset clears AI draft and test feedback, restores a blank model, and leaves secrets saved', async () => {
    const fixture = createFixture()
    await ready(fixture)
    await act(async () => fixture.result.current.ai.actions.submit())
    act(() => fixture.result.current.ai.actions.setKeyInput('discarded-key'))
    await act(async () =>
      fixture.result.current.preferences.actions.resetDefaults(),
    )
    expect(fixture.result.current.ai.model).toBe('')
    expect(fixture.result.current.ai.keyInput).toBe('')
    expect(fixture.result.current.ai.feedback).toBeNull()
    expect(fixture.result.current.ai.hasKey).toBe(true)
    expect(sendMessage).not.toHaveBeenCalledWith(
      'genai.clearAiProviderSecret',
      expect.anything(),
    )
  })

  it('allows independent preference discard during a pending connection test', async () => {
    const fixture = createFixture()
    await ready(fixture)
    act(() =>
      fixture.result.current.preferences.actions.setNumberInput(
        'dailyGoal',
        '9',
      ),
    )
    let finish: (() => void) | undefined
    vi.mocked(sendMessage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(testSuccess)
        }),
    )
    let completion: Promise<void> | undefined
    await act(async () => {
      completion = fixture.result.current.ai.actions.submit()
      await Promise.resolve()
    })
    expect(fixture.result.current.preferences.canDiscard).toBe(true)
    act(() => fixture.result.current.preferences.actions.discard())
    expect(fixture.result.current.preferences.numberInputs.dailyGoal).toBe('4')
    expect(fixture.result.current.ai.step).toBe('testing')
    await act(async () => {
      finish?.()
      await completion
    })
    expect(fixture.result.current.ai.connectionStatus).toBe('Connected')
  })

  it('normalizes a whitespace-only model edit after testing the unchanged saved model', async () => {
    const fixture = createFixture()
    await ready(fixture)
    act(() => fixture.result.current.ai.actions.setModel(' saved-model '))
    await act(async () => fixture.result.current.ai.actions.submit())
    expect(fixture.result.current.ai.model).toBe('saved-model')
    expect(fixture.result.current.ai.hasChanges).toBe(false)
  })

  it('ignores a late test completion after unmount and releases its operation lease', async () => {
    const fixture = createFixture()
    await ready(fixture)
    let finish: (() => void) | undefined
    vi.mocked(sendMessage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(testSuccess)
        }),
    )
    let completion: Promise<void> | undefined
    await act(async () => {
      completion = fixture.result.current.ai.actions.submit()
      await Promise.resolve()
    })
    const isBusy = fixture.result.current.gate.isBusy
    expect(isBusy()).toBe(true)
    fixture.unmount()
    await act(async () => {
      finish?.()
      await completion
    })
    expect(isBusy()).toBe(false)
    expect(fixture.result.current.ai.feedback).toBeNull()
  })
})
