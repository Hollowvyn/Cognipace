import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { normalizeFsrsSchedulingOptions } from '@/lib/fsrs'
import { buildAnalyticsTimeFrame } from '../../domain/analytics-time'
import { buildAnalyticsBucketsFromTimeFrame } from '../../domain/analytics-range-policy'
import {
  buildHistoricalAnalyticsViews,
  type HistoricalAnalyticsReviewEvent,
} from '../../domain/historical-presentation'
import { PerformanceCard } from './performance-card'
import { CombinedProblemOutcomesView } from '../combined-problem-outcomes-view'
import { TimeTargetCard } from './time-target-card'

const timeFrame = buildAnalyticsTimeFrame({
  asOf: new Date('2026-08-14T12:00:00.123Z'),
  requestedDays: 14,
  timeZone: 'UTC',
})
const sample = {
  easy: { again: 1, hard: 1, good: 15, easy: 8 },
  medium: { again: 5, hard: 10, good: 30, easy: 10 },
  hard: { again: 5, hard: 4, good: 9, easy: 2 },
  unknown: { again: 0, hard: 0, good: 0, easy: 0 },
} as const
function event(
  id: string,
  difficulty: HistoricalAnalyticsReviewEvent['problemDifficulty'],
  rating: string,
  day = '03',
  problemSlug = id,
): HistoricalAnalyticsReviewEvent {
  return {
    id,
    cardId: id,
    problemSlug,
    problemDifficulty: difficulty,
    rating,
    reviewedAt: new Date(`2026-08-${day}T12:00:00Z`),
    fsrsReviewLog: null,
    topicLabels: [],
    elapsedSeconds: 600,
  }
}
function view(
  records = Object.entries(sample).flatMap(([difficulty, ratings]) =>
    Object.entries(ratings).flatMap(([rating, count]) =>
      Array.from({ length: count }, (_, index) =>
        event(
          `${difficulty}-${rating}-${index}`,
          difficulty as HistoricalAnalyticsReviewEvent['problemDifficulty'],
          rating,
        ),
      ),
    ),
  ),
) {
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
async function details(section: string) {
  await userEvent.click(
    screen.getByRole('button', { name: 'Performance Details' }),
  )
  await userEvent.selectOptions(
    screen.getByLabelText('Performance detail section'),
    section,
  )
}
async function allFields(label: string) {
  const table = screen.getByRole('table', { name: label })
  const seen = new Set<string>()
  const previous = screen.queryByRole('button', {
    name: `Previous ${label} fields`,
  })
  while (previous && !(previous as HTMLButtonElement).disabled)
    await userEvent.click(previous)
  while (true) {
    within(table)
      .getAllByRole('columnheader')
      .forEach((header) => seen.add(header.textContent ?? ''))
    const next = screen.queryByRole('button', { name: `Next ${label} fields` })
    if (!next || (next as HTMLButtonElement).disabled) break
    await userEvent.click(next)
  }
  return seen
}
async function exactValues(label: string) {
  const table = screen.getByRole('table', { name: label })
  const previous = screen.queryByRole('button', {
    name: `Previous ${label} fields`,
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
    const next = screen.queryByRole('button', { name: `Next ${label} fields` })
    if (!next || (next as HTMLButtonElement).disabled) break
    await userEvent.click(next)
  }
  return values
}

describe('PerformanceCard', () => {
  it('shows the approved pooled weighted score and a cumulative curve without raw outcome overload', async () => {
    render(<PerformanceCard view={view()} timeFrame={timeFrame} />)
    expect(screen.getByRole('region', { name: 'Performance' })).toHaveClass(
      'cp-historical-view',
      'cp-historical-problem-solving',
    )
    expect(screen.getByTestId('performance-score')).toHaveTextContent('68/100')
    expect(screen.getByText('100 valid ratings')).toBeVisible()
    expect(screen.getAllByTestId(/performance-trend-marker-/)).toHaveLength(1)
    expect(
      screen.queryByTestId('combined-successRate-markers'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Performance' })).toHaveAttribute(
      'data-mode',
      'overview',
    )
    await details('ratings')
    expect(await allFields('Performance Ratings exact values')).toEqual(
      new Set([
        'Rating',
        'Description',
        'Count',
        'Fixed points',
        'Weighted contribution',
      ]),
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Performance detail section'),
      'difficulty',
    )
    expect(await allFields('Performance Difficulty exact values')).toEqual(
      new Set([
        'Difficulty',
        'Recorded',
        'Valid',
        'Invalid excluded',
        'Influence',
        'Score',
        'Again',
        'Hard',
        'Good',
        'Easy',
        'Prior valid',
        'Prior score',
        'Change',
        'Prior period',
        'Prior recorded',
        'Prior invalid',
        'Prior Again',
        'Prior Hard',
        'Prior Good',
        'Prior Easy',
      ]),
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Performance detail section'),
      'intervals',
    )
    const fields = await allFields('Performance Intervals exact values')
    for (const field of [
      'ID',
      'Start',
      'End',
      'Partial',
      'Interval score',
      'New valid',
      'Cumulative valid',
      'Weighted points',
      'Weighted units',
      'Cumulative score',
      'State',
      'Last update',
      'Recorded',
      'Invalid excluded',
    ])
      expect(fields).toContain(field)
    await userEvent.selectOptions(
      screen.getByLabelText('Performance detail section'),
      'method',
    )
    expect(screen.getByText('67.74358974358974')).toBeVisible()
    expect(screen.getByText('13210 / 195')).toBeVisible()
  })

  it('keeps cohort state independent of Time and distinguishes unavailable, measured zero, and held rows', async () => {
    const source = view([
      event('invalid', 'unknown', 'invalid', '02'),
      event('zero', 'hard', 'again'),
      event('later', 'hard', 'easy', '06', 'zero'),
    ])
    render(
      <>
        <PerformanceCard view={source} timeFrame={timeFrame} />
        <TimeTargetCard view={source} timeFrame={timeFrame} />
      </>,
    )
    expect(screen.getByTestId('performance-score')).toHaveTextContent('0/100')
    const inspect = screen.getByRole('button', {
      name: 'Inspect Performance cumulative chart',
    })
    fireEvent.keyDown(inspect, { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Unavailable')
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Held')
    expect(screen.getByRole('tooltip')).toHaveTextContent('0 new valid')
    await userEvent.selectOptions(
      screen.getByLabelText('Performance population'),
      'followupPractice',
    )
    expect(screen.getByTestId('performance-score')).toHaveTextContent('100/100')
    expect(screen.getByLabelText('Time population')).toHaveValue('newProblems')
  })

  it('preserves pooled rates, raw difficulty evidence, mix fields and all four mapped persistent goal drafts', async () => {
    const save = vi.fn().mockRejectedValue(new Error('Storage unavailable'))
    render(
      <PerformanceCard
        view={view([
          event('unknown', 'unknown', 'again'),
          event('good', 'easy', 'good'),
          event('invalid', 'unknown', 'invalid'),
          event('repeat', 'easy', 'hard', '06', 'good'),
        ])}
        timeFrame={timeFrame}
        onSaveTarget={save}
      />,
    )
    await details('pooled')
    expect(screen.getByTestId('combined-shared-target')).toBeInTheDocument()
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Inspect New Problem Success chart' }),
      { key: 'Home' },
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('50.0% (1/2)')
    await userEvent.click(
      screen.getByRole('button', { name: 'Hard + Good + Easy' }),
    )
    expect(
      screen.queryByTestId('combined-successRate-markers'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('combined-goodEasyRate-marker-0'),
    ).toBeInTheDocument()
    await userEvent.selectOptions(
      screen.getByLabelText('Pooled outcome display'),
      'values',
    )
    const pooled = await allFields('Performance Pooled outcomes exact values')
    for (const field of [
      'Recorded',
      'Valid',
      'Invalid excluded',
      'Again',
      'Hard',
      'Good',
      'Easy',
      'Hard + Good + Easy',
      'Good + Easy',
      'Target First-attempt Success',
      'Target Good + Easy',
      'Context',
      'Report as of',
      'Timezone',
    ])
      expect(pooled).toContain(field)
    await userEvent.selectOptions(
      screen.getByLabelText('Performance detail section'),
      'mix',
    )
    expect(await allFields('Performance Mix exact values')).toEqual(
      new Set([
        'Interval · difficulty',
        'Assessments',
        'Recorded seconds',
        'Share',
        'Context',
        'Report as of',
        'Timezone',
      ]),
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Performance detail section'),
      'difficultyOutcomes',
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Difficulty outcome display'),
      'values',
    )
    for (const field of [
      'Recorded',
      'Valid',
      'Invalid excluded',
      'Hard + Good + Easy',
      'Numerator / valid',
      'Target First-attempt Success',
      'Context',
    ])
      expect(
        await allFields('Performance Difficulty outcomes exact values'),
      ).toContain(field)
    await userEvent.selectOptions(
      screen.getByLabelText('Performance detail section'),
      'goals',
    )
    const labels = [
      'Target First-attempt Success',
      'Target Good + Easy',
      'Target Recall',
      'Target Review Success',
    ]
    for (const label of labels) {
      await userEvent.selectOptions(
        screen.getByLabelText('Performance goal'),
        label,
      )
      expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
      expect(screen.getByLabelText(`${label} (%)`)).toBeVisible()
    }
    await userEvent.selectOptions(
      screen.getByLabelText('Performance goal'),
      'Target Recall',
    )
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '80' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Storage unavailable',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Performance Overview' }),
    )
    await details('goals')
    expect(screen.getByRole('spinbutton')).toHaveValue(80)
    expect(screen.getByRole('alert')).toHaveTextContent('Storage unavailable')
    expect(save).toHaveBeenCalledExactlyOnceWith({ targetRecall: 0.8 })
  })
})

it('keeps Unclassified invalid assessments in the exact period Mix share', async () => {
  render(
    <PerformanceCard
      view={view([
        event('good', 'easy', 'good'),
        event('unknown', 'unknown', 'again'),
        event('invalid', 'unknown', 'invalid'),
      ])}
      timeFrame={timeFrame}
    />,
  )
  await details('mix')
  for (let index = 0; index < 3; index++)
    await userEvent.click(
      screen.getByRole('button', { name: 'Next Performance rows' }),
    )
  const table = screen.getByRole('table', {
    name: 'Performance Mix exact values',
  })
  expect(table).toHaveTextContent('Selected period · Unclassified')
  expect(table).toHaveTextContent('2')
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Next Performance Mix exact values fields',
    }),
  )
  expect(table).toHaveTextContent('66.66666666666666%')
})

