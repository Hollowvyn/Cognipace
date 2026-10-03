import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnalyticsViews } from '../api/analytics-contracts'
import {
  ObservedRecallVsFsrsView,
  RatingsMixView,
} from './recall-ratings-views'

type RecallRow = AnalyticsViews['observedRecallVsFsrs']['rows'][number]
type RatingsRow = AnalyticsViews['ratingsMix']['rows'][number]

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

function ratingsRow(
  index: number,
  overrides: Partial<RatingsRow> = {},
): RatingsRow {
  return {
    id: `rating-${index}`,
    bucketStart: `2026-09-${String(3 + index * 3).padStart(2, '0')}`,
    bucketEnd: `2026-09-${String(5 + index * 3).padStart(2, '0')}`,
    isPartial: false,
    again: 1,
    hard: 0,
    good: 1,
    easy: 4,
    againShare: 1 / 6,
    hardShare: 0,
    goodShare: 1 / 6,
    easyShare: 4 / 6,
    validRatings: 6,
    challengingReviews: 1,
    evidence: 'measured',
    ...overrides,
  }
}

function emptyRatingsRow(index: number) {
  return ratingsRow(index, {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    againShare: null,
    hardShare: null,
    goodShare: null,
    easyShare: null,
    validRatings: 0,
    challengingReviews: 0,
    evidence: 'not-measured',
  })
}

function ratingsView(rows: RatingsRow[]): AnalyticsViews['ratingsMix'] {
  return {
    rows,
    selectedHardAgain: 18,
    selectedValidRatings: 39,
    comparison: {
      direction: 'up',
      difference: 0.15,
      previousHardAgainShare: 0.31,
      previousValidRatings: 45,
    },
  }
}

beforeEach(() => {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: vi.fn(function (this: SVGElement) {
      return {
        x: 0,
        y: 0,
        width: (this.textContent?.length ?? 0) * 7,
        height: 12,
      } as DOMRect
    }),
  })
})

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

