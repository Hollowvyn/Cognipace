import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { buildAdaptiveDurationScale } from '../domain/analytics-scales'
import { MemoryStrengthView, PracticeRhythmView } from './memory-practice-views'

const timeFrame = {
  asOf: '2026-10-02T06:44:00.000Z',
  timeZone: 'America/New_York',
  requestedDays: 30,
}

type MemoryRow = AnalyticsViews['memoryStrength']['rows'][number]
type PracticeRow = AnalyticsViews['practiceRhythm']['rows'][number]

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

function practiceRow(overrides: Partial<PracticeRow> = {}): PracticeRow {
  return {
    id: 'supported',
    bucketStart: '2026-09-03',
    bucketEnd: '2026-09-05',
    isPartial: false,
    completedReviews: 8,
    goodEasy: 6,
    validRatings: 8,
    reviewSuccess: 0.75,
    evidence: 'measured',
    ...overrides,
  }
}

const memoryScale: AnalyticsViews['memoryStrength']['scale'] = {
  domain: [0, 50],
  ticks: [0, 10, 20, 30, 40, 50],
}
const countScale: AnalyticsViews['practiceRhythm']['countScale'] = {
  domain: [0, 20],
  ticks: [0, 5, 10, 15, 20],
}
const percentageScale: AnalyticsViews['practiceRhythm']['percentageScale'] = {
  domain: [0.6, 0.9],
  ticks: [0.6, 0.7, 0.8, 0.9],
}

describe('approved Memory Strength and Practice Rhythm views', () => {
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

  it('shows one mixed Practice plot with muted columns behind measured success and independent axes', () => {
    const rows = [
      practiceRow(),
      practiceRow({
        id: 'zero',
        bucketStart: '2026-09-06',
        bucketEnd: '2026-09-08',
        completedReviews: 0,
        goodEasy: 0,
        validRatings: 0,
        reviewSuccess: null,
        evidence: 'not-measured',
      }),
      practiceRow({
        id: 'last',
        bucketStart: '2026-09-09',
        bucketEnd: '2026-09-11',
        completedReviews: 12,
        goodEasy: 10,
        validRatings: 12,
        reviewSuccess: 10 / 12,
      }),
    ]
    const { container } = render(
      <PracticeRhythmView
        timeFrame={timeFrame}
        view={{ rows, countScale, percentageScale }}
      />,
    )
    expect(container.querySelectorAll('[data-chart]')).toHaveLength(1)
    expect(screen.getByText('Reviews')).toBeVisible()
    expect(screen.getByText('Review Success (%)')).toBeVisible()
    expect(within(container).getByText('60%')).toBeVisible()
    expect(within(container).getByText('90%')).toBeVisible()
    expect(within(container).queryByText('0%')).not.toBeInTheDocument()
    expect(screen.getByTestId('practice-volume-zero')).toHaveAttribute(
      'data-completed-reviews',
      '0',
    )
    expect(screen.getByTestId('practice-volume-zero')).toHaveAttribute(
      'height',
      '0',
    )
    expect(
      screen.queryByTestId('practice-success-marker-1'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('practice-success-bridge-0-2')).toHaveAttribute(
      'stroke-dasharray',
      '7 5',
    )
    const columns = screen.getByTestId('practice-volume-columns')
    const markers = screen.getByTestId('practice-success-markers')
    expect(
      columns.compareDocumentPosition(markers) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      screen.getByRole('list', { name: 'Practice Rhythm series' }),
    ).toHaveTextContent('Review volume (left)Review Success (right)')
    expect(
      screen
        .getByText('Association, not causation.')
        .compareDocumentPosition(screen.getByRole('list')) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy()
    expect(container.querySelector('[data-chart]')).toHaveStyle({
      height: '290px',
    })
    const ticks = screen
      .getByTestId('historical-chart-grid')
      .querySelectorAll('line')
    const bottom = Number(ticks[0]!.getAttribute('y1'))
    const top = Number(ticks[ticks.length - 1]!.getAttribute('y1'))
    const success = screen
      .getByTestId('practice-success-marker-0')
      .querySelector('circle')!
    const volume = screen.getByTestId('practice-volume-supported')
    // The 75% observation is halfway along its 60–90% domain. Eight reviews
    // occupy 40% of the independent 0–20 review-count domain.
    expect(
      (bottom - Number(success.getAttribute('cy'))) / (bottom - top),
    ).toBeCloseTo(0.5)
    expect(Number(volume.getAttribute('height')) / (bottom - top)).toBeCloseTo(
      0.4,
    )
  })

  it('preserves exact Practice cohort values and inspects zero volume separately from unavailable success', async () => {
    const user = userEvent.setup()
    const rows = [
      practiceRow(),
      practiceRow({
        id: 'empty',
        bucketStart: '2026-09-06',
        bucketEnd: '2026-09-08',
        completedReviews: 0,
        goodEasy: 0,
        validRatings: 0,
        reviewSuccess: null,
        evidence: 'not-measured',
      }),
      practiceRow({
        id: 'later',
        bucketStart: '2026-09-09',
        bucketEnd: '2026-09-11',
      }),
    ]
    render(
      <PracticeRhythmView
        timeFrame={timeFrame}
        view={{ rows, countScale, percentageScale }}
      />,
    )
    const control = screen.getByRole('button', {
      name: 'Inspect Practice Rhythm chart',
    })
    fireEvent.focus(control)
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Good + Easy: 6 of 8 valid ratings',
    )
    fireEvent.keyDown(control, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/06–09/08')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Completed reviews: 0',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Review Success: Unavailable',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Good + Easy: 0 of 0 valid ratings',
    )
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(
      within(
        screen.getByRole('rowheader', { name: '09/03–09/05' }).closest('tr')!,
      )
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      '8',
      '6 of 8',
      '75%',
      'Measured',
      '3-day summaries · Complete interval',
    ])
    expect(
      within(
        screen.getByRole('rowheader', { name: '09/06–09/08' }).closest('tr')!,
      )
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      '0',
      '0 of 0',
      '—',
      'Not measured',
      '3-day summaries · Complete interval',
    ])
  })

  it('reports an empty Practice history without a fabricated line or inspection target', () => {
    render(
      <PracticeRhythmView
        timeFrame={timeFrame}
        view={{
          rows: [
            practiceRow({
              completedReviews: 0,
              goodEasy: 0,
              validRatings: 0,
              reviewSuccess: null,
              evidence: 'not-measured',
            }),
          ],
          countScale,
          percentageScale,
        }}
      />,
    )
    expect(
      screen.getByText('No valid review ratings are available in this period.'),
    ).toBeVisible()
    expect(screen.getByText('Association, not causation.')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Inspect Practice Rhythm chart' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('practice-success-marker-0'),
    ).not.toBeInTheDocument()
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
  it('trims Practice ends but keeps zero success, middle gaps, and reviews without ratings', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 5 }, (_, index) =>
      practiceRow({
        id: `period-${index}`,
        bucketStart: `2026-09-${String(3 + index * 3).padStart(2, '0')}`,
        bucketEnd: `2026-09-${String(5 + index * 3).padStart(2, '0')}`,
        completedReviews: 0,
        goodEasy: 0,
        validRatings: 0,
        reviewSuccess: null,
        evidence: 'measured',
      }),
    )
    rows[1] = {
      ...rows[1]!,
      completedReviews: 4,
      validRatings: 4,
      reviewSuccess: 0,
    }
    rows[3] = { ...rows[3]!, completedReviews: 2 }
    render(
      <PracticeRhythmView
        timeFrame={timeFrame}
        view={{ rows, countScale, percentageScale }}
      />,
    )
    expect(
      screen.queryByTestId('practice-volume-period-0'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('practice-volume-period-4'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('practice-volume-period-2')).toBeInTheDocument()
    const inspect = screen.getByRole('button', {
      name: 'Inspect Practice Rhythm chart',
    })
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/06–09/08')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Review Success: 0%')
    fireEvent.keyDown(inspect, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/09–09/11')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Completed reviews: 0',
    )
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/12–09/14')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Completed reviews: 2',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Review Success: Unavailable',
    )
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(3)
  })

  it('leaves Memory Strength edge rows available for inspection', () => {
    const rows = [
      memoryRow({
        id: 'empty-first',
        medianStrengthDays: null,
        q1: null,
        q3: null,
        eligibleReviews: 0,
      }),
      memoryRow({
        id: 'measured',
        bucketStart: '2026-09-06',
        bucketEnd: '2026-09-08',
      }),
      memoryRow({
        id: 'empty-last',
        bucketStart: '2026-09-09',
        bucketEnd: '2026-09-11',
        medianStrengthDays: null,
        q1: null,
        q3: null,
        eligibleReviews: 0,
      }),
    ]
    render(
      <MemoryStrengthView
        timeFrame={timeFrame}
        view={{ rows, scale: memoryScale }}
      />,
    )
    const inspect = screen.getByRole('button', {
      name: 'Inspect Memory Strength chart',
    })
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/03–09/05')
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/09–09/11')
  })
})

