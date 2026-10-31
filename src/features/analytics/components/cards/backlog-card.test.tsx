import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
import { BacklogCard } from './backlog-card'
const summary = createSerializedAnalyticsSummary()
const view = {
  ...summary.views.overdueBacklog,
  rows: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    overdueCount: [0, 4, 6, 5, null][i % 5] ?? null,
    inProgress: i === 29,
  })),
  knownDays: 24,
  withinWatchDays: 12,
  aboveWatchDays: 12,
  selectedDays: 30,
  currentBacklog: null,
  peak: 6,
  scale: { domain: [0, 10] as [number, number], ticks: [0, 5, 10] },
}
describe('BacklogCard', () => {
  it('keeps current unknown unavailable and exact strict markers without crossing observations', () => {
    const { container } = render(<BacklogCard view={view} />)
    expect(screen.getByTestId('backlog-current')).toHaveTextContent(
      'Unavailable',
    )
    expect(container.querySelectorAll('[data-workload-dot]')).toHaveLength(24)
    expect(
      container.querySelector('[data-workload-dot][data-date="2026-08-04"]'),
    ).toHaveAttribute('fill', 'var(--cp-analytics-attention)')
    expect(screen.getByText('Below 5')).toBeVisible()
    expect(screen.getByText('At or above 5')).toBeVisible()
    const inspect = screen.getByRole('button', {
      name: 'Inspect Recent Overdue Backlog chart',
    })
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Watch status: Unknown',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('In progress')
  })
  it('reaches every exact date and observation field including known zero and unknown', async () => {
    render(<BacklogCard view={view} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Backlog Details' }),
    )
    const dates = new Set<string>()
    while (true) {
      const table = screen.getByRole('table', {
        name: 'Backlog Days exact values',
      })
      within(table)
        .getAllByRole('rowheader')
        .forEach((n) => dates.add(n.textContent ?? ''))
      const next = screen.getByRole('button', { name: 'Next Backlog rows' })
      if (next.hasAttribute('disabled')) break
      await userEvent.click(next)
    }
    expect(dates.size).toBe(30)
    await userEvent.selectOptions(
      screen.getByLabelText('Backlog detail section'),
      'summary',
    )
    const names = new Set<string>()
    while (true) {
      within(
        screen.getByRole('table', { name: 'Backlog Summary exact values' }),
      )
        .getAllByRole('rowheader')
        .forEach((n) => names.add(n.textContent ?? ''))
      const next = screen.getByRole('button', { name: 'Next Backlog rows' })
      if (next.hasAttribute('disabled')) break
      await userEvent.click(next)
    }
    for (const n of [
      'Current backlog',
      'Known peak',
      'Known days',
      'Unknown days',
      'Below 5 days',
      'At or above 5 days',
      'Selected days',
    ])
      expect(names.has(n)).toBe(true)
  })
  it('preserves exact all-unknown rows and known zero singleton', async () => {
    const { rerender } = render(
      <BacklogCard
        view={{
          ...view,
          knownDays: 0,
          rows: view.rows.map((r) => ({ ...r, overdueCount: null })),
        }}
      />,
    )
    expect(screen.getByText(/could not be reconstructed/)).toBeVisible()
    fireEvent.keyDown(
      screen.getByRole('button', {
        name: 'Inspect Recent Overdue Backlog chart',
      }),
      { key: 'End' },
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Not measured')
    expect(screen.getByRole('tooltip')).toHaveTextContent('In progress')
    await userEvent.click(
      screen.getByRole('button', { name: 'Backlog Details' }),
    )
    expect(screen.getByRole('table')).toHaveTextContent('Not measured')
    await userEvent.click(
      screen.getByRole('button', { name: 'Backlog Overview' }),
    )
    rerender(
      <BacklogCard
        view={{
          ...view,
          knownDays: 1,
          currentBacklog: 0,
          rows: [{ date: '2026-08-01', overdueCount: 0, inProgress: true }],
        }}
      />,
    )
    expect(screen.getByTestId('backlog-current')).toHaveTextContent('0')
    expect(document.querySelectorAll('[data-workload-dot]')).toHaveLength(1)
  })
  it('resets hidden own-frame pages while retaining equivalent reports', async () => {
    const { rerender } = render(<BacklogCard view={view} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Backlog Details' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Next Backlog rows' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Backlog Overview' }),
    )
    rerender(
      <BacklogCard view={{ ...view, timeFrame: { ...view.timeFrame } }} />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Backlog Details' }),
    )
    expect(
      screen.getByRole('button', { name: 'Previous Backlog rows' }),
    ).toBeEnabled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Backlog Overview' }),
    )
    rerender(
      <BacklogCard
        view={{
          ...view,
          timeFrame: { ...view.timeFrame, asOf: '2026-10-10T17:00:00Z' },
        }}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Backlog Details' }),
    )
    expect(
      screen.getByRole('button', { name: 'Previous Backlog rows' }),
    ).toBeDisabled()
  })
})