describe('Ratings Mix approved historical presentation', () => {
  it('trims leading/trailing empty slots and retains internal hatching and exact zero shares', () => {
    render(
      <RatingsMixView
        view={ratingsView([
          emptyRatingsRow(0),
          ratingsRow(1),
          emptyRatingsRow(2),
          ratingsRow(3),
          emptyRatingsRow(4),
        ])}
      />,
    )
    const empty = screen.getByTestId('ratings-empty-1')
    expect(screen.queryByTestId('ratings-empty-0')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ratings-empty-3')).not.toBeInTheDocument()
    expect(empty).toHaveAttribute('fill', expect.stringMatching(/^url\(#/))
    expect(screen.queryByTestId('ratings-empty-2')).not.toBeInTheDocument()
    expect(Number(empty.getAttribute('height'))).toBeGreaterThan(200)
    const again = screen.getByTestId('ratings-again-0')
    const easy = screen.getByTestId('ratings-easy-0')
    expect(
      Number(easy.getAttribute('height')) /
        Number(again.getAttribute('height')),
    ).toBeCloseTo(4)
    expect(screen.getByTestId('ratings-hard-0')).toHaveAttribute('height', '0')
    expect(screen.queryByTestId('ratings-hard-label-0')).not.toBeInTheDocument()
    expect(
      screen.queryByText('100%', { selector: '[data-rating-label]' }),
    ).not.toBeInTheDocument()
  })

  it('measures whole-percent label fit while exact counts and shares remain inspectable', () => {
    render(
      <RatingsMixView
        timeFrame={timeFrame}
        view={ratingsView([
          ratingsRow(0, {
            againShare: 0.01,
            again: 1,
            goodShare: 0.32,
            good: 32,
            easyShare: 0.67,
            easy: 67,
            validRatings: 100,
          }),
        ])}
      />,
    )
    expect(screen.getByTestId('ratings-again-label-0')).not.toBeVisible()
    expect(screen.getByTestId('ratings-easy-label-0')).toHaveTextContent('67%')
    expect(screen.getByTestId('ratings-easy-label-0')).toHaveAttribute(
      'font-size',
      '12',
    )
    expect(screen.getByTestId('ratings-easy-label-0')).toHaveAttribute(
      'fill',
      'var(--cp-analytics-rating-label)',
    )
    fireEvent.focus(
      screen.getByRole('button', { name: 'Inspect Ratings Mix chart' }),
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('1 (1%)')
    expect(screen.getByRole('tooltip')).toHaveTextContent('100 valid ratings')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Complete interval')
  })

  it('uses the actual touch position to inspect an internal unavailable bucket', () => {
    render(
      <RatingsMixView
        timeFrame={timeFrame}
        view={ratingsView([ratingsRow(0), emptyRatingsRow(1), ratingsRow(2)])}
      />,
    )
    const inspect = screen.getByRole('button', {
      name: 'Inspect Ratings Mix chart',
    })
    vi.spyOn(inspect, 'getBoundingClientRect').mockReturnValue({
      x: 364,
      y: 100,
      left: 364,
      right: 940,
      top: 100,
      bottom: 322,
      width: 576,
      height: 222,
      toJSON: () => ({}),
    })
    const touch = new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 652,
      clientY: 210,
    })
    Object.defineProperty(touch, 'pointerType', { value: 'touch' })
    fireEvent(inspect, touch)
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/06–09/08')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'No valid ratings · composition unavailable',
    )
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('16.7%')
  })

  it('remeasures hidden labels before deciding fit on inspection and rerender', () => {
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: vi.fn(function (this: SVGElement) {
        const hidden = this.style.display === 'none'
        return {
          x: 0,
          y: 0,
          width: hidden ? 0 : 100,
          height: hidden ? 0 : 12,
        } as DOMRect
      }),
    })
    const view = ratingsView([ratingsRow(0)])
    const { rerender } = render(<RatingsMixView view={view} />)
    expect(screen.getByTestId('ratings-again-label-0')).not.toBeVisible()
    fireEvent.focus(
      screen.getByRole('button', { name: 'Inspect Ratings Mix chart' }),
    )
    expect(screen.getByTestId('ratings-again-label-0')).not.toBeVisible()
    rerender(<RatingsMixView view={{ ...view }} />)
    expect(screen.getByTestId('ratings-again-label-0')).not.toBeVisible()
  })

  it('inspects unknown composition via keyboard and preserves comparison gates and precise table values', async () => {
    const user = userEvent.setup()
    render(
      <RatingsMixView
        timeFrame={timeFrame}
        view={ratingsView([
          ratingsRow(0),
          emptyRatingsRow(1),
          ratingsRow(2, { isPartial: true }),
        ])}
      />,
    )
    const inspect = screen.getByRole('button', {
      name: 'Inspect Ratings Mix chart',
    })
    fireEvent.focus(inspect)
    fireEvent.keyDown(inspect, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'No valid ratings · composition unavailable',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('0 (Not measured)')
    fireEvent.keyDown(inspect, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('1 (16.7%)')
    expect(screen.getByRole('tooltip')).toHaveTextContent('In progress')
    expect(screen.getByText(/Hard \+ Again is up 15 pp/)).toHaveTextContent(
      '31%; 45 valid ratings',
    )
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(3)
    expect(
      screen.getByRole('rowheader', {
        name: /09\/06–09\/08.*No valid ratings/,
      }),
    ).toBeVisible()
    expect(
      within(screen.getByRole('table')).getAllByText('4 (66.7%)')[0]!,
    ).toBeVisible()
  })

  it('preserves the whole-period empty copy and suppresses unsupported comparison', () => {
    render(
      <RatingsMixView
        view={{
          ...ratingsView([emptyRatingsRow(0)]),
          selectedValidRatings: 0,
          selectedHardAgain: 0,
          comparison: {
            direction: null,
            difference: null,
            previousHardAgainShare: null,
            previousValidRatings: 0,
          },
        }}
      />,
    )
    expect(
      screen.getByText('No valid review ratings are available in this period.'),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Inspect Ratings Mix chart' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/equivalent prior period/),
    ).not.toBeInTheDocument()
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

  it('trims Ratings ends in both views while retaining middle gaps and period totals', async () => {
    const user = userEvent.setup()
    render(
      <RatingsMixView
        timeFrame={timeFrame}
        view={ratingsView([
          emptyRatingsRow(0),
          ratingsRow(1),
          emptyRatingsRow(2),
          ratingsRow(3),
          emptyRatingsRow(4),
        ])}
      />,
    )
    const inspect = screen.getByRole('button', {
      name: 'Inspect Ratings Mix chart',
    })
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/06–09/08')
    fireEvent.keyDown(inspect, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'No valid ratings · composition unavailable',
    )
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/12–09/14')
    expect(screen.getByText(/based on 39 valid ratings/)).toHaveTextContent(
      '18 of 39',
    )
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(3)
    expect(
      screen.queryByRole('rowheader', { name: /09\/03–09\/05/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('rowheader', { name: /09\/15–09\/17/ }),
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
