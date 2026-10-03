import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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

  it('shows every rising column, shares the goal, and inspects unrounded status through keyboard and Table', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 7 }, (_, index) => ({
      id: `topic-${index}`,
      topic:
        index === 1 ? 'A very long canonical topic name' : `Topic ${index}`,
      reviewSuccess: index === 0 ? 0 : index === 1 ? 179 / 200 : 1,
      goodEasy: index === 0 ? 0 : index === 1 ? 179 : 200,
      validRatings: 200,
      distinctProblems: 3,
      evidence: 'Measured' as const,
    }))
    const { rerender } = render(
      <TopicPerformanceView
        selectedPeriod="30-day selected period"
        targetReviewSuccess={0.9}
        targetEditor={<button>Shared goal editor</button>}
        view={{
          rows,
          strongerQualifyingTopics: 0,
          lowEvidenceTopics: [],
          additionalLowEvidenceTopics: 0,
        }}
      />,
    )
    expect(
      screen.getByRole('img', { name: 'Topic Performance chart' }),
    ).toHaveAttribute('aria-roledescription', 'ranked vertical bar chart')
    expect(screen.getAllByTestId(/^topic-column-topic-/)).toHaveLength(7)
    expect(screen.getByTestId('topic-column-topic-0')).toHaveAttribute(
      'data-value',
      '0',
    )
    expect(screen.getByText('Scroll to see all topics')).toBeVisible()
    expect(screen.getByTestId('topic-plot-scroller')).not.toContainElement(
      screen.getByRole('button', { name: 'Shared goal editor' }),
    )
    const first = screen.getByRole('button', { name: 'Inspect Topic 0' })
    expect(
      screen.getByRole('img', { name: 'Topic Performance chart' }),
    ).not.toContainElement(first)
    fireEvent.focus(first)
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Review Success: 0.0%',
    )
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    const active = screen.getByRole('button', {
      name: 'Inspect A very long canonical topic name',
    })
    expect(active).toHaveFocus()
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Review Success: 89.5%',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Good + Easy: 179 / 200 valid ratings',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Below target')
    const last = screen.getByRole('button', { name: 'Inspect Topic 6' })
    const reveal = vi.fn()
    last.scrollIntoView = reveal
    const height = screen
      .getByTestId('topic-column-topic-1')
      .querySelector('rect')!
      .getAttribute('height')
    rerender(
      <TopicPerformanceView
        selectedPeriod="30-day selected period"
        targetReviewSuccess={0.8}
        targetEditor={<button>Shared goal editor</button>}
        view={{
          rows,
          strongerQualifyingTopics: 0,
          lowEvidenceTopics: [],
          additionalLowEvidenceTopics: 0,
        }}
      />,
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Meets target')
    expect(
      screen.getByTestId('topic-column-topic-1').querySelector('rect'),
    ).toHaveAttribute('height', height!)
    fireEvent.keyDown(active, { key: 'End' })
    expect(reveal).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Topic 6')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Meets target')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Inspect Topic 6' }), {
      key: 'Escape',
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(last).toHaveFocus()
    expect(last).toHaveAttribute('tabindex', '0')
    expect(first).toHaveAttribute('tabindex', '-1')
    await user.tab({ shift: true })
    expect(screen.getByRole('tab', { name: 'Chart' })).toHaveFocus()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.pointerMove(first)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Topic 0')
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(7)
    expect(
      screen
        .getByRole('rowheader', { name: 'A very long canonical topic name' })
        .closest('tr'),
    ).toHaveTextContent('89.5%')
    expect(
      screen.queryByRole('button', { name: 'Next' }),
    ).not.toBeInTheDocument()
    rerender(
      <TopicPerformanceView
        selectedPeriod="14-day selected period"
        targetReviewSuccess={0}
        targetEditor={<button>Shared goal editor</button>}
        view={{
          rows: [],
          strongerQualifyingTopics: 0,
          lowEvidenceTopics: [
            { topic: 'Sparse', validRatings: 1, distinctProblems: 1 },
          ],
          additionalLowEvidenceTopics: 2,
        }}
      />,
    )
    await user.click(screen.getByRole('tab', { name: 'Chart' }))
    expect(
      screen.getByRole('button', { name: 'Shared goal editor' }),
    ).toBeVisible()
    expect(screen.getByText(/No topic has at least 10/)).toBeVisible()
    expect(
      screen.queryByText('Scroll to see all topics'),
    ).not.toBeInTheDocument()
    await user.click(screen.getByText('Calculation details'))
    expect(screen.getByText(/Sparse.*1 valid ratings/)).toBeVisible()
  })
  it.each([0, 1])(
    'preserves a measured %s boundary, its goal and unclipped label without overflow',
    (value) => {
      render(
        <TopicPerformanceView
          selectedPeriod="14-day selected period"
          targetReviewSuccess={value}
          view={{
            rows: [
              {
                id: 'boundary',
                topic: 'Boundary',
                reviewSuccess: value,
                goodEasy: value * 10,
                validRatings: 10,
                distinctProblems: 3,
                evidence: 'Measured',
              },
            ],
            strongerQualifyingTopics: 0,
            lowEvidenceTopics: [],
            additionalLowEvidenceTopics: 0,
          }}
        />,
      )
      const column = screen.getByTestId('topic-column-boundary')
      expect(column).toHaveAttribute('data-status', 'Meets target')
      expect(column).toHaveTextContent(`${value * 100}%`)
      expect(
        screen.queryByText('Scroll to see all topics'),
      ).not.toBeInTheDocument()
      const mark = column.querySelector(value ? 'rect' : 'line')!
      const label = column.querySelector('text')!
      expect(Number(label.getAttribute('y'))).toBeGreaterThanOrEqual(0)
      expect(Number(label.getAttribute('y'))).toBeLessThan(
        Number(mark.getAttribute(value ? 'y' : 'y1')),
      )
      expect(screen.getByTestId('topic-target').getAttribute('y1')).toBe(
        mark.getAttribute(value ? 'y' : 'y1'),
      )
      fireEvent.pointerDown(
        screen.getByRole('button', { name: 'Inspect Boundary' }),
      )
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        `Review Success: ${(value * 100).toFixed(1)}%`,
      )
      const touchLeave = new MouseEvent('pointerout', { bubbles: true })
      Object.defineProperty(touchLeave, 'pointerType', { value: 'touch' })
      fireEvent(
        screen.getByRole('button', { name: 'Inspect Boundary' }),
        touchLeave,
      )
      expect(screen.getByRole('tooltip')).toBeVisible()
      fireEvent.pointerLeave(
        screen.getByRole('button', { name: 'Inspect Boundary' }),
      )
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    },
  )
})
