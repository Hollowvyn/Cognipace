import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createYouTubeSearchUrl } from '../../../domain'
import { OverlayHelpSection } from './overlay-help-section'

const searchQuery = 'Two Sum #1'

describe('OverlayHelpSection', () => {
  it('keeps the idle hint action compact and explicit', async () => {
    const onToggleHints = vi.fn()
    render(
      <OverlayHelpSection
        searchQuery={searchQuery}
        onToggleHints={onToggleHints}
      />,
    )
    const button = screen.getByRole('button', { name: 'Request AI hints' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-controls', 'overlay-ai-hint-block')
    expect(
      screen.queryByRole('region', { name: 'AI hints' }),
    ).not.toBeInTheDocument()
    await userEvent.setup().click(button)
    expect(onToggleHints).toHaveBeenCalledOnce()
  })

  it('shows inert snapshot-bound hints with actual strength and caps at three', async () => {
    const onRevealNextHint = vi.fn()
    const turn = (
      text: string,
      strength: 'light' | 'medium' | 'heavy' = 'light',
    ) => ({
      snapshot: { code: '', language: 'typescript', capturedAt: 1 },
      hint: { text, strength, progress: 'initial' as const },
    })
    const hints = {
      status: 'ready' as const,
      isOpen: true,
      history: [turn('<script>inert pointer</script>')],
    }
    const { rerender, container } = render(
      <OverlayHelpSection
        searchQuery={searchQuery}
        hints={hints}
        onRevealNextHint={onRevealNextHint}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Hints · 1 of 3' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Light')).toBeInTheDocument()
    expect(screen.getByText('Based on code when requested')).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Get next hint' }))
    expect(onRevealNextHint).toHaveBeenCalledOnce()
    rerender(
      <OverlayHelpSection
        searchQuery={searchQuery}
        hints={{
          ...hints,
          history: [
            ...hints.history,
            turn('Second pointer', 'medium'),
            turn('Third pointer', 'heavy'),
          ],
        }}
      />,
    )
    expect(screen.getByText('Medium')).toBeInTheDocument()
    expect(screen.getByText('Heavy')).toBeInTheDocument()
    expect(screen.getByText('All 3 hints requested')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Get next hint' }),
    ).not.toBeInTheDocument()
    rerender(
      <OverlayHelpSection
        searchQuery={searchQuery}
        hints={{ ...hints, isOpen: false }}
      />,
    )
    expect(
      screen.queryByRole('region', { name: 'AI hints' }),
    ).not.toBeInTheDocument()
  })

  it('preserves earlier hints through preparation and controlled errors', () => {
    const history = [
      {
        snapshot: { code: '', language: 'python', capturedAt: 1 },
        hint: {
          text: 'Earlier pointer',
          strength: 'light' as const,
          progress: 'initial' as const,
        },
      },
    ]
    const { rerender } = render(
      <OverlayHelpSection
        searchQuery={searchQuery}
        hints={{
          status: 'pending',
          isOpen: true,
          history,
          requestId: 'next',
          phase: 'preparation',
        }}
      />,
    )
    expect(screen.getByText('Earlier pointer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get next hint' })).toBeDisabled()
    rerender(
      <OverlayHelpSection
        searchQuery={searchQuery}
        hints={{
          status: 'error',
          isOpen: true,
          history,
          code: 'unknown',
          message: 'Try again.',
          canRetry: true,
          showSettings: false,
        }}
      />,
    )
    expect(screen.getByText('Earlier pointer')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Retry hints' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['preparation', 'Reading code and problem details…'],
    ['generation', 'Generating hint…'],
  ] as const)('shows a useful busy state during %s', (phase, message) => {
    render(
      <OverlayHelpSection
        searchQuery={searchQuery}
        hints={{
          history: [],
          status: 'pending',
          isOpen: true,
          requestId: 'fixture',
          phase,
        }}
        onToggleHints={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Show AI hints' })).toBeDisabled()
    expect(screen.getByRole('region', { name: 'AI hints' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.getByRole('status')).toHaveTextContent(message)
  })

  it('hands off controlled auth error retry and settings actions', async () => {
    const onRetryHints = vi.fn(),
      onSettings = vi.fn()
    render(
      <OverlayHelpSection
        searchQuery={searchQuery}
        hints={{
          history: [],
          status: 'error',
          isOpen: true,
          code: 'auth',
          message: 'Check the AI connection.',
          canRetry: true,
          showSettings: true,
        }}
        onRetryHints={onRetryHints}
        onSettings={onSettings}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Check the AI connection.',
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retry hints' }))
    await user.click(screen.getByRole('button', { name: 'AI settings' }))
    expect(onRetryHints).toHaveBeenCalledOnce()
    expect(onSettings).toHaveBeenCalledOnce()
  })

  it('renders a labeled Help region with a YouTube search link', () => {
    render(<OverlayHelpSection searchQuery={searchQuery} />)

    expect(screen.getByRole('region', { name: 'Help' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Help' })).toHaveClass(
      'uppercase',
    )

    const link = screen.getByRole('link', {
      name: 'Search YouTube for this problem',
    })
    expect(link).toHaveAttribute('href', createYouTubeSearchUrl(searchQuery))
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('shows the action tooltip on hover', async () => {
    const user = userEvent.setup()
    render(<OverlayHelpSection searchQuery={searchQuery} />)

    await user.hover(
      screen.getByRole('link', { name: 'Search YouTube for this problem' }),
    )

    expect(
      await screen.findByRole('tooltip', {
        name: 'Search YouTube for this problem',
      }),
    ).toBeInTheDocument()
  })

  it.each([null, '', '   '])(
    'renders a disabled button without a link when query is %j',
    (query) => {
      render(<OverlayHelpSection searchQuery={query} />)

      expect(
        screen.getByRole('button', {
          name: 'Search YouTube for this problem',
        }),
      ).toBeDisabled()
      expect(
        screen.getByRole('button', {
          name: 'Search YouTube for this problem',
        }),
      ).toHaveAccessibleDescription('Problem details are still loading')
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    },
  )
})
