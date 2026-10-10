import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
import { UpcomingCard } from './upcoming-card'
const summary = createSerializedAnalyticsSummary()
const view = {
  rows: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-08-${String(10 + i).padStart(2, '0')}`,
    dueCount: i === 0 ? 2 : 0,
    overdueCount: i === 0 ? 1 : 0,
    today: i === 0,
  })),
  scale: { domain: [0, 4] as [number, number], ticks: [0, 2, 4] },
}
function card(context = summary.timeFrame) {
  return <UpcomingCard view={view} reportContext={context} />
}
describe('UpcomingCard', () => {
  it('keeps all fourteen actual slots and exposes forward context rather than global history', () => {
    const { container } = render(card())
    expect(container.querySelectorAll('[data-workload-bar]')).toHaveLength(14)
    expect(screen.getByText(/2026-08-10 through 2026-08-23/)).toBeVisible()
    const inspect = screen.getByRole('button', {
      name: 'Inspect Upcoming Review Load chart',
    })
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Due: 2')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Overdue: 1')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Total: 3')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      summary.timeFrame.asOf,
    )
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('All time')
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Total: 0')
  })
  it('reaches fourteen exact days including zero and Today plus all original fields', async () => {
    render(card())
    await userEvent.click(
      screen.getByRole('button', { name: 'Upcoming Details' }),
    )
    const dates = new Set<string>()
    while (true) {
      const t = screen.getByRole('table', {
        name: 'Upcoming Days exact values',
      })
      within(t)
        .getAllByRole('rowheader')
        .forEach((n) => dates.add(n.textContent ?? ''))
      const next = screen.getByRole('button', { name: 'Next Upcoming rows' })
      if (next.hasAttribute('disabled')) break
      await userEvent.click(next)
    }
    expect(dates.size).toBe(14)
    await userEvent.click(
      screen.getByRole('button', { name: 'Previous Upcoming rows' }),
    )
    const fields = new Set<string>()
    while (true) {
      within(screen.getByRole('table', { name: 'Upcoming Days exact values' }))
        .getAllByRole('columnheader')
        .forEach((n) => fields.add(n.textContent ?? ''))
      const next = screen.getByRole('button', {
        name: 'Next Upcoming Days exact values fields',
      })
      if (next.hasAttribute('disabled')) break
      await userEvent.click(next)
    }
    for (const field of [
      'Date',
      'Due',
      'Overdue',
      'Total',
      'Today',
      'Report as of',
      'Timezone',
    ])
      expect(fields.has(field)).toBe(true)
  })
  it('keeps zero schedule explanation and zero dates accessible to native inspection', () => {
    render(
      <UpcomingCard
        view={{
          ...view,
          rows: view.rows.map((r) => ({ ...r, dueCount: 0, overdueCount: 0 })),
        }}
        reportContext={summary.timeFrame}
      />,
    )
    expect(screen.getByText(/No reviews are currently scheduled/)).toBeVisible()
    fireEvent.keyDown(
      screen.getByRole('button', {
        name: 'Inspect Upcoming Review Load chart',
      }),
      { key: 'End' },
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Total: 0')
  })
  it('retains pages on historical selection alone but resets hidden current metadata changes', async () => {
    const { rerender } = render(card())
    await userEvent.click(
      screen.getByRole('button', { name: 'Upcoming Details' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Next Upcoming rows' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Upcoming Overview' }),
    )
    rerender(card({ ...summary.timeFrame, requestedDays: 90 }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Upcoming Details' }),
    )
    expect(
      screen.getByRole('button', { name: 'Previous Upcoming rows' }),
    ).toBeEnabled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Upcoming Overview' }),
    )
    rerender(card({ ...summary.timeFrame, asOf: '2026-10-10T17:00:00Z' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Upcoming Details' }),
    )
    expect(
      screen.getByRole('button', { name: 'Previous Upcoming rows' }),
    ).toBeDisabled()
  })
})