it('uses later-raw population copy and appropriate goals in the controlled pooled owner', () => {
  render(
    <CombinedProblemOutcomesView
      view={view([
        event('first', 'easy', 'good'),
        event('repeat', 'easy', 'hard', '06', 'first'),
      ])}
      cohort="followupPractice"
      timeFrame={timeFrame}
    />,
  )
  expect(screen.getByText(/1 recorded later raw assessment/)).toBeVisible()
  expect(screen.getByText('Target Recall 90.0%')).toBeVisible()
  expect(screen.getByText('Target Review Success 90.0%')).toBeVisible()
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'Inspect Follow-up outcomes chart' }),
    { key: 'Home' },
  )
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Hard + Good + Easy: 100.0% (1/1)',
  )
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Good + Easy: 0.0% (0/1)',
  )
})

it('retains every cumulative interval through the final page and resets rows for a fresh report', async () => {
  const source = view()
  const { rerender } = render(
    <PerformanceCard view={source} timeFrame={timeFrame} />,
  )
  await details('intervals')
  const table = screen.getByRole('table', {
    name: 'Performance Intervals exact values',
  })
  const next = screen.getByRole('button', { name: 'Next Performance rows' })
  const seen = new Set<string>()
  while (true) {
    within(table)
      .getAllByRole('rowheader')
      .forEach((row) => seen.add(row.textContent ?? ''))
    if ((next as HTMLButtonElement).disabled) break
    await userEvent.click(next)
  }
  expect(seen.size).toBe(source.cohorts.newProblems.rows.length)
  await allFields('Performance Intervals exact values')
  const previousFields = screen.getByRole('button', {
    name: 'Previous Performance Intervals exact values fields',
  })
  while (
    !within(table).queryByRole('columnheader', { name: 'Weighted points' })
  )
    await userEvent.click(previousFields)
  expect(table).toHaveTextContent('13210')
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Next Performance Intervals exact values fields',
    }),
  )
  expect(table).toHaveTextContent('195')
  expect(table).toHaveTextContent('67.74358974358974')
  rerender(
    <PerformanceCard
      view={source}
      timeFrame={{ ...timeFrame, asOf: '2026-08-14T13:00:00.123Z' }}
    />,
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Previous Performance rows' }),
    ).toBeDisabled(),
  )
})

