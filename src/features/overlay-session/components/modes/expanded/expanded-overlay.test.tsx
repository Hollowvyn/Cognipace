import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { initialOverlaySessionState } from '../../../domain'
import { ExpandedOverlay } from './expanded-overlay'

describe('ExpandedOverlay', () => {
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

    expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled()
  })

  it('renders the AI recommendation section when state is non-idle', () => {
    renderExpanded({
      view: {
        aiRecommendation: {
          status: 'ready',
          fingerprint: 'fp-smoke',
          recommendation: {
            recommendedRating: 'good',
            confidence: 'medium',
            summary: 'Solved cleanly.',
            primaryReason: 'Solved cleanly.',
            evidence: [],
            complexity: { time: 'O(n)', space: 'O(n)', confidence: 'medium' },
            improvementPoints: [],
            edgeCaseNotes: [],
            shouldUpdateRating: false,
            promptVersion: 'leetcode-assessment-v1',
          },
          providerMetadata: {
            provider: 'openai',
            model: 'gpt-test',
            durationMs: 100,
          },
        },
      },
    })

    expect(
      screen.getByRole('region', { name: 'AI recommendation' }),
    ).toBeInTheDocument()
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
      'Notes',
    ]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    }
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
      onSelectRating: vi.fn(),
      onSettings: vi.fn(),
      onStartTimer: vi.fn(),
      onSubmit: vi.fn(),
      onUpdate: vi.fn(),
      ...overrides.commands,
    },
    themeMode: 'system',
    view: {
      aiRecommendation: { status: 'idle' },
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
