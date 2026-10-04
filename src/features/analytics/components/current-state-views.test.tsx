import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
  totalEligible: 1,
  statusCounts: { onTarget: 0, watch: 0, needsAttention: 1 },
  recallScale: {
    domain: [0.6, 1] as [number, number],
    ticks: [0.6, 0.7, 0.8, 0.9, 1],
  },
  durationScale: { domain: [1, 10] as [number, number], ticks: [1, 10] },
  targetRetention: 0.9,
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function plotFixture(distinct = false) {
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      readonly pointerId: number
      readonly pointerType: string
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
        this.pointerType = init.pointerType ?? 'mouse'
      }
    },
  )
  const rows = Array.from({ length: 3 }, (_, index) => ({
    ...retentionMap.rows[0]!,
    rank: index + 1,
    slug: `overlap-${index}`,
    title: `Overlap ${index}`,
    targetDurationDays: distinct && index === 2 ? 6 : 3,
    retrievability: distinct && index === 2 ? 0.85 : 0.7,
  }))
  render(
    <RetentionMapView
      view={{
        ...retentionMap,
        rows,
        totalEligible: 3,
        statusCounts: { onTarget: 0, watch: 0, needsAttention: 3 },
      }}
    />,
  )
  const control = screen.getByRole('button', { name: /Inspect Retention Map/ })
  const left = parseFloat(control.style.left),
    top = parseFloat(control.style.top),
    width = parseFloat(control.style.width),
    height = parseFloat(control.style.height)
  vi.spyOn(control, 'getBoundingClientRect').mockReturnValue({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  })
  const point = document.querySelector(
    `[data-retention-map-point="${distinct ? 'overlap-2' : 'overlap-0'}"] polygon`,
  )!
  const [x, y] = point
    .getAttribute('points')!
    .split(' ')[0]!
    .split(',')
    .map(Number)
  return { control, left, top, width, height, x: x!, y: y! + 30 }
}

