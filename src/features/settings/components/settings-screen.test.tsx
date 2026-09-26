import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TOOLTIP_EXIT_ANIMATION_MS } from '@/components/ui/tooltip'
import { sendMessage } from '@/extension/messaging'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import { defaultUserSettings } from '../domain'
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
})
