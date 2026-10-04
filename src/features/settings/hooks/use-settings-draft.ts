import { useEffect, useReducer, useRef, useState } from 'react'

import { readErrorMessage } from '@/utils/errors'

import { useSettings, useUpdateSettings } from '../api/settings-api'
import {
  useSettingsOperationGate,
  type SettingsOperationGate,
} from './use-settings-operation-gate'
import {
  createUserSettingsPatch,
  defaultAnalyticsTargets,
  defaultUserSettings,
  hasUserSettingsChanges,
  type StudyMode,
  type ThemeMode,
  type UserSettings,
} from '../domain'
import {
  applyNumberInputs,
  createFieldErrors,
  createNumberInputs,
  hasNumberInputTextChanges,
  type SettingsFieldErrors,
  type SettingsNumberField,
  type SettingsNumberInputs,
} from './settings-number-inputs'

export type {
  SettingsFieldErrors,
  SettingsNumberField,
  SettingsNumberInputs,
} from './settings-number-inputs'

export type SettingsDraftStatus = {
  tone: 'success' | 'danger' | 'neutral'
  message: string
} | null

export interface SettingsDraftActions {
  discard: () => void
  resetDefaults: () => Promise<void>
  retry: () => void
  save: () => Promise<void>
  setAutoDetectSolved: (value: boolean) => void
  setNumberInput: (field: SettingsNumberField, value: string) => void
  setRemindersEnabled: (value: boolean) => void
  setRemindersTime: (value: string) => void
  setRequireSolveTime: (value: boolean) => void
  setSkipPremium: (value: boolean) => void
  setStudyMode: (value: StudyMode) => void
  setStrictTiming: (value: boolean) => void
  setTargetRetention: (value: number) => void
  setThemeMode: (value: ThemeMode) => void
}

export interface SettingsDraftController {
  draft: UserSettings | null
  fieldErrors: SettingsFieldErrors
  hasChanges: boolean
  hasValidationErrors: boolean
  isError: boolean
  isInitialLoading: boolean
  isResettingDefaults: boolean
  isSaving: boolean
  loadError: string | null
  numberInputs: SettingsNumberInputs
  status: SettingsDraftStatus
  canDiscard: boolean
  canResetDefaults: boolean
  canSave: boolean
  actions: SettingsDraftActions
}

interface SettingsDraftState {
  draft: UserSettings | null
  numberInputs: SettingsNumberInputs
  saved: UserSettings | null
  status: SettingsDraftStatus
}

type SettingsDraftAction =
  | { type: 'discard' }
  | { type: 'loaded'; settings: UserSettings }
  | { type: 'number-input-changed'; field: SettingsNumberField; value: string }
  | { type: 'saved'; settings: UserSettings }
  | { type: 'set-auto-detect-solved'; value: boolean }
  | { type: 'set-reminders-enabled'; value: boolean }
  | { type: 'set-reminders-time'; value: string }
  | { type: 'set-require-solve-time'; value: boolean }
  | { type: 'set-skip-premium'; value: boolean }
  | { type: 'set-status'; status: SettingsDraftStatus }
  | { type: 'set-study-mode'; value: StudyMode }
  | { type: 'set-strict-timing'; value: boolean }
  | { type: 'set-target-retention'; value: number }
  | { type: 'set-theme-mode'; value: ThemeMode }

const initialNumberInputs = createNumberInputs(defaultUserSettings)

const initialDraftState: SettingsDraftState = {
  draft: null,
  numberInputs: initialNumberInputs,
  saved: null,
  status: null,
}

type SettingsMutationKind = 'resetDefaults' | 'save'

