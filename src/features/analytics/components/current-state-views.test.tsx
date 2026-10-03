import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { MemorySignalsView, RetentionMapView } from './current-state-views'

const retentionMap: AnalyticsViews['retentionMap'] = {
  rows: [
    {
      rank: 1,
      slug: 'graph-traversal',
      title: 'Graph Traversal',
      retrievability: 0.7,
      targetRetention: 0.9,
      targetGap: -0.2,
      targetDurationDays: 3,
      lastReviewedAt: '2026-08-20T02:00:00.000Z',
      dueAt: '2026-08-21T02:00:00.000Z',
      difficulty: 5,
      lapseCount: 2,
      status: 'needs-attention' as const,
      region: 'highest-attention' as const,
    },
  ],
  totalEligible: 31,
  statusCounts: { onTarget: 12, watch: 8, needsAttention: 11 },
  recallScale: {
    domain: [0.6, 1] as [number, number],
    ticks: [0.6, 0.7, 0.8, 0.9, 1],
  },
  durationScale: { domain: [1, 10] as [number, number], ticks: [1, 10] },
  targetRetention: 0.9,
}

describe('current-state analytics views', () => {
  it('keeps Retention Map chart interactions and exact table rows in parity', async () => {
    const user = userEvent.setup()
    render(
      <RetentionMapView timeZone="America/Los_Angeles" view={retentionMap} />,
    )

    expect(
      screen.getByText(
        'Showing the 1 highest-priority problems of 31 eligible.',
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        '12 on target, 8 watch, and 11 need attention across the full eligible cohort.',
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        'Adaptive Y-scale: current recall spans 60%–100% for this eligible cohort.',
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Retention Map chart' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('img', { name: 'Retention Map chart' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: 'Retention Map regions' }),
    ).toHaveTextContent(
      /Strongest position.*On target now.*Near target, more durable.*Watch closely.*Needs attention.*Highest attention/,
    )
    const point = screen.getByRole('button', {
      name: /Graph Traversal.*Needs attention/i,
    })
    await user.hover(point)
    const preview = await screen.findByRole('status')
    expect(preview).toHaveTextContent('Current recall')
    expect(
      within(preview).getByRole('link', {
        name: 'Graph Traversal',
      }),
    ).toHaveAttribute('href', 'https://leetcode.com/problems/graph-traversal/')
    await user.click(
      screen.getByRole('button', { name: /Graph Traversal.*Needs attention/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', { name: 'Graph Traversal memory details' }),
      ).toBeVisible(),
    )
    await user.click(
      screen.getByRole('button', {
        name: /Close Graph Traversal memory details/,
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /Graph Traversal.*Needs attention/i,
        }),
      ).toHaveFocus(),
    )
    fireEvent.keyDown(
      screen.getByRole('button', {
        name: /Graph Traversal.*Needs attention/i,
      }),
      { key: 'Enter' },
    )
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', {
          name: 'Graph Traversal memory details',
        }),
      ).toBeVisible(),
    )
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', {
          name: 'Graph Traversal memory details',
        }),
      ).not.toBeInTheDocument(),
    )
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(
      screen.getByRole('rowheader', { name: 'Graph Traversal' }),
    ).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Time above target' }),
    ).toBeVisible()
    expect(screen.getByText('Retention Map data table')).toBeInTheDocument()
    const retentionTable = screen.getByRole('table', {
      name: /Retention Map rows/i,
    })
    expect(within(retentionTable).getByText('08/19/26')).toBeVisible()
    expect(within(retentionTable).getByText('08/20/26')).toBeVisible()
  })

  it('pages ranked Memory Signals with canonical links and supplied reasons', async () => {
    const user = userEvent.setup()
    const rows: AnalyticsViews['memorySignals']['rows'] = Array.from(
      { length: 25 },
      (_, index) => ({
        rank: index + 1,
        slug: `problem-${index + 1}`,
        title: `Problem ${index + 1}`,
        reasons: [
          {
            kind: 'below-recall',
            label: 'Estimated recall 70% · below FSRS target',
          },
          { kind: 'overdue', label: 'Overdue · 1d' },
          { kind: 'low-durability', label: 'Low durability · 3d' },
        ],
      }),
    )
    const { rerender } = render(
      <MemorySignalsView view={{ totalQualifying: 31, rows }} />,
    )
    const list = screen.getByRole('list', { name: /Memory Signals rows/i })
    expect(list.tagName).toBe('OL')
    expect(within(list).getAllByRole('link')).toHaveLength(5)
    const link = within(list).getByRole('link', { name: 'Problem 1' })
    expect(link).toHaveAttribute(
      'href',
      'https://leetcode.com/problems/problem-1/',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent(
      /Estimated recall 70% · below FSRS target.*Overdue · 1d.*Low durability · 3d/,
    )
    expect(
      screen.getByText(
        '31 qualifying problems; showing the first 25 by severity.',
      ),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(list).toHaveAttribute('start', '6')
    expect(screen.getByRole('status')).toHaveTextContent('Showing 6–10 of 25')
    rerender(
      <MemorySignalsView view={{ totalQualifying: 31, rows: [...rows] }} />,
    )
    expect(list).toHaveAttribute('start', '1')
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–5 of 25')
  })

  it('returns to page one when retained rows refresh', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 8 }, (_, index) => ({
      ...retentionMap.rows[0]!,
      rank: index + 1,
      slug: `problem-${index + 1}`,
      title: `Problem ${index + 1}`,
    }))
    const { rerender } = render(
      <RetentionMapView
        view={{
          ...retentionMap,
          rows,
          totalEligible: 8,
          statusCounts: { onTarget: 0, watch: 0, needsAttention: 8 },
        }}
      />,
    )

    await user.click(screen.getByRole('tab', { name: 'Table' }))
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('status')).toHaveTextContent('Showing 8–8 of 8')

    rerender(
      <RetentionMapView
        view={{
          ...retentionMap,
          rows: rows.map((row) => ({ ...row, title: `Refreshed ${row.rank}` })),
          totalEligible: 8,
          statusCounts: { onTarget: 0, watch: 0, needsAttention: 8 },
        }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Showing 1–7 of 8')
    expect(screen.getByRole('rowheader', { name: 'Refreshed 1' })).toBeVisible()
  })

  it('keeps one roving chart tab stop in retained rank order across statuses', async () => {
    render(
      <RetentionMapView
        view={{
          ...retentionMap,
          rows: [
            { ...retentionMap.rows[0]!, rank: 1, title: 'Risk' },
            {
              ...retentionMap.rows[0]!,
              rank: 2,
              slug: 'watch',
              title: 'Watch',
              status: 'watch',
              region: 'watch-closely',
            },
            {
              ...retentionMap.rows[0]!,
              rank: 3,
              slug: 'on-target',
              title: 'On target',
              status: 'on-target',
              region: 'on-target-now',
            },
          ],
          totalEligible: 3,
          statusCounts: { onTarget: 1, watch: 1, needsAttention: 1 },
        }}
      />,
    )

    const region = screen.getByRole('region', { name: 'Retention Map chart' })
    const summaryId = region.getAttribute('aria-describedby')
    expect(summaryId).toBeTruthy()
    expect(document.getElementById(summaryId!)).toHaveTextContent(
      /Scope: active, non-suspended, reviewed problems.*watch band spans 10 percentage points.*vertical reference is 7 days.*model-estimated/i,
    )

    const points = screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('data-retention-map-point'))
    expect(
      points.map((point) => point.getAttribute('data-retention-map-point')),
    ).toEqual(['graph-traversal', 'watch', 'on-target'])
    expect(points.map((point) => point.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
    ])

    fireEvent.keyDown(points[0]!, { key: 'ArrowRight' })
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('button')
          .filter((button) =>
            button.hasAttribute('data-retention-map-point'),
          )[1],
      ).toHaveFocus(),
    )
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('data-retention-map-point'))
        .map((point) => point.getAttribute('tabindex')),
    ).toEqual(['-1', '0', '-1'])
  })
})
