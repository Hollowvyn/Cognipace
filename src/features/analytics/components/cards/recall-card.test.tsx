import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
import { buildAnalyticsHistoryTimeFrame } from '../../domain/analytics-history-frame'
import { RecallCard } from './recall-card'
import type { AnalyticsViews } from '../../api/analytics-contracts'

const targets = {
  targetRecall: 0.87,
  targetReviewSuccess: 0.9,
  targetFirstAttemptSuccess: 0.9,
  targetFirstAttemptGoodEasy: 0.9,
}
const frame = buildAnalyticsHistoryTimeFrame({
  selection: 'all',
  asOf: new Date('2026-10-05T12:00:00Z'),
  timeZone: 'UTC',
  history: [{ reviewedAt: new Date('2026-09-09T12:00:00Z') }],
})
function view(): AnalyticsViews['observedRecallVsFsrs'] {
  const base = createSerializedAnalyticsSummary().views.observedRecallVsFsrs
  return {
    ...base,
    timeFrame: frame,
    rows: frame.buckets.map((bucket, index) => {
      const pairs = index === 0 ? 4 : 6
      const recalled = index < 4 ? pairs - 1 : pairs
      return {
        id: bucket.key,
        bucketStart: bucket.startKey,
        bucketEnd: bucket.endKey,
        isPartial: bucket.isPartial,
        pairedReviews: pairs,
        recalledCount: recalled,
        observedRecall: recalled / pairs,
        fsrsEstimate: 0.8876923076923077,
        difference: recalled / pairs - 0.8876923076923077,
        provenance: 'reconstructed' as const,
        evidence: 'measured' as const,
      }
    }),
  }
}
async function section(value: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Recall Details' }))
  await userEvent.selectOptions(
    screen.getByLabelText('Recall detail section'),
    value,
  )
}
async function allFields(label: string) {
  const result = new Set<string>()
  while (true) {
    within(screen.getByRole('table', { name: label }))
      .getAllByRole('columnheader')
      .forEach((node) => result.add(node.textContent ?? ''))
    const next = screen.queryByRole('button', {
      name: `Next ${label} fields`,
    })
    if (!next || next.hasAttribute('disabled')) return result
    await userEvent.click(next)
  }
}
describe('RecallCard', () => {
  it('uses the approved primary Recall headline and secondary FSRS average for instant pairs at 100%', () => {
    const source = view()
    source.rows = [
      {
        ...source.rows[0]!,
        pairedReviews: 12,
        recalledCount: 12,
        observedRecall: 1,
        fsrsEstimate: 1,
        difference: 0,
      },
    ]
    render(<RecallCard view={source} targets={targets} />)
    expect(screen.getByTestId('recall-observed-value')).toHaveTextContent(
      '100%',
    )
    expect(screen.getByTestId('recall-estimate-value')).toHaveTextContent(
      'FSRS average 100%',
    )
    expect(
      screen.getByTestId('recall-estimate-value').closest('strong'),
    ).toBeNull()
    expect(screen.getByTestId('recall-pair-count')).toHaveTextContent('12 / 12')
    expect(
      screen
        .getByTestId('recall-observed-value')
        .closest('.cp-recall-hero')!
        .querySelectorAll('strong'),
    ).toHaveLength(1)
  })

  it('uses the effective optional paired frame consistently for visible dates and grouping', () => {
    const effective = buildAnalyticsHistoryTimeFrame({
      selection: 'all',
      asOf: new Date('2026-10-06T12:00:00Z'),
      timeZone: 'UTC',
      history: [{ reviewedAt: new Date('2026-09-12T12:00:00Z') }],
    })
    const source = view()
    source.rows = effective.buckets.map((bucket) => ({
      ...source.rows[0]!,
      id: bucket.key,
      bucketStart: bucket.startKey,
      bucketEnd: bucket.endKey,
      isPartial: bucket.isPartial,
    }))
    render(<RecallCard view={source} timeFrame={effective} targets={targets} />)
    expect(screen.getByTestId('recall-frame')).toHaveTextContent(
      'Paired 09/12–10/06 · 3-day summaries',
    )
  })
  it('visibly labels the supplied paired frame, grouping, held key and last eligible interval', () => {
    const source = view()
    source.rows[source.rows.length - 1] = {
      ...source.rows.at(-1)!,
      pairedReviews: 0,
      recalledCount: 0,
      observedRecall: null,
      fsrsEstimate: null,
      difference: null,
      evidence: 'not-measured',
    }
    render(<RecallCard view={source} targets={targets} />)
    expect(screen.getByTestId('recall-frame')).toHaveTextContent(
      'Paired 09/09–10/05 · 3-day summaries',
    )
    expect(screen.getByText('No new paired reviews')).toBeVisible()
    expect(screen.getByTestId('recall-last-update')).toHaveTextContent(
      'Updated during 09/30–10/02',
    )
  })
  it('pools supplied eligible pairs in their frame with cumulative update marks and independent toggles', async () => {
    render(<RecallCard view={view()} targets={targets} />)
    expect(screen.getByTestId('recall-observed-value')).toHaveTextContent('92%')
    expect(screen.getByTestId('recall-estimate-value')).toHaveTextContent('89%')
    expect(screen.getByTestId('recall-pair-count')).toHaveTextContent('48 / 52')
    const inspect = screen.getByRole('button', {
      name: 'Inspect Recall cumulative chart',
    })
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('52 paired')
    await userEvent.click(
      screen.getByRole('button', { name: 'Observed recall' }),
    )
    expect(screen.queryByTestId('recall-observed')).not.toBeInTheDocument()
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(
      within(screen.getByRole('tooltip')).queryByText(/Difference:/),
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'FSRS estimate' }))
    expect(screen.queryByTestId('recall-estimate')).not.toBeInTheDocument()
    expect(screen.getByTestId('recall-target')).toBeInTheDocument()
    expect(screen.getByTestId('recall-pair-count')).toHaveTextContent('48 / 52')
  })
  it('preserves raw and cumulative exact evidence and held intervals without markers', async () => {
    const source = view()
    source.rows[4] = {
      ...source.rows[4]!,
      pairedReviews: 0,
      recalledCount: 0,
      observedRecall: null,
      fsrsEstimate: null,
      difference: null,
      evidence: 'not-measured',
    }
    render(<RecallCard view={source} targets={targets} />)
    expect(
      screen.queryByTestId(`recall-observed-marker-${source.rows[4].id}`),
    ).not.toBeInTheDocument()
    expect(
      screen.getAllByTestId(/recall-observed-held-/).length,
    ).toBeGreaterThan(0)
    await section('intervals')
    const fields = await allFields('Recall Intervals exact values')
    for (const field of [
      'Bucket',
      'Recalled',
      'Paired reviews',
      'Observed recall',
      'FSRS estimate',
      'Difference',
      'Provenance',
      'Evidence',
      'Period context',
      'Cumulative pairs',
      'Cumulative recalled',
      'Cumulative estimate sum',
      'State',
      'Last update',
      'ID',
      'Start',
      'End',
      'Partial',
      'Report as of',
      'Timezone',
      'Target Recall',
    ])
      expect(fields).toContain(field)
  })
  it('keeps both goal controllers mounted and a late hidden save does not close the active counterpart', async () => {
    let finish!: () => void
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(<RecallCard view={view()} targets={targets} onSaveTarget={save} />)
    await userEvent.click(
      screen.getByRole('button', { name: /Target Recall 87%/ }),
    )
    const input = screen.getByRole('spinbutton', { name: 'Target Recall (%)' })
    await userEvent.clear(input)
    await userEvent.type(input, '91')
    expect(screen.getByRole('alert')).toHaveTextContent(/Review Success/)
    await userEvent.clear(input)
    await userEvent.type(input, '88')
    fireEvent.submit(screen.getByRole('form', { name: 'Target Recall editor' }))
    await userEvent.click(
      screen.getByRole('button', { name: /Target Review Success 90%/ }),
    )
    const counterpart = screen.getByRole('spinbutton', {
      name: 'Target Review Success (%)',
    })
    await act(async () => {
      finish()
      await Promise.resolve()
    })
    expect(counterpart).toBeVisible()
    expect(counterpart).toHaveFocus()
    expect(save).toHaveBeenCalledExactlyOnceWith({ targetRecall: 0.88 })
  })
  it('resets pages while Overview hides the table, preserving an equivalent report rerender', async () => {
    const source = view()
    const { rerender } = render(<RecallCard view={source} targets={targets} />)
    await section('intervals')
    await userEvent.click(
      screen.getByRole('button', { name: 'Next Recall rows' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Recall Overview' }),
    )
    rerender(<RecallCard view={{ ...source }} targets={targets} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Recall Details' }),
    )
    expect(
      screen.getByRole('button', { name: 'Previous Recall rows' }),
    ).toBeEnabled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Recall Overview' }),
    )
    rerender(
      <RecallCard
        view={{
          ...source,
          timeFrame: { ...frame, asOf: '2026-10-05T13:00:00Z' },
        }}
        targets={targets}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Recall Details' }),
    )
    expect(
      screen.getByRole('button', { name: 'Previous Recall rows' }),
    ).toBeDisabled()
  })

  it('retains an old sparse paired window and holds the last value through report as-of without adding a sample', () => {
    const oldFrame = buildAnalyticsHistoryTimeFrame({
      selection: 'all',
      asOf: new Date('2026-10-05T12:00:00Z'),
      timeZone: 'UTC',
      history: [{ reviewedAt: new Date('2025-02-01T12:00:00Z') }],
    })
    const source = view()
    const first = source.rows[0]!
    source.timeFrame = oldFrame
    source.rows = oldFrame.buckets.map((bucket, index) => ({
      ...first,
      id: bucket.key,
      bucketStart: bucket.startKey,
      bucketEnd: bucket.endKey,
      isPartial: bucket.isPartial,
      ...(index
        ? {
            pairedReviews: 0,
            recalledCount: 0,
            observedRecall: null,
            fsrsEstimate: null,
            difference: null,
            evidence: 'not-measured' as const,
          }
        : {
            recalledCount: 0,
            observedRecall: 0,
            difference: -first.fsrsEstimate!,
          }),
    }))
    render(<RecallCard view={source} targets={targets} />)
    expect(screen.getByTestId('recall-observed-value')).toHaveTextContent('0%')
    expect(screen.getAllByTestId(/recall-observed-marker-/)).toHaveLength(1)
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Inspect Recall cumulative chart' }),
      { key: 'End' },
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('held')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'No new paired evidence',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('02/01/25')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Oct 5, 2026')
  })

  it('uses one fitting unavailable headline while retaining both labels and empty pair counts', () => {
    render(<RecallCard view={{ ...view(), rows: [] }} targets={targets} />)
    const hero = screen
      .getByTestId('recall-observed-value')
      .closest('.cp-recall-hero')!
    expect(hero.querySelectorAll('strong')).toHaveLength(1)
    expect(hero).toHaveTextContent('Observed / FSRS')
    expect(screen.getByTestId('recall-pair-count')).toHaveTextContent('0 / 0')
  })

  it('keeps global readiness and full precision pooled evidence reachable in Summary', async () => {
    const readiness = {
      ...createSerializedAnalyticsSummary().historicalReadiness.recallQuality,
      availableDays: 612,
      failingReasons: ['insufficient-span' as const, 'gap-too-long' as const],
    }
    render(<RecallCard view={view()} targets={targets} readiness={readiness} />)
    await section('summary')
    const values = new Map<string, string>()
    while (true) {
      const table = screen.getByRole('table', {
        name: 'Recall Summary exact values',
      })
      const headers = within(table).getAllByRole('columnheader').slice(1)
      const cells = within(table).getAllByRole('cell')
      headers.forEach((header, index) =>
        values.set(header.textContent ?? '', cells[index]?.textContent ?? ''),
      )
      const next = screen.getByRole('button', {
        name: 'Next Recall Summary exact values fields',
      })
      if (next.hasAttribute('disabled')) break
      await userEvent.click(next)
    }
    expect(values.get('Selected history availableDays')).toBe('612')
    expect(values.get('Selected history failingReasons')).toContain(
      'gap-too-long',
    )
    expect(Number.parseFloat(values.get('Observed recall')!)).toBe(
      (48 / 52) * 100,
    )
    expect(Number(values.get('Estimate sum'))).toBeCloseTo(46.16, 12)
  })

  it('preserves drafts, retry errors, duplicate guard and focus in empty Goals', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Try again'))
      .mockResolvedValueOnce(undefined)
    render(
      <RecallCard
        view={{ ...view(), rows: [] }}
        targets={targets}
        onSaveTarget={save}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: /Target Recall 87%/ }),
    )
    let input = screen.getByRole('spinbutton', { name: 'Target Recall (%)' })
    await userEvent.clear(input)
    await userEvent.type(input, '85')
    await userEvent.click(
      screen.getByRole('button', { name: 'Recall Overview' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Recall Details' }),
    )
    input = screen.getByRole('spinbutton', { name: 'Target Recall (%)' })
    expect(input).toHaveValue(85)
    fireEvent.submit(screen.getByRole('form', { name: 'Target Recall editor' }))
    fireEvent.submit(screen.getByRole('form', { name: 'Target Recall editor' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again')
    expect(save).toHaveBeenCalledTimes(1)
    await userEvent.type(input, '{Enter}')
    expect(save).toHaveBeenCalledTimes(2)
    expect(
      screen.getByRole('button', { name: 'Recall Overview' }),
    ).toHaveFocus()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it.each([
    ['range', { ...frame, requestedDays: 90 }],
    ['timezone', { ...frame, timeZone: 'America/New_York' }],
    [
      'grouping',
      { ...frame, grouping: { unit: 'week' as const, step: 1 as const } },
    ],
  ])(
    'resets a hidden paired interval page after a %s change',
    async (_key, changed) => {
      const source = view()
      const { rerender } = render(
        <RecallCard view={source} targets={targets} />,
      )
      await section('intervals')
      await userEvent.click(
        screen.getByRole('button', { name: 'Next Recall rows' }),
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Recall Overview' }),
      )
      rerender(
        <RecallCard view={source} targets={targets} timeFrame={changed} />,
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Recall Details' }),
      )
      expect(
        screen.getByRole('button', { name: 'Previous Recall rows' }),
      ).toBeDisabled()
    },
  )
})