it('saves each mapped goal with only its owning Settings key and returns focus after closing', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(
    <PerformanceCard view={view()} timeFrame={timeFrame} onSaveTarget={save} />,
  )
  await details('goals')
  for (const [label, value, key] of [
    ['Target First-attempt Success', '95', 'targetFirstAttemptSuccess'],
    ['Target Good + Easy', '80', 'targetFirstAttemptGoodEasy'],
    ['Target Recall', '80', 'targetRecall'],
    ['Target Review Success', '95', 'targetReviewSuccess'],
  ] as const) {
    await userEvent.selectOptions(
      screen.getByLabelText('Performance detail section'),
      'goals',
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Performance goal'),
      label,
    )
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Performance Overview' }),
      ).toHaveFocus(),
    )
    expect(save).toHaveBeenLastCalledWith({ [key]: Number(value) / 100 })
  }
  expect(save).toHaveBeenCalledTimes(4)
})

it('distinguishes a missing prior period from a measured prior zero in raw Compare values', async () => {
  const source = { ...view(), previousPeriod: null }
  render(<PerformanceCard view={source} timeFrame={timeFrame} />)
  await details('difficultyOutcomes')
  await userEvent.selectOptions(
    screen.getByLabelText('Difficulty outcome display'),
    'compare',
  )
  await userEvent.selectOptions(
    screen.getByLabelText('Difficulty outcome display'),
    'values',
  )
  const table = screen.getByRole('table', {
    name: 'Performance Difficulty outcomes exact values',
  })
  const nextFields = screen.getByRole('button', {
    name: 'Next Performance Difficulty outcomes exact values fields',
  })
  while (!within(table).queryByRole('columnheader', { name: 'Prior valid' }))
    await userEvent.click(nextFields)
  expect(table).toHaveTextContent('Unavailable')
  while (!within(table).queryByRole('columnheader', { name: 'Change' }))
    await userEvent.click(nextFields)
  expect(table).toHaveTextContent('No previous period')
})

