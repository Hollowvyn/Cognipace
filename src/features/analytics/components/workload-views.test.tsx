import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { AnalyticsViews } from '../api/analytics-contracts'
import {
  buildThresholdLineSegments,
  RecentOverdueBacklogView,
  UpcomingReviewLoadView,
} from './workload-views'

const overdueBacklog: AnalyticsViews['overdueBacklog'] = {
  rows: Array.from({ length: 8 }, (_, index) => ({
    date: `2026-08-${String(index + 9).padStart(2, '0')}`,
    overdueCount: index === 2 ? null : index,
    inProgress: index === 7,
  })),
  knownDays: 7,
  withinWatchDays: 5,
  aboveWatchDays: 2,
  selectedDays: 8,
  currentBacklog: 7,
  peak: 7,
  scale: { domain: [0, 10], ticks: [0, 5, 10] },
}

const upcomingReviewLoad: AnalyticsViews['upcomingReviewLoad'] = {
  rows: Array.from({ length: 14 }, (_, index) => ({
    date:
      index < 10
        ? `2026-08-${String(index + 22).padStart(2, '0')}`
        : `2026-09-${String(index - 9).padStart(2, '0')}`,
    dueCount: index === 0 ? 2 : 0,
    overdueCount: index === 0 ? 1 : 0,
    today: index === 0,
  })),
  scale: { domain: [0, 4], ticks: [0, 2, 4] },
}

