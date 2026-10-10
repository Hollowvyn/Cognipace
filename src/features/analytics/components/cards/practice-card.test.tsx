import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
import { PracticeCard } from './practice-card'

const summary = createSerializedAnalyticsSummary()
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const targets = {
  targetRecall: 0.87,
  targetReviewSuccess: 0.9,
  targetFirstAttemptSuccess: 0.9,
  targetFirstAttemptGoodEasy: 0.9,
}
const interval = {
  id: 'interval',
  bucketStart: '2026-08-03',
  bucketEnd: '2026-08-05',
  isPartial: false,
}
const practice = {
  ...interval,
  completedReviews: 0,
  goodEasy: 0,
  validRatings: 1,
  reviewSuccess: 0,
  evidence: 'measured' as const,
}
const rating = {
  ...interval,
  easy: 1,
  good: 0,
  hard: 1,
  again: 0,
  easyShare: 0.5,
  goodShare: 0,
  hardShare: 0.5,
  againShare: 0,
  validRatings: 2,
  challengingReviews: 1,
  evidence: 'measured' as const,
}
function props() {
  return {
    view: { ...summary.views.practiceRhythm, rows: [practice] },
    ratingsView: {
      ...summary.views.ratingsMix,
      rows: [rating],
      selectedValidRatings: 2,
      selectedHardAgain: 1,
    },
    targets,
    timeFrame: summary.timeFrame,
  }
}
describe('PracticeCard', () => {
  it('uses approved friendly Overview labels while retaining original rating inspection and exact evidence', () => {
    render(<PracticeCard {...props()} />)
    const legend = screen.getByRole('list', { name: 'Practice Rhythm series' })
    for (const label of ['Strong', 'Solid', 'Effortful', 'Needs practice'])
      expect(within(legend).getByText(label)).toBeVisible()
    expect(within(legend).queryByText('Easy')).not.toBeInTheDocument()
    expect(screen.getByText(/Challenging reviews/)).toHaveTextContent('1 / 2')
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Inspect Practice Rhythm chart' }),
      { key: 'Home' },
    )
    for (const label of ['Easy', 'Good', 'Hard', 'Again'])
      expect(within(screen.getByRole('tooltip')).getByText(label)).toBeVisible()
    expect(screen.getByTestId('practice-ratings-easy-0')).toHaveAttribute(
      'data-rating',
      'Easy',
    )
  })

  it('fits the plot to the measured wrapped coarse-control legend and updates when that legend resizes', () => {
    const handlers = new Map<Element, ResizeObserverCallback>()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 414,
      height: 240,
      top: 0,
      right: 414,
      bottom: 240,
      left: 0,
      toJSON: () => ({}),
    })
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(target: Element) {
          handlers.set(target, this.callback)
        }
        unobserve = vi.fn()
        disconnect = vi.fn()
      },
    )
    render(<PracticeCard {...props()} />)
    const body = screen
      .getByRole('region', { name: 'Practice' })
      .querySelector('.cp-analytics-card-body')!
    const legend = screen.getByRole('list', {
      name: 'Practice Rhythm series',
    }).parentElement!
    const resize = (target: Element, width: number, height: number) =>
      act(() =>
        handlers.get(target)?.(
          [{ target, contentRect: { width, height } } as ResizeObserverEntry],
          {} as ResizeObserver,
        ),
      )
    resize(body, 414, 240)
    expect(handlers.has(legend)).toBe(true)
    resize(legend, 414, 76)
    expect(body.querySelector('.cp-historical-chart')).toHaveStyle({
      height: '156px',
    })
    resize(legend, 414, 58)
    expect(body.querySelector('.cp-historical-chart')).toHaveStyle({
      height: '174px',
    })
  })
  it('keeps known zero completed counts independent of supplied rating counts and removes all Reviews drawing together', async () => {
    render(<PracticeCard {...props()} />)
    expect(screen.getByTestId('practice-reviews-marker-0')).toHaveAttribute(
      'data-completed-reviews',
      '0',
    )
    expect(screen.getByTestId('practice-ratings-easy-0')).toHaveAttribute(
      'data-share',
      '0.5',
    )
    expect(
      Number(
        screen.getByTestId('practice-ratings-easy-0').getAttribute('width'),
      ),
    ).toBeGreaterThan(44)
    expect(screen.getByTestId('practice-ratings-good-0')).toHaveAttribute(
      'height',
      '0',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reviews' }))
    expect(
      screen.queryByTestId('practice-reviews-line'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('practice-success-target')).toBeInTheDocument()
    const inspect = screen.getByRole('button', {
      name: 'Inspect Practice Rhythm chart',
    })
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).not.toHaveTextContent(
      'Completed reviews',
    )
  })
  it('exposes every original exact field, source identity, period metadata and separate readiness', async () => {
    render(
      <PracticeCard
        {...props()}
        practiceReadiness={summary.historicalReadiness.practiceRhythm}
        ratingsReadiness={summary.historicalReadiness.ratingsMix}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Practice Details' }),
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Practice detail section'),
      'intervals',
    )
    const fields = new Set<string>()
    while (true) {
      within(
        screen.getByRole('table', { name: 'Practice Intervals exact values' }),
      )
        .getAllByRole('columnheader')
        .forEach((node) => fields.add(node.textContent ?? ''))
      const next = screen.getByRole('button', {
        name: 'Next Practice Intervals exact values fields',
      })
      if (next.hasAttribute('disabled')) break
      await userEvent.click(next)
    }
    for (const field of [
      'Bucket',
      'Completed reviews',
      'Easy',
      'Good',
      'Hard',
      'Again',
      'Good + Easy',
      'Review Success',
      'Target Review Success',
      'Valid ratings',
      'Challenging reviews',
      'Practice evidence',
      'Ratings evidence',
      'Period context',
      'ID',
      'Practice ID',
      'Ratings ID',
      'Start',
      'End',
      'Partial',
      'Report as of',
      'Timezone',
    ])
      expect(fields).toContain(field)
    await userEvent.selectOptions(
      screen.getByLabelText('Practice detail section'),
      'method',
    )
    expect(screen.getByText(/Association, not causation/)).toBeVisible()
  })
  it('keeps a missing rating counterpart neutral without replacing known completed zero', () => {
    render(
      <PracticeCard
        {...props()}
        ratingsView={{ ...props().ratingsView, rows: [] }}
      />,
    )
    expect(screen.getByTestId('practice-ratings-empty-0')).toHaveAccessibleName(
      /Rating composition unavailable/,
    )
    expect(screen.getByTestId('practice-reviews-marker-0')).toHaveAttribute(
      'data-completed-reviews',
      '0',
    )
  })

  it('preserves every joined interval page including distinct identities and missing calendar counterparts', async () => {
    const source = props()
    source.view.rows = Array.from({ length: 7 }, (_, index) => ({
      ...practice,
      id: `practice-${index}`,
      bucketStart: `2026-08-${String(3 + index * 3).padStart(2, '0')}`,
      bucketEnd: `2026-08-${String(5 + index * 3).padStart(2, '0')}`,
    }))
    source.ratingsView.rows = [
      { ...rating, id: 'different-source', isPartial: true },
      {
        ...rating,
        ...source.view.rows[6]!,
        easy: 1,
        good: 0,
        hard: 1,
        again: 0,
        easyShare: 0.5,
        goodShare: 0,
        hardShare: 0.5,
        againShare: 0,
        validRatings: 2,
        challengingReviews: 1,
      },
    ]
    render(<PracticeCard {...source} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Practice Details' }),
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Practice detail section'),
      'intervals',
    )
    let total = 0
    while (true) {
      total += within(
        screen.getByRole('table', { name: 'Practice Intervals exact values' }),
      ).getAllByRole('rowheader').length
      const next = screen.getByRole('button', {
        name: 'Next Practice rows',
      })
      if (next.hasAttribute('disabled')) break
      await userEvent.click(next)
    }
    expect(total).toBe(8)
  })

  it('exposes every readiness field and reason separately for Practice and Ratings', async () => {
    const practiceReadiness = {
      ...summary.historicalReadiness.practiceRhythm,
      assessments: 23,
      failingReasons: ['gap-too-long' as const],
    }
    const ratingsReadiness = {
      ...summary.historicalReadiness.ratingsMix,
      assessments: 11,
      failingReasons: ['insufficient-assessments' as const],
    }
    render(
      <PracticeCard
        {...props()}
        practiceReadiness={practiceReadiness}
        ratingsReadiness={ratingsReadiness}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Practice Details' }),
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Practice detail section'),
      'evidence',
    )
    const values = new Map<string, string>()
    while (true) {
      const table = screen.getByRole('table', {
        name: 'Practice Evidence exact values',
      })
      within(table)
        .getAllByRole('row')
        .slice(1)
        .forEach((row) =>
          values.set(
            within(row).getByRole('rowheader').textContent ?? '',
            within(row).getByRole('cell').textContent ?? '',
          ),
        )
      const next = screen.getByRole('button', {
        name: 'Next Practice rows',
      })
      if (next.hasAttribute('disabled')) break
      await userEvent.click(next)
    }
    expect(values.size).toBe(
      Object.keys(practiceReadiness).length +
        Object.keys(ratingsReadiness).length,
    )
    expect(values.get('Practice assessments')).toBe('23')
    expect(values.get('Ratings assessments')).toBe('11')
    expect(values.get('Practice failingReasons')).toContain('gap-too-long')
    expect(values.get('Ratings failingReasons')).toContain(
      'insufficient-assessments',
    )
  })

  it('shows supported prior share/count/direction/difference while retaining an honest absent All-time comparison', async () => {
    const source = props()
    const { rerender } = render(
      <PracticeCard
        {...source}
        ratingsView={{
          ...source.ratingsView,
          comparison: {
            previousHardAgainShare: 0.3,
            previousValidRatings: 20,
            difference: 0.2,
            direction: 'up',
          },
        }}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Practice Details' }),
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Practice detail section'),
      'comparison',
    )
    const values = new Map<string, string>()
    while (true) {
      const table = screen.getByRole('table', {
        name: 'Practice Comparison exact values',
      })
      const headers = within(table).getAllByRole('columnheader').slice(1)
      const cells = within(table).getAllByRole('cell')
      headers.forEach((header, index) =>
        values.set(header.textContent ?? '', cells[index]?.textContent ?? ''),
      )
      const next = screen.getByRole('button', {
        name: 'Next Practice Comparison exact values fields',
      })
      if (next.hasAttribute('disabled')) break
      await userEvent.click(next)
    }
    expect(values.get('Prior share')).toBe('30%')
    expect(values.get('Prior valid ratings')).toBe('20')
    expect(values.get('Direction')).toBe('up')
    expect(values.get('Difference')).toBe('+20 pp')
    rerender(
      <PracticeCard
        {...source}
        timeFrame={{ ...summary.timeFrame, requestedDays: null }}
        ratingsView={{
          ...source.ratingsView,
          comparison: {
            previousHardAgainShare: null,
            previousValidRatings: 0,
            difference: null,
            direction: null,
          },
        }}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Previous Practice Comparison exact values fields',
      }),
    )
    expect(screen.getByRole('table')).toHaveTextContent(
      'No previous period for All time',
    )
  })

  it.each([0, 100])(
    'saves the %s percent Review Success goal from an empty card with one atomic patch',
    async (value) => {
      const save = vi.fn().mockResolvedValue(undefined)
      render(
        <PracticeCard
          {...props()}
          view={{ ...props().view, rows: [] }}
          ratingsView={{ ...props().ratingsView, rows: [] }}
          targets={{ ...targets, targetRecall: 0 }}
          onSaveTarget={save}
        />,
      )
      await userEvent.click(
        screen.getByRole('button', { name: /Target Review Success 90%/ }),
      )
      const input = screen.getByRole('spinbutton', {
        name: 'Target Review Success (%)',
      })
      await userEvent.clear(input)
      await userEvent.type(input, `${value}{Enter}`)
      expect(save).toHaveBeenCalledExactlyOnceWith({
        targetReviewSuccess: value / 100,
      })
      expect(
        screen.getByRole('button', { name: 'Practice Overview' }),
      ).toHaveFocus()
    },
  )

  it.each([
    ['as of', { ...summary.timeFrame, asOf: '2026-08-31T15:00:00Z' }],
    ['range', { ...summary.timeFrame, requestedDays: 90 }],
    ['timezone', { ...summary.timeFrame, timeZone: 'America/New_York' }],
    [
      'grouping',
      {
        ...summary.timeFrame,
        grouping: { unit: 'week' as const, step: 1 as const },
      },
    ],
  ])(
    'resets hidden pages after a %s change and preserves equivalent report rerenders',
    async (_key, changed) => {
      const source = props()
      source.view.rows = Array.from({ length: 3 }, (_, index) => ({
        ...practice,
        id: `row-${index}`,
        bucketStart: `2026-08-${String(3 + index * 3).padStart(2, '0')}`,
        bucketEnd: `2026-08-${String(5 + index * 3).padStart(2, '0')}`,
      }))
      const { rerender } = render(<PracticeCard {...source} />)
      await userEvent.click(
        screen.getByRole('button', { name: 'Practice Details' }),
      )
      await userEvent.selectOptions(
        screen.getByLabelText('Practice detail section'),
        'intervals',
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Next Practice rows' }),
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Practice Overview' }),
      )
      rerender(
        <PracticeCard {...source} timeFrame={{ ...summary.timeFrame }} />,
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Practice Details' }),
      )
      expect(
        screen.getByRole('button', { name: 'Previous Practice rows' }),
      ).toBeEnabled()
      await userEvent.click(
        screen.getByRole('button', { name: 'Practice Overview' }),
      )
      rerender(<PracticeCard {...source} timeFrame={changed} />)
      await userEvent.click(
        screen.getByRole('button', { name: 'Practice Details' }),
      )
      expect(
        screen.getByRole('button', { name: 'Previous Practice rows' }),
      ).toBeDisabled()
    },
  )
})
