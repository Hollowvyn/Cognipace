import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

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
const unavailable = row(2, {
  again: 0,
  hard: 0,
  good: 0,
  recordedFirstAttempts: 2,
  excludedInvalidRatings: 2,
  validFirstAttempts: 0,
  hardGoodEasy: 0,
  goodEasy: 0,
  firstAttemptSuccess: null,
  firstAttemptGoodEasy: null,
  evidence: 'not-measured',
})
function view(rows: FirstRow[], overrides: Partial<FirstView> = {}): FirstView {
  return {
    rows,
    totals: row(0),
    scale: { domain: [0.2, 1], ticks: [0.2, 0.4, 0.6, 0.8, 1] },
    targetFirstAttemptSuccess: 0.87,
    targetFirstAttemptGoodEasy: 0.76,
    ...overrides,
  }
}
const part = (id: string) => screen.getByTestId(`first-attempt-${id}`)
const queryPart = (id: string) => screen.queryByTestId(`first-attempt-${id}`)
const tooltip = () => screen.getByRole('tooltip')
const inspect = (key = 'Home') =>
  fireEvent.keyDown(
    screen.getByRole('button', {
      name: 'Inspect New Problem Success chart',
    }),
    { key },
  )

describe('New Problem Success', () => {
  it('wires distinct outcome curves, unequal references, exact values, visibility and Table', async () => {
    const user = userEvent.setup()
    render(
      <NewProblemSuccessView
        timeFrame={timeFrame}
        view={view(
          [
            row(0, { isPartial: true }),
            row(1),
            unavailable,
            row(3, {
              again: 3,
              hard: 0,
              good: 0,
              hardGoodEasy: 0,
              goodEasy: 0,
              firstAttemptSuccess: 0,
              firstAttemptGoodEasy: 0,
            }),
          ],
          {
            totals: row(0, {
              again: 5,
              hard: 2,
              good: 2,
              recordedFirstAttempts: 14,
              excludedInvalidRatings: 5,
              validFirstAttempts: 9,
              hardGoodEasy: 4,
              goodEasy: 2,
              firstAttemptSuccess: 4 / 9,
              firstAttemptGoodEasy: 2 / 9,
            }),
            scale: { domain: [0, 1], ticks: [0, 0.5, 1] },
          },
        )}
      />,
    )
    for (const [series, shape, color] of [
      ['success', 'circle', 'var(--cp-analytics-first-success)'],
      ['good-easy', 'diamond', 'var(--cp-analytics-first-good-easy)'],
    ] as const) {
      expect(part(`${series}-marker-0`)).toHaveAttribute(
        'data-marker-shape',
        shape,
      )
      expect(part(`${series}-solid-0-1`)).toHaveAttribute('stroke', color)
      expect(part(`${series}-solid-0-1`)).not.toHaveAttribute(
        'stroke-dasharray',
      )
      expect(part(`${series}-target`).querySelector('line')).toHaveAttribute(
        'stroke',
        color,
      )
    }
    expect(
      Number(part('success-solid-0-1').getAttribute('stroke-width')),
    ).toBeGreaterThan(
      Number(part('good-easy-solid-0-1').getAttribute('stroke-width')),
    )
    const marker = part('success-marker-0').querySelector('circle')!
    const grid = screen
      .getByTestId('historical-chart-grid')
      .querySelector('line')!
    expect(
      Number(marker.getAttribute('cx')) - Number(grid.getAttribute('x1')),
    ).toBeCloseTo(12)
    inspect()
    const values = tooltip()
    for (const text of [
      'Hard + Good + Easy66.7% (2/3)',
      'Good + Easy33.3% (1/3)',
      'Again 1 · Hard 1 · Good 1 · Easy 0',
      '4 recorded · 3 valid · 1 invalid excluded',
      'Target First-attempt Success87%',
      'Target Good + Easy76%',
      'America/New_York',
      'In progress',
    ])
      expect(values).toHaveTextContent(text)
    expect(values).not.toHaveTextContent(/difficulty|FSRS|Reconstructed/i)
    expect(
      screen.getByText(
        /14 recorded first attempts · 9 valid · 5 invalid first ratings excluded/,
      ),
    ).toBeVisible()
    for (const series of ['success', 'good-easy']) {
      expect(part(`${series}-marker-3`)).toBeVisible()
      expect(queryPart(`${series}-marker-2`)).not.toBeInTheDocument()
      expect(part(`${series}-bridge-1-3`)).toHaveAttribute(
        'stroke-dasharray',
        '9 7',
      )
    }
    inspect('End')
    expect(tooltip()).toHaveTextContent('Hard + Good + Easy0% (0/3)')
    inspect('ArrowLeft')
    expect(tooltip()).toHaveTextContent(
      'No valid first recorded outcomes in this bucket',
    )
    expect(tooltip()).toHaveTextContent(
      '2 recorded · 0 valid · 2 invalid excluded',
    )
    for (const [label, series] of [
      ['Good + Easy', 'good-easy'],
      ['Hard + Good + Easy', 'success'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: label }))
      expect(queryPart(`${series}-markers`)).not.toBeInTheDocument()
      if (series === 'good-easy') expect(part('success-markers')).toBeVisible()
      expect(screen.getByRole('button', { name: label })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    }
    inspect()
    const hiddenValues = within(tooltip())
    for (const label of ['Hard + Good + Easy', 'Good + Easy'])
      expect(hiddenValues.queryByText(label)).not.toBeInTheDocument()
    expect(part('success-target')).toBeInTheDocument()
    expect(part('good-easy-target')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    const tableRow = within(
      screen.getByRole('table', { name: 'New Problem Success exact values' }),
    ).getAllByRole('row')[1]!
    for (const value of ['66.7%', '33.3%', '87%', '76%'])
      expect(within(tableRow).getByText(value)).toBeVisible()
  })

  it('shares equal references at their saved value and keeps both editors available in empty Chart and Table', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <NewProblemSuccessView
        view={view([row(0)], {
          targetFirstAttemptSuccess: 0.8,
          targetFirstAttemptGoodEasy: 0.8,
        })}
      />,
    )
    expect(queryPart('success-target')).not.toBeInTheDocument()
    expect(queryPart('good-easy-target')).not.toBeInTheDocument()
    const reference = part('shared-target').querySelector('line')!
    expect(reference).toHaveAttribute(
      'stroke',
      'var(--cp-analytics-first-shared-target)',
    )
    const grid = screen
      .getByTestId('historical-chart-grid')
      .querySelectorAll('line')
    const top = Number(grid[grid.length - 1]!.getAttribute('y1'))
    const bottom = Number(grid[0]!.getAttribute('y1'))
    expect(Number(reference.getAttribute('y1'))).toBeCloseTo(
      top + (bottom - top) * 0.25,
    )
    expect(screen.getByText('Target First-attempt Success 80%')).toBeVisible()
    expect(screen.getByText('Target Good + Easy 80%')).toBeVisible()
    inspect()
    expect(tooltip()).toHaveTextContent('Target First-attempt Success80%')
    expect(tooltip()).toHaveTextContent('Target Good + Easy80%')
    rerender(
      <NewProblemSuccessView
        view={view([unavailable], { totals: unavailable })}
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
    expect(screen.getByText(/2 invalid first ratings excluded/)).toBeVisible()
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
    for (const tab of ['Chart', 'Table']) {
      await user.click(screen.getByRole('tab', { name: tab }))
      expect(screen.getByRole('button', { name: 'First goal' })).toBeVisible()
      expect(
        screen.getByRole('button', { name: 'Good + Easy goal' }),
      ).toBeVisible()
      expect(
        screen.getByRole('button', { name: 'Hard + Good + Easy' }),
      ).toBeVisible()
    }
  })
})
