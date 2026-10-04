import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TOOLTIP_EXIT_ANIMATION_MS } from '@/components/ui/tooltip'
import { sendMessage } from '@/extension/messaging'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  defaultUserSettings,
  mergeUserSettings,
  type UserSettings,
} from '../domain'
import { settingsUpdateRequestSchema } from '../api/settings-contracts'
import { SettingsScreen } from './settings-screen'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

vi.mock('@/features/sync', () => ({
  GitHubSyncSettingsSection: () => (
    <section aria-label="GitHub sync settings">GitHub Sync</section>
  ),
}))

describe('SettingsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a compact loading state', () => {
    vi.mocked(sendMessage).mockReturnValue(new Promise(() => undefined))
    const { wrapper } = createQueryTestHarness()

    render(<SettingsScreen />, { wrapper })

    expect(screen.getByText('Loading settings…')).toBeInTheDocument()
  })

  it('shows a load error with retry affordance', async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error('Background offline'))
    const { wrapper } = createQueryTestHarness()

    render(<SettingsScreen />, { wrapper })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Background offline',
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
  })

  it('renders grouped lightweight settings with click-open hints', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()

    render(<SettingsScreen />, { wrapper })

    expect(
      await screen.findByRole('heading', { name: 'Practice Defaults' }),
    ).toBeVisible()
    expect(
      await screen.findByRole('heading', { name: 'Appearance' }),
    ).toBeVisible()
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Light' })).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Solving Overlay' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Review & Timing' }),
    ).toBeVisible()
    expect(screen.queryByText('Review order')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Due first' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Weakest first' })).toBeNull()
    expect(
      screen.queryByRole('radio', { name: 'Mix by difficulty' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Study mode details' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Timing targets details' }),
    ).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Easy' })).toHaveValue(
      defaultUserSettings.assessment.timeTargetsMinutes.easy,
    )
    expect(screen.getByRole('spinbutton', { name: 'Medium' })).toHaveValue(
      defaultUserSettings.assessment.timeTargetsMinutes.medium,
    )
    expect(screen.getByRole('spinbutton', { name: 'Hard' })).toHaveValue(
      defaultUserSettings.assessment.timeTargetsMinutes.hard,
    )
    expect(
      screen.queryByText(
        'Study plan follows the active track; free practice uses queue priority.',
      ),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Study mode details' }))

    expect(
      await screen.findByText(
        'Study plan follows the active track; free practice uses queue priority.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Experimental' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Notifications' })).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'Data Management' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Import content' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Clear local data' }),
    ).toBeVisible()
  })

  it('dismisses click-open hints predictably', async () => {
    const studyModeHint =
      'Study plan follows the active track; free practice uses queue priority.'
    const dailyGoalHint = 'How many problems CogniPace queues each day.'
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()

    try {
      render(<SettingsScreen />, { wrapper })

      await screen.findByRole('heading', { name: 'Practice Defaults' })
      vi.useFakeTimers()

      const studyModeDetails = screen.getByRole('button', {
        name: 'Study mode details',
      })
      const dailyGoalDetails = screen.getByRole('button', {
        name: 'Daily goal details',
      })

      fireEvent.click(studyModeDetails)
      act(() => {
        vi.advanceTimersByTime(0)
      })

      expect(screen.getByText(studyModeHint)).toBeVisible()

      fireEvent.click(studyModeDetails)

      act(() => {
        vi.advanceTimersByTime(TOOLTIP_EXIT_ANIMATION_MS)
      })

      expect(screen.queryByText(studyModeHint)).not.toBeInTheDocument()

      fireEvent.click(studyModeDetails)
      act(() => {
        vi.advanceTimersByTime(0)
      })
      fireEvent.pointerDown(dailyGoalDetails)
      fireEvent.click(dailyGoalDetails)
      act(() => {
        vi.advanceTimersByTime(0)
      })

      act(() => {
        vi.advanceTimersByTime(TOOLTIP_EXIT_ANIMATION_MS)
      })

      expect(screen.queryByText(studyModeHint)).not.toBeInTheDocument()
      expect(screen.getByText(dailyGoalHint)).toBeVisible()

      fireEvent.pointerDown(screen.getByLabelText('Daily goal'))

      act(() => {
        vi.advanceTimersByTime(TOOLTIP_EXIT_ANIMATION_MS)
      })

      expect(screen.queryByText(dailyGoalHint)).not.toBeInTheDocument()

      fireEvent.click(dailyGoalDetails)
      act(() => {
        vi.advanceTimersByTime(0)
      })
      expect(screen.getByText(dailyGoalHint)).toBeVisible()

      act(() => {
        vi.advanceTimersByTime(6000)
      })

      act(() => {
        vi.advanceTimersByTime(TOOLTIP_EXIT_ANIMATION_MS)
      })

      expect(screen.queryByText(dailyGoalHint)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('edits settings and saves the expected dashboard patch', async () => {
    const user = userEvent.setup()
    const savedSettings = {
      ...defaultUserSettings,
      practice: {
        ...defaultUserSettings.practice,
        dailyGoal: 7,
        mode: 'freePractice' as const,
        problemFilters: {
          skipPremium: true,
        },
      },
    }
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'settings.getSettings') {
        return Promise.resolve(defaultUserSettings)
      }

      if (method === 'settings.updateSettings') {
        return Promise.resolve(savedSettings)
      }

      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()

    render(<SettingsScreen />, { wrapper })

    await screen.findByRole('heading', { name: 'Practice Defaults' })
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Settings actions')).toBeVisible()
    expect(screen.getByText('No pending changes')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'Free practice' }))
    await user.clear(screen.getByLabelText('Daily goal'))
    await user.type(screen.getByLabelText('Daily goal'), '7')
    await user.click(
      screen.getByRole('switch', { name: 'Skip premium problems' }),
    )

    expect(screen.getByText('Unsaved changes')).toBeVisible()
    expect(screen.getByLabelText('Settings actions')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Save Settings' }))

    expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
      surface: 'dashboard',
      patch: {
        practice: {
          dailyGoal: 7,
          mode: 'freePractice',
          problemFilters: {
            skipPremium: true,
          },
        },
      },
    })
    const toast = await screen.findByRole('status', {
      name: 'Settings feedback',
    })
    expect(toast).toHaveTextContent('Settings saved.')
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled()
    expect(screen.getByText('No pending changes')).toBeVisible()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('edits appearance and saves only after Save Settings', async () => {
    const user = userEvent.setup()
    const savedSettings = {
      ...defaultUserSettings,
      appearance: {
        themeMode: 'light' as const,
      },
    }
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'settings.getSettings') {
        return Promise.resolve(defaultUserSettings)
      }

      if (method === 'settings.updateSettings') {
        return Promise.resolve(savedSettings)
      }

      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()

    render(<SettingsScreen />, { wrapper })

    await screen.findByRole('heading', { name: 'Appearance' })
    await user.click(screen.getByRole('radio', { name: 'Light' }))

    expect(screen.getByText('Unsaved changes')).toBeVisible()
    expect(sendMessage).not.toHaveBeenCalledWith(
      'settings.updateSettings',
      expect.anything(),
    )

    await user.click(screen.getByRole('button', { name: 'Save Settings' }))

    expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
      surface: 'dashboard',
      patch: {
        appearance: {
          themeMode: 'light',
        },
      },
    })
  })

  it('shows the strict timing dependency from the disabled switch', async () => {
    const user = userEvent.setup()
    const disabledReason =
      'Enable Require solve time before using strict timing.'
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()

    render(<SettingsScreen />, { wrapper })

    await screen.findByRole('heading', { name: 'Practice Defaults' })
    const strictTimingSwitch = screen.getByRole('switch', {
      name: 'Strict timing',
    })

    expect(screen.queryByText(disabledReason)).not.toBeInTheDocument()
    expect(strictTimingSwitch).toHaveAttribute('aria-disabled', 'true')

    await user.hover(strictTimingSwitch)

    expect(await screen.findByRole('tooltip')).toHaveTextContent(disabledReason)
    expect(strictTimingSwitch).toHaveAttribute('aria-checked', 'false')

    await user.unhover(strictTimingSwitch)

    await waitFor(() => {
      expect(screen.queryByText(disabledReason)).not.toBeInTheDocument()
    })

    fireEvent.click(strictTimingSwitch)

    expect(screen.queryByText(disabledReason)).not.toBeInTheDocument()
    expect(strictTimingSwitch).toHaveAttribute('aria-checked', 'false')

    strictTimingSwitch.focus()

    expect(await screen.findByRole('tooltip')).toHaveTextContent(disabledReason)

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByText(disabledReason)).not.toBeInTheDocument()
    })
  })

  it('renders the Reminders settings section', async () => {
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()
    render(<SettingsScreen />, { wrapper })
    expect(
      await screen.findByRole('heading', { name: 'Reminders' }),
    ).toBeVisible()
    expect(
      screen.getByRole('switch', { name: 'Daily reminder' }),
    ).toBeInTheDocument()
  })

  it('blocks invalid numeric saves with inline validation', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockResolvedValue(defaultUserSettings)
    const { wrapper } = createQueryTestHarness()

    render(<SettingsScreen />, { wrapper })

    await screen.findByRole('heading', { name: 'Practice Defaults' })
    await user.clear(screen.getByLabelText('Daily goal'))

    expect(screen.getByText('Required')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Fix highlighted settings',
    )
    expect(
      screen.queryByText('Fix the highlighted settings before saving.'),
    ).not.toBeInTheDocument()
  })

  it('saves and tests Gemini independently of dirty preferences and persists on remount', async () => {
    const user = userEvent.setup()
    let stored = defaultUserSettings
    let presence = { openai: false, anthropic: false, gemini: false }
    const calls: string[] = []
    vi.mocked(sendMessage).mockImplementation((method, payload) => {
      if (method === 'settings.getSettings') return Promise.resolve(stored)
      if (method === 'genai.getAiProviderSecretPresence')
        return Promise.resolve(presence)
      if (method === 'genai.setAiProviderSecret') {
        calls.push('key')
        presence = { ...presence, gemini: true }
        return Promise.resolve(presence)
      }
      if (method === 'settings.updateSettings') {
        calls.push('settings')
        stored = mergeUserSettings(
          stored,
          settingsUpdateRequestSchema.parse(payload).patch,
        )
        return Promise.resolve(stored)
      }
      if (method === 'genai.testConnection') {
        calls.push('test')
        return Promise.resolve({
          status: 'success',
          provider: 'gemini',
          model: 'my-gemini-model',
          durationMs: 42,
        })
      }
      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()
    const view = render(<SettingsScreen />, { wrapper })
    await screen.findByRole('heading', { name: 'AI connection' })
    await user.clear(screen.getByLabelText('Daily goal'))
    await user.type(screen.getByLabelText('Daily goal'), '9')
    await user.click(screen.getByRole('radio', { name: 'Gemini' }))
    expect(screen.getByLabelText('Model')).toHaveValue('gemini-3.5-flash-lite')
    await user.clear(screen.getByLabelText('Model'))
    await user.type(screen.getByLabelText('Model'), 'my-gemini-model')
    await user.type(screen.getByLabelText('Gemini API key'), 'local-test-key')
    await user.keyboard('{Enter}')
    await screen.findByText('Connected to Gemini · my-gemini-model.')
    expect(calls).toEqual(['key', 'settings', 'test'])
    expect(sendMessage).toHaveBeenCalledWith('settings.updateSettings', {
      surface: 'dashboard',
      patch: { aiAssessment: { provider: 'gemini', model: 'my-gemini-model' } },
    })
    expect(sendMessage).toHaveBeenCalledWith('genai.testConnection', {
      surface: 'dashboard',
      provider: 'gemini',
      model: 'my-gemini-model',
    })
    expect(stored.practice.dailyGoal).toBe(4)
    expect(screen.getByLabelText('Daily goal')).toHaveValue(9)
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled()
    expect(screen.getByLabelText('Gemini API key')).toHaveValue('')
    expect(
      screen.getByRole('switch', { name: 'AI assessment' }),
    ).toHaveAttribute('aria-checked', 'false')
    view.unmount()
    render(<SettingsScreen />, { wrapper })
    await waitFor(() =>
      expect(screen.getByLabelText('Model')).toHaveValue('my-gemini-model'),
    )
    expect(screen.getByRole('radio', { name: 'Gemini' })).toBeChecked()
    expect(screen.getByText('Saved key · not tested')).toBeVisible()
    expect(
      screen.queryByText('Connected to Gemini · my-gemini-model.'),
    ).toBeNull()
  })

  it('freezes preference and AI fields during general Save and rejects overlapping AI submission', async () => {
    const user = userEvent.setup()
    let stored: UserSettings = {
      ...defaultUserSettings,
      aiAssessment: {
        enabled: false,
        provider: 'openai' as const,
        model: 'saved-model',
      },
    }
    let finish: (() => void) | undefined
    vi.mocked(sendMessage).mockImplementation((method, payload) => {
      if (method === 'settings.getSettings') return Promise.resolve(stored)
      if (method === 'genai.getAiProviderSecretPresence')
        return Promise.resolve({
          openai: true,
          anthropic: false,
          gemini: false,
        })
      if (method === 'settings.updateSettings')
        return new Promise((resolve) => {
          finish = () => {
            stored = mergeUserSettings(
              stored,
              settingsUpdateRequestSchema.parse(payload).patch,
            )
            resolve(stored)
          }
        })
      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()
    render(<SettingsScreen />, { wrapper })
    await screen.findByRole('heading', { name: 'AI connection' })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Test connection' }),
      ).toBeEnabled(),
    )
    await user.click(screen.getByRole('radio', { name: 'Light' }))
    await user.click(screen.getByRole('button', { name: 'Save Settings' }))
    expect(screen.getByLabelText('Daily goal')).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeDisabled()
    expect(screen.getByLabelText('Model')).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Gemini' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Test connection' }),
    ).toBeDisabled()
    fireEvent.submit(screen.getByRole('form', { name: 'AI connection' }))
    expect(sendMessage).not.toHaveBeenCalledWith(
      'genai.testConnection',
      expect.anything(),
    )
    act(() => finish?.())
    await waitFor(() =>
      expect(screen.getByLabelText('Daily goal')).toBeEnabled(),
    )
    expect(
      screen.getByRole('button', { name: 'Test connection' }),
    ).toBeEnabled()
  })

  it('can reset unsaved AI changes when persisted preferences already use defaults', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (
        method === 'settings.getSettings' ||
        method === 'settings.updateSettings'
      )
        return Promise.resolve(defaultUserSettings)
      if (method === 'genai.getAiProviderSecretPresence')
        return Promise.resolve({
          openai: false,
          anthropic: false,
          gemini: false,
        })
      return Promise.reject(new Error(`Unexpected method ${method}`))
    })
    const { wrapper } = createQueryTestHarness()
    render(<SettingsScreen />, { wrapper })
    await screen.findByRole('heading', { name: 'AI connection' })
    await user.click(screen.getByRole('radio', { name: 'Gemini' }))
    await user.type(screen.getByLabelText('Gemini API key'), 'local-key')
    expect(screen.getByRole('button', { name: 'Reset Defaults' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Reset Defaults' }))
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'OpenAI' })).toBeChecked(),
    )
    expect(screen.getByLabelText('Model')).toHaveValue('')
    expect(screen.getByLabelText('OpenAI API key')).toHaveValue('')
  })
})
