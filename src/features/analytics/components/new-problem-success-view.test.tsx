import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { normalizeFsrsSchedulingOptions } from '@/lib/fsrs'
import { buildAnalyticsTimeFrame } from '../domain/analytics-time'
import { buildAnalyticsBucketsFromTimeFrame } from '../domain/analytics-range-policy'
import { buildHistoricalAnalyticsViews } from '../domain/historical-presentation'
import type { HistoricalAnalyticsReviewEvent } from '../domain/historical-presentation'
import { NewProblemSuccessView } from './new-problem-success-view'

const timeFrame = buildAnalyticsTimeFrame({
  asOf: new Date('2026-08-14T12:00:00Z'),
  requestedDays: 14,
  timeZone: 'UTC',
})
function event(
  id: string,
  overrides: Partial<HistoricalAnalyticsReviewEvent> = {},
): HistoricalAnalyticsReviewEvent {
  return {
    id,
    cardId: id,
    problemSlug: id,
    topicLabels: [],
    rating: 'good',
    reviewedAt: new Date('2026-08-01T12:00:00Z'),
    fsrsReviewLog: null,
    problemDifficulty: 'easy',
    elapsedSeconds: 600,
    ...overrides,
  }
}
function view() {
  return buildHistoricalAnalyticsViews(
    [
      ...[600, 1200, 1800, 2400].map((elapsedSeconds, index) =>
        event(`easy-${index}`, { elapsedSeconds }),
      ),
      event('medium', {
        problemDifficulty: 'medium',
        rating: 'again',
        reviewedAt: new Date('2026-08-04T12:00:00Z'),
      }),
      event('hard', {
        problemDifficulty: 'hard',
        rating: 'invalid',
        reviewedAt: new Date('2026-08-03T12:00:00Z'),
      }),
      event('unknown', {
        problemDifficulty: 'unknown',
        rating: 'invalid',
        reviewedAt: new Date('2026-08-02T12:00:00Z'),
      }),
      event('medium-repeat', {
        problemSlug: 'medium',
        problemDifficulty: 'medium',
        rating: 'hard',
        reviewedAt: new Date('2026-08-06T12:00:00Z'),
      }),
      event('hard-repeat', {
        problemSlug: 'hard',
        problemDifficulty: 'hard',
        reviewedAt: new Date('2026-08-07T12:00:00Z'),
      }),
    ],
    {
      start: new Date(timeFrame.periodStart),
      end: new Date(timeFrame.asOf),
      buckets: buildAnalyticsBucketsFromTimeFrame(timeFrame),
      timeFrame,
      timeZone: 'UTC',
      fsrsOptions: normalizeFsrsSchedulingOptions(),
      timeTargetsMinutes: { easy: 20, medium: 35, hard: 50 },
    },
  ).problemSolving
}
const plot = (name: string) => within(screen.getByRole('region', { name }))
const choose = (
  user: ReturnType<typeof userEvent.setup>,
  group: string,
  name: string,
) =>
  user.click(
    within(screen.getByRole('group', { name: group })).getByRole('button', {
      name,
    }),
  )

