import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { NewProblemSuccessView } from './historical-views'

type FirstRow = AnalyticsViews['firstAttemptOutcomes']['rows'][number]
type FirstView = AnalyticsViews['firstAttemptOutcomes']

const timeFrame = {
  asOf: '2026-10-02T06:44:00.000Z',
  timeZone: 'America/New_York',
  requestedDays: 30,
}

function row(index: number, overrides: Partial<FirstRow> = {}): FirstRow {
  const day = 3 + index * 3
  return {
    id: `first-${index}`,
    bucketStart: `2026-09-${String(day).padStart(2, '0')}`,
    bucketEnd: `2026-09-${String(day + 2).padStart(2, '0')}`,
    isPartial: false,
    again: 1,
    hard: 1,
    good: 1,
    easy: 0,
    recordedFirstAttempts: 4,
    excludedInvalidRatings: 1,
    validFirstAttempts: 3,
    hardGoodEasy: 2,
    goodEasy: 1,
    firstAttemptSuccess: 2 / 3,
    firstAttemptGoodEasy: 1 / 3,
    evidence: 'measured',
    ...overrides,
  }
}

function empty(index: number, exclusions = 0): FirstRow {
  return row(index, {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    recordedFirstAttempts: exclusions,
    excludedInvalidRatings: exclusions,
    validFirstAttempts: 0,
    hardGoodEasy: 0,
    goodEasy: 0,
    firstAttemptSuccess: null,
    firstAttemptGoodEasy: null,
    evidence: 'not-measured',
  })
}

function view(rows: FirstRow[], overrides: Partial<FirstView> = {}): FirstView {
  const counts = {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    recordedFirstAttempts: 0,
    excludedInvalidRatings: 0,
    validFirstAttempts: 0,
    hardGoodEasy: 0,
    goodEasy: 0,
  }
  for (const row of rows) {
    for (const key of Object.keys(counts) as Array<keyof typeof counts>)
      counts[key] += row[key]
  }
  return {
    rows,
    totals: {
      ...counts,
      firstAttemptSuccess:
        counts.validFirstAttempts > 0
          ? counts.hardGoodEasy / counts.validFirstAttempts
          : null,
      firstAttemptGoodEasy:
        counts.validFirstAttempts > 0
          ? counts.goodEasy / counts.validFirstAttempts
          : null,
      evidence: counts.validFirstAttempts > 0 ? 'measured' : 'not-measured',
    },
    scale: { domain: [0.2, 1], ticks: [0.2, 0.4, 0.6, 0.8, 1] },
    targetFirstAttemptSuccess: 0.87,
    targetFirstAttemptGoodEasy: 0.76,
    ...overrides,
  }
}

function inspect() {
  return screen.getByRole('button', {
    name: 'Inspect New Problem Success chart',
  })
}

function plotLeft() {
  return Number(
    screen
      .getByTestId('historical-chart-grid')
      .querySelector('line')!
      .getAttribute('x1'),
  )
}

function firstPointX() {
  return Number(
    screen
      .getByTestId('first-attempt-success-marker-0')
      .querySelector('circle')!
      .getAttribute('cx'),
  )
}