export function useSettingsDraft(
  sharedGate?: SettingsOperationGate,
  onReset?: (settings: UserSettings) => void,
): SettingsDraftController {
  const localGate = useSettingsOperationGate()
  const gate = sharedGate ?? localGate
  const settingsQuery = useSettings()
  const updateSettings = useUpdateSettings()
  const [state, dispatch] = useReducer(settingsDraftReducer, initialDraftState)
  const [pendingMutation, setPendingMutation] =
    useState<SettingsMutationKind | null>(null)
  const ownMutationPending = useRef(false)

  useEffect(() => {
    if (settingsQuery.data) {
      dispatch({ type: 'loaded', settings: settingsQuery.data })
    }
  }, [settingsQuery.data])

  const fieldErrors = createFieldErrors(state.numberInputs)
  const hasTimeError = Boolean(
    state.draft?.reminders.daily.enabled &&
    state.draft?.reminders.daily.time === '',
  )
  const hasValidationErrors =
    Object.values(fieldErrors).some(Boolean) || hasTimeError
  const hasChanges = hasLocalChanges(state)
  const hasSettingsChanges = hasPersistableSettingsChanges(state)
  const isMutatingSettings = updateSettings.isPending
  const isResettingDefaults =
    isMutatingSettings && pendingMutation === 'resetDefaults'
  const isSaving = isMutatingSettings && pendingMutation === 'save'
  const canSave =
    Boolean(state.saved && state.draft) &&
    hasSettingsChanges &&
    !hasValidationErrors &&
    !gate.activeOperation
  const canDiscard =
    Boolean(state.saved && state.draft) && hasChanges && !isMutatingSettings
  const canResetDefaults =
    Boolean(
      state.saved &&
      state.draft &&
      (hasUserSettingsChanges(defaultUserSettings, state.saved) ||
        hasUserSettingsChanges(defaultUserSettings, state.draft) ||
        hasNumberInputChanges(state)),
    ) && !gate.activeOperation
  const loadError = settingsQuery.isError
    ? readErrorMessage(settingsQuery.error, 'Failed to load settings.')
    : null

  async function save() {
    if (!state.saved || !state.draft || hasValidationErrors || gate.isBusy()) {
      return
    }

    const patch = createPreferencesPatch(state.saved, state.draft)

    if (!patch) {
      return
    }

    const release = gate.acquire('preferences')
    if (!release) return
    ownMutationPending.current = true
    dispatch({ type: 'set-status', status: null })
    setPendingMutation('save')

    try {
      const savedSettings = await updateSettings.mutateAsync({
        surface: 'dashboard',
        patch,
      })

      dispatch({ type: 'saved', settings: savedSettings })
      dispatch({
        type: 'set-status',
        status: { tone: 'success', message: 'Settings saved.' },
      })
    } catch (error) {
      dispatch({
        type: 'set-status',
        status: {
          tone: 'danger',
          message: readErrorMessage(error, 'Failed to save settings.'),
        },
      })
    } finally {
      ownMutationPending.current = false
      setPendingMutation(null)
      release()
    }
  }

  async function resetDefaults() {
    if (!state.saved || !state.draft || gate.isBusy()) {
      return
    }

    const release = gate.acquire('reset')
    if (!release) return
    ownMutationPending.current = true
    dispatch({ type: 'set-status', status: null })
    setPendingMutation('resetDefaults')

    try {
      const patch = {
        ...createUserSettingsPatch(
          settingsQuery.data ?? state.saved,
          defaultUserSettings,
        ),
        analytics: defaultAnalyticsTargets,
      }
      const savedSettings = await updateSettings.mutateAsync({
        surface: 'dashboard',
        patch,
      })

      dispatch({ type: 'saved', settings: savedSettings })
      onReset?.(savedSettings)

      dispatch({
        type: 'set-status',
        status: { tone: 'success', message: 'Settings reset to defaults.' },
      })
    } catch (error) {
      dispatch({
        type: 'set-status',
        status: {
          tone: 'danger',
          message: readErrorMessage(error, 'Failed to reset settings.'),
        },
      })
    } finally {
      ownMutationPending.current = false
      setPendingMutation(null)
      release()
    }
  }

  function dispatchEdit(action: SettingsDraftAction) {
    if (!ownMutationPending.current) dispatch(action)
  }

  return {
    draft: state.draft,
    fieldErrors,
    hasChanges,
    hasValidationErrors,
    isError: settingsQuery.isError,
    isInitialLoading: settingsQuery.isPending && !state.draft,
    isResettingDefaults,
    isSaving,
    loadError,
    numberInputs: state.numberInputs,
    status: state.status,
    canDiscard,
    canResetDefaults,
    canSave,
    actions: {
      discard: () => {
        if (ownMutationPending.current) return
        dispatch({ type: 'discard' })
      },
      resetDefaults,
      retry: () => {
        void settingsQuery.refetch()
      },
      save,
      setAutoDetectSolved: (value) => {
        dispatchEdit({ type: 'set-auto-detect-solved', value })
      },
      setNumberInput: (field, value) => {
        dispatchEdit({ type: 'number-input-changed', field, value })
      },
      setRequireSolveTime: (value) => {
        dispatchEdit({ type: 'set-require-solve-time', value })
      },
      setRemindersEnabled: (value) =>
        dispatchEdit({ type: 'set-reminders-enabled', value }),
      setRemindersTime: (value) =>
        dispatchEdit({ type: 'set-reminders-time', value }),
      setSkipPremium: (value) => {
        dispatchEdit({ type: 'set-skip-premium', value })
      },
      setStudyMode: (value) => {
        dispatchEdit({ type: 'set-study-mode', value })
      },
      setStrictTiming: (value) => {
        dispatchEdit({ type: 'set-strict-timing', value })
      },
      setTargetRetention: (value) => {
        dispatchEdit({ type: 'set-target-retention', value })
      },
      setThemeMode: (value) => {
        dispatchEdit({ type: 'set-theme-mode', value })
      },
    },
  }
}

