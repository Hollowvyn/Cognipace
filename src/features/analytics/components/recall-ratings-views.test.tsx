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
  return {
    id: `recall-${index}`,
    bucketStart: `2026-09-${String(9 + index * 3).padStart(2, '0')}`,
    bucketEnd: `2026-09-${String(11 + index * 3).padStart(2, '0')}`,
    isPartial: false,
    recalledCount: 5,
    pairedReviews: 6,
    observedRecall: 5 / 6,
    fsrsEstimate: 0.9,
    difference: -0.0664,
    provenance: 'reconstructed',
    evidence: 'measured',
    ...overrides,
  }
}

const missing: Partial<RecallRow> = {
  observedRecall: null,
  fsrsEstimate: null,
  difference: null,
  pairedReviews: 0,
  recalledCount: 0,
  evidence: 'not-measured',
}

function recallView(rows: RecallRow[]): AnalyticsViews['observedRecallVsFsrs'] {
  return {
    rows,
    scale: { domain: [0, 1], ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    targetRecall: 0.87,
  }
}

const inspectName = 'Inspect Recall vs FSRS Estimate chart'

const tooltip = () => screen.getByRole('tooltip')
const inspect = () => screen.getByRole('button', { name: inspectName })

describe('Recall historical view composition', () => {
  it('wires measured shapes, missing bridges, middle inspection, exact values and Table pagination', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 8 }, (_, index) =>
      recallRow(
        index,
        index === 4
          ? missing
          : index === 7
            ? {
                bucketStart: '2026-09-30',
                bucketEnd: '2026-10-02',
                isPartial: true,
              }
            : {},
      ),
    )
    const { rerender } = render(
      <ObservedRecallVsFsrsView
        timeFrame={timeFrame}
        view={recallView(rows)}
      />,
    )
    const first = screen
      .getByTestId('observed-recall-marker-0')
      .querySelector('circle')!
    const axis = screen
      .getByTestId('historical-chart-grid')
      .querySelector('line')!
    expect(
      Number(first.getAttribute('cx')) - Number(axis.getAttribute('x1')),
    ).toBeCloseTo(12)
    expect(screen.getByTestId('observed-recall-marker-3')).toHaveAttribute(
      'data-marker-shape',
      'circle',
    )
    expect(screen.getByTestId('fsrs-estimate-marker-3')).toHaveAttribute(
      'data-marker-shape',
      'diamond',
    )
    expect(screen.getByTestId('fsrs-estimate-markers')).toHaveAttribute(
      'stroke-dasharray',
      '4 4',
    )
    expect(screen.getByTestId('observed-recall-bridge-3-5')).toHaveAttribute(
      'stroke-dasharray',
      '9 7',
    )
    expect(screen.getByTestId('observed-recall-bridge-3-5')).toHaveAttribute(
      'stroke-width',
      '1.5',
    )
    for (const series of ['observed-recall', 'fsrs-estimate']) {
      expect(screen.queryByTestId(`${series}-marker-4`)).not.toBeInTheDocument()
    }
    expect(screen.getByText('Target Recall 87%').closest('svg')).toBeNull()
    fireEvent.focus(inspect())
    for (const value of [
      '09/18–09/20',
      '5 recalled / 6 paired reviews',
      '83.3%',
      '−6.6 pp',
      'Target Recall87%',
      'Reconstructed',
    ])
      expect(tooltip()).toHaveTextContent(value)
    fireEvent.keyDown(inspect(), {
      key: 'ArrowRight',
    })
    expect(tooltip()).toHaveTextContent(
      'No usable paired evidence in this bucket',
    )
    expect(tooltip()).toHaveTextContent('Not measured')
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(7)
    const row = screen
      .getByRole('rowheader', { name: '09/18–09/20' })
      .closest('tr')!
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
        .slice(0, 7),
    ).toEqual([
      '5',
      '6',
      '83.3%',
      '90%',
      '−6.6 pp',
      'Reconstructed',
      'Measured',
    ])
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(1)
    expect(
      screen.getByRole('rowheader', { name: '09/30–10/02 (in progress)' }),
    ).toBeVisible()
    rerender(
      <ObservedRecallVsFsrsView
        timeFrame={timeFrame}
        view={recallView(rows.slice(1))}
      />,
    )
    expect(screen.getAllByRole('rowheader')).toHaveLength(7)
    expect(screen.getByRole('rowheader', { name: '09/12–09/14' })).toBeVisible()
  })

  it('hides series and tooltip rates together while preserving the goal, fitted scale and trimmed rows', async () => {
    const user = userEvent.setup()
    const rows = [
      recallRow(0, missing),
      recallRow(1),
      recallRow(2, missing),
      recallRow(3, { observedRecall: 0, recalledCount: 0 }),
      recallRow(4, missing),
    ]
    render(
      <ObservedRecallVsFsrsView
        timeFrame={timeFrame}
        view={recallView(rows)}
      />,
    )
    const chart = screen.getByRole('img', {
      name: 'Recall vs FSRS Estimate chart',
    })
    const description = document.getElementById(
      chart.getAttribute('aria-describedby')!,
    )
    const bridge = screen.getByTestId('fsrs-estimate-bridge-0-2')
    const path = bridge.getAttribute('d')
    expect(screen.getByTestId('observed-recall-marker-2')).toBeVisible()
    fireEvent.keyDown(inspect(), {
      key: 'End',
    })
    expect(tooltip()).toHaveTextContent('Observed recall0%')
    await user.click(screen.getByRole('button', { name: 'Observed recall' }))
    expect(
      screen.queryByTestId('observed-recall-markers'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Observed recall' }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('fsrs-estimate-bridge-0-2')).toHaveAttribute(
      'd',
      path,
    )
    expect(description).toHaveTextContent(
      'FSRS estimate is shown with short dashes and diamonds',
    )
    expect(description).toHaveTextContent('Scale: 0%–100%. Target Recall: 87%')
    expect(description).not.toHaveTextContent('Observed recall is shown')
    fireEvent.keyDown(inspect(), {
      key: 'Home',
    })
    const values = tooltip()
    expect(values).toHaveTextContent('09/12–09/14')
    expect(values).toHaveTextContent('5 recalled / 6 paired reviews')
    expect(
      within(values).queryByText('Observed recall'),
    ).not.toBeInTheDocument()
    expect(
      within(values).queryByText('Observed − estimate'),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'FSRS estimate' }))
    expect(
      screen.queryByTestId('fsrs-estimate-markers'),
    ).not.toBeInTheDocument()
    expect(description).toHaveTextContent('Both data series are hidden')
    expect(
      screen.queryByText('Long dashes: missing buckets'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('recall-target')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(
      screen.getAllByRole('rowheader').map((row) => row.textContent),
    ).toEqual(['09/12–09/14', '09/15–09/17', '09/18–09/20'])
  })

  it('retains a lone FSRS-only period between empty edges without inventing observed recall', () => {
    const rows = [
      recallRow(0, missing),
      recallRow(1, {
        observedRecall: null,
        recalledCount: 0,
        difference: null,
      }),
      recallRow(2, missing),
    ]
    render(<ObservedRecallVsFsrsView view={recallView(rows)} />)
    expect(screen.getByTestId('fsrs-estimate-marker-0')).toBeInTheDocument()
    expect(
      screen.queryByTestId('observed-recall-marker-0'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('Not enough data for a trend yet.'),
    ).toBeInTheDocument()
  })
})
