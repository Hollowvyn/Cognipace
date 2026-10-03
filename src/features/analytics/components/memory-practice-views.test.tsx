import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { MemoryStrengthView } from './memory-practice-views'

const timeFrame = {
  asOf: '2026-10-02T06:44:00.000Z',
  timeZone: 'America/New_York',
  requestedDays: 30,
}

type MemoryRow = AnalyticsViews['memoryStrength']['rows'][number]

function memoryRow(index = 0, overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: `memory-${index}`,
    bucketStart: `2026-09-${String(3 + index * 3).padStart(2, '0')}`,
    bucketEnd: `2026-09-${String(5 + index * 3).padStart(2, '0')}`,
    isPartial: false,
    medianStrengthDays: 6,
    q1: 4,
    q3: 8,
    eligibleReviews: 4,
    medianChangeDays: 2,
    provenance: 'reconstructed',
    evidence: 'measured',
    ...overrides,
  }
}

const scale: AnalyticsViews['memoryStrength']['scale'] = {
  domain: [0, 50],
  ticks: [0, 10, 20, 30, 40, 50],
}

const tooltip = () => screen.getByRole('tooltip')
const part = (id: string) => screen.getByTestId(`memory-strength-${id}`)
const queryPart = (id: string) => screen.queryByTestId(`memory-strength-${id}`)

describe('Memory Strength view composition', () => {
  it('draws supported quartile stems and caps below medians using the supplied duration scale', () => {
    const rows = [
      memoryRow(0, { medianStrengthDays: 1, q1: 0.5, q3: 2 }),
      memoryRow(1, { eligibleReviews: 3 }),
      memoryRow(2, { q1: null }),
      memoryRow(3, { q3: null }),
      memoryRow(4, { medianStrengthDays: null }),
      memoryRow(5, { medianStrengthDays: 32, q1: 24, q3: 44 }),
    ]
    render(<MemoryStrengthView timeFrame={timeFrame} view={{ rows, scale }} />)
    const whiskers = part('whiskers')
    const low = part('whisker-memory-0')
    const high = part('whisker-memory-5')
    expect(low.querySelectorAll('line')).toHaveLength(3)
    expect(low).toHaveAttribute('data-q1', '0.5')
    expect(high).toHaveAttribute('data-q3', '44')
    for (const index of [1, 2, 3, 4]) {
      expect(queryPart(`whisker-memory-${index}`)).not.toBeInTheDocument()
    }
    expect(queryPart('iqr-band')).not.toBeInTheDocument()
    expect(
      whiskers.compareDocumentPosition(part('markers')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const grid = screen
      .getByTestId('historical-chart-grid')
      .querySelectorAll('line')
    expect(Number(low.querySelector('line')!.getAttribute('y1'))).toBeLessThan(
      Number(grid[0]!.getAttribute('y1')),
    )
    expect(
      Number(high.querySelector('line')!.getAttribute('y2')),
    ).toBeGreaterThan(Number(grid[grid.length - 1]!.getAttribute('y1')))
    expect(screen.getByText('Stability (days)')).toBeVisible()
    expect(
      screen.getByRole('list', { name: 'Memory Strength series' }),
    ).toHaveTextContent('MedianMiddle 50%')
  })

  it('wires exact memory values and report context into inspection and Table', async () => {
    const user = userEvent.setup()
    const rows = [
      memoryRow(0, {
        bucketStart: '2026-09-30',
        bucketEnd: '2026-10-02',
        isPartial: true,
      }),
    ]
    render(<MemoryStrengthView timeFrame={timeFrame} view={{ rows, scale }} />)
    expect(screen.getByText('Not enough data for a trend yet.')).toBeVisible()
    fireEvent.focus(
      screen.getByRole('button', { name: 'Inspect Memory Strength chart' }),
    )
    for (const value of [
      '09/30–10/02',
      'Median strength: 6.0d',
      'Q1: 4.0d',
      'Q3: 8.0d',
      'Eligible reviews: 4',
      'Median change: +2.0d',
      'Provenance: Reconstructed',
      'In progress',
      '2:44 AM (America/New_York)',
    ])
      expect(tooltip()).toHaveTextContent(value)
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    const row = screen
      .getByRole('rowheader', { name: '09/30–10/02 (in progress)' })
      .closest('tr')!
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      '6.0d',
      '4.0d–8.0d',
      '4',
      '+2.0d',
      'Reconstructed',
      'Measured',
      '3-day summaries · In progress',
    ])
  })

  it('uses medians to trim edges while keeping measured zero and an unavailable internal bucket', async () => {
    const user = userEvent.setup()
    const missing = {
      medianStrengthDays: null,
      evidence: 'not-measured' as const,
    }
    const rows = [
      memoryRow(0, missing),
      memoryRow(1, {
        medianStrengthDays: 0,
        q1: null,
        q3: null,
        eligibleReviews: 1,
      }),
      memoryRow(2, { ...missing, eligibleReviews: 0 }),
      memoryRow(3, {
        medianStrengthDays: 0.25,
        q1: null,
        q3: null,
        eligibleReviews: 1,
      }),
      memoryRow(4, missing),
    ]
    render(<MemoryStrengthView timeFrame={timeFrame} view={{ rows, scale }} />)
    expect(part('marker-0')).toBeVisible()
    expect(queryPart('marker-1')).not.toBeInTheDocument()
    expect(part('bridge-0-2')).toBeVisible()
    const inspect = screen.getByRole('button', {
      name: 'Inspect Memory Strength chart',
    })
    fireEvent.focus(inspect)
    expect(tooltip()).toHaveTextContent('Median strength: 0.0d')
    expect(tooltip()).toHaveTextContent(
      'Unavailable (needs 4 eligible reviews)',
    )
    fireEvent.keyDown(inspect, { key: 'ArrowRight' })
    expect(tooltip()).toHaveTextContent('Median strength: Unavailable')
    expect(tooltip()).toHaveTextContent('Eligible reviews: 0')
    expect(tooltip()).toHaveTextContent('Evidence: Not measured')
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(
      screen.getAllByRole('rowheader').map((row) => row.textContent),
    ).toEqual(['09/06–09/08', '09/09–09/11', '09/12–09/14'])
  })

  it.each([
    { rows: [] },
    { rows: [memoryRow(0, { medianStrengthDays: null })] },
  ])('reports absent median history without observations', async ({ rows }) => {
    const user = userEvent.setup()
    render(<MemoryStrengthView timeFrame={timeFrame} view={{ rows, scale }} />)
    expect(
      screen.getByText(
        'No valid post-review FSRS stability is available in this period.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Inspect Memory Strength chart' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.queryByRole('rowheader')).not.toBeInTheDocument()
  })
})
