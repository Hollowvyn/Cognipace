import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
import { MemoryStrengthCard } from './memory-strength-card'

const summary = createSerializedAnalyticsSummary()
function row(index: number, median: number | null, count = 1) {
  return {
    id: `memory-${index}`,
    bucketStart: `2026-08-${String(3 + index * 3).padStart(2, '0')}`,
    bucketEnd: `2026-08-${String(5 + index * 3).padStart(2, '0')}`,
    isPartial: false,
    medianStrengthDays: median,
    q1: 0.1,
    q3: 8,
    eligibleReviews: count,
    medianChangeDays: index ? -0.25 : null,
    provenance: 'reconstructed' as const,
    evidence:
      median === null ? ('not-measured' as const) : ('measured' as const),
  }
}
describe('MemoryStrengthCard', () => {
  it('shares the original supported-edge trim with plot, inspection and exact Details', async () => {
    render(
      <MemoryStrengthCard
        view={{
          ...summary.views.memoryStrength,
          rows: [row(0, null, 0), row(1, 0), row(2, null, 0)],
        }}
        timeFrame={summary.timeFrame}
      />,
    )
    expect(screen.getByTestId('memory-strength-marker-0')).toBeInTheDocument()
    expect(
      screen.queryByTestId('memory-strength-marker-1'),
    ).not.toBeInTheDocument()
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Inspect Memory Strength chart' }),
      { key: 'Home' },
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('08/06–08/08')
    await userEvent.click(
      screen.getByRole('button', { name: 'Memory strength Details' }),
    )
    const table = screen.getByRole('table', {
      name: 'Memory strength Intervals exact values',
    })
    expect(within(table).getAllByRole('rowheader')).toHaveLength(1)
    expect(table).toHaveTextContent('08/06–08/08')
    expect(table).not.toHaveTextContent('08/03–08/05')
    expect(table).not.toHaveTextContent('08/09–08/11')
    expect(
      screen.getByRole('button', { name: 'Next Memory strength rows' }),
    ).toBeDisabled()
  })

  it('keeps all-unavailable Memory intervals empty after the same supported-edge trim', async () => {
    render(
      <MemoryStrengthCard
        view={{
          ...summary.views.memoryStrength,
          rows: [row(0, null, 0), row(1, null, 0)],
        }}
        timeFrame={summary.timeFrame}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Memory strength Details' }),
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('No exact values available.')).toBeVisible()
    expect(
      screen.getByRole('navigation', { name: 'Memory strength rows' }),
    ).toHaveTextContent('0–0 of 0')
  })
  it('uses concise headline precision while keeping exact medians in native inspection', () => {
    render(
      <MemoryStrengthCard
        view={{ ...summary.views.memoryStrength, rows: [row(0, 5.30105)] }}
        timeFrame={summary.timeFrame}
      />,
    )
    expect(screen.getByTestId('memory-latest-value')).toHaveTextContent(
      '5.3 days',
    )
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Inspect Memory Strength chart' }),
      { key: 'End' },
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Median strength: 5.30105 days',
    )
  })

  it.each([
    [0.000012345, '1.23E-5 days'],
    [123456789, '1.23E8 days'],
  ])(
    'keeps a finite %s day headline compact and nonzero',
    (median, display) => {
      render(
        <MemoryStrengthCard
          view={{ ...summary.views.memoryStrength, rows: [row(0, median)] }}
          timeFrame={summary.timeFrame}
        />,
      )
      expect(screen.getByTestId('memory-latest-value')).toHaveTextContent(
        display,
      )
    },
  )
  it('renders zero and subday medians, preserves internal continuity gaps and gates quartiles by actual evidence', () => {
    render(
      <MemoryStrengthCard
        view={{
          ...summary.views.memoryStrength,
          rows: [row(0, 0), row(1, null, 0), row(2, 0.25, 3), row(3, 2, 4)],
        }}
        timeFrame={summary.timeFrame}
      />,
    )
    expect(screen.getByTestId('memory-strength-marker-0')).toBeInTheDocument()
    expect(screen.getByTestId('memory-strength-bridge-0-2')).toBeInTheDocument()
    expect(
      screen.queryByTestId('memory-strength-whisker-memory-0'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('memory-strength-whisker-memory-2'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('memory-strength-whisker-memory-3'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('memory-latest-value')).toHaveTextContent(
      '2 days',
    )
    expect(
      screen.queryByRole('button', { name: /Target/ }),
    ).not.toBeInTheDocument()
  })
  it('keeps a singleton measurable and every original exact field plus raw unsupported quartiles reachable', async () => {
    render(
      <MemoryStrengthCard
        view={{ ...summary.views.memoryStrength, rows: [row(0, 0)] }}
        timeFrame={summary.timeFrame}
        readiness={summary.historicalReadiness.stability}
      />,
    )
    expect(screen.getByTestId('memory-latest-value')).toHaveTextContent(
      '0 days',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Memory strength Details' }),
    )
    const fields = new Set<string>()
    while (true) {
      within(
        screen.getByRole('table', {
          name: 'Memory strength Intervals exact values',
        }),
      )
        .getAllByRole('columnheader')
        .forEach((node) => fields.add(node.textContent ?? ''))
      const next = screen.getByRole('button', {
        name: 'Next Memory strength Intervals exact values fields',
      })
      if (next.hasAttribute('disabled')) break
      await userEvent.click(next)
    }
    for (const field of [
      'Bucket',
      'Median strength',
      'Middle 50%',
      'Eligible reviews',
      'Observed reviews',
      'Median change',
      'Model provenance',
      'Evidence',
      'Period context',
      'Raw Q1',
      'Raw Q3',
      'Range support',
      'ID',
      'Start',
      'End',
      'Partial',
      'Report as of',
      'Timezone',
    ])
      expect(fields).toContain(field)
  })

  it('keeps unsupported independent quartiles and signed changes exact without inventing a range', async () => {
    render(
      <MemoryStrengthCard
        view={{
          ...summary.views.memoryStrength,
          rows: [{ ...row(0, 0.25, 4), q3: null, medianChangeDays: -0.125 }],
        }}
        timeFrame={summary.timeFrame}
      />,
    )
    expect(
      screen.queryByTestId('memory-strength-whisker-memory-0'),
    ).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Memory strength Details' }),
    )
    const values = new Map<string, string>()
    while (true) {
      const table = screen.getByRole('table', {
        name: 'Memory strength Intervals exact values',
      })
      const headers = within(table).getAllByRole('columnheader').slice(1)
      const cells = within(table).getAllByRole('cell')
      headers.forEach((header, index) =>
        values.set(header.textContent ?? '', cells[index]?.textContent ?? ''),
      )
      const next = screen.getByRole('button', {
        name: 'Next Memory strength Intervals exact values fields',
      })
      if (next.hasAttribute('disabled')) break
      await userEvent.click(next)
    }
    expect(values.get('Middle 50%')).toBe('Unavailable')
    expect(values.get('Raw Q1')).toBe('0.1 days')
    expect(values.get('Raw Q3')).toBe('Unavailable')
    expect(values.get('Signed median change days')).toBe('-0.125')
    expect(values.get('Range support')).toBe(
      'Finite median, Q1 and Q3 required',
    )
  })

  it('retains empty explanations and complete readiness evidence', async () => {
    const readiness = {
      ...summary.historicalReadiness.stability,
      failingReasons: ['no-evidence' as const, 'insufficient-span' as const],
    }
    render(
      <MemoryStrengthCard
        view={{ ...summary.views.memoryStrength, rows: [] }}
        timeFrame={summary.timeFrame}
        readiness={readiness}
      />,
    )
    expect(screen.getByTestId('memory-latest-value')).toHaveTextContent(
      'Unavailable',
    )
    expect(
      screen.getByText(
        'No valid post-review FSRS stability is available in this period.',
      ),
    ).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Memory strength Details' }),
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Memory strength detail section'),
      'evidence',
    )
    const values = new Map<string, string>()
    while (true) {
      const table = screen.getByRole('table', {
        name: 'Memory strength Evidence exact values',
      })
      within(table)
        .getAllByRole('row')
        .slice(1)
        .forEach((row) =>
          values.set(
            within(row).getByRole('rowheader').textContent ?? '',
            within(row).getByRole('cell').textContent ?? '',
          ),
        )
      const next = screen.getByRole('button', {
        name: 'Next Memory strength rows',
      })
      if (next.hasAttribute('disabled')) break
      await userEvent.click(next)
    }
    expect(values.size).toBe(Object.keys(readiness).length)
    expect(values.get('failingReasons')).toContain('no-evidence')
    expect(values.get('failingReasons')).toContain('insufficient-span')
    await userEvent.selectOptions(
      screen.getByLabelText('Memory strength detail section'),
      'method',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Next Memory strength method pages' }),
    )
    expect(screen.getByText(/A singleton is measurable/)).toBeVisible()
  })

  it.each([
    ['as of', { ...summary.timeFrame, asOf: '2026-08-31T15:00:00Z' }],
    ['range', { ...summary.timeFrame, requestedDays: 90 }],
    ['timezone', { ...summary.timeFrame, timeZone: 'America/New_York' }],
    [
      'grouping',
      {
        ...summary.timeFrame,
        grouping: { unit: 'week' as const, step: 1 as const },
      },
    ],
  ])(
    'resets hidden pages after a %s change and preserves equivalent reports',
    async (_key, changed) => {
      const view = {
        ...summary.views.memoryStrength,
        rows: [row(0, 0), row(1, 0.5), row(2, 1)],
      }
      const { rerender } = render(
        <MemoryStrengthCard view={view} timeFrame={summary.timeFrame} />,
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Memory strength Details' }),
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Next Memory strength rows' }),
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Memory strength Overview' }),
      )
      rerender(
        <MemoryStrengthCard view={view} timeFrame={{ ...summary.timeFrame }} />,
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Memory strength Details' }),
      )
      expect(
        screen.getByRole('button', { name: 'Previous Memory strength rows' }),
      ).toBeEnabled()
      await userEvent.click(
        screen.getByRole('button', { name: 'Memory strength Overview' }),
      )
      rerender(<MemoryStrengthCard view={view} timeFrame={changed} />)
      await userEvent.click(
        screen.getByRole('button', { name: 'Memory strength Details' }),
      )
      expect(
        screen.getByRole('button', { name: 'Previous Memory strength rows' }),
      ).toBeDisabled()
    },
  )
})