describe('workload analytics views', () => {
  it('splits straight connectors exactly at the 5-problem threshold', () => {
    expect(
      buildThresholdLineSegments(
        [
          { x: 0, y: 10 },
          { x: 10, y: 0 },
        ],
        [4, 6],
      ),
    ).toEqual([
      { d: 'M0,10L5,5', status: 'within-watch' },
      { d: 'M5,5L10,0', status: 'above-watch' },
    ])
  })

  it('does not introduce green segments when every backlog value is above the threshold', () => {
    expect(
      buildThresholdLineSegments(
        [
          { x: 0, y: 2 },
          { x: 10, y: 4 },
          { x: 20, y: 6 },
        ],
        [8, 7, 6],
      ).map((segment) => segment.status),
    ).toEqual(['above-watch', 'above-watch'])
  })

  it('needs no connector for an isolated observation', () => {
    expect(buildThresholdLineSegments([{ x: 10, y: 10 }], [4])).toEqual([])
  })

  it('renders unknown backlog days as a broken-line measure with Chart/Table parity and keyboard inspection', async () => {
    const user = userEvent.setup()
    render(<RecentOverdueBacklogView view={overdueBacklog} />)

    expect(screen.getByText(/7 known days of 8;/)).toBeVisible()
    expect(
      screen.getByText(/5 known days within the 5-problem watch zone/),
    ).toBeVisible()
    const chart = screen.getByRole('region', {
      name: 'Recent Overdue Backlog chart',
    })
    expect(chart).toHaveAttribute('aria-describedby')
    expect(chart.querySelectorAll('[data-workload-dot]')).toHaveLength(7)
    expect(screen.getByText('Within watch zone')).toBeVisible()
    expect(screen.getByText('Above watch zone')).toBeVisible()
    const inspect = screen.getByRole('button', {
      name: 'Inspect Recent Overdue Backlog chart',
    })
    fireEvent.keyDown(inspect, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Overdue problems: 1')
    expect(screen.getByRole('status')).toHaveClass('sr-only')
    fireEvent.keyDown(inspect, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Watch status: Unknown',
    )
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(
      chart.querySelector('[data-workload-dot][data-selected="true"]'),
    ).toHaveAttribute('data-date', '2026-08-16')
    fireEvent.keyDown(inspect, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Overdue problems: 0')

    await user.click(screen.getByRole('tab', { name: 'Table' }))
    const table = screen.getByRole('table', {
      name: 'Recent Overdue Backlog data table',
    })
    expect(within(table).getByText('Not measured')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–7 of 8')
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(within(table).getByText('08/16/26 · In progress')).toBeVisible()
  })

  it('preserves gaps and the inclusive watch boundary without crossing markers', () => {
    expect(
      buildThresholdLineSegments(
        [
          { x: 0, y: 8 },
          { x: 5, y: 4 },
          { x: 10, y: 0 },
        ],
        [0, null, 8],
      ),
    ).toEqual([])
    expect(
      buildThresholdLineSegments(
        [
          { x: 0, y: 5 },
          { x: 10, y: 0 },
        ],
        [5, 6],
      ),
    ).toEqual([{ d: 'M0,5L10,0', status: 'above-watch' }])
    const { container } = render(
      <RecentOverdueBacklogView
        view={{
          ...overdueBacklog,
          rows: [{ date: '2026-08-09', overdueCount: 0, inProgress: true }],
          knownDays: 1,
        }}
      />,
    )
    expect(container.querySelectorAll('[data-workload-dot]')).toHaveLength(1)
  })

  it('moves selection between keyboard, pointer and pinned touch, then clamps refreshed rows', () => {
    vi.stubGlobal(
      'PointerEvent',
      class extends MouseEvent {
        pointerType: string
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init)
          this.pointerType = init.pointerType ?? 'mouse'
        }
      },
    )
    const { container, rerender } = render(
      <RecentOverdueBacklogView view={overdueBacklog} />,
    )
    const inspect = screen.getByRole('button', {
      name: 'Inspect Recent Overdue Backlog chart',
    })
    fireEvent.keyDown(inspect, { key: 'Home' })
    fireEvent.pointerMove(inspect, {
      clientX: Number.parseFloat(inspect.style.width) - 1,
    })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Overdue problems: 7')
    fireEvent.pointerDown(inspect, { clientX: 1, pointerType: 'touch' })
    fireEvent.pointerLeave(inspect, { pointerType: 'touch' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Overdue problems: 0')
    fireEvent.keyDown(inspect, { key: 'End' })
    rerender(
      <RecentOverdueBacklogView
        view={{
          ...overdueBacklog,
          rows: overdueBacklog.rows.slice(0, 1),
          knownDays: 1,
        }}
      />,
    )
    expect(
      container.querySelector('[data-workload-dot][data-selected="true"]'),
    ).toHaveAttribute('data-date', '2026-08-09')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Overdue problems: 0')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('uses rendered text measurements rather than fitting an oversized count', () => {
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
      configurable: true,
      value() {
        return 60
      },
    })
    try {
      render(<UpcomingReviewLoadView view={upcomingReviewLoad} />)
      expect(
        screen.getByText('Due 2 · Overdue 1', {
          selector: '[data-count-label="outside"] tspan',
        }),
      ).toBeVisible()
      expect(document.querySelector('[data-count-label="due"]')).toBeNull()
    } finally {
      delete (SVGElement.prototype as { getComputedTextLength?: unknown })
        .getComputedTextLength
    }
  })

  it('names tiny mixed and overdue-only counts without labelling zeros', () => {
    const rows = upcomingReviewLoad.rows.map((row, index) => ({
      ...row,
      dueCount: index < 3 ? 2 : 0,
      overdueCount: index === 0 ? 1 : 0,
    }))
    const { container, rerender } = render(
      <UpcomingReviewLoadView
        view={{ rows, scale: { domain: [0, 100], ticks: [0, 50, 100] } }}
      />,
    )
    expect(
      screen.getByText('Due 2 · Overdue 1', {
        selector: '[data-count-label="outside"] tspan',
      }),
    ).toBeVisible()
    expect(
      container.querySelectorAll('[data-count-label="outside"]'),
    ).toHaveLength(3)
    rerender(
      <UpcomingReviewLoadView
        view={{
          ...upcomingReviewLoad,
          rows: rows.map((row) => ({ ...row, dueCount: 0 })),
          scale: { domain: [0, 100], ticks: [0, 50, 100] },
        }}
      />,
    )
    expect(
      screen.getByText('Overdue 1', {
        selector: '[data-count-label="outside"] tspan',
      }),
    ).toBeVisible()
  })

  it('renders the fixed upcoming schedule with due and overdue labels, plus the exact zero state', () => {
    render(<UpcomingReviewLoadView view={upcomingReviewLoad} />)

    expect(
      screen.getByRole('region', { name: 'Upcoming Review Load chart' }),
    ).toBeVisible()
    expect(
      screen.getByRole('list', { name: 'Upcoming Review Load legend' }),
    ).toHaveTextContent('Due — solid greenOverdue — diagonally hatched pink')
    expect(
      screen.getByText('2', { selector: '[data-count-label="due"]' }),
    ).toBeVisible()
    expect(
      screen.getByText('1', { selector: '[data-count-label="overdue"]' }),
    ).toBeVisible()
    const inspect = screen.getByRole('button', {
      name: 'Inspect Upcoming Review Load chart',
    })
    fireEvent.keyDown(inspect, { key: 'Enter' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Total: 3')
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Total: 0')

    const zeroView = {
      ...upcomingReviewLoad,
      rows: upcomingReviewLoad.rows.map((row) => ({
        ...row,
        dueCount: 0,
        overdueCount: 0,
      })),
    }
    const { rerender } = render(<UpcomingReviewLoadView view={zeroView} />)
    expect(
      screen.getAllByText(
        'No reviews are currently scheduled in the next 14 days.',
      ),
    ).toHaveLength(1)
    rerender(<UpcomingReviewLoadView view={upcomingReviewLoad} />)
  })
})
