import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  MemoryStrengthView,
  ObservedRecallVsFsrsView,
  TopicPerformanceView,
} from './historical-views'

describe('Phase 2 historical analytics views', () => {
  it('renders View 1 measured markers, a non-color line distinction, and a semantic legend', () => {
    render(
      <ObservedRecallVsFsrsView
        view={{
          rows: [
            {
              id: '2026-08-01',
              bucketStart: '2026-08-01',
              bucketEnd: '2026-08-01',
              isPartial: false,
              recalledCount: 3,
              pairedReviews: 4,
              observedRecall: 0.75,
              fsrsEstimate: 0.8,
              difference: -0.05,
              provenance: 'reconstructed',
              evidence: 'measured',
            },
          ],
          scale: { domain: [0.6, 1], ticks: [0.6, 0.8, 1] },
          targetRecall: 0.9,
        }}
      />,
    )

    expect(
      screen.getByRole('img', {
        name: 'Recall vs FSRS Estimate chart',
      }),
    ).toHaveAccessibleDescription(
      /solid line with circles.*short dashes and diamonds/,
    )
    expect(
      screen.getByRole('button', {
        name: 'Inspect Recall vs FSRS Estimate chart',
      }),
    ).toBeVisible()
    expect(screen.getByRole('list')).toHaveTextContent('Observed recall')
    expect(screen.getByRole('list')).toHaveTextContent('FSRS estimate')
    expect(screen.getByRole('list').closest('svg')).toBeNull()
  })

  it('keeps shared time buckets aligned across multiple line series', () => {
    render(
      <ObservedRecallVsFsrsView
        view={{
          rows: [
            {
              id: '2026-08-01',
              bucketStart: '2026-08-01',
              bucketEnd: '2026-08-02',
              isPartial: false,
              recalledCount: 3,
              pairedReviews: 4,
              observedRecall: 0.75,
              fsrsEstimate: 0.8,
              difference: -0.05,
              provenance: 'reconstructed',
              evidence: 'measured',
            },
            {
              id: '2026-08-03',
              bucketStart: '2026-08-03',
              bucketEnd: '2026-08-04',
              isPartial: false,
              recalledCount: 4,
              pairedReviews: 4,
              observedRecall: 1,
              fsrsEstimate: 0.9,
              difference: 0.1,
              provenance: 'reconstructed',
              evidence: 'measured',
            },
          ],
          scale: { domain: [0.6, 1], ticks: [0.6, 0.8, 1] },
          targetRecall: 0.9,
        }}
      />,
    )

    const xAxisLabels = Array.from(
      document.querySelectorAll('.recharts-xAxis-tick-labels text'),
    ).map((node) => node.textContent)

    expect(xAxisLabels).toEqual(['08/02', '08/03', '08/04'])
  })

  it('describes supported Memory Strength quartiles as whiskers', () => {
    render(
      <MemoryStrengthView
        view={{
          rows: [
            {
              id: '2026-08-01',
              bucketStart: '2026-08-01',
              bucketEnd: '2026-08-01',
              isPartial: false,
              medianStrengthDays: 6,
              q1: 4,
              q3: 8,
              eligibleReviews: 4,
              medianChangeDays: 2,
              provenance: 'reconstructed',
              evidence: 'measured',
            },
          ],
          scale: { domain: [0, 10], ticks: [0, 5, 10] },
        }}
      />,
    )

    expect(
      screen.getByRole('img', { name: 'Memory Strength chart' }),
    ).toHaveAccessibleDescription(/supported Q1–Q3 ranges/)
    expect(screen.getByTestId('memory-strength-whiskers')).toBeInTheDocument()
    expect(
      screen.queryByTestId('memory-strength-iqr-band'),
    ).not.toBeInTheDocument()
  })

  it('renders Topic Performance as an unpaginated five-row-or-fewer ranking', async () => {
    const user = userEvent.setup()
    render(
      <TopicPerformanceView
        selectedPeriod="30-day selected period"
        view={{
          rows: [
            {
              id: 'graphs',
              topic: 'Graphs',
              reviewSuccess: 0.6,
              goodEasy: 750,
              validRatings: 1000,
              distinctProblems: 300,
              evidence: 'Measured',
            },
          ],
          strongerQualifyingTopics: 1000,
          lowEvidenceTopics: [
            { topic: 'Trees', validRatings: 800, distinctProblems: 200 },
          ],
          additionalLowEvidenceTopics: 0,
        }}
      />,
    )

    const topicChartContainer = screen.getByRole('img', {
      name: 'Topic Performance chart',
    })
    expect(topicChartContainer).toHaveAttribute(
      'aria-roledescription',
      'ranked horizontal bar chart',
    )
    const topicChart = screen.getByTestId('topic-performance-keyboard-chart')
    const topicChartSvg = topicChart.closest('svg')
    expect(topicChartSvg).toHaveAttribute('tabindex', '0')
    expect(
      within(topicChart).getByText(
        'Ranked Topic Review Success for the selected period. Scale: 0%–100%. 1 of 1,001 qualifying topics shown.',
      ),
    ).toBeInTheDocument()
    expect(within(topicChart).getByText('60%')).toBeVisible()
    expect(
      screen.getByText(/1,000 stronger qualifying topics omitted/),
    ).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getByRole('rowheader', { name: 'Graphs' })).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Distinct problems' }),
    ).toBeVisible()
    expect(screen.getByText('1,000')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Next' }),
    ).not.toBeInTheDocument()
  })
})
