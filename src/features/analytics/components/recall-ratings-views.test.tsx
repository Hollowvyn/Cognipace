import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { ObservedRecallVsFsrsView } from './recall-ratings-views'

type RecallRow = AnalyticsViews['observedRecallVsFsrs']['rows'][number]

const timeFrame = {
  asOf: '2026-10-02T06:44:00.000Z',
  timeZone: 'America/New_York',
  requestedDays: 30,
}

function recallRow(
  index: number,
  overrides: Partial<RecallRow> = {},
): RecallRow {
  const day = String(9 + index * 3).padStart(2, '0')
  return {
    id: `recall-${index}`,
    bucketStart: `2026-09-${day}`,
    bucketEnd: `2026-09-${String(11 + index * 3).padStart(2, '0')}`,
    isPartial: false,
    recalledCount: 5,
    pairedReviews: 6,
    observedRecall: 5 / 6,
    fsrsEstimate: 0.9,
    difference: -1 / 15,
    provenance: 'reconstructed',
    evidence: 'measured',
    ...overrides,
  }
}

function recallView(rows: RecallRow[]): AnalyticsViews['observedRecallVsFsrs'] {
  return {
    rows,
    scale: { domain: [0.2, 1], ticks: [0.2, 0.4, 0.6, 0.8, 1] },
    targetRecall: 0.87,
  }
}

