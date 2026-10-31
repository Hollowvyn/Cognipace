import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { normalizeFsrsSchedulingOptions } from '@/lib/fsrs'
import { buildAnalyticsTimeFrame } from '../../domain/analytics-time'
import { buildAnalyticsBucketsFromTimeFrame } from '../../domain/analytics-range-policy'
import {
  buildHistoricalAnalyticsViews,
  type HistoricalAnalyticsReviewEvent,
} from '../../domain/historical-presentation'
import { TimeTargetCard } from './time-target-card'

const timeFrame = buildAnalyticsTimeFrame({
  asOf: new Date('2026-08-14T12:00:00Z'),
  requestedDays: 14,
  timeZone: 'UTC',
})
function event(
  id: string,
  difficulty: HistoricalAnalyticsReviewEvent['problemDifficulty'],
  seconds: number | null,
  rating = 'good',
  day = '03',
): HistoricalAnalyticsReviewEvent {
  return {
    id,
    cardId: id,
    problemSlug: id,
    rating,
    problemDifficulty: difficulty,
    reviewedAt: new Date(`2026-08-${day}T12:00:00Z`),
    elapsedSeconds: seconds,
    fsrsReviewLog: null,
    topicLabels: [],
  }
}
const events = [
  event('easy', 'easy', 600),
  event('medium', 'medium', 2700),
  event('hard', 'hard', 2400),
  event('unknown', 'unknown', 300, 'invalid'),
  event('missing', 'unknown', null),
]
function view(records = events) {
  return buildHistoricalAnalyticsViews(records, {
    start: new Date(timeFrame.periodStart),
    end: new Date(timeFrame.asOf),
    buckets: buildAnalyticsBucketsFromTimeFrame(timeFrame),
    timeFrame,
    timeZone: 'UTC',
    fsrsOptions: normalizeFsrsSchedulingOptions(),
    timeTargetsMinutes: { easy: 20, medium: 30, hard: 40 },
  }).problemSolving
}
async function section(value: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Time Details' }))
  await userEvent.selectOptions(
    screen.getByLabelText('Time detail section'),
    value,
  )
}
async function fields() {
  const table = screen.getByRole('table', {
    name: 'Time Intervals exact values',
  })
  const result = new Set<string>()
  while (true) {
    within(table)
      .getAllByRole('columnheader')
      .forEach((header) => result.add(header.textContent ?? ''))
    const next = screen.queryByRole('button', {
      name: 'Next Time Intervals exact values fields',
    })
    if (!next || (next as HTMLButtonElement).disabled) break
    await userEvent.click(next)
  }
  return result
}
async function exactValues() {
  const table = screen.getByRole('table', {
    name: 'Time Intervals exact values',
  })
  const previous = screen.queryByRole('button', {
    name: 'Previous Time Intervals exact values fields',
  })
  while (previous && !(previous as HTMLButtonElement).disabled)
    await userEvent.click(previous)
  const values = new Map<string, string>()
  while (true) {
    const headers = within(table).getAllByRole('columnheader').slice(1)
    const cells = within(table).getAllByRole('cell')
    headers.forEach((header, index) =>
      values.set(header.textContent ?? '', cells[index]?.textContent ?? ''),
    )
    const next = screen.queryByRole('button', {
      name: 'Next Time Intervals exact values fields',
    })
    if (!next || (next as HTMLButtonElement).disabled) break
    await userEvent.click(next)
  }
  return values
}
describe('TimeTargetCard', () => {
  it('renders uncapped separate medians with amber only for excess and all-classification coverage', () => {
    render(<TimeTargetCard view={view()} timeFrame={timeFrame} />)
    expect(
      screen.getByRole('region', { name: 'Time vs target' }),
    ).toHaveAccessibleDescription('Median time by difficulty')
    expect(screen.getByRole('region', { name: 'Time vs target' })).toHaveClass(
      'cp-historical-view',
      'cp-historical-problem-solving',
    )
    expect(screen.getByTestId('time-coverage')).toHaveTextContent('4 timed')
    expect(screen.getByTestId('time-coverage')).toHaveTextContent(
      '5 eligible · first attempts',
    )
    expect(
      Number(
        screen.getByTestId('time-target-easy-base').getAttribute('height'),
      ),
    ).toBeGreaterThanOrEqual(11)
    expect(screen.getByTestId('time-target-easy')).toHaveTextContent(
      '50% · -10 min · Under target',
    )
    expect(screen.getByTestId('time-target-medium')).toHaveTextContent(
      '150% · +15 min · Over target',
    )
    expect(screen.getByTestId('time-target-hard')).toHaveTextContent(
      '100% · 0 min · On target',
    )
    expect(
      screen.queryByTestId('time-target-easy-excess'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('time-target-hard-excess'),
    ).not.toBeInTheDocument()
    expect(
      Number(
        screen.getByTestId('time-target-medium-excess').getAttribute('width'),
      ),
    ).toBeGreaterThan(0)
    expect(screen.queryByTestId('time-target-unknown')).not.toBeInTheDocument()
    expect(
      screen.getByText('Unclassified: 1/2 timed; no target.'),
    ).toBeVisible()
  })

  it('keeps null time unavailable and successful eligibility rating-derived with independent defaults', async () => {
    render(
      <TimeTargetCard
        view={view([
          event('missing', 'easy', null),
          event('again', 'medium', 900, 'again'),
          event('invalid', 'unknown', 600, 'invalid'),
        ])}
        timeFrame={timeFrame}
      />,
    )
    expect(screen.getByTestId('time-target-easy')).toHaveTextContent(
      'Unavailable',
    )
    expect(
      screen.queryByTestId('time-target-easy-base'),
    ).not.toBeInTheDocument()
    await section('settings')
    expect(screen.getByLabelText('Time units')).toHaveValue('targetPercent')
    expect(screen.getByLabelText('Timing population')).toHaveValue('all')
    await userEvent.selectOptions(
      screen.getByLabelText('Timing population'),
      'successful',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Time Overview' }))
    expect(screen.getByTestId('time-coverage')).toHaveTextContent('0 timed')
    expect(screen.getByTestId('time-coverage')).toHaveTextContent(
      '1 eligible · first attempts',
    )
    expect(screen.getByTestId('time-target-medium')).toHaveTextContent(
      'Unavailable',
    )
  })

  it('preserves all exact fields, fixed Compare categories and isolated four-record quartiles', async () => {
    render(
      <TimeTargetCard
        view={view([
          ...events,
          ...[600, 1200, 1800].map((seconds, index) =>
            event(`easy-${index}`, 'easy', seconds),
          ),
          event('gap-invalid', 'hard', null, 'invalid', '07'),
        ])}
        timeFrame={timeFrame}
      />,
    )
    await section('trend')
    expect(
      screen.queryByTestId('problem-time-easy-quartiles-0'),
    ).not.toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByLabelText('Time detail section'),
      'settings',
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Time units'),
      'minutes',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Medium' }))
    await userEvent.click(screen.getByRole('button', { name: 'Hard' }))
    await userEvent.selectOptions(
      screen.getByLabelText('Time detail section'),
      'trend',
    )
    expect(
      screen.getByTestId('problem-time-easy-quartiles-0'),
    ).toBeInTheDocument()
    const inspect = screen.getByRole('button', {
      name: 'Inspect Recorded Time by Difficulty chart',
    })
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('08/07')
    await userEvent.selectOptions(
      screen.getByLabelText('Time detail section'),
      'compare',
    )
    for (const key of ['easy', 'medium', 'hard'])
      expect(
        screen.getByTestId(`problem-compare-time-${key}`),
      ).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByLabelText('Time detail section'),
      'intervals',
    )
    const exact = await fields()
    for (const field of [
      'Raw recorded',
      'Valid',
      'Invalid',
      'Timed / eligible',
      'Median',
      'Q1',
      'Q3',
      'Current target',
      'Recorded seconds',
      'Context',
      'Report as of',
      'Timezone',
      'Prior period',
    ])
      expect(exact).toContain(field)
    await userEvent.selectOptions(
      screen.getByLabelText('Time detail section'),
      'method',
    )
    expect(screen.getByText(/paused time/)).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Next Time method pages' }),
    )
    expect(screen.getByText(/Strict Timing/)).toBeVisible()
  })

  it('keeps three-record quartiles hidden and distinguishes all-hidden from an untimed successful subset', async () => {
    render(
      <TimeTargetCard
        view={view([
          event('easy-1', 'easy', 600, 'again'),
          event('easy-2', 'easy', 1200, 'again'),
          event('easy-3', 'easy', 1800, 'again'),
          event('unknown-missing', 'unknown', null),
        ])}
        timeFrame={timeFrame}
      />,
    )
    await section('settings')
    await userEvent.click(screen.getByRole('button', { name: 'Medium' }))
    await userEvent.click(screen.getByRole('button', { name: 'Hard' }))
    await userEvent.selectOptions(
      screen.getByLabelText('Time detail section'),
      'trend',
    )
    expect(
      screen.queryByTestId('problem-time-easy-quartiles-0'),
    ).not.toBeInTheDocument()
    const inspect = screen.getByRole('button', {
      name: 'Inspect Recorded Time by Difficulty chart',
    })
    const fullDomain = inspect.getAttribute('aria-describedby')
    expect(fullDomain).toBeTruthy()
    await userEvent.selectOptions(
      screen.getByLabelText('Time detail section'),
      'settings',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Easy' }))
    await userEvent.selectOptions(
      screen.getByLabelText('Time detail section'),
      'trend',
    )
    expect(screen.getByText('Select a difficulty.')).toBeVisible()
    await userEvent.selectOptions(
      screen.getByLabelText('Time detail section'),
      'compare',
    )
    for (const key of ['easy', 'medium', 'hard'])
      expect(
        screen.getByTestId(`problem-compare-time-${key}`),
      ).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByLabelText('Time detail section'),
      'settings',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Easy' }))
    await userEvent.selectOptions(
      screen.getByLabelText('Timing population'),
      'successful',
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Time detail section'),
      'trend',
    )
    expect(
      screen.getByText(
        'No eligible recorded assessment time for the selected difficulties in this period.',
      ),
    ).toBeVisible()
  })

  it('preserves every original interval classification and resets row pagination on a new report', async () => {
    const source = view()
    const { rerender } = render(
      <TimeTargetCard view={source} timeFrame={timeFrame} />,
    )
    await section('intervals')
    const table = screen.getByRole('table', {
      name: 'Time Intervals exact values',
    })
    const next = screen.getByRole('button', { name: 'Next Time rows' })
    const seen = new Set<string>()
    while (true) {
      within(table)
        .getAllByRole('rowheader')
        .forEach((row) => seen.add(row.textContent ?? ''))
      if ((next as HTMLButtonElement).disabled) break
      await userEvent.click(next)
    }
    expect(seen.size).toBe(source.cohorts.newProblems.rows.length * 4)
    expect(table).toHaveTextContent('Unclassified')
    rerender(
      <TimeTargetCard
        view={source}
        timeFrame={{ ...timeFrame, asOf: '2026-08-14T13:00:00Z' }}
      />,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Previous Time rows' }),
      ).toBeDisabled(),
    )
  })

  it('exposes prior raw, valid and invalid counts for every classification and keeps no-prior values absent', async () => {
    const prior = [
      ...Array.from({ length: 12 }, (_, index) =>
        event(
          `prior-easy-${index}`,
          'easy',
          600,
          index < 2 ? 'invalid' : 'again',
        ),
      ),
      event('prior-unknown-good', 'unknown', 300),
      event('prior-unknown-invalid', 'unknown', null, 'invalid'),
    ].map((record) => ({
      ...record,
      reviewedAt: new Date('2026-07-26T12:00:00Z'),
    }))
    const source = view([...events, ...prior])
    const { rerender } = render(
      <TimeTargetCard view={source} timeFrame={timeFrame} />,
    )
    await section('intervals')
    await userEvent.selectOptions(
      screen.getByLabelText('Time exact population'),
      'compare',
    )
    const easy = await exactValues()
    expect(easy.get('Prior raw recorded')).toBe('12')
    expect(easy.get('Prior valid')).toBe('10')
    expect(easy.get('Prior invalid')).toBe('2')
    await userEvent.click(
      screen.getByRole('button', { name: 'Next Time rows' }),
    )
    const medium = await exactValues()
    for (const field of ['Prior raw recorded', 'Prior valid', 'Prior invalid'])
      expect(medium.get(field)).toBe('0')
    for (let index = 0; index < 2; index++)
      await userEvent.click(
        screen.getByRole('button', { name: 'Next Time rows' }),
      )
    const unknown = await exactValues()
    expect(unknown.get('Prior raw recorded')).toBe('2')
    expect(unknown.get('Prior valid')).toBe('1')
    expect(unknown.get('Prior invalid')).toBe('1')
    rerender(
      <TimeTargetCard
        view={{ ...source, previousPeriod: null }}
        timeFrame={timeFrame}
      />,
    )
    const missing = await exactValues()
    for (const field of ['Prior raw recorded', 'Prior valid', 'Prior invalid'])
      expect(missing.get(field)).toBe('—')
    expect(missing.get('Prior period')).toContain('No previous period')
  })

  it.each([
    ['as of', { ...timeFrame, asOf: '2026-08-14T13:00:00Z' }],
    ['range', { ...timeFrame, requestedDays: 30 }],
    ['timezone', { ...timeFrame, timeZone: 'America/New_York' }],
    [
      'grouping',
      { ...timeFrame, grouping: { unit: 'week' as const, step: 1 as const } },
    ],
  ])(
    'resets hidden Time interval pages after a %s change and preserves equivalent rerenders',
    async (_context, refreshed) => {
      const source = view()
      const { rerender } = render(
        <TimeTargetCard view={source} timeFrame={timeFrame} />,
      )
      await section('intervals')
      await userEvent.click(
        screen.getByRole('button', { name: 'Next Time rows' }),
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Time Overview' }),
      )
      rerender(<TimeTargetCard view={source} timeFrame={{ ...timeFrame }} />)
      await userEvent.click(
        screen.getByRole('button', { name: 'Time Details' }),
      )
      expect(
        screen.getByRole('button', { name: 'Previous Time rows' }),
      ).toBeEnabled()
      await userEvent.click(
        screen.getByRole('button', { name: 'Time Overview' }),
      )
      rerender(<TimeTargetCard view={source} timeFrame={refreshed} />)
      await userEvent.click(
        screen.getByRole('button', { name: 'Time Details' }),
      )
      expect(
        screen.getByRole('button', { name: 'Previous Time rows' }),
      ).toBeDisabled()
    },
  )
})
