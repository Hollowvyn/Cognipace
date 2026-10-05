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

  it('reveals inert pointers progressively without a regenerate action', async () => {
    const onRevealNextHint = vi.fn()
    const hints = {
      status: 'ready' as const,
      isOpen: true,
      batch: { hints: ['<script>inert pointer</script>', 'Second pointer'] },
      revealedCount: 1,
    }
    const { rerender, container } = render(
      <OverlayHelpSection
        searchQuery={searchQuery}
        hints={hints}
        onRevealNextHint={onRevealNextHint}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Hints · 1 of 2' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('<script>inert pointer</script>'),
    ).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(screen.queryByText('Second pointer')).not.toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Reveal next hint' }))
    expect(onRevealNextHint).toHaveBeenCalledOnce()
    rerender(
      <OverlayHelpSection
        searchQuery={searchQuery}
        hints={{ ...hints, revealedCount: 2 }}
      />,
    )
    expect(screen.getByText('Second pointer')).toBeInTheDocument()
    expect(screen.getByText('All 2 hints revealed')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reveal next hint' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /regenerate/i }),
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

  it.each([1, 2, 3])('uses the actual %i pointer batch length', (count) => {
    render(
      <OverlayHelpSection
        searchQuery={searchQuery}
        hints={{
          status: 'ready',
          isOpen: true,
          batch: {
            hints: Array.from({ length: count }, (_, i) => `Pointer ${i}`),
          },
          revealedCount: 1,
        }}
      />,
    )
    expect(screen.getByRole('region', { name: 'AI hints' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: `Hints · 1 of ${count}` }),
    ).toBeInTheDocument()
  })

  it.each([
    ['preparation', 'Reading problem details…'],
    ['generation', 'Generating hints…'],
  ] as const)('shows a useful busy state during %s', (phase, message) => {
    render(
      <OverlayHelpSection
        searchQuery={searchQuery}
        hints={{ status: 'pending', isOpen: true, requestId: 'fixture', phase }}
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
