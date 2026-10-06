import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { initialOverlaySessionState } from '../../../domain'
import { CollapsedOverlay } from './collapsed-overlay'

describe('CollapsedOverlay', () => {
  it('renders the compact controls', () => {
    renderCollapsed()

    expect(
      screen.getByRole('complementary', {
        name: 'CogniPace collapsed controls',
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Elapsed solve time')).toHaveTextContent(
      '00:00',
    )
    expect(
      screen.getByRole('button', { name: 'Submit Review' }),
    ).toBeInTheDocument()
  })

  it('quick submits from the checkmark without expanding from row click', async () => {
    const user = userEvent.setup()
    const onPrepareSubmit = vi.fn()
    const onExpand = vi.fn()

    renderCollapsed({ commands: { onExpand, onPrepareSubmit } })

    await user.click(screen.getByRole('button', { name: 'Submit Review' }))

    expect(onPrepareSubmit).toHaveBeenCalledOnce()
    expect(onExpand).not.toHaveBeenCalled()
  })

  it('disables session reset while an accepted review remains unresolved', () => {
    renderCollapsed({
      view: {
        elapsedSeconds: 30,
        overlay: {
          ...initialOverlaySessionState,
          reviewStatus: 'saving',
          commandStatus: 'error',
        },
      },
    })
    expect(screen.getByRole('button', { name: 'Reset Timer' })).toBeDisabled()
  })

  it('expands when the collapsed surface is clicked', async () => {
    const user = userEvent.setup()
    const onExpand = vi.fn()

    renderCollapsed({ commands: { onExpand } })

    await user.click(
      screen.getByRole('complementary', {
        name: 'CogniPace collapsed controls',
      }),
    )

    expect(onExpand).toHaveBeenCalledOnce()
  })
})

function renderCollapsed(overrides?: Parameters<typeof createProps>[0]) {
  render(<CollapsedOverlay {...createProps(overrides)} />)
}

function createProps(
  overrides: {
    commands?: Partial<CollapsedOverlayProps['commands']>
    view?: Partial<CollapsedOverlayProps['view']>
  } = {},
): CollapsedOverlayProps {
  return {
    commands: {
      onDock: vi.fn(),
      onExpand: vi.fn(),
      onFail: vi.fn(),
      onPauseTimer: vi.fn(),
      onPrepareSubmit: vi.fn(),
      onResetTimer: vi.fn(),
      onRestartLocalSession: vi.fn(),
      onStartTimer: vi.fn(),
      ...overrides.commands,
    },
    themeMode: 'system',
    view: {
      canUseProblem: true,
      elapsedSeconds: 0,
      isOverTarget: false,
      overlay: initialOverlaySessionState,
      timerStatus: 'idle',
      ...overrides.view,
    },
  }
}

type CollapsedOverlayProps = ComponentProps<typeof CollapsedOverlay>