describe('New Problem Success', () => {
  it('exports the feature-owned first-outcome view', () => {
    expect(NewProblemSuccessView).toEqual(expect.any(Function))
  })

  it('uses mint solid circles and thinner blue solid diamonds with color-matched unequal references', () => {
    render(<NewProblemSuccessView view={view([row(0), row(1)])} />)
    expect(
      screen.getByTestId('first-attempt-success-marker-0'),
    ).toHaveAttribute('data-marker-shape', 'circle')
    expect(
      screen.getByTestId('first-attempt-good-easy-marker-0'),
    ).toHaveAttribute('data-marker-shape', 'diamond')
    const primary = screen.getByTestId('first-attempt-success-solid-0-1')
    const secondary = screen.getByTestId('first-attempt-good-easy-solid-0-1')
    expect(primary).toHaveAttribute(
      'stroke',
      'var(--cp-analytics-first-success)',
    )
    expect(secondary).toHaveAttribute(
      'stroke',
      'var(--cp-analytics-first-good-easy)',
    )
    expect(primary).not.toHaveAttribute('stroke-dasharray')
    expect(secondary).not.toHaveAttribute('stroke-dasharray')
    expect(Number(primary.getAttribute('stroke-width'))).toBeGreaterThan(
      Number(secondary.getAttribute('stroke-width')),
    )
    expect(
      screen.getByTestId('first-attempt-success-target').querySelector('line'),
    ).toHaveAttribute('stroke', 'var(--cp-analytics-first-success)')
    expect(
      screen
        .getByTestId('first-attempt-good-easy-target')
        .querySelector('line'),
    ).toHaveAttribute('stroke', 'var(--cp-analytics-first-good-easy)')
    expect(
      screen.getAllByText(/Target First-attempt Success 87%/),
    ).toHaveLength(1)
    expect(screen.queryByText(/FSRS/)).not.toBeInTheDocument()
    expect(screen.queryByText('Reviews')).not.toBeInTheDocument()
  })

  it('draws one neutral reference for equal goals at their actual value and retains both captions and inspection values', () => {
    const goals = {
      targetFirstAttemptSuccess: 0.8,
      targetFirstAttemptGoodEasy: 0.8,
    }
    render(<NewProblemSuccessView view={view([row(0)], goals)} />)
    expect(
      screen.queryByTestId('first-attempt-success-target'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('first-attempt-good-easy-target'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('first-attempt-shared-target').querySelector('line'),
    ).toHaveAttribute('stroke', 'var(--cp-analytics-first-shared-target)')
    const grid = screen
      .getByTestId('historical-chart-grid')
      .querySelectorAll('line')
    const top = Number(grid[grid.length - 1]!.getAttribute('y1'))
    const bottom = Number(grid[0]!.getAttribute('y1'))
    const y = Number(
      screen
        .getByTestId('first-attempt-shared-target')
        .querySelector('line')!
        .getAttribute('y1'),
    )
    expect(y).toBeCloseTo(top + (bottom - top) * 0.25)
    expect(screen.getByText('Target First-attempt Success 80%')).toBeVisible()
    expect(screen.getByText('Target Good + Easy 80%')).toBeVisible()
    fireEvent.keyDown(inspect(), { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Target First-attempt Success80%',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Target Good + Easy80%',
    )
  })

  it('retains measured zero, trims unavailable outer buckets, bridges internal gaps and reports full-period exclusions', async () => {
    const user = userEvent.setup()
    render(
      <NewProblemSuccessView
        timeFrame={timeFrame}
        view={view([
          empty(0, 4),
          row(1, {
            again: 3,
            hard: 0,
            good: 0,
            hardGoodEasy: 0,
            goodEasy: 0,
            firstAttemptSuccess: 0,
            firstAttemptGoodEasy: 0,
          }),
          empty(2, 2),
          row(3),
          empty(4, 3),
        ])}
      />,
    )
    expect(
      screen.getByText(
        'Selected period: 17 recorded first attempts · 6 valid · 11 invalid first ratings excluded.',
      ),
    ).toBeVisible()
    expect(screen.getByTestId('first-attempt-success-marker-0')).toBeVisible()
    expect(
      screen.queryByTestId('first-attempt-success-marker-1'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('first-attempt-success-bridge-0-2'),
    ).toHaveAttribute('stroke-dasharray', '9 7')
    fireEvent.keyDown(inspect(), { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/06–09/08')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Hard + Good + Easy0% (0/3)',
    )
    fireEvent.keyDown(inspect(), { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'No valid first recorded outcomes in this bucket',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      '2 recorded · 0 valid · 2 invalid excluded',
    )
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(3)
    expect(
      screen.queryByRole('rowheader', { name: '09/03–09/05' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: '09/06–09/08' })).toBeVisible()
  })

  it('keeps midpoint clearance, all dates, targets and supplied scale stable when either or both curves are hidden', async () => {
    const user = userEvent.setup()
    render(
      <NewProblemSuccessView
        timeFrame={timeFrame}
        view={view([row(0), row(1), row(2)])}
      />,
    )
    expect(firstPointX() - plotLeft()).toBeCloseTo(12)
    const dates = () =>
      Array.from(
        document.querySelectorAll(
          '.recharts-xAxis .recharts-cartesian-axis-tick text',
        ),
      ).map((node) => node.textContent)
    const originalDates = dates()
    const sharedScale = () =>
      document.getElementById(
        screen
          .getByRole('img', { name: 'New Problem Success chart' })
          .getAttribute('aria-describedby')!,
      )!.textContent
    expect(sharedScale()).toContain('Scale: 20%–100%')
    await user.click(screen.getByRole('button', { name: 'Good + Easy' }))
    expect(
      screen.queryByTestId('first-attempt-good-easy-markers'),
    ).not.toBeInTheDocument()
    expect(firstPointX() - plotLeft()).toBeCloseTo(12)
    expect(dates()).toEqual(originalDates)
    await user.click(screen.getByRole('button', { name: 'Hard + Good + Easy' }))
    expect(
      screen.queryByTestId('first-attempt-success-markers'),
    ).not.toBeInTheDocument()
    expect(dates()).toEqual(originalDates)
    expect(sharedScale()).toContain('Scale: 20%–100%')
    expect(
      screen.getByTestId('first-attempt-success-target'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('first-attempt-good-easy-target'),
    ).toBeInTheDocument()
    fireEvent.keyDown(inspect(), { key: 'End' })
    const tooltip = screen.getByRole('tooltip')
    expect(
      within(tooltip).queryByText('Hard + Good + Easy'),
    ).not.toBeInTheDocument()
    expect(within(tooltip).queryByText('Good + Easy')).not.toBeInTheDocument()
    expect(tooltip).toHaveTextContent(
      '4 recorded · 3 valid · 1 invalid excluded',
    )
    expect(tooltip).toHaveTextContent('Target First-attempt Success87%')
    await user.click(screen.getByRole('button', { name: 'Hard + Good + Easy' }))
    expect(firstPointX() - plotLeft()).toBeCloseTo(12)
  })

  it('centers a singleton in its original interval and warns that it does not establish a trend', () => {
    render(
      <NewProblemSuccessView
        timeFrame={timeFrame}
        view={view([empty(0), row(1), empty(2)])}
      />,
    )
    const line = screen
      .getByTestId('historical-chart-grid')
      .querySelector('line')!
    const right = Number(line.getAttribute('x2'))
    expect(firstPointX()).toBeCloseTo((plotLeft() + right) / 2)
    expect(screen.getByText('Not enough data for a trend yet.')).toBeVisible()
    fireEvent.keyDown(inspect(), { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/06–09/08')
  })

  it('labels sparse ticks with the year outside the report year while retaining complete bucket ranges', async () => {
    const user = userEvent.setup()
    render(
      <NewProblemSuccessView
        timeFrame={timeFrame}
        view={view([
          row(0, { bucketStart: '2025-12-26', bucketEnd: '2025-12-28' }),
          row(1, { bucketStart: '2025-12-29', bucketEnd: '2025-12-31' }),
          row(2, { bucketStart: '2026-01-01', bucketEnd: '2026-01-03' }),
        ])}
      />,
    )
    expect(screen.getByText('12/27/25')).toBeVisible()
    fireEvent.keyDown(inspect(), { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('12/26/25–12/28/25')
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(
      screen.getByRole('rowheader', { name: '12/26/25–12/28/25' }),
    ).toBeVisible()
    expect(screen.getByRole('rowheader', { name: '01/01–01/03' })).toBeVisible()
  })

  it('inspects supplied outcomes, numerators, ratings, exclusions, both goals and full report context by keyboard', () => {
    render(
      <NewProblemSuccessView
        timeFrame={timeFrame}
        view={view([row(0), row(1, { isPartial: true })])}
      />,
    )
    fireEvent.keyDown(inspect(), { key: 'End' })
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('09/06–09/08')
    expect(tooltip).toHaveTextContent('Hard + Good + Easy66.7% (2/3)')
    expect(tooltip).toHaveTextContent('Good + Easy33.3% (1/3)')
    expect(tooltip).toHaveTextContent('Again 1 · Hard 1 · Good 1 · Easy 0')
    expect(tooltip).toHaveTextContent(
      '4 recorded · 3 valid · 1 invalid excluded',
    )
    expect(tooltip).toHaveTextContent('Target First-attempt Success87%')
    expect(tooltip).toHaveTextContent('Target Good + Easy76%')
    expect(tooltip).toHaveTextContent('America/New_York')
    expect(tooltip).toHaveTextContent('In progress')
    expect(tooltip).toHaveTextContent('As of')
    expect(tooltip).not.toHaveTextContent(/difficulty|FSRS|Reconstructed/i)
    fireEvent.keyDown(inspect(), { key: 'ArrowLeft' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/03–09/05')
    fireEvent.keyDown(inspect(), { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.keyDown(inspect(), { key: ' ' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/03–09/05')
  })

  it('groups exact rating composition and sample counts into compact rows for tooltip clearance', () => {
    render(<NewProblemSuccessView view={view([row(0)])} />)
    fireEvent.keyDown(inspect(), { key: 'Home' })
    const tooltip = screen.getByRole('tooltip')
    expect(
      within(tooltip).getByText('Again 1 · Hard 1 · Good 1 · Easy 0'),
    ).toBeVisible()
    expect(
      within(tooltip).getByText('4 recorded · 3 valid · 1 invalid excluded'),
    ).toBeVisible()
    expect(
      within(tooltip).getByText('Target First-attempt Success'),
    ).toBeVisible()
    expect(within(tooltip).getByText('Target Good + Easy')).toBeVisible()
  })

  it('selects the nearest original bucket on touch and reveals nothing until inspection', () => {
    render(<NewProblemSuccessView view={view([row(0), row(1), row(2)])} />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    vi.spyOn(inspect(), 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 576,
    } as DOMRect)
    fireEvent.pointerDown(inspect(), { clientX: 575, pointerType: 'touch' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/09–09/11')
    fireEvent.pointerLeave(inspect(), { pointerType: 'touch' })
    expect(screen.getByRole('tooltip')).toBeVisible()
    fireEvent.keyDown(inspect(), { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/03–09/05')
    fireEvent.keyDown(inspect(), { key: 'Enter' })
    expect(screen.getByRole('tooltip')).toBeVisible()
  })

  it.each([
    { targetFirstAttemptSuccess: 0, targetFirstAttemptGoodEasy: 1 },
    { targetFirstAttemptSuccess: 1, targetFirstAttemptGoodEasy: 0 },
  ])(
    'renders target extremes inside the supplied fitted scale without clipping measured endpoints: %j',
    (targets) => {
      render(
        <NewProblemSuccessView
          view={view(
            [row(0, { firstAttemptSuccess: 1, firstAttemptGoodEasy: 0 })],
            {
              ...targets,
              scale: { domain: [0, 1], ticks: [0, 0.5, 1] },
            },
          )}
        />,
      )
      const grid = screen
        .getByTestId('historical-chart-grid')
        .querySelectorAll('line')
      const top = Number(grid[grid.length - 1]!.getAttribute('y1'))
      const bottom = Number(grid[0]!.getAttribute('y1'))
      for (const key of ['success', 'good-easy']) {
        const y = Number(
          screen
            .getByTestId(`first-attempt-${key}-target`)
            .querySelector('line')!
            .getAttribute('y1'),
        )
        expect(y).toBeGreaterThanOrEqual(top)
        expect(y).toBeLessThanOrEqual(bottom)
      }
      expect(
        screen.getByRole('img', { name: 'New Problem Success chart' }),
      ).toHaveAccessibleDescription(expect.stringContaining('Scale: 0%–100%'))
    },
  )

  it('paginates exact retained values seven rows at a time with both targets and context', async () => {
    const user = userEvent.setup()
    render(
      <NewProblemSuccessView
        timeFrame={timeFrame}
        view={view(Array.from({ length: 9 }, (_, i) => row(i)))}
      />,
    )
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(7)
    const firstRow = screen
      .getByRole('rowheader', { name: '09/03–09/05' })
      .closest('tr')!
    expect(firstRow).toHaveTextContent('66.7%')
    expect(firstRow).toHaveTextContent('33.3%')
    expect(firstRow).toHaveTextContent('87%')
    expect(firstRow).toHaveTextContent('76%')
    expect(firstRow).toHaveTextContent('America/New_York')
    expect(screen.getByText('Page 1 of 2')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(2)
    expect(screen.getByRole('rowheader', { name: '09/24–09/26' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(7)
  })

  it('keeps both target controls, series switches, exclusion totals and collapsed calculation details in empty Chart and Table states', async () => {
    const user = userEvent.setup()
    render(
      <NewProblemSuccessView
        view={view([empty(0, 9)])}
        targetControl={
          <>
            <button>First goal</button>
            <button>Good + Easy goal</button>
          </>
        }
      />,
    )
    expect(
      screen.getByText('No valid first recorded outcomes in this period.'),
    ).toBeVisible()
    expect(screen.getByText(/9 invalid first ratings excluded/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'First goal' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Good + Easy goal' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('img', { name: 'New Problem Success chart' }),
    ).not.toBeInTheDocument()
    const details = screen.getByText('Calculation details').closest('details')!
    expect(details).not.toHaveAttribute('open')
    await user.click(screen.getByText('Calculation details'))
    expect(details).toHaveTextContent('first recorded in retained history')
    expect(details).toHaveTextContent(
      'Hints, retries, and prior exposure are unknown',
    )
    expect(details).toHaveTextContent('Hard share')
    expect(details).toHaveTextContent('Long dashes')
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getByRole('button', { name: 'First goal' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Good + Easy goal' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Hard + Good + Easy' }),
    ).toBeVisible()
  })
})
