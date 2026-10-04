import { useEffect, useReducer, useRef, useState } from 'react'

import {
  useClearAiProviderSecretMutation,
  useGenAiConfigurationRevision,
  useGenAiSecretPresenceQuery,
  useSetAiProviderSecretMutation,
  useTestAiConnectionMutation,
  type GenAiProviderId,
} from '@/features/genai'

import { useSettings, useUpdateSettings } from '../api/settings-api'
import { defaultUserSettings, type UserSettings } from '../domain'
import type { SettingsOperationGate } from './use-settings-operation-gate'

export const aiProviderLabels: Record<GenAiProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
}

export const aiProviderModelDefaults: Record<GenAiProviderId, string> = {
  openai: 'gpt-5.4-mini',
  anthropic: 'claude-haiku-4-5',
  gemini: 'gemini-3.5-flash-lite',
}

type ConnectionStep =
  | 'saving-key'
  | 'saving-settings'
  | 'testing'
  | 'removing-key'
  | 'saving-assessment'
  | null
type Feedback = {
  tone: 'success' | 'danger' | 'neutral'
  message: string
} | null
type TestState = {
  revision: number
  status: 'testing' | 'connected' | 'error'
} | null
type ConnectionDraft = {
  provider: GenAiProviderId
  model: string
  key: string
  saved: UserSettings['aiAssessment'] | null
}

export function useAiConnectionController(gate: SettingsOperationGate) {
  const settingsQuery = useSettings()
  const presenceQuery = useGenAiSecretPresenceQuery()
  const saveKey = useSetAiProviderSecretMutation()
  const removeKey = useClearAiProviderSecretMutation()
  const updateSettings = useUpdateSettings()
  const testConnection = useTestAiConnectionMutation()
  const { revision, readRevision } = useGenAiConfigurationRevision()
  const [draft, dispatchDraft] = useReducer(connectionDraftReducer, {
    ...defaultUserSettings.aiAssessment,
    key: '',
    saved: null,
  })
  const [step, setStep] = useState<ConnectionStep>(null)
  const [{ feedback, test }, dispatchFeedback] = useReducer(
    connectionFeedbackReducer,
    { feedback: null, test: null },
  )
  function setFeedback(feedback: Feedback) {
    dispatchFeedback({ type: 'feedback', feedback })
  }
  function setTest(test: TestState) {
    dispatchFeedback({ type: 'test', test })
  }
  const epoch = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      epoch.current += 1
    }
  }, [])

  useEffect(() => {
    const saved = settingsQuery.data?.aiAssessment
    if (!saved) return
    dispatchDraft({ type: 'loaded', saved })
  }, [settingsQuery.data])

  useEffect(() => {
    dispatchFeedback({ type: 'revision', revision })
  }, [revision])

  const hasChanges = hasDraftChanges(draft)
  const hasKey = presenceQuery.data?.[draft.provider] ?? false
  const saved = settingsQuery.data?.aiAssessment ?? draft.saved
  const isBusy = gate.activeOperation !== null
  const presenceReady = !presenceQuery.isPending && !presenceQuery.isError
  const canSubmit = Boolean(
    draft.saved &&
    presenceReady &&
    draft.model.trim() &&
    draft.model.trim().length <= 120 &&
    (draft.key.trim() || hasKey) &&
    !isBusy,
  )
  const canEnableAssessment = Boolean(
    saved &&
    presenceReady &&
    presenceQuery.data?.[saved.provider] &&
    saved.model.trim(),
  )
  const connectionStatus = presenceQuery.isPending
    ? 'Loading saved key…'
    : presenceQuery.isError
      ? 'Could not load saved keys.'
      : test?.status === 'connected'
        ? 'Connected'
        : test?.status === 'testing'
          ? 'Testing connection…'
          : test?.status === 'error'
            ? 'Connection test failed'
            : hasKey
              ? 'Saved key · not tested'
              : 'No saved key'

  function clearTest() {
    epoch.current += 1
    setTest(null)
    setFeedback(null)
  }

  function edit(
    update: Partial<Pick<ConnectionDraft, 'key' | 'model' | 'provider'>>,
  ) {
    if (gate.isBusy()) return
    clearTest()
    dispatchDraft({ type: 'changed', patch: update })
  }

  function reset(settings: UserSettings) {
    clearTest()
    dispatchDraft({ type: 'reset', saved: settings.aiAssessment })
  }

  async function submit() {
    if (!canSubmit) return
    const release = gate.acquire('ai')
    if (!release) return
    clearTest()
    const captured = {
      provider: draft.provider,
      model: draft.model.trim(),
      key: draft.key.trim(),
    }
    let keySaved = false
    let configurationSaved = false
    let testEpoch: number | null = null
    let testRevision: number | null = null
    try {
      if (captured.key) {
        setStep('saving-key')
        await saveKey.mutateAsync({
          provider: captured.provider,
          key: captured.key,
        })
        keySaved = true
        if (!mounted.current) return
        dispatchDraft({ type: 'changed', patch: { key: '' } })
      }
      if (
        captured.provider !== draft.saved?.provider ||
        captured.model !== draft.saved?.model
      ) {
        setStep('saving-settings')
        const settings = await updateSettings.mutateAsync({
          surface: 'dashboard',
          patch: {
            aiAssessment: {
              provider: captured.provider,
              model: captured.model,
            },
          },
        })
        if (!mounted.current) return
        dispatchDraft({
          type: 'changed',
          patch: {
            provider: captured.provider,
            model: captured.model,
            saved: settings.aiAssessment,
          },
        })
      }
      dispatchDraft({ type: 'changed', patch: { model: captured.model } })
      configurationSaved = true
      testEpoch = ++epoch.current
      testRevision = readRevision()
      setStep('testing')
      setTest({ status: 'testing', revision: testRevision })
      const result = await testConnection.mutateAsync({
        provider: captured.provider,
        model: captured.model,
      })
      if (
        !mounted.current ||
        testEpoch !== epoch.current ||
        testRevision !== readRevision()
      )
        return
      if (result.status === 'success') {
        setTest({ status: 'connected', revision: testRevision })
        setFeedback({
          tone: 'success',
          message: `Connected to ${aiProviderLabels[captured.provider]} · ${captured.model}.`,
        })
      } else {
        setTest({ status: 'error', revision: testRevision })
        setFeedback({
          tone: 'danger',
          message: `Configuration saved; connection test failed. ${result.message}`,
        })
      }
    } catch {
      if (
        !mounted.current ||
        (testEpoch !== null &&
          (testEpoch !== epoch.current || testRevision !== readRevision()))
      )
        return
      if (configurationSaved) {
        setTest({ status: 'error', revision: readRevision() })
        setFeedback({
          tone: 'danger',
          message:
            'Configuration saved; connection test failed. Please try again.',
        })
      } else if (keySaved) {
        setFeedback({
          tone: 'danger',
          message:
            'Key saved; provider and model could not be saved. Try Save & test connection again.',
        })
      } else {
        setFeedback({
          tone: 'danger',
          message:
            'Could not save the connection. Your changes are ready to retry.',
        })
      }
    } finally {
      if (mounted.current) setStep(null)
      release()
    }
  }

  async function clearKey() {
    if (!hasKey || !presenceReady) return
    const release = gate.acquire('ai')
    if (!release) return
    clearTest()
    setStep('removing-key')
    try {
      await removeKey.mutateAsync({ provider: draft.provider })
      if (!mounted.current) return
      dispatchDraft({ type: 'changed', patch: { key: '' } })
      setFeedback({
        tone: 'neutral',
        message: `${aiProviderLabels[draft.provider]} key removed.`,
      })
    } catch {
      if (mounted.current)
        setFeedback({
          tone: 'danger',
          message: 'Could not remove the key. Please try again.',
        })
    } finally {
      if (mounted.current) setStep(null)
      release()
    }
  }

  async function setAssessmentEnabled(enabled: boolean) {
    if (!saved || (enabled && !canEnableAssessment)) return
    const release = gate.acquire('ai')
    if (!release) return
    clearTest()
    setStep('saving-assessment')
    try {
      await updateSettings.mutateAsync({
        surface: 'dashboard',
        patch: { aiAssessment: { enabled } },
      })
      if (mounted.current)
        setFeedback({
          tone: 'neutral',
          message: `AI assessment ${enabled ? 'enabled' : 'disabled'}.`,
        })
    } catch {
      if (mounted.current)
        setFeedback({
          tone: 'danger',
          message: 'Could not save AI assessment. Please try again.',
        })
    } finally {
      if (mounted.current) setStep(null)
      release()
    }
  }

  return {
    provider: draft.provider,
    model: draft.model,
    keyInput: draft.key,
    enabled: saved?.enabled ?? false,
    hasChanges,
    hasKey,
    isBusy,
    canSubmit,
    canEnableAssessment,
    connectionStatus,
    feedback,
    step,
    presenceError: presenceQuery.isError,
    assessmentDisabledReason: !presenceReady
      ? 'Wait until saved keys can be loaded.'
      : !saved || !presenceQuery.data?.[saved.provider]
        ? 'Save a key for the saved provider first.'
        : 'Save a model first.',
    actions: {
      submit,
      clearKey,
      setAssessmentEnabled,
      reset,
      setModel: (model: string) => edit({ model }),
      setKeyInput: (key: string) => edit({ key }),
      setProvider: (provider: GenAiProviderId) => {
        if (provider !== draft.provider)
          edit({ provider, model: aiProviderModelDefaults[provider], key: '' })
      },
      discard: () => {
        if (gate.isBusy() || !saved) return
        clearTest()
        dispatchDraft({ type: 'reset', saved })
      },
      retryPresence: () => {
        void presenceQuery.refetch()
      },
    },
  }
}