it('keeps pooled goal references when both raw series are hidden and omits their inspection rates', async () => {
  render(<PerformanceCard view={view()} timeFrame={timeFrame} />)
  await details('pooled')
  const inspect = screen.getByRole('button', {
    name: 'Inspect New Problem Success chart',
  })
  fireEvent.keyDown(inspect, { key: 'Home' })
  expect(screen.getByRole('tooltip')).toHaveTextContent('Hard + Good + Easy:')
  expect(screen.getByRole('tooltip')).toHaveTextContent('Good + Easy:')
  await userEvent.click(
    screen.getByRole('button', { name: 'Hard + Good + Easy' }),
  )
  await userEvent.click(screen.getByRole('button', { name: 'Good + Easy' }))
  expect(screen.getByTestId('combined-shared-target')).toBeInTheDocument()
  expect(
    screen.queryByTestId('combined-successRate-marker-0'),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByTestId('combined-goodEasyRate-marker-0'),
  ).not.toBeInTheDocument()
  fireEvent.keyDown(inspect, { key: 'Home' })
  expect(screen.getByRole('tooltip')).not.toHaveTextContent(
    'Hard + Good + Easy:',
  )
  expect(
    within(screen.getByRole('tooltip')).queryByText(/^Good \+ Easy:/),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('tooltip')).toHaveTextContent('100 valid')
})

it('makes every weighted Difficulty prior count unavailable without a prior period and preserves a measured zero score', async () => {
  const records = [
    ...Array.from({ length: 10 }, (_, index) =>
      event(`current-${index}`, 'easy', 'good'),
    ),
    ...Array.from({ length: 10 }, (_, index) => ({
      ...event(`prior-${index}`, 'easy', 'again'),
      reviewedAt: new Date('2026-07-26T12:00:00Z'),
    })),
  ]
  const source = view(records)
  const { rerender } = render(
    <PerformanceCard
      view={{ ...source, previousPeriod: null }}
      timeFrame={timeFrame}
    />,
  )
  await details('difficulty')
  const missing = await exactValues('Performance Difficulty exact values')
  for (const field of [
    'Prior valid',
    'Prior score',
    'Prior recorded',
    'Prior invalid',
    'Prior Again',
    'Prior Hard',
    'Prior Good',
    'Prior Easy',
  ])
    expect(missing.get(field)).toBe('Unavailable')
  expect(missing.get('Change')).toBe('No previous period')
  expect(missing.get('Prior period')).toContain('No previous period')
  rerender(<PerformanceCard view={source} timeFrame={timeFrame} />)
  const actual = await exactValues('Performance Difficulty exact values')
  expect(actual.get('Prior valid')).toBe('10')
  expect(actual.get('Prior recorded')).toBe('10')
  expect(actual.get('Prior invalid')).toBe('0')
  expect(actual.get('Prior Again')).toBe('10')
  for (const field of ['Prior score', 'Prior Hard', 'Prior Good', 'Prior Easy'])
    expect(actual.get(field)).toBe('0')
  expect(actual.get('Change')).toBe('80 points')
})