describe('Recall approved historical presentation', () => {
  it('names its personal recall goal explicitly above the plot and in inspection', () => {
    render(<ObservedRecallVsFsrsView view={recallView([recallRow(0)])} />)
    expect(screen.getByText('Target Recall 87%')).toBeVisible()
    fireEvent.keyDown(
      screen.getByRole('button', {
        name: 'Inspect Recall vs FSRS Estimate chart',
      }),
      { key: 'Home' },
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Target Recall87%')
  })

  it('starts the first Recall point 12px from the left axis while keeping its full interval and stable switches', async () => {
    const user = userEvent.setup()
    render(
      <ObservedRecallVsFsrsView
        timeFrame={timeFrame}
        view={recallView([recallRow(0), recallRow(1), recallRow(2)])}
      />,
    )
    const plotLeft = Number(
      screen
        .getByTestId('historical-chart-grid')
        .querySelector('line')!
        .getAttribute('x1'),
    )
    const firstX = () =>
      Number(
        screen
          .getByTestId('observed-recall-marker-0')
          .querySelector('circle')!
          .getAttribute('cx'),
      )
    expect(firstX() - plotLeft).toBeCloseTo(12)
    expect(screen.getByText('09/10')).toBeVisible()
    const inspect = screen.getByRole('button', {
      name: 'Inspect Recall vs FSRS Estimate chart',
    })
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/09–09/11')
    await user.click(screen.getByRole('button', { name: 'FSRS estimate' }))
    expect(firstX() - plotLeft).toBeCloseTo(12)
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getByRole('rowheader', { name: '09/09–09/11' })).toBeVisible()
  })

  it('distinguishes measured shapes and missing bridges without unknown markers', () => {
    render(
      <ObservedRecallVsFsrsView
        view={recallView([
          recallRow(0),
          recallRow(1, {
            observedRecall: null,
            fsrsEstimate: null,
            difference: null,
            pairedReviews: 0,
            recalledCount: 0,
            evidence: 'not-measured',
          }),
          recallRow(2),
        ])}
      />,
    )
    expect(screen.getByTestId('observed-recall-marker-0')).toHaveAttribute(
      'data-marker-shape',
      'circle',
    )
    expect(screen.getByTestId('fsrs-estimate-marker-0')).toHaveAttribute(
      'data-marker-shape',
      'diamond',
    )
    expect(screen.getByTestId('fsrs-estimate-markers')).toHaveAttribute(
      'stroke-dasharray',
      '4 4',
    )
    expect(screen.getByTestId('observed-recall-bridge-0-2')).toHaveAttribute(
      'stroke-dasharray',
      '9 7',
    )
    expect(screen.getByTestId('observed-recall-bridge-0-2')).toHaveAttribute(
      'stroke-width',
      '1.5',
    )
    expect(
      screen.queryByTestId('observed-recall-marker-1'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('fsrs-estimate-marker-1'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByText('Target Recall 87%')).toBeInTheDocument()
  })

  it('keeps exact serialized precision, counts, context, and cohort in keyboard inspection', () => {
    render(
      <ObservedRecallVsFsrsView
        timeFrame={timeFrame}
        view={recallView([
          recallRow(0, { difference: -0.0664 }),
          recallRow(1, {
            observedRecall: null,
            fsrsEstimate: null,
            difference: null,
            pairedReviews: 0,
            recalledCount: 0,
            evidence: 'not-measured',
          }),
          recallRow(2, { isPartial: true }),
        ])}
      />,
    )
    const inspect = screen.getByRole('button', {
      name: 'Inspect Recall vs FSRS Estimate chart',
    })
    fireEvent.focus(inspect)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('09/09–09/11')
    expect(tooltip).toHaveTextContent('3-day summaries')
    expect(tooltip).toHaveTextContent('5 recalled / 6 paired reviews')
    expect(tooltip).toHaveTextContent('83.3%')
    expect(tooltip).toHaveTextContent('−6.6 pp')
    expect(tooltip).toHaveTextContent('Reconstructed')
    expect(tooltip).toHaveTextContent('Complete interval')
    expect(tooltip).toHaveTextContent('Oct 2, 2026, 2:44 AM')
    fireEvent.keyDown(inspect, { key: 'ArrowRight' })
    expect(tooltip).toHaveTextContent(
      'No usable paired evidence in this bucket',
    )
    expect(tooltip).toHaveTextContent('Not measured')
    fireEvent.keyDown(inspect, { key: 'ArrowRight' })
    expect(tooltip).toHaveTextContent('In progress')
    fireEvent.keyDown(inspect, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('starts on the approved middle interval with clear measured boundary marks and one guide', () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      recallRow(index, {
        observedRecall: 1,
        fsrsEstimate: 1,
        ...(index === 7
          ? { bucketStart: '2026-09-30', bucketEnd: '2026-10-02' }
          : {}),
      }),
    )
    render(
      <ObservedRecallVsFsrsView
        timeFrame={timeFrame}
        view={recallView(rows)}
      />,
    )
    const active = screen.getByTestId('observed-recall-marker-3')
    expect(active).toHaveAttribute('data-active-marker', 'true')
    expect(screen.getByTestId('fsrs-estimate-marker-3')).toHaveAttribute(
      'data-active-marker',
      'true',
    )
    expect(
      document.querySelectorAll('[data-active-marker="true"]'),
    ).toHaveLength(2)
    const circle = active.querySelector('circle')!
    expect(circle).toHaveAttribute('r', '5')
    expect(circle).toHaveAttribute('stroke-width', '3')
    const guide = screen.getByTestId('historical-chart-selected-guide')
    expect(guide).toHaveAttribute('x1', circle.getAttribute('cx'))
    expect(
      Number(circle.getAttribute('cy')) - Number(guide.getAttribute('y1')),
    ).toBeGreaterThanOrEqual(8)
    expect(screen.getByText('Target Recall 87%').closest('svg')).toBeNull()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.focus(
      screen.getByRole('button', {
        name: 'Inspect Recall vs FSRS Estimate chart',
      }),
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/18–09/20')
  })

  it('hides each curve, markers, tooltip rate, and difference together while retaining samples', async () => {
    const user = userEvent.setup()
    render(<ObservedRecallVsFsrsView view={recallView([recallRow(0)])} />)
    const chart = screen.getByRole('img', {
      name: 'Recall vs FSRS Estimate chart',
    })
    const description = document.getElementById(
      chart.getAttribute('aria-describedby')!,
    )
    await user.click(screen.getByRole('button', { name: 'Observed recall' }))
    expect(
      screen.queryByTestId('observed-recall-markers'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Observed recall' }),
    ).toHaveAttribute('aria-pressed', 'false')
    fireEvent.focus(
      screen.getByRole('button', {
        name: 'Inspect Recall vs FSRS Estimate chart',
      }),
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      '5 recalled / 6 paired reviews',
    )
    expect(
      within(screen.getByRole('tooltip')).queryByText('Observed recall'),
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('tooltip')).queryByText('Observed − estimate'),
    ).not.toBeInTheDocument()
    expect(description).toHaveTextContent(
      'FSRS estimate is shown with short dashes and diamonds',
    )
    expect(description).not.toHaveTextContent('Observed recall is shown')
    await user.click(screen.getByRole('button', { name: 'FSRS estimate' }))
    expect(
      screen.queryByTestId('fsrs-estimate-markers'),
    ).not.toBeInTheDocument()
    expect(description).toHaveTextContent('Both data series are hidden')
    expect(description).not.toHaveTextContent('Long-dash bridges')
    expect(
      screen.queryByText('Long dashes: missing buckets'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('keeps the complete exact-value table and seven-row pagination', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 8 }, (_, index) =>
      recallRow(
        index,
        index === 7
          ? {
              bucketStart: '2026-09-30',
              bucketEnd: '2026-10-02',
              isPartial: true,
            }
          : {},
      ),
    )
    render(
      <ObservedRecallVsFsrsView
        timeFrame={timeFrame}
        view={recallView(rows)}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Observed recall' }))
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(7)
    expect(screen.getAllByText('83.3%')).toHaveLength(7)
    expect(screen.getAllByText('−6.7 pp')).toHaveLength(7)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(
      screen.getByRole('rowheader', { name: /09\/30–10\/02.*in progress/ }),
    ).toBeVisible()
  })
})

describe('historical visible window', () => {
  it('trims Recall ends, preserves measured zero and middle inspection, and keeps dates stable when a series hides', async () => {
    const user = userEvent.setup()
    const empty = (index: number) =>
      recallRow(index, {
        observedRecall: null,
        fsrsEstimate: null,
        difference: null,
        pairedReviews: 0,
        recalledCount: 0,
        evidence: 'not-measured',
      })
    render(
      <ObservedRecallVsFsrsView
        timeFrame={timeFrame}
        view={recallView([
          empty(0),
          recallRow(1, { observedRecall: 0, recalledCount: 0 }),
          empty(2),
          recallRow(3),
          empty(4),
        ])}
      />,
    )
    const inspect = screen.getByRole('button', {
      name: 'Inspect Recall vs FSRS Estimate chart',
    })
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/12–09/14')
    expect(screen.getByRole('tooltip')).toHaveTextContent('0%')
    fireEvent.keyDown(inspect, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/15–09/17')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'No usable paired evidence',
    )
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/18–09/20')
    await user.click(screen.getByRole('button', { name: 'Observed recall' }))
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/12–09/14')
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(3)
    expect(
      screen.queryByRole('rowheader', { name: '09/09–09/11' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('rowheader', { name: '09/21–09/23' }),
    ).not.toBeInTheDocument()
  })
})

it('retains a lone FSRS-only Recall period with single-point guidance', () => {
  render(
    <ObservedRecallVsFsrsView
      view={recallView([
        recallRow(0, {
          observedRecall: null,
          recalledCount: 0,
          difference: null,
        }),
      ])}
    />,
  )
  expect(screen.getByTestId('fsrs-estimate-marker-0')).toBeInTheDocument()
  expect(
    screen.getByText('Not enough data for a trend yet.'),
  ).toBeInTheDocument()
})