it('retains zero-volume Practice boundaries with known rating evidence or measured zero success', () => {
  const rows = [
    practiceRow({
      id: 'rating-only',
      completedReviews: 0,
      goodEasy: 0,
      validRatings: 2,
      reviewSuccess: null,
    }),
    practiceRow({
      id: 'known-zero',
      bucketStart: '2026-09-06',
      bucketEnd: '2026-09-08',
      completedReviews: 0,
      goodEasy: 0,
      validRatings: 0,
      reviewSuccess: 0,
    }),
    practiceRow({
      id: 'empty-end',
      bucketStart: '2026-09-09',
      bucketEnd: '2026-09-11',
      completedReviews: 0,
      goodEasy: 0,
      validRatings: 0,
      reviewSuccess: null,
    }),
  ]
  render(
    <PracticeRhythmView
      timeFrame={timeFrame}
      view={{ rows, countScale, percentageScale }}
    />,
  )
  const inspect = screen.getByRole('button', {
    name: 'Inspect Practice Rhythm chart',
  })
  fireEvent.keyDown(inspect, { key: 'Home' })
  expect(screen.getByRole('tooltip')).toHaveTextContent('09/03–09/05')
  fireEvent.keyDown(inspect, { key: 'End' })
  expect(screen.getByRole('tooltip')).toHaveTextContent('09/06–09/08')
  expect(screen.getByRole('tooltip')).toHaveTextContent('Review Success: 0%')
  expect(
    screen.queryByTestId('practice-volume-empty-end'),
  ).not.toBeInTheDocument()
})
