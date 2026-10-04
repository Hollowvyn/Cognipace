import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createPopupAppShellView } from '@/features/app-shell'
import type {
  AppShellProblemSummary,
  PopupAppShellController,
  PopupAppShellData,
} from '@/features/app-shell'

import { PopupShell } from './popup-shell'

const twoSum = {
  problemSlug: 'two-sum',
  title: 'Two Sum',
  difficulty: 'easy',
  isPremium: false,
} satisfies AppShellProblemSummary

const validParentheses = {
  problemSlug: 'valid-parentheses',
  title: 'Valid Parentheses',
  difficulty: 'easy',
  isPremium: false,
} satisfies AppShellProblemSummary

const shellGeneratedAt = new Date(2026, 0, 1, 12, 0, 0).toISOString()

const shellData = {
  surface: 'popup',
  generatedAt: shellGeneratedAt,
  status: {
    label: 'Practice ready',
    detail: '1 due, 1 new, 0 reinforcement available.',
  },
  metrics: [
    { label: 'Reviews Due', value: '1' },
    { label: 'Streak', value: '0 days' },
  ],
  practiceProgress: {
    completedToday: 0,
    recordedSecondsToday: 0,
    dailyGoal: 4,
    currentStreak: 0,
    goalMetToday: false,
    todayDateKey: '2026-01-01',
  },
  recommendation: {
    title: 'Valid Parentheses',
    detail: 'Review easy.',
    category: 'due',
    problem: validParentheses,
    dueAt: '2025-12-31T00:00:00.000Z',
  },
  activeTrack: {
    state: 'ready',
    trackId: 'leetcode-75',
    title: 'LeetCode 75',
    description: 'Focused starter track for interview patterns.',
    groupTitle: 'Arrays and Hashing',
    dueAt: '2026-03-01T00:00:00.000Z',
    progress: {
      completedCount: 0,
      totalCount: 1,
      percent: 0,
    },
    detail: 'Next: Two Sum',
    nextProblem: twoSum,
  },
  queue: {
    dueCount: 1,
    newCount: 1,
    reinforcementCount: 0,
    items: [
      {
        category: 'due',
        reason: 'overdue',
        problem: validParentheses,
        state: {
          problemSlug: 'valid-parentheses',
          cardId: 'valid-parentheses:default',
          status: 'review',
          phase: 'review',
          dueAt: '2025-12-31T00:00:00.000Z',
          lastReviewedAt: '2025-12-01T00:00:00.000Z',
          reviewCount: 1,
          lapses: 0,
          difficulty: 5,
          stability: 1,
          scheduledDays: 1,
          isSuspended: false,
          isStarted: true,
          isDue: true,
          isOverdue: true,
          overdueDays: 1,
          retrievability: 0.4,
          reviewHistory: [],
          recentAttempts: [],
          latestAttempt: null,
        },
      },
    ],
  },
  settings: {
    appearance: {
      themeMode: 'system',
    },
    practice: {
      dailyGoal: 4,
      mode: 'studyPlan',
      problemFilters: {
        skipPremium: false,
      },
    },
    review: {
      targetRetention: 0.9,
      order: 'dueFirst',
    },
    assessment: {
      requireSolveTime: false,
      strictTiming: false,
      timeTargetsMinutes: {
        easy: 20,
        medium: 35,
        hard: 50,
      },
    },
    aiAssessment: { enabled: false, provider: 'openai', model: '' },
  },
  popup: {
    queuePreview: [],
  },
} satisfies PopupAppShellData

