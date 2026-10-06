import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { makeValidAnalysis } from '@/features/leetcode-review-assistant/testing'

import { initialOverlaySessionState } from '../../../domain'
import { ExpandedOverlay } from './expanded-overlay'

describe('ExpandedOverlay', () => {
  it('presents hints in Solve Help and hands off reveal and toggle actions', async () => {
    const props = createProps({
      view: {
        hints: {
          status: 'ready',
          isOpen: true,
          history: [
            {
              snapshot: { code: '', language: 'typescript', capturedAt: 1 },
              hint: {
                text: 'First pointer',
                strength: 'light',
                progress: 'initial',
              },
            },
          ],
        },
      },
    })
    render(<ExpandedOverlay {...props} />)
    const user = userEvent.setup()
    expect(screen.getByRole('region', { name: 'AI hints' })).toBeInTheDocument()
    expect(screen.getByText('First pointer')).toBeInTheDocument()
    expect(screen.queryByText('Second pointer')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Get next hint' }))
    await user.click(screen.getByRole('button', { name: 'Show AI hints' }))
    expect(props.commands.onRevealNextHint).toHaveBeenCalledOnce()
    expect(props.commands.onToggleHints).toHaveBeenCalledOnce()
  })

  it('hands off hint retry and settings from Solve Help', async () => {
    const props = createProps({
      view: {
        hints: {
          history: [],
          status: 'error',
          isOpen: true,
          code: 'auth',
          message: 'Check AI connection.',
          canRetry: true,
          showSettings: true,
        },
      },
    })
    render(<ExpandedOverlay {...props} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retry hints' }))
    await user.click(screen.getByRole('button', { name: 'AI settings' }))
    expect(props.commands.onRetryHints).toHaveBeenCalledOnce()
    expect(props.commands.onSettings).toHaveBeenCalledOnce()
  })

  it('keeps review actions in Solve and shows focused AI and Notes panels', () => {
    const props = createProps()
    const { rerender } = render(<ExpandedOverlay {...props} />)

    expect(screen.getByRole('button', { name: 'Submit' })).toBeVisible()

    rerender(
      <ExpandedOverlay
        {...props}
        view={{
          ...props.view,
          overlay: { ...props.view.overlay, expandedTab: 'ai' },
        }}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    expect(screen.getByRole('region', { name: 'AI assessment' })).toBeVisible()

    rerender(
      <ExpandedOverlay
        {...props}
        view={{
          ...props.view,
          overlay: { ...props.view.overlay, expandedTab: 'notes' },
        }}
      />,
    )

    expect(
      screen.getByText(
        'A dedicated space for your problem notes, coming in a later phase.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
  })

  it('retains AI disclosure identity and scroll position when switching panels', async () => {
    const user = userEvent.setup()
    const props = createProps({
      view: {
        aiAnalysis: {
          status: 'ready',
          requestId: 'request-1',
          report: makeValidAnalysis(),
        },
        overlay: {
          ...initialOverlaySessionState,
          visualMode: 'expanded',
          expandedTab: 'ai',
        },
      },
    })
    const { rerender } = render(<ExpandedOverlay {...props} />)
    const approach = screen.getByText('Approach', { selector: 'summary' })
    await user.click(approach)
    const details = approach.closest('details')
    const scrollContainer = screen.getByRole('tabpanel', { name: /^AI/ })
      .firstElementChild as HTMLDivElement
    scrollContainer.scrollTop = 137
    fireEvent.scroll(scrollContainer)

    rerender(
      <ExpandedOverlay
        {...props}
        view={{
          ...props.view,
          overlay: { ...props.view.overlay, expandedTab: 'solve' },
        }}
      />,
    )
    scrollContainer.scrollTop = 0
    fireEvent.scroll(scrollContainer)
    rerender(<ExpandedOverlay {...props} />)

    expect(
      screen.getByText('Approach', { selector: 'summary' }).closest('details'),
    ).toBe(details)
    expect(details).toHaveAttribute('open')
    expect(scrollContainer.scrollTop).toBe(137)
  })

  it('tabs from AI into its Settings action without visiting hidden Solve controls', async () => {
    const user = userEvent.setup()
    renderExpanded({
      view: {
        aiAnalysis: {
          status: 'unavailable',
          message: 'Connect AI in Settings.',
          canRetry: false,
          showSettings: true,
        },
        overlay: {
          ...initialOverlaySessionState,
          visualMode: 'expanded',
          expandedTab: 'ai',
        },
      },
    })

    screen.getByRole('tab', { name: /^AI/ }).focus()
    await user.tab()

    expect(
      within(screen.getByRole('region', { name: 'AI assessment' })).getByRole(
        'button',
        { name: 'Settings' },
      ),
    ).toHaveFocus()
  })

  it('renders the pre-submit review console', () => {
    renderExpanded()

    expect(
      screen.getByRole('complementary', { name: 'CogniPace review overlay' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Two Sum' })).toBeInTheDocument()
    expect(screen.getByText('No submissions yet')).toBeInTheDocument()
    expect(screen.getByText('After first submission')).toBeInTheDocument()
    expect(screen.getByText('Assessment')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: "I Couldn't Finish" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Restart' }),
    ).not.toBeInTheDocument()
  })

  it('collapses from the collapse button', async () => {
    const user = userEvent.setup()
    const onCollapse = vi.fn()

    renderExpanded({ commands: { onCollapse } })

    await user.click(screen.getByRole('button', { name: 'Collapse Overlay' }))

    expect(onCollapse).toHaveBeenCalledOnce()
  })

  it('does not collapse from the non-interactive header row', async () => {
    const user = userEvent.setup()
    const onCollapse = vi.fn()

    renderExpanded({ commands: { onCollapse } })

    await user.click(screen.getByRole('banner'))

    expect(onCollapse).not.toHaveBeenCalled()
  })

  it('does not collapse when header utility buttons are clicked', async () => {
    const user = userEvent.setup()
    const onCollapse = vi.fn()
    const onSettings = vi.fn()

    renderExpanded({ commands: { onCollapse, onSettings } })

    await user.click(screen.getByRole('button', { name: 'Open Settings' }))

    expect(onSettings).toHaveBeenCalledOnce()
    expect(onCollapse).not.toHaveBeenCalled()
  })

  it('renders post-submit update actions without duplicate submit', () => {
    renderExpanded({ view: { overlay: createSubmittedOverlay() } })

    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Submit' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the submitted footer shrinkable for a long next title', () => {
    const longTitle = 'Find First and Last Position of Element in Sorted Array'

    renderExpanded({
      view: {
        overlay: {
          ...createSubmittedOverlay(),
          nextStep: {
            status: 'ready',
            value: {
              ...nextStep,
              problem: {
                ...nextStep.problem,
                title: longTitle,
              },
              title: longTitle,
            },
            message: null,
          },
        },
      },
    })

    const nextCard = screen.getByRole('region', { name: 'Up next' })

    expect(nextCard.parentElement).toHaveClass(
      'min-w-0',
      'grid-cols-[minmax(0,1fr)]',
    )
    expect(screen.getByRole('heading', { name: longTitle })).toHaveClass(
      'truncate',
    )
  })

  it('opens the next problem in the same tab from the post-submit card', () => {
    renderExpanded({
      view: {
        overlay: {
          ...createSubmittedOverlay(),
          nextStep: {
            status: 'ready',
            value: nextStep,
            message: null,
          },
        },
      },
    })

    const link = screen.getByRole('link', { name: 'Open' })

    expect(link).toHaveAttribute(
      'href',
      'https://leetcode.com/problems/valid-parentheses/',
    )
    expect(link).not.toHaveAttribute('target')
    expect(link).not.toHaveAttribute('rel')
  })

  it('keeps failed attempts locked', () => {
    renderExpanded({
      view: {
        overlay: createFailedSubmittedOverlay(),
      },
    })

    expect(
      screen.queryByRole('textbox', { name: 'Notes' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled()
  })

  it('renders scored analysis independently of selected rating, locks, and mutation state', async () => {
    const user = userEvent.setup()
    const onRetryAiAnalysis = vi.fn()
    const onSettings = vi.fn()
    const onSelectRating = vi.fn()
    renderExpanded({
      commands: { onRetryAiAnalysis, onSettings, onSelectRating },
      view: {
        aiAnalysis: {
          status: 'ready',
          requestId: 'request-1',
          report: makeValidAnalysis(),
        },
        overlay: {
          ...createFailedSubmittedOverlay(),
          reviewStatus: 'saving',
          expandedTab: 'ai',
        },
      },
    })
    expect(
      screen.getByRole('region', { name: 'AI assessment' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Approach 3/5')).toBeInTheDocument()
    await user.click(screen.getByText('Approach', { selector: 'summary' }))
    expect(onSelectRating).not.toHaveBeenCalled()
  })

  it('passes analysis recovery actions through the expanded panel', async () => {
    const user = userEvent.setup()
    const onRetryAiAnalysis = vi.fn()
    const onSettings = vi.fn()
    renderExpanded({
      commands: { onRetryAiAnalysis, onSettings },
      view: {
        aiAnalysis: {
          status: 'unavailable',
          message: 'Configure AI assessment.',
          canRetry: true,
          showSettings: true,
        },
        overlay: {
          ...initialOverlaySessionState,
          visualMode: 'expanded',
          expandedTab: 'ai',
        },
      },
    })
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onRetryAiAnalysis).toHaveBeenCalledOnce()
    expect(onSettings).toHaveBeenCalledOnce()
  })

  it('keeps Help without structured-log controls', () => {
    renderExpanded()

    expect(screen.getByRole('region', { name: 'Help' })).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Structured Log' }),
    ).not.toBeInTheDocument()
    for (const label of [
      'Interview Pattern',
      'Time Complexity',
      'Space Complexity',
      'Languages',
    ]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    }
    expect(
      screen.queryByRole('textbox', { name: 'Notes' }),
    ).not.toBeInTheDocument()
  })
})

function renderExpanded(overrides?: Parameters<typeof createProps>[0]) {
  render(<ExpandedOverlay {...createProps(overrides)} />)
}

function createProps(
  overrides: {
    commands?: Partial<ExpandedOverlayProps['commands']>
    view?: Partial<ExpandedOverlayProps['view']>
  } = {},
): ExpandedOverlayProps {
  return {
    commands: {
      onCollapse: vi.fn(),
      onDock: vi.fn(),
      onFail: vi.fn(),
      onPauseTimer: vi.fn(),
      onResetTimer: vi.fn(),
      onRestart: vi.fn(),
      onRetryAiAnalysis: vi.fn(),
      onToggleHints: vi.fn(),
      onRevealNextHint: vi.fn(),
      onRetryHints: vi.fn(),
      onSelectExpandedTab: vi.fn(),
      onSelectRating: vi.fn(),
      onSettings: vi.fn(),
      onStartTimer: vi.fn(),
      onSubmit: vi.fn(),
      onUpdate: vi.fn(),
      ...overrides.commands,
    },
    themeMode: 'system',
    view: {
      hints: { status: 'idle', isOpen: false },
      aiAnalysis: { status: 'idle' },
      context: createOverlayContext(),
      elapsedSeconds: 0,
      helpSearchQuery: 'Two Sum',
      isOverTarget: false,
      overlay: {
        ...initialOverlaySessionState,
        activeProblemSlug: 'two-sum',
        visualMode: 'expanded',
      },
      problemTitle: 'Two Sum',
      syncFeedback: null,
      syncStatus: 'ready',
      targetSeconds: 20 * 60,
      timerStatus: 'idle',
      ...overrides.view,
    },
  }
}

function createSubmittedOverlay(
  overrides: Partial<ExpandedOverlayProps['view']['overlay']> = {},
): ExpandedOverlayProps['view']['overlay'] {
  return {
    ...initialOverlaySessionState,
    activeProblemSlug: 'two-sum',
    reviewStatus: 'submitted-clean',
    submittedSession: {
      elapsedSeconds: 95,
      isCorrect: true,
      lockReason: null,
      rating: 'good',
    },
    visualMode: 'expanded',
    ...overrides,
  }
}

function createFailedSubmittedOverlay(): ExpandedOverlayProps['view']['overlay'] {
  return createSubmittedOverlay({
    ratingLockReason: 'failed',
    selectedRating: 'again',
    submittedSession: {
      elapsedSeconds: null,
      isCorrect: false,
      lockReason: 'failed',
      rating: 'again',
    },
  })
}

function createOverlayContext(): ExpandedOverlayProps['view']['context'] {
  return {
    appearance: {
      themeMode: 'system',
    },
    automation: {
      autoDetectSolved: false,
    },
    problem: {
      problemSlug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'easy',
      isPremium: false,
    },
    practice: null,
    timing: {
      requireSolveTime: false,
      strictTiming: false,
      timeTargetsMinutes: {
        easy: 20,
        medium: 35,
        hard: 50,
      },
    },
    nextStep: null,
    aiAssessmentEnabled: false,
    aiAssessmentAvailable: false,
  }
}

type ExpandedOverlayProps = ComponentProps<typeof ExpandedOverlay>

const nextStep = {
  category: null,
  detail: 'Next in track - easy',
  dueAt: null,
  kind: 'track',
  problem: {
    difficulty: 'easy',
    isPremium: false,
    problemSlug: 'valid-parentheses',
    title: 'Valid Parentheses',
  },
  title: 'Valid Parentheses',
} satisfies NonNullable<
  ExpandedOverlayProps['view']['overlay']['nextStep']['value']
>