describe('current-state analytics views', () => {
  it('pins complete native inspection and keeps exact table values in parity', async () => {
    const user = userEvent.setup()
    render(
      <RetentionMapView timeZone="America/Los_Angeles" view={retentionMap} />,
    )
    const control = await screen.findByRole('button', {
      name: /Inspect Retention Map/,
    })
    expect(control.tagName).toBe('BUTTON')
    fireEvent.focus(control)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Graph Traversal',
    )
    fireEvent.keyDown(control, { key: 'Enter' })
    const details = await screen.findByRole('dialog', {
      name: 'Graph Traversal memory details',
    })
    expect(
      within(details).getByRole('link', { name: 'Graph Traversal' }),
    ).toHaveAttribute('href', 'https://leetcode.com/problems/graph-traversal/')
    expect(details).toHaveTextContent(
      /Estimated recall now.*70%.*FSRS scheduling target.*90%.*Target gap.*−20 pp.*Memory durability.*3d/,
    )
    expect(details).toHaveTextContent(
      /Due.*08\/20\/26.*Difficulty.*5.0.*Lapses.*2/,
    )
    await user.click(within(details).getByRole('button', { name: /Close/ }))
    await waitFor(() => expect(control).toHaveFocus())
    fireEvent.keyDown(control, { key: ' ' })
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    const table = screen.getByRole('table', { name: /Retention Map rows/i })
    expect(
      within(table).getByRole('rowheader', { name: 'Graph Traversal' }),
    ).toBeVisible()
    expect(
      within(table).getByRole('columnheader', { name: 'Memory durability' }),
    ).toBeVisible()
    expect(within(table).getByText('08/19/26')).toBeVisible()
    expect(within(table).getByText('08/20/26')).toBeVisible()
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

  it('reaches every filtered row with one native plot control and keeps full counts', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 31 }, (_, index) => ({
      ...retentionMap.rows[0]!,
      rank: index + 1,
      slug: `problem-${index}`,
      title: `Problem ${index}`,
      targetDurationDays: index === 30 ? 10 : 3,
      retrievability: index === 30 ? 1 : 0.7,
      status:
        index === 30 ? ('on-target' as const) : ('needs-attention' as const),
    }))
    render(
      <RetentionMapView
        view={{
          ...retentionMap,
          rows,
          totalEligible: 31,
          statusCounts: { onTarget: 1, watch: 0, needsAttention: 30 },
        }}
      />,
    )
    const control = await screen.findByRole('button', {
      name: /Inspect Retention Map/,
    })
    expect(
      screen.getAllByRole('button', { name: /Inspect Retention Map/ }),
    ).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.keyDown(control, { key: 'End' })
    expect(await screen.findByRole('status')).toHaveTextContent('Problem 30')
    fireEvent.keyDown(control, { key: 'Enter' })
    expect(await screen.findByRole('dialog')).toHaveTextContent('Problem 30')
    await user.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Problem 30')
    await user.click(screen.getByRole('button', { name: 'Below target' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: 'Retention Map status counts' }),
    ).toHaveTextContent(/1 On target now.*0 Watch.*30 Needs attention/)
    fireEvent.keyDown(control, { key: 'End' })
    fireEvent.keyDown(control, { key: 'Enter' })
    expect(await screen.findByRole('dialog')).toHaveTextContent('Problem 29')
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getByRole('table')).toHaveAttribute(
      'aria-label',
      'Retention Map rows 1 through 7 of 30',
    )
  })

  it('retains filtering and Chart/Table when below target has no matches', async () => {
    const user = userEvent.setup()
    const rows = [
      {
        ...retentionMap.rows[0]!,
        retrievability: 1,
        status: 'on-target' as const,
      },
    ]
    render(
      <RetentionMapView
        view={{
          ...retentionMap,
          rows,
          statusCounts: { onTarget: 1, watch: 0, needsAttention: 0 },
        }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Below target' }))
    expect(
      screen.getByText(
        'No reviewed problems are below the FSRS scheduling target.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'All' })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(
      screen.getByText(
        'No reviewed problems are below the FSRS scheduling target.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('table')).toHaveAttribute(
      'aria-label',
      'Retention Map rows 0 through 0 of 0',
    )
  })

  it('offers every nearby candidate and restores the pre-click pin on double-click reset', async () => {
    const user = userEvent.setup()
    const { control, x, y, left, top } = plotFixture()
    fireEvent.click(control, { clientX: x, clientY: y, detail: 1 })
    const chooser = screen.getByRole('dialog', {
      name: 'Choose a nearby memory',
    })
    expect(
      within(chooser).getAllByRole('button', { name: /Overlap/ }),
    ).toHaveLength(3)
    await user.click(within(chooser).getByRole('button', { name: /Overlap 2/ }))
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(control, { clientX: left, clientY: top, detail: 1 })
    fireEvent.click(control, { clientX: left, clientY: top, detail: 2 })
    fireEvent.doubleClick(control, { clientX: left, clientY: top })
    expect(
      screen.getByRole('dialog', { name: 'Overlap 2 memory details' }),
    ).toBeVisible()
    expect(
      screen.getByText('3 in view · 3 matching · 3 eligible'),
    ).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    await user.click(screen.getByRole('tab', { name: 'Chart' }))
    expect(
      screen.getByRole('dialog', { name: 'Overlap 2 memory details' }),
    ).toBeVisible()
  })

  it('pins the hovered preview identity with Enter', () => {
    const { control, x, y } = plotFixture(true)
    fireEvent.pointerMove(control, { clientX: x, clientY: y })
    expect(screen.getByRole('status')).toHaveTextContent('Overlap 2')
    fireEvent.keyDown(control, { key: 'Enter' })
    expect(
      screen.getByRole('dialog', { name: 'Overlap 2 memory details' }),
    ).toBeVisible()
  })

  it('cancels a box before dismissing pinned details and suppresses the trailing drag click', () => {
    const { control, left, top, width, height } = plotFixture()
    fireEvent.keyDown(control, { key: 'Enter' })
    fireEvent.pointerDown(control, { clientX: left + 10, clientY: top + 10 })
    fireEvent.pointerMove(control, {
      clientX: left + width / 2,
      clientY: top + height / 2,
    })
    fireEvent.keyDown(control, { key: 'Escape' })
    expect(
      screen.getByRole('dialog', { name: 'Overlap 0 memory details' }),
    ).toBeVisible()
    fireEvent.pointerUp(control, {
      clientX: left + width / 2,
      clientY: top + height / 2,
    })
    fireEvent.click(control, { detail: 1 })
    expect(
      screen.getByRole('dialog', { name: 'Overlap 0 memory details' }),
    ).toBeVisible()
    fireEvent.keyDown(control, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.pointerDown(control, { clientX: left + 5, clientY: top + 5 })
    fireEvent.pointerMove(control, {
      clientX: left + width - 5,
      clientY: top + height - 5,
    })
    fireEvent.pointerCancel(control)
    expect(
      screen.getByText('3 in view · 3 matching · 3 eligible'),
    ).toBeVisible()
  })
})
