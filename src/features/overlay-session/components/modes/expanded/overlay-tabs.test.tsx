import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { OverlayExpandedTab } from '../../../domain'
import { OverlayTabs } from './overlay-tabs'

function Harness() {
  const [activeTab, setActiveTab] = useState<OverlayExpandedTab>('solve')

  return (
    <OverlayTabs
      activeTab={activeTab}
      idPrefix="test-overlay"
      onSelectTab={setActiveTab}
      aiStatus={null}
      solveStatus={null}
    />
  )
}

describe('OverlayTabs', () => {
  it('preserves selection and focus when tab statuses update', () => {
    const onSelectTab = vi.fn()
    const { rerender } = render(
      <OverlayTabs
        activeTab="ai"
        idPrefix="test-overlay"
        onSelectTab={onSelectTab}
        aiStatus={null}
        solveStatus={null}
      />,
    )
    const ai = screen.getByRole('tab', { name: 'AI' })
    const solve = screen.getByRole('tab', { name: 'Solve' })
    const notes = screen.getByRole('tab', { name: 'Notes' })
    ai.focus()
    expect(ai).toHaveTextContent(/^AI$/)
    expect(solve).toHaveTextContent(/^Solve$/)

    for (const [aiStatus, solveStatus] of [
      ['Ready', 'Working'],
      ['Working', 'Error'],
      ['Error', null],
    ] as const) {
      rerender(
        <OverlayTabs
          activeTab="ai"
          idPrefix="test-overlay"
          onSelectTab={onSelectTab}
          aiStatus={aiStatus}
          solveStatus={solveStatus}
        />,
      )

      expect(ai).toHaveFocus()
      expect(ai).toHaveAttribute('aria-selected', 'true')
      expect(ai).toHaveAttribute('tabindex', '0')
      expect(solve).toHaveAttribute('aria-selected', 'false')
      expect(solve).toHaveAttribute('tabindex', '-1')
      expect(notes).toHaveAttribute('aria-selected', 'false')
      expect(notes).toHaveAttribute('tabindex', '-1')
      expect(ai).toHaveTextContent(new RegExp(`^AI${aiStatus}$`))
      expect(solve).toHaveTextContent(new RegExp(`^Solve${solveStatus ?? ''}$`))
      expect(within(ai).getByText(aiStatus)).toBeVisible()
      if (solveStatus) {
        expect(within(solve).getByText(solveStatus)).toBeVisible()
      }
      expect(notes).toHaveTextContent(/^Notes$/)
      expect(onSelectTab).not.toHaveBeenCalled()
    }
  })

  it('selects tabs with keyboard navigation, wraps, and leaves one tab stop', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const solve = screen.getByRole('tab', { name: 'Solve' })
    const ai = screen.getByRole('tab', { name: 'AI' })
    const notes = screen.getByRole('tab', { name: 'Notes' })
    solve.focus()

    await user.keyboard('{ArrowRight}')
    expect(ai).toHaveFocus()
    expect(ai).toHaveAttribute('aria-selected', 'true')
    expect(solve).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{End}')
    expect(notes).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(solve).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(notes).toHaveFocus()
    await user.keyboard('{Home}')
    expect(solve).toHaveFocus()
    expect(solve).toHaveAttribute('aria-controls', 'test-overlay-solve-panel')
    expect(solve).toHaveAttribute('tabindex', '0')
    expect(ai).toHaveAttribute('tabindex', '-1')
    expect(notes).toHaveAttribute('tabindex', '-1')
  })

  it('moves focus between tabs inside a real ShadowRoot', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const container = document.createElement('div')
    shadow.append(container)

    try {
      render(<Harness />, { container })
      const solve = within(container).getByRole('tab', { name: 'Solve' })
      const ai = within(container).getByRole('tab', { name: 'AI' })
      const notes = within(container).getByRole('tab', { name: 'Notes' })
      solve.focus()

      fireEvent.keyDown(solve, { key: 'ArrowRight' })
      expect(shadow.activeElement).toBe(ai)
      expect(ai).toHaveAttribute('aria-selected', 'true')
      fireEvent.keyDown(ai, { key: 'End' })
      expect(shadow.activeElement).toBe(notes)
      fireEvent.keyDown(notes, { key: 'Home' })
      expect(shadow.activeElement).toBe(solve)
    } finally {
      host.remove()
    }
  })
})
