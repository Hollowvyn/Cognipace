import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OverlayHintState } from '../hooks/use-leetcode-code-hints'
import type { CodeAnalysisState } from '../hooks/use-leetcode-code-analysis'
import { describe, expect, it, vi } from 'vitest'

import { initialOverlaySessionState } from '../domain'
import type { LeetCodeOverlaySession } from '../hooks/use-leetcode-overlay-session'
import { OverlayShell } from './overlay-shell'

vi.mock('./modes/collapsed/collapsed-overlay', () => ({
  CollapsedOverlay: ({ themeMode }: { themeMode: string }) => (
    <div>Collapsed mode: {themeMode}</div>
  ),
}))

vi.mock('./modes/docked/docked-overlay', () => ({
  DockedOverlay: ({ themeMode }: { themeMode: string }) => (
    <div>Docked mode: {themeMode}</div>
  ),
}))

vi.mock('./modes/expanded/expanded-overlay', () => ({
  ExpandedOverlay: ({
    themeMode,
    view,
    commands,
  }: {
    themeMode: string
    view: {
      helpSearchQuery: string | null
      problemTitle: string
      hints: OverlayHintState
      aiAnalysis: CodeAnalysisState
    }
    commands: {
      onToggleHints: () => void
      onRevealNextHint: () => void
      onRetryHints: () => void
      onRetryAiAnalysis: () => void
      onSelectExpandedTab: (tab: 'solve' | 'ai' | 'notes') => void
      onSettings: () => void
    }
  }) => (
    <div
      data-help-search-query={view.helpSearchQuery ?? 'unavailable'}
      data-problem-title={view.problemTitle}
      data-testid="expanded-overlay"
    >
      <button onClick={commands.onToggleHints}>Toggle hints</button>
      <button onClick={commands.onRevealNextHint}>Reveal hint</button>
      <button onClick={commands.onRetryHints}>Retry hints</button>
      <span>Hints: {view.hints?.status ?? 'missing'}</span>
      <button onClick={commands.onRetryAiAnalysis}>Retry AI</button>
      <button onClick={commands.onSettings}>AI Settings</button>
      <button onClick={() => commands.onSelectExpandedTab('ai')}>
        Select AI tab
      </button>
      <span>Analysis: {view.aiAnalysis?.status ?? 'missing'}</span>
      <span>
        Expanded mode: {view.problemTitle}: {themeMode}; Help query:{' '}
        {view.helpSearchQuery ?? 'unavailable'}
      </span>
    </div>
  ),
}))

