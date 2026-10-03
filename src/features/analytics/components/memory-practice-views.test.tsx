import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { buildAdaptiveDurationScale } from '../domain/analytics-scales'
import { MemoryStrengthView } from './memory-practice-views'

const timeFrame = {
  asOf: '2026-10-02T06:44:00.000Z',
  timeZone: 'America/New_York',
  requestedDays: 30,
}

type MemoryRow = AnalyticsViews['memoryStrength']['rows'][number]

function memoryRow(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    id: 'supported',
    bucketStart: '2026-09-03',
    bucketEnd: '2026-09-05',
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

const memoryScale: AnalyticsViews['memoryStrength']['scale'] = {
  domain: [0, 50],
  ticks: [0, 10, 20, 30, 40, 50],
}

describe('approved Memory Strength view', () => {
  it('draws discrete quartile stems and caps only for supported eligible cohorts, below the median', () => {
    const rows = [
      memoryRow(),
      memoryRow({
        id: 'too-small',
        bucketStart: '2026-09-06',
        bucketEnd: '2026-09-08',
        eligibleReviews: 3,
      }),
      memoryRow({
        id: 'unknown-low',
        bucketStart: '2026-09-09',
        bucketEnd: '2026-09-11',
        q1: null,
      }),
      memoryRow({
        id: 'unknown-high',
        bucketStart: '2026-09-12',
        bucketEnd: '2026-09-14',
        q3: null,
      }),
      memoryRow({
        id: 'missing',
        bucketStart: '2026-09-15',
        bucketEnd: '2026-09-17',
        medianStrengthDays: null,
        q1: null,
        q3: null,
        eligibleReviews: 0,
        evidence: 'not-measured',
      }),
      memoryRow({
        id: 'final',
        bucketStart: '2026-09-18',
        bucketEnd: '2026-09-20',
        medianStrengthDays: 24,
        q1: 16,
        q3: 44,
      }),
    ]
    const { container } = render(
      <MemoryStrengthView
        timeFrame={timeFrame}
        view={{ rows, scale: memoryScale }}
      />,
    )

    expect(
      screen.queryByTestId('memory-strength-iqr-band'),
    ).not.toBeInTheDocument()
    expect(
      screen
        .getByTestId('memory-strength-whisker-supported')
        .querySelectorAll('line'),
    ).toHaveLength(3)
    expect(screen.getByTestId('memory-strength-whisker-final')).toHaveAttribute(
      'data-q3',
      '44',
    )
    for (const id of ['too-small', 'unknown-low', 'unknown-high', 'missing']) {
      expect(
        screen.queryByTestId(`memory-strength-whisker-${id}`),
      ).not.toBeInTheDocument()
    }
    expect(
      screen.queryByTestId('memory-strength-marker-4'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('memory-strength-marker-5')).toBeVisible()
    expect(screen.getByTestId('memory-strength-bridge-3-5')).toHaveAttribute(
      'stroke-dasharray',
      '5 5',
    )
    const whiskers = screen.getByTestId('memory-strength-whiskers')
    const markers = screen.getByTestId('memory-strength-markers')
    expect(
      whiskers.compareDocumentPosition(markers) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      screen.getByRole('list', { name: 'Memory Strength series' }),
    ).toHaveTextContent('MedianMiddle 50%')
    expect(container.querySelector('[data-chart]')).toHaveStyle({
      height: '290px',
    })
  })

  it('keeps all median and quartile values in the fitted serialized duration scale', () => {
    const rows = [
      memoryRow({ medianStrengthDays: 1, q1: 0.5, q3: 2 }),
      memoryRow({
        id: 'high',
        bucketStart: '2026-09-06',
        bucketEnd: '2026-09-08',
        medianStrengthDays: 32,
        q1: 24,
        q3: 44,
      }),
    ]
    const fittedScale = buildAdaptiveDurationScale(
      rows.flatMap((row) => [row.medianStrengthDays!, row.q1!, row.q3!]),
    )
    const scale: AnalyticsViews['memoryStrength']['scale'] = {
      domain: [...fittedScale.domain],
      ticks: [...fittedScale.ticks],
    }
    render(<MemoryStrengthView timeFrame={timeFrame} view={{ rows, scale }} />)

    expect(scale.domain).toEqual([0, 50])
    expect(
      screen.getByTestId('memory-strength-whisker-supported'),
    ).toHaveAttribute('data-q1', '0.5')
    expect(screen.getByText('Stability (days)')).toBeVisible()
    const firstDot = screen
      .getByTestId('memory-strength-marker-0')
      .querySelector('circle')!
    const grid = screen
      .getByTestId('historical-chart-grid')
      .querySelectorAll('line')
    expect(Number(firstDot.getAttribute('cy'))).toBeLessThan(
      Number(grid[0]!.getAttribute('y1')),
    )
    expect(Number(firstDot.getAttribute('cy'))).toBeGreaterThan(
      Number(grid[grid.length - 1]!.getAttribute('y1')),
    )
  })

  it('inspects an entire memory bucket with eligible counts, quartiles, change, provenance and report context', async () => {
    const user = userEvent.setup()
    render(
      <MemoryStrengthView
        timeFrame={timeFrame}
        view={{
          rows: [
            memoryRow({
              bucketStart: '2026-09-30',
              bucketEnd: '2026-10-02',
              isPartial: true,
            }),
          ],
          scale: memoryScale,
        }}
      />,
    )
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.focus(
      screen.getByRole('button', { name: 'Inspect Memory Strength chart' }),
    )
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('09/30–10/02')
    expect(tooltip).toHaveTextContent('Median strength: 6.0d')
    expect(tooltip).toHaveTextContent('Q1: 4.0d')
    expect(tooltip).toHaveTextContent('Q3: 8.0d')
    expect(tooltip).toHaveTextContent('Eligible reviews: 4')
    expect(tooltip).toHaveTextContent('Median change: +2.0d')
    expect(tooltip).toHaveTextContent('Provenance: Reconstructed')
    expect(tooltip).toHaveTextContent('In progress')
    expect(tooltip).toHaveTextContent('2:44 AM (America/New_York)')
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

  it('keeps zero median measured while missing memory remains explicitly unavailable during inspection', () => {
    const rows = [
      memoryRow({
        medianStrengthDays: 0,
        q1: null,
        q3: null,
        eligibleReviews: 1,
      }),
      memoryRow({
        id: 'unknown',
        bucketStart: '2026-09-06',
        bucketEnd: '2026-09-08',
        medianStrengthDays: null,
        q1: null,
        q3: null,
        eligibleReviews: 0,
        medianChangeDays: null,
        evidence: 'not-measured',
      }),
      memoryRow({
        id: 'later',
        bucketStart: '2026-09-09',
        bucketEnd: '2026-09-11',
      }),
    ]
    rows.forEach(Object.freeze)
    render(
      <MemoryStrengthView
        timeFrame={timeFrame}
        view={{ rows, scale: memoryScale }}
      />,
    )
    expect(screen.getByTestId('memory-strength-marker-0')).toBeVisible()
    expect(
      screen.queryByTestId('memory-strength-marker-1'),
    ).not.toBeInTheDocument()
    const control = screen.getByRole('button', {
      name: 'Inspect Memory Strength chart',
    })
    fireEvent.focus(control)
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Median strength: 0.0d',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Unavailable (needs 4 eligible reviews)',
    )
    fireEvent.keyDown(control, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Median strength: Unavailable',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Eligible reviews: 0')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Evidence: Not measured',
    )
    fireEvent.keyDown(control, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('keeps seven-row paging and reports empty and single-point histories truthfully', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 8 }, (_, index) =>
      memoryRow({
        id: `day-${index}`,
        bucketStart: `2026-09-${String(index + 3).padStart(2, '0')}`,
        bucketEnd: `2026-09-${String(index + 3).padStart(2, '0')}`,
      }),
    )
    const { rerender } = render(
      <MemoryStrengthView
        timeFrame={{ ...timeFrame, requestedDays: 14 }}
        view={{ rows, scale: memoryScale }}
      />,
    )
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(7)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(1)
    rerender(
      <MemoryStrengthView
        timeFrame={{ ...timeFrame, requestedDays: 14 }}
        view={{ rows: [memoryRow({ id: 'single' })], scale: memoryScale }}
      />,
    )
    await user.click(screen.getByRole('tab', { name: 'Chart' }))
    expect(screen.getByTestId('memory-strength-marker-0')).toBeVisible()
    rerender(
      <MemoryStrengthView
        timeFrame={timeFrame}
        view={{ rows: [], scale: memoryScale }}
      />,
    )
    expect(
      screen.getByText(
        'No valid post-review FSRS stability is available in this period.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Inspect Memory Strength chart' }),
    ).not.toBeInTheDocument()
  })
})

describe('empty edge trimming boundaries', () => {
  it('trims Memory to finite medians, preserving its internal gaps, fitted scale, and source rows', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 5 }, (_, index) =>
      memoryRow({
        id: `period-${index}`,
        bucketStart: `2026-09-${String(3 + index * 3).padStart(2, '0')}`,
        bucketEnd: `2026-09-${String(5 + index * 3).padStart(2, '0')}`,
        medianStrengthDays: null,
        q1: null,
        q3: null,
        eligibleReviews: 0,
        medianChangeDays: null,
        evidence: 'not-measured',
      }),
    )
    // Counts or stray quartiles cannot create a plotted median at an edge.
    rows[0] = { ...rows[0]!, eligibleReviews: 4, q1: 1, q3: 8 }
    rows[1] = {
      ...rows[1]!,
      medianStrengthDays: 0,
      eligibleReviews: 1,
      evidence: 'measured',
    }
    rows[3] = {
      ...rows[3]!,
      medianStrengthDays: 0.5,
      q1: 0.2,
      q3: 1,
      eligibleReviews: 4,
      evidence: 'measured',
    }
    rows[4] = { ...rows[4]!, eligibleReviews: 4, q1: 1, q3: 8 }
    const fittedScale = buildAdaptiveDurationScale([0, 0.2, 0.5, 1])
    const scale: AnalyticsViews['memoryStrength']['scale'] = {
      domain: [...fittedScale.domain],
      ticks: [...fittedScale.ticks],
    }
    const original = structuredClone({ rows, scale })
    rows.forEach(Object.freeze)
    Object.freeze(rows)
    Object.freeze(scale.domain)
    Object.freeze(scale.ticks)
    Object.freeze(scale)
    render(<MemoryStrengthView timeFrame={timeFrame} view={{ rows, scale }} />)
    expect(screen.getByTestId('memory-strength-marker-0')).toBeVisible()
    expect(screen.getByTestId('memory-strength-marker-2')).toBeVisible()
    expect(screen.getByTestId('memory-strength-bridge-0-2')).toBeVisible()
    expect(
      screen.queryByTestId('memory-strength-whisker-period-1'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('memory-strength-whisker-period-3'),
    ).toHaveAttribute('data-q1', '0.2')
    expect(scale.domain).toEqual([0, 2])
    expect(screen.getByText('2.0d')).toBeVisible()
    const inspect = screen.getByRole('button', {
      name: 'Inspect Memory Strength chart',
    })
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/06–09/08')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Median strength: 0.0d',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Eligible reviews: 1')
    fireEvent.keyDown(inspect, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/09–09/11')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Median strength: Unavailable',
    )
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/12–09/14')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Median strength: 0.5d',
    )
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(
      screen.getAllByRole('rowheader').map((row) => row.textContent),
    ).toEqual(['09/06–09/08', '09/09–09/11', '09/12–09/14'])
    expect({ rows, scale }).toEqual(original)
  })

  it('retains a lone small-cohort Memory median between empty edges with its real interval', async () => {
    const user = userEvent.setup()
    const rows = [
      memoryRow({ medianStrengthDays: null, q1: null, q3: null }),
      memoryRow({
        id: 'single',
        bucketStart: '2026-09-06',
        bucketEnd: '2026-09-08',
        medianStrengthDays: 0.25,
        q1: null,
        q3: null,
        eligibleReviews: 1,
      }),
      memoryRow({
        id: 'empty-end',
        bucketStart: '2026-09-09',
        bucketEnd: '2026-09-11',
        medianStrengthDays: null,
        q1: null,
        q3: null,
      }),
    ]
    render(
      <MemoryStrengthView
        timeFrame={timeFrame}
        view={{ rows, scale: memoryScale }}
      />,
    )
    expect(screen.getByTestId('memory-strength-marker-0')).toBeVisible()
    expect(screen.getByText('Not enough data for a trend yet.')).toBeVisible()
    const inspect = screen.getByRole('button', {
      name: 'Inspect Memory Strength chart',
    })
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/06–09/08')
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/06–09/08')
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(1)
    expect(screen.getByRole('rowheader', { name: '09/06–09/08' })).toBeVisible()
  })

  it('reports wholly unavailable Memory history without chart or table observations', async () => {
    const user = userEvent.setup()
    render(
      <MemoryStrengthView
        timeFrame={timeFrame}
        view={{
          rows: [memoryRow({ medianStrengthDays: null })],
          scale: memoryScale,
        }}
      />,
    )
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