it('keeps raw Compare tooltip truthful for absent and measured-zero priors', async () => {
  const source = view([
    ...Array.from({ length: 10 }, (_, index) =>
      event(`current-${index}`, 'easy', 'good'),
    ),
    ...Array.from({ length: 10 }, (_, index) => ({
      ...event(`prior-${index}`, 'easy', 'again'),
      reviewedAt: new Date('2026-07-26T12:00:00Z'),
    })),
  ])
  const { rerender } = render(
    <PerformanceCard
      view={{ ...source, previousPeriod: null }}
      timeFrame={timeFrame}
    />,
  )
  await details('difficultyOutcomes')
  await userEvent.selectOptions(
    screen.getByLabelText('Difficulty outcome display'),
    'compare',
  )
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'Inspect Easy outcome comparison' }),
    { key: 'Enter' },
  )
  expect(screen.getByRole('tooltip')).toHaveTextContent('No previous period')
  expect(screen.getByRole('tooltip')).not.toHaveTextContent('· 0 valid')
  expect(screen.getByRole('tooltip')).not.toHaveTextContent('Sparse comparison')
  rerender(<PerformanceCard view={source} timeFrame={timeFrame} />)
  fireEvent.keyDown(
    screen.getByRole('button', { name: 'Inspect Easy outcome comparison' }),
    { key: 'Enter' },
  )
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Prior: 0.0% · 10 valid',
  )
  expect(screen.getByRole('tooltip')).toHaveTextContent('+100.0 pp')
})

it('keeps raw Compare report context reachable through every exact field group', async () => {
  render(<PerformanceCard view={view()} timeFrame={timeFrame} />)
  await details('difficultyOutcomes')
  await userEvent.selectOptions(
    screen.getByLabelText('Difficulty outcome display'),
    'compare',
  )
  await userEvent.selectOptions(
    screen.getByLabelText('Difficulty outcome display'),
    'values',
  )
  const values = await exactValues(
    'Performance Difficulty outcomes exact values',
  )
  expect(values.get('Context')).toBe('Selected period')
  expect(values.get('Report as of')).toBe(timeFrame.asOf)
  expect(values.get('Timezone')).toBe('UTC')
})

it('keeps the newly active goal draft and focus when a different hidden goal finishes saving', async () => {
  let resolve!: () => void
  const save = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  render(
    <PerformanceCard view={view()} timeFrame={timeFrame} onSaveTarget={save} />,
  )
  await details('goals')
  await userEvent.clear(screen.getByRole('spinbutton'))
  await userEvent.type(screen.getByRole('spinbutton'), '95')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(save).toHaveBeenCalledExactlyOnceWith({
    targetFirstAttemptSuccess: 0.95,
  })
  expect(screen.getByLabelText('Performance goal')).toBeEnabled()
  await userEvent.selectOptions(
    screen.getByLabelText('Performance goal'),
    'Target Recall',
  )
  const active = screen.getByLabelText('Target Recall (%)')
  await userEvent.clear(active)
  await userEvent.type(active, '80')
  expect(active).toHaveFocus()
  await act(async () => {
    resolve()
    await Promise.resolve()
  })
  expect(screen.getByRole('region', { name: 'Performance' })).toHaveAttribute(
    'data-mode',
    'goals',
  )
  expect(screen.getByLabelText('Performance goal')).toHaveValue('recall')
  expect(screen.getByLabelText('Target Recall (%)')).toHaveValue(80)
  expect(screen.getByLabelText('Target Recall (%)')).toHaveFocus()
  await userEvent.selectOptions(
    screen.getByLabelText('Performance goal'),
    'Target First-attempt Success',
  )
  expect(screen.getByRole('spinbutton')).toHaveValue(90)
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
})

it.each([
  ['as of', { ...timeFrame, asOf: '2026-08-14T13:00:00.123Z' }],
  ['range', { ...timeFrame, requestedDays: 30 }],
  ['timezone', { ...timeFrame, timeZone: 'America/New_York' }],
  [
    'grouping',
    { ...timeFrame, grouping: { unit: 'week' as const, step: 1 as const } },
  ],
])(
  'resets hidden Performance interval pages after a %s change and preserves equivalent rerenders',
  async (_context, refreshed) => {
    const source = view()
    const { rerender } = render(
      <PerformanceCard view={source} timeFrame={timeFrame} />,
    )
    await details('intervals')
    await userEvent.click(
      screen.getByRole('button', { name: 'Next Performance rows' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Performance Overview' }),
    )
    rerender(<PerformanceCard view={source} timeFrame={{ ...timeFrame }} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Performance Details' }),
    )
    expect(
      screen.getByRole('button', { name: 'Previous Performance rows' }),
    ).toBeEnabled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Performance Overview' }),
    )
    rerender(<PerformanceCard view={source} timeFrame={refreshed} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Performance Details' }),
    )
    expect(
      screen.getByRole('button', { name: 'Previous Performance rows' }),
    ).toBeDisabled()
  },
)