type ConnectionDraftAction =
  | { type: 'loaded' | 'reset'; saved: UserSettings['aiAssessment'] }
  | { type: 'changed'; patch: Partial<ConnectionDraft> }

function connectionDraftReducer(
  draft: ConnectionDraft,
  action: ConnectionDraftAction,
): ConnectionDraft {
  if (action.type === 'changed') return { ...draft, ...action.patch }
  const saved = action.saved
  if (action.type === 'loaded' && hasDraftChanges(draft))
    return { ...draft, saved }
  return { provider: saved.provider, model: saved.model, key: '', saved }
}

type ConnectionFeedbackState = { feedback: Feedback; test: TestState }
type ConnectionFeedbackAction =
  | { type: 'feedback'; feedback: Feedback }
  | { type: 'test'; test: TestState }
  | { type: 'revision'; revision: number }

function connectionFeedbackReducer(
  state: ConnectionFeedbackState,
  action: ConnectionFeedbackAction,
): ConnectionFeedbackState {
  if (action.type === 'feedback') return { ...state, feedback: action.feedback }
  if (action.type === 'test') return { ...state, test: action.test }
  return state.test && state.test.revision !== action.revision
    ? { test: null, feedback: null }
    : state
}

function hasDraftChanges(draft: ConnectionDraft) {
  return Boolean(
    draft.key ||
    (draft.saved &&
      (draft.provider !== draft.saved.provider ||
        draft.model !== draft.saved.model)),
  )
}

export type AiConnectionController = ReturnType<
  typeof useAiConnectionController
>