describe('PopupShell', () => {
  it('applies the saved appearance theme to the popup surface', () => {
    render(
      <PopupShell
        controller={createController({
          data: {
            ...shellData,
            settings: {
              ...shellData.settings,
              appearance: {
                themeMode: 'dark',
              },
            },
          },
        })}
      />,
    )

    expect(screen.getByRole('main')).toHaveAttribute('data-cp-theme', 'dark')
  })

  it('renders real popup data and routes user actions through callbacks', async () => {
    const user = userEvent.setup()
    const controller = createController({ canShuffleRecommendation: true })

    render(<PopupShell controller={controller} />)

    expect(
      screen.getByRole('heading', { name: 'CogniPace' }),
    ).toBeInTheDocument()
    const metrics = screen.getByRole('region', { name: 'Practice Metrics' })
    expect(within(metrics).getByText('Reviews Due')).toBeInTheDocument()
    expect(within(metrics).getByText('0 days')).toBeInTheDocument()

    const recommendation = screen.getByRole('region', {
      name: 'Valid Parentheses',
    })
    expect(within(recommendation).queryByText('Due')).toBeNull()
    expect(within(recommendation).queryByText('Due today')).toBeNull()
    expect(within(recommendation).getByText('Easy')).toBeInTheDocument()
    expect(within(recommendation).getAllByText('Overdue')).toHaveLength(1)

    const activeTrack = screen.getByRole('region', { name: 'LeetCode 75' })
    expect(within(activeTrack).getByText('59 days left')).toBeInTheDocument()
    expect(within(activeTrack).queryByText('Due Mar 1, 2026')).toBeNull()
    expect(
      within(activeTrack).getByText('Arrays and Hashing'),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('Track progress 0 percent complete'),
    ).toBeInTheDocument()
    expect(within(activeTrack).getByText('Two Sum')).toBeInTheDocument()
    expect(
      screen.queryByText(/Open the current best review target/i),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open Overview' }))
    await user.click(screen.getByRole('button', { name: 'Open Settings' }))
    await user.click(screen.getByRole('button', { name: 'Open Tracks' }))
    await user.click(screen.getByRole('button', { name: 'Open Problem' }))
    await user.click(screen.getByRole('button', { name: 'Continue Track' }))
    await user.click(
      screen.getByRole('button', { name: 'Shuffle recommendation' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Start freestyle mode' }),
    )

    expect(controller.actions.openOverview).toHaveBeenCalledTimes(1)
    expect(controller.actions.openSettings).toHaveBeenCalledTimes(1)
    expect(controller.actions.openTracks).toHaveBeenCalledTimes(1)
    expect(controller.actions.openProblem).toHaveBeenNthCalledWith(
      1,
      validParentheses,
      'recommendation',
    )
    expect(controller.actions.openProblem).toHaveBeenNthCalledWith(
      2,
      twoSum,
      'track',
    )
    expect(controller.actions.shuffleRecommendation).toHaveBeenCalledTimes(1)
    expect(controller.actions.toggleStudyMode).toHaveBeenCalledTimes(1)
  })

  it('renders exactly one Due today badge for a due-today recommendation', () => {
    const dueTodayData = {
      ...shellData,
      recommendation: {
        ...shellData.recommendation,
        dueAt: '2026-01-01T00:00:00.000Z',
      },
      queue: {
        ...shellData.queue,
        items: shellData.queue.items.map((item) => ({
          ...item,
          reason: 'due-today' as const,
          state: { ...item.state, isOverdue: false },
        })),
      },
    }

    render(<PopupShell controller={createController({ data: dueTodayData })} />)

    const recommendation = screen.getByRole('region', {
      name: 'Valid Parentheses',
    })
    expect(within(recommendation).getAllByText('Due today')).toHaveLength(1)
    expect(within(recommendation).queryByText('Overdue')).toBeNull()
  })

  it('uses the popup preview reason when the aggregate queue omits the recommendation', () => {
    const previewOnlyData = {
      ...shellData,
      queue: { ...shellData.queue, items: [] },
      popup: {
        queuePreview: [
          {
            ...shellData.queue.items[0]!,
            reason: 'overdue' as const,
          },
        ],
      },
    }

    render(
      <PopupShell controller={createController({ data: previewOnlyData })} />,
    )

    const recommendation = screen.getByRole('region', {
      name: 'Valid Parentheses',
    })
    expect(within(recommendation).getAllByText('Overdue')).toHaveLength(1)
  })

  it('renders the freestyle card without active-track affordances in freestyle mode', () => {
    render(
      <PopupShell
        controller={createController({
          data: {
            ...shellData,
            settings: {
              ...shellData.settings,
              practice: {
                ...shellData.settings.practice,
                mode: 'freePractice',
              },
            },
            activeTrack: {
              state: 'disabled-free-practice',
              trackId: null,
              title: 'Track guidance disabled',
              description: null,
              groupTitle: null,
              dueAt: null,
              progress: {
                completedCount: 0,
                totalCount: 0,
                percent: 0,
              },
              detail: 'Free Practice uses queue recommendations only.',
              nextProblem: null,
            },
          },
          studyMode: 'freePractice',
        })}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Track guidance disabled' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Freestyle Mode')).toBeInTheDocument()
    expect(
      screen.getByText('Queue-first practice without track guidance.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Start study mode' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open Tracks' })).toBeNull()
    expect(screen.queryByText('Active Track')).toBeNull()
    expect(screen.queryByText('Up Next')).toBeNull()
    expect(screen.queryByText('Two Sum')).toBeNull()
    expect(screen.queryByText('Arrays and Hashing')).toBeNull()
    const freePractice = screen.getByRole('region', {
      name: 'Track guidance disabled',
    })
    expect(within(freePractice).queryByText('59 days left')).toBeNull()
    expect(within(freePractice).queryByText('Overdue')).toBeNull()
    expect(
      within(freePractice).queryByLabelText(
        /Track progress .* percent complete/i,
      ),
    ).toBeNull()
  })

  it('renders overdue active-track target status without a full due date', () => {
    render(
      <PopupShell
        controller={createController({
          data: {
            ...shellData,
            generatedAt: new Date(2026, 2, 2, 12, 0, 0).toISOString(),
          },
        })}
      />,
    )

    const activeTrack = screen.getByRole('region', { name: 'LeetCode 75' })
    expect(within(activeTrack).getByText('Overdue')).toBeInTheDocument()
    expect(within(activeTrack).queryByText('Due Mar 1, 2026')).toBeNull()
  })

  it('derives the study card from active-track state when settings mode is stale', () => {
    render(
      <PopupShell
        controller={createController({
          data: {
            ...shellData,
            settings: {
              ...shellData.settings,
              practice: {
                ...shellData.settings.practice,
                mode: 'freePractice',
              },
            },
          },
        })}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'LeetCode 75' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Free Practice' }),
    ).not.toBeInTheDocument()
  })

  it('disables the mode action while study mode is saving', () => {
    render(
      <PopupShell
        controller={createController({ isUpdatingStudyMode: true })}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Start freestyle mode' }),
    ).toBeDisabled()
  })

  it('renders compact empty and no-active-track states', () => {
    render(
      <PopupShell
        controller={createController({
          data: {
            ...shellData,
            recommendation: {
              title: 'Queue is clear',
              detail: 'No due reviews or extra practice are queued right now.',
              category: null,
              problem: null,
              dueAt: null,
            },
            activeTrack: {
              state: 'no-active-track',
              trackId: null,
              title: 'No active track',
              description: null,
              groupTitle: null,
              dueAt: null,
              progress: {
                completedCount: 0,
                totalCount: 0,
                percent: 0,
              },
              detail: 'Choose a track to restore guided progression.',
              nextProblem: null,
            },
            queue: {
              ...shellData.queue,
              dueCount: 0,
              newCount: 0,
              reinforcementCount: 0,
              items: [],
            },
            popup: { queuePreview: [] },
          },
        })}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Queue Clear' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'No active track' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Your review queue is clear/i)).toBeInTheDocument()
    expect(screen.queryByText('Up Next')).not.toBeInTheDocument()
  })

  it('surfaces load failure and disables study mode changes', () => {
    render(
      <PopupShell
        controller={createController({
          status: {
            scope: 'surface',
            message: 'Failed to load popup data.',
            isError: true,
          },
          canToggleStudyMode: false,
        })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load popup data.',
    )
    expect(
      screen.getByRole('button', { name: 'Start freestyle mode' }),
    ).toBeDisabled()
  })
})

function createController(
  overrides: Partial<PopupAppShellController> = {},
): PopupAppShellController {
  const data = overrides.data ?? shellData
  const studyMode = overrides.studyMode ?? data.settings.practice.mode
  const view = overrides.view ?? createPopupAppShellView(data)

  return {
    data,
    view,
    studyMode,
    status: null,
    isUpdatingStudyMode: false,
    canToggleStudyMode: true,
    canShuffleRecommendation: false,
    actions: {
      openOverview: vi.fn(),
      openSettings: vi.fn(),
      openTracks: vi.fn(),
      openProblem: vi.fn(),
      shuffleRecommendation: vi.fn(),
      toggleStudyMode: vi.fn(),
    },
    ...overrides,
  }
}