function settingsDraftReducer(
  state: SettingsDraftState,
  action: SettingsDraftAction,
): SettingsDraftState {
  switch (action.type) {
    case 'discard':
      return state.saved
        ? createStateFromSettings(action.type, state.saved)
        : state
    case 'loaded':
      return hasLocalChanges(state)
        ? state
        : {
            ...createStateFromSettings(action.type, action.settings),
            status: state.status,
          }
    case 'number-input-changed':
      return applyNumberInputChange(state, action.field, action.value)
    case 'saved':
      return createStateFromSettings(action.type, action.settings)
    case 'set-auto-detect-solved':
      return updateDraft(state, (draft) => ({
        ...draft,
        overlay: {
          ...draft.overlay,
          autoDetectSolved: action.value,
        },
      }))
    case 'set-strict-timing':
      return updateDraft(state, (draft) => ({
        ...draft,
        assessment: {
          ...draft.assessment,
          strictTiming: draft.assessment.requireSolveTime
            ? action.value
            : false,
        },
      }))
    case 'set-reminders-enabled':
      return updateDraft(state, (draft) => ({
        ...draft,
        reminders: {
          ...draft.reminders,
          daily: { ...draft.reminders.daily, enabled: action.value },
        },
      }))
    case 'set-reminders-time':
      return updateDraft(state, (draft) => ({
        ...draft,
        reminders: {
          ...draft.reminders,
          daily: { ...draft.reminders.daily, time: action.value },
        },
      }))
    case 'set-require-solve-time':
      return updateDraft(state, (draft) => ({
        ...draft,
        assessment: {
          ...draft.assessment,
          requireSolveTime: action.value,
          strictTiming: action.value ? draft.assessment.strictTiming : false,
        },
      }))
    case 'set-skip-premium':
      return updateDraft(state, (draft) => ({
        ...draft,
        practice: {
          ...draft.practice,
          problemFilters: {
            ...draft.practice.problemFilters,
            skipPremium: action.value,
          },
        },
      }))
    case 'set-status':
      return { ...state, status: action.status }
    case 'set-study-mode':
      return updateDraft(state, (draft) => ({
        ...draft,
        practice: {
          ...draft.practice,
          mode: action.value,
        },
      }))
    case 'set-target-retention':
      return updateDraft(state, (draft) => ({
        ...draft,
        review: {
          ...draft.review,
          targetRetention: action.value,
        },
      }))
    case 'set-theme-mode':
      return updateDraft(state, (draft) => ({
        ...draft,
        appearance: {
          ...draft.appearance,
          themeMode: action.value,
        },
      }))
  }
}

function createStateFromSettings(
  reason: 'discard' | 'loaded' | 'saved',
  settings: UserSettings,
): SettingsDraftState {
  return {
    draft: settings,
    numberInputs: createNumberInputs(settings),
    saved: settings,
    status:
      reason === 'saved'
        ? { tone: 'success', message: 'Settings saved.' }
        : null,
  }
}

function updateDraft(
  state: SettingsDraftState,
  update: (draft: UserSettings) => UserSettings,
): SettingsDraftState {
  if (!state.draft) {
    return state
  }

  return {
    ...state,
    draft: update(state.draft),
    status: null,
  }
}

function applyNumberInputChange(
  state: SettingsDraftState,
  field: SettingsNumberField,
  value: string,
): SettingsDraftState {
  const nextState = {
    ...state,
    numberInputs: {
      ...state.numberInputs,
      [field]: value,
    },
    status: null,
  }

  if (!state.draft) {
    return nextState
  }

  const fieldErrors = createFieldErrors(nextState.numberInputs)

  if (Object.values(fieldErrors).some(Boolean)) {
    return nextState
  }

  return {
    ...nextState,
    draft: applyNumberInputs(state.draft, nextState.numberInputs),
  }
}

function hasLocalChanges(state: SettingsDraftState) {
  return hasPersistableSettingsChanges(state) || hasNumberInputChanges(state)
}

function hasPersistableSettingsChanges(state: SettingsDraftState) {
  return Boolean(
    state.saved &&
    state.draft &&
    createPreferencesPatch(state.saved, state.draft),
  )
}

function hasNumberInputChanges(state: SettingsDraftState) {
  return hasNumberInputTextChanges(state.draft, state.numberInputs)
}

function createPreferencesPatch(saved: UserSettings, draft: UserSettings) {
  const patch = createUserSettingsPatch(saved, draft)
  if (!patch) return null
  delete patch.aiAssessment
  return Object.keys(patch).length === 0 ? null : patch
}