describe('OverlayShell', () => {
  it('passes session hints and their commands to expanded Help', async () => {
    const user = userEvent.setup()
    const session = createSession({
      overlay: { ...initialOverlaySessionState, visualMode: 'expanded' },
      hints: {
        status: 'ready',
        isOpen: true,
        batch: { hints: ['Pointer'] },
        revealedCount: 1,
      },
    })
    render(<OverlayShell {...session} />)
    expect(screen.getByText('Hints: ready')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Toggle hints' }))
    await user.click(screen.getByRole('button', { name: 'Reveal hint' }))
    await user.click(screen.getByRole('button', { name: 'Retry hints' }))
    expect(session.actions.toggleHints).toHaveBeenCalledOnce()
    expect(session.actions.revealNextHint).toHaveBeenCalledOnce()
    expect(session.actions.retryHints).toHaveBeenCalledOnce()
  })

  it('wires expanded-tab selection to the session action', async () => {
    const user = userEvent.setup()
    const session = createSession({
      overlay: { ...initialOverlaySessionState, visualMode: 'expanded' },
    })

    render(<OverlayShell {...session} />)
    await user.click(screen.getByRole('button', { name: 'Select AI tab' }))

    expect(session.actions.selectExpandedTab).toHaveBeenCalledWith('ai')
  })

  it.each([
    ['collapsed', 'Collapsed mode: light'],
    ['expanded', 'Expanded mode: Two Sum: light; Help query: Two Sum'],
    ['docked', 'Docked mode: light'],
  ] as const)('routes to the %s mode', (visualMode, text) => {
    render(
      <OverlayShell
        {...createSession({
          context: {
            ...createSession().context!,
            appearance: {
              themeMode: 'light',
            },
          },
          overlay: {
            ...initialOverlaySessionState,
            visualMode,
          },
        })}
      />,
    )

    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('wires the scored report and actual recovery commands to expanded mode', async () => {
    const user = userEvent.setup()
    const session = createSession({
      aiAnalysis: {
        status: 'unavailable',
        message: 'Configure AI.',
        canRetry: true,
        showSettings: true,
      },
      overlay: { ...initialOverlaySessionState, visualMode: 'expanded' },
    })
    render(<OverlayShell {...session} />)
    expect(screen.getByText('Analysis: unavailable')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry AI' }))
    await user.click(screen.getByRole('button', { name: 'AI Settings' }))
    expect(session.retryAiAnalysis).toHaveBeenCalledOnce()
    expect(session.actions.openSettings).toHaveBeenCalledOnce()
  })

  it('falls back to the LeetCode slug for the expanded Help query', () => {
    const session = createSession()

    render(
      <OverlayShell
        {...createSession({
          context: {
            ...session.context!,
            problem: null,
          },
          location: {
            host: 'leetcode.com',
            slug: 'search-in-rotated-sorted-array',
            url: 'https://leetcode.com/problems/search-in-rotated-sorted-array/',
          },
          overlay: {
            ...initialOverlaySessionState,
            visualMode: 'expanded',
          },
        })}
      />,
    )

    expect(
      screen.getByText(
        'Expanded mode: search-in-rotated-sorted-array: system; Help query: search-in-rotated-sorted-array',
      ),
    ).toBeInTheDocument()
  })

  it('keeps fallback metadata visible while Help uses the stored title', () => {
    render(
      <OverlayShell
        {...createSession({
          metadata: createFallbackMetadata('Fallback page title'),
          overlay: {
            ...initialOverlaySessionState,
            visualMode: 'expanded',
          },
        })}
      />,
    )

    const expandedOverlay = screen.getByTestId('expanded-overlay')

    expect(expandedOverlay).toHaveAttribute(
      'data-problem-title',
      'Fallback page title',
    )
    expect(expandedOverlay).toHaveAttribute('data-help-search-query', 'Two Sum')
  })

  it('keeps fallback metadata visible while Help uses the slug without context', () => {
    const location = {
      host: 'leetcode.com',
      slug: 'search-in-rotated-sorted-array',
      url: 'https://leetcode.com/problems/search-in-rotated-sorted-array/',
    }

    render(
      <OverlayShell
        {...createSession({
          context: null,
          location,
          metadata: createFallbackMetadata('Fallback page title', location),
          overlay: {
            ...initialOverlaySessionState,
            visualMode: 'expanded',
          },
        })}
      />,
    )

    const expandedOverlay = screen.getByTestId('expanded-overlay')

    expect(expandedOverlay).toHaveAttribute(
      'data-problem-title',
      'Fallback page title',
    )
    expect(expandedOverlay).toHaveAttribute(
      'data-help-search-query',
      'search-in-rotated-sorted-array',
    )
  })

  it('prefers captured metadata for display and Help', () => {
    const location = {
      host: 'leetcode.com',
      slug: 'search-in-rotated-sorted-array',
      url: 'https://leetcode.com/problems/search-in-rotated-sorted-array/',
    }

    render(
      <OverlayShell
        {...createSession({
          location,
          metadata: {
            ...createFallbackMetadata('Captured page title', location),
            confidence: 'high',
            source: 'graphql',
          },
          overlay: {
            ...initialOverlaySessionState,
            visualMode: 'expanded',
          },
        })}
      />,
    )

    const expandedOverlay = screen.getByTestId('expanded-overlay')

    expect(expandedOverlay).toHaveAttribute(
      'data-problem-title',
      'Captured page title',
    )
    expect(expandedOverlay).toHaveAttribute(
      'data-help-search-query',
      'Captured page title',
    )
  })
})

function createSession(
  overrides: Partial<LeetCodeOverlaySession> = {},
): LeetCodeOverlaySession {
  return {
    actions: {
      collapse: vi.fn(),
      dock: vi.fn(),
      expand: vi.fn(),
      failReview: vi.fn(),
      openSettings: vi.fn(),
      pauseTimer: vi.fn(),
      prepareQuickSubmit: vi.fn(),
      resetTimer: vi.fn(),
      restartLocalSession: vi.fn(),
      restore: vi.fn(),
      saveLeetCodeSubmissionResult: vi.fn(),
      selectExpandedTab: vi.fn(),
      selectRating: vi.fn(),
      startTimer: vi.fn(),
      submitReview: vi.fn(),
      updateReview: vi.fn(),
      toggleHints: vi.fn(),
      revealNextHint: vi.fn(),
      retryHints: vi.fn(),
    },
    context: {
      appearance: {
        themeMode: 'system',
      },
      automation: {
        autoDetectSolved: false,
      },
      nextStep: null,
      practice: null,
      problem: {
        difficulty: 'easy',
        isPremium: false,
        problemSlug: 'two-sum',
        title: 'Two Sum',
      },
      timing: {
        requireSolveTime: false,
        strictTiming: false,
        timeTargetsMinutes: {
          easy: 20,
          medium: 35,
          hard: 50,
        },
      },
      aiAssessmentEnabled: false,
      aiAssessmentAvailable: false,
    },
    feedback: null,
    location: null,
    metadata: null,
    overlay: initialOverlaySessionState,
    status: 'ready',
    timer: {
      elapsedSeconds: 0,
      isOverTarget: false,
      status: 'idle',
      targetSeconds: 20 * 60,
    },
    hints: { status: 'idle', isOpen: false },
    aiAnalysis: { status: 'idle' },
    retryAiAnalysis: vi.fn(),
    ...overrides,
  }
}

function createFallbackMetadata(
  title: string,
  location = {
    host: 'leetcode.com',
    slug: 'two-sum',
    url: 'https://leetcode.com/problems/two-sum/',
  },
): NonNullable<LeetCodeOverlaySession['metadata']> {
  return {
    capturedAt: 1,
    confidence: 'low',
    difficulty: 'Unknown',
    frontendId: null,
    isPremium: null,
    location,
    source: 'fallback',
    title,
    topics: [],
  }
}
