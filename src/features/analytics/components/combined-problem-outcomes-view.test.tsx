import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { normalizeFsrsSchedulingOptions } from '@/lib/fsrs'
import { buildAnalyticsTimeFrame } from '../domain/analytics-time'
import { buildAnalyticsBucketsFromTimeFrame } from '../domain/analytics-range-policy'
import { buildHistoricalAnalyticsViews } from '../domain/historical-presentation'
import type { HistoricalAnalyticsReviewEvent } from '../domain/historical-presentation'
import {
  CombinedProblemOutcomesView,
  combinedProblemOutcomeRows,
} from './combined-problem-outcomes-view'

const timeFrame = buildAnalyticsTimeFrame({
  asOf: new Date('2026-08-14T12:00:00Z'),
  requestedDays: 14,
  timeZone: 'UTC',
})
function event(
  id: string,
  problemDifficulty: HistoricalAnalyticsReviewEvent['problemDifficulty'],
  rating: string,
  day = '03',
): HistoricalAnalyticsReviewEvent {
  return {
    id,
    cardId: id,
    problemSlug: id,
    problemDifficulty,
    rating,
    topicLabels: [],
    fsrsReviewLog: null,
    reviewedAt: new Date(`2026-08-${day}T12:00:00Z`),
  }
}
const events = [
  event('invalid-start', 'hard', 'invalid', '02'),
  event('easy', 'easy', 'good'),
  ...Array.from({ length: 8 }, (_, i) => event(`hard-${i}`, 'hard', 'hard')),
  event('unknown-good', 'unknown', 'good'),
  event('unknown-again-1', 'unknown', 'again'),
  event('unknown-again-2', 'unknown', 'again'),
  event('zero', 'medium', 'again', '06'),
  event('invalid-end', 'hard', 'invalid', '07'),
]
function view(records = events) {
  return buildHistoricalAnalyticsViews(records, {
    start: new Date(timeFrame.periodStart),
    end: new Date(timeFrame.asOf),
    buckets: buildAnalyticsBucketsFromTimeFrame(timeFrame),
    timeFrame,
    timeZone: 'UTC',
    fsrsOptions: normalizeFsrsSchedulingOptions(),
  }).problemSolving
}

describe('combined new problem outcomes', () => {
  it('pools counts including unknown difficulty instead of averaging rates', () => {
    const row = combinedProblemOutcomeRows(
      view().cohorts.newProblems.rows,
    ).find((row) => row.bucketStart === '2026-08-03')!
    expect(row).toMatchObject({
      recordedAssessments: 12,
      validRatings: 12,
      excludedInvalidRatings: 0,
      again: 2,
      hard: 8,
      good: 2,
      easy: 0,
      hardGoodEasy: 10,
      goodEasy: 2,
    })
    expect(row.successRate).toBeCloseTo(10 / 12)
    expect(row.goodEasyRate).toBeCloseTo(2 / 12)
  })

  it('trims invalid-only edges, retains interior gaps and real zero, and inspects exact values', async () => {
    const user = userEvent.setup()
    render(<CombinedProblemOutcomesView view={view()} timeFrame={timeFrame} />)
    expect(
      screen.getByTestId('combined-successRate-bridge-0-3'),
    ).toBeInTheDocument()
    const inspect = screen.getByRole('button', {
      name: 'Inspect New Problem Success chart',
    })
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('83.3% (10/12)')
    expect(screen.getByRole('tooltip')).toHaveTextContent('16.7% (2/12)')
    fireEvent.keyDown(inspect, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'No valid first recorded outcomes',
    )
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('0.0% (0/1)')
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    const table = screen.getByRole('table', {
      name: 'New Problem Success exact values',
    })
    expect(within(table).getAllByRole('row')).toHaveLength(5)
    expect(table).toHaveTextContent('08/03')
    expect(table).toHaveTextContent('08/06')
    expect(table).not.toHaveTextContent('08/02')
    expect(table).not.toHaveTextContent('08/07')
    expect(table).toHaveTextContent('As of Aug 14, 2026')
  })

  it('keeps both saved goals visible and toggles outcome curves independently', async () => {
    const user = userEvent.setup()
    const onSaveTarget = vi.fn().mockResolvedValue(undefined)
    const current = view()
    const { rerender } = render(
      <CombinedProblemOutcomesView
        view={current}
        onSaveTarget={onSaveTarget}
      />,
    )
    expect(screen.getByTestId('combined-shared-target')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveTextContent(
      'Equal goals share one neutral reference',
    )
    expect(
      screen.getByRole('button', { name: 'Target Good + Easy 90%' }),
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Target First-attempt Success 90%' }),
    )
    await user.clear(screen.getByLabelText('Target First-attempt Success (%)'))
    await user.type(
      screen.getByLabelText('Target First-attempt Success (%)'),
      '80{Enter}',
    )
    expect(onSaveTarget).toHaveBeenCalledWith({
      targetFirstAttemptSuccess: 0.8,
    })
    rerender(
      <CombinedProblemOutcomesView
        view={{
          ...current,
          targets: { ...current.targets, targetFirstAttemptSuccess: 0.8 },
        }}
      />,
    )
    expect(
      screen.queryByTestId('combined-shared-target'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('combined-successRate-target'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('combined-goodEasyRate-target'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hard + Good + Easy' }))
    expect(
      screen.queryByTestId('combined-successRate-markers'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('combined-goodEasyRate-markers'),
    ).toBeInTheDocument()
    expect(screen.getByRole('img')).not.toHaveTextContent(
      'Hard + Good + Easy uses circles',
    )
    expect(screen.getByRole('img')).toHaveTextContent(
      'Good + Easy uses diamonds',
    )
  })

  it('renders unknown-only zero outcomes on a fitted scale and retains controls when empty', () => {
    const { rerender } = render(
      <CombinedProblemOutcomesView
        view={view([event('unknown-zero', 'unknown', 'again')])}
      />,
    )
    expect(
      screen.getByRole('img', { name: 'New Problem Success chart' }),
    ).toHaveTextContent('Scale 0.0%–100.0%')
    rerender(
      <CombinedProblemOutcomesView view={view([])} onSaveTarget={vi.fn()} />,
    )
    expect(
      screen.getByText('No valid first recorded outcomes in this period.'),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Target First-attempt Success 90%' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Target Good + Easy 90%' }),
    ).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Table' })).toBeVisible()
  })
})
