import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  AnalyticsCardCloseButton,
  AnalyticsCardControls,
  AnalyticsCardPager,
} from './analytics-card-controls'

describe('AnalyticsCardControls', () => {
  it('keeps controls independently named and keyboard accessible', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <>
        <AnalyticsCardControls
          label="Performance view"
          value="overview"
          onChange={onChange}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'details', label: 'Details' },
          ]}
        />
        <AnalyticsCardControls
          label="Recall view"
          value="details"
          onChange={onChange}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'details', label: 'Details' },
          ]}
        />
      </>,
    )
    expect(
      screen.getByRole('group', { name: 'Performance view' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Performance view: Overview' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: 'Recall view: Details' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await user.tab()
    await user.tab()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('details')
  })

  it('returns focus to the original action after closing a goals surface', async () => {
    const user = userEvent.setup()
    function Goals() {
      const trigger = useRef<HTMLButtonElement>(null)
      const [open, setOpen] = useState(false)
      return (
        <>
          {!open ? (
            <button ref={trigger} onClick={() => setOpen(true)}>
              Performance Goals
            </button>
          ) : null}
          {open ? (
            <AnalyticsCardCloseButton
              label="Close Performance Goals"
              onClose={() => setOpen(false)}
              returnFocusRef={trigger}
            />
          ) : null}
        </>
      )
    }
    render(<Goals />)
    await user.click(screen.getByRole('button', { name: 'Performance Goals' }))
    expect(
      screen.queryByRole('button', { name: 'Performance Goals' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Close Performance Goals' }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Performance Goals' }),
      ).toHaveFocus(),
    )
  })
})

describe('AnalyticsCardPager', () => {
  it('exposes row counts and native previous/next disabled states', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    const { rerender } = render(
      <AnalyticsCardPager
        label="Recall rows"
        page={0}
        pageSize={3}
        rowCount={7}
        onPageChange={onPageChange}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Previous Recall rows' }),
    ).toBeDisabled()
    expect(screen.getByText('1–3 of 7')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Next Recall rows' }))
    expect(onPageChange).toHaveBeenCalledWith(1)
    rerender(
      <AnalyticsCardPager
        label="Recall rows"
        page={9}
        pageSize={3}
        rowCount={7}
        onPageChange={onPageChange}
      />,
    )
    expect(screen.getByText('7–7 of 7')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Next Recall rows' }),
    ).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: 'Previous Recall rows' }),
    )
    expect(onPageChange).toHaveBeenLastCalledWith(1)
    rerender(
      <AnalyticsCardPager
        label="Recall rows"
        page={2}
        pageSize={3}
        rowCount={0}
        onPageChange={onPageChange}
      />,
    )
    expect(screen.getByText('0–0 of 0')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Previous Recall rows' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Next Recall rows' }),
    ).toBeDisabled()
  })
})