describe('Problem Solving', () => {
  it('shares difficulty visibility, retains measure and dates, and reveals isolated quartiles', async () => {
    const user = userEvent.setup()
    render(<NewProblemSuccessView view={view()} timeFrame={timeFrame} />)
    expect(
      screen.getByText(/7 assessments · 7 distinct problems/),
    ).toBeVisible()
    const outcome = screen.getByRole('img', {
      name: 'Success by Difficulty chart',
    }).textContent
    await choose(user, 'Outcome measure', 'Good + Easy')
    for (const name of ['Medium', 'Hard'])
      await user.click(screen.getByRole('button', { name }))
    expect(
      within(screen.getByRole('group', { name: 'Outcome measure' })).getByRole(
        'button',
        { name: 'Good + Easy' },
      ),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('problem-time-easy-quartiles-0')).toHaveAttribute(
      'data-low',
      '75',
    )
    expect(
      screen.queryByTestId('problem-outcome-medium-markers'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Success by Difficulty chart' })
        .textContent,
    ).toContain('08/01–08/04')
    expect(outcome).toContain('08/01–08/04')
    await user.click(screen.getByRole('button', { name: 'Easy' }))
    expect(screen.getAllByText('Select a difficulty.')).toHaveLength(2)
    expect(plot('Difficulty Mix').getByRole('img')).toBeVisible()
  })

  it('uses recorded-time units and successful coverage consistently in tables and inspection', async () => {
    const user = userEvent.setup()
    render(<NewProblemSuccessView view={view()} timeFrame={timeFrame} />)
    await choose(user, 'Time units', 'Minutes')
    const time = plot('Recorded Time by Difficulty')
    fireEvent.keyDown(
      time.getByRole('button', {
        name: 'Inspect Recorded Time by Difficulty chart',
      }),
      { key: 'Home' },
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('25.0 min')
    expect(screen.getByRole('tooltip')).toHaveTextContent('4/4 timed')
    await user.selectOptions(
      screen.getByLabelText('Timing population'),
      'successful',
    )
    await user.click(time.getByRole('tab', { name: 'Table' }))
    const table = time.getByRole('table', {
      name: 'Recorded Time by Difficulty exact values',
    })
    expect(table).toHaveTextContent('15.0 min')
    expect(table).toHaveTextContent('35.0 min')
    expect(table).toHaveTextContent('0/0')
    await choose(user, 'Difficulty Mix measure', 'Recorded-time share')
    await user.click(plot('Difficulty Mix').getByRole('tab', { name: 'Table' }))
    expect(plot('Difficulty Mix').getByRole('table')).toHaveTextContent(
      'Unknown',
    )
  })

  it('switches to fixed-category comparisons with exact prior counts and sparse labels', async () => {
    const user = userEvent.setup()
    render(<NewProblemSuccessView view={view()} timeFrame={timeFrame} />)
    await choose(user, 'View', 'Compare')
    const column = screen
      .getByTestId('problem-compare-outcome-easy')
      .querySelector('rect')!
    const tick = Array.from(
      screen
        .getByRole('region', { name: 'Success by Difficulty' })
        .querySelectorAll('svg text'),
    ).find((node) => node.textContent === 'Easy')!
    expect(Number(tick.getAttribute('x'))).toBeCloseTo(
      Number(column.getAttribute('x')) +
        Number(column.getAttribute('width')) / 2,
    )
    await user.click(
      plot('Success by Difficulty').getByRole('tab', { name: 'Table' }),
    )
    const table = plot('Success by Difficulty').getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(table).toHaveTextContent('Sparse comparison')
    expect(table).toHaveTextContent('100.0%')
    expect(table).toHaveTextContent('0.0%')
    await choose(user, 'Assessment population', 'Follow-up practice')
    expect(
      screen.getByText(/2 assessments · 2 distinct problems/),
    ).toBeVisible()
    expect(table).toHaveTextContent('Hard')
  })

  it('renders and saves only the chosen existing target across both raw cohorts', async () => {
    const user = userEvent.setup()
    const onSaveTarget = vi.fn().mockResolvedValue(undefined)
    render(
      <NewProblemSuccessView
        view={view()}
        timeFrame={timeFrame}
        onSaveTarget={onSaveTarget}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Target First-attempt Success 90%' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Target Good + Easy 90%' }),
    ).not.toBeInTheDocument()
    await choose(user, 'Outcome measure', 'Good + Easy')
    await user.click(
      screen.getByRole('button', { name: 'Target Good + Easy 90%' }),
    )
    await user.clear(screen.getByLabelText('Target Good + Easy (%)'))
    await user.type(
      screen.getByLabelText('Target Good + Easy (%)'),
      '80{Enter}',
    )
    expect(onSaveTarget).toHaveBeenCalledWith({
      targetFirstAttemptGoodEasy: 0.8,
    })
    await choose(user, 'Assessment population', 'Follow-up practice')
    expect(
      screen.getByRole('button', { name: 'Target Review Success 90%' }),
    ).toBeVisible()
    await choose(user, 'Outcome measure', 'Hard + Good + Easy')
    expect(
      screen.getByRole('button', { name: 'Target Recall 90%' }),
    ).toBeVisible()
    expect(screen.getByText(/can differ from FSRS-paired Recall/)).toBeVisible()
  })
})
