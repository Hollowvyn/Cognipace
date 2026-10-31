import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
import { MemorySignalsCard } from './memory-signals-card'
const summary = createSerializedAnalyticsSummary()
const view = {
  totalQualifying: 31,
  rows: Array.from({ length: 25 }, (_, i) => ({
    rank: i + 1,
    slug: `problem-${i + 1}`,
    title:
      i === 0
        ? 'A complete long problem title retaining every word through narrow card layout'
        : 'Problem ' + (i + 1),
    reasons: [
      {
        kind: 'below-recall' as const,
        label: 'Estimated recall 53% is below FSRS target 90%',
      },
      { kind: 'overdue' as const, label: 'Overdue by 3 local days' },
      {
        kind: 'low-durability' as const,
        label: 'Modeled total durability below 7 days',
      },
    ],
  })),
}
function card(context = summary.timeFrame) {
  return <MemorySignalsCard view={view} reportContext={context} />
}
describe('MemorySignalsCard', () => {
  it('pages all returned canonical links and full ordered flags while distinguishing qualifying count', async () => {
    render(card())
    expect(
      screen.getByText(/31 qualifying; first 25 by severity/),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Chart' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: 'Memory Signals problems' }).children
        .length,
    ).toBeLessThanOrEqual(3)
    const link = screen.getByRole('link', { name: view.rows[0]!.title })
    expect(link).toHaveAttribute(
      'href',
      'https://leetcode.com/problems/problem-1/',
    )
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('target', '_blank')
    for (const reason of view.rows[0]!.reasons)
      expect(
        screen.getByRole('list', { name: 'Memory Signals problems' }),
      ).toHaveTextContent(reason.label)
    while (
      !screen
        .getByRole('button', { name: 'Next Memory Signals problems' })
        .hasAttribute('disabled')
    )
      await userEvent.click(
        screen.getByRole('button', { name: 'Next Memory Signals problems' }),
      )
    expect(screen.getByRole('link', { name: 'Problem 25' })).toBeVisible()
    expect(
      screen.getByRole('list', { name: 'Memory Signals problems' }),
    ).toHaveTextContent('25')
  })
  it('preserves every typed flag and current scope in Details without historical selection', async () => {
    render(card())
    await userEvent.click(
      screen.getByRole('button', { name: 'Memory Signals Details' }),
    )
    expect(
      screen
        .getByRole('list', { name: 'Memory Signals exact problems' })
        .querySelectorAll('[data-signal-kind]'),
    ).toHaveLength(3)
    await userEvent.selectOptions(
      screen.getByLabelText('Memory Signals detail section'),
      'scope',
    )
    expect(
      screen.getByText(summary.timeFrame.asOf, { exact: false }),
    ).toBeVisible()
    expect(
      screen.getByText(summary.timeFrame.timeZone, { exact: false }),
    ).toBeVisible()
    expect(screen.queryByText(/Selected report range/)).not.toBeInTheDocument()
  })
  it('retains equivalent pages but resets hidden current-report changes', async () => {
    const { rerender } = render(card())
    await userEvent.click(
      screen.getByRole('button', { name: 'Next Memory Signals problems' }),
    )
    rerender(card({ ...summary.timeFrame }))
    expect(
      screen.getByRole('button', { name: 'Previous Memory Signals problems' }),
    ).toBeEnabled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Memory Signals Details' }),
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Memory Signals detail section'),
      'method',
    )
    rerender(card({ ...summary.timeFrame, asOf: '2026-10-10T17:00:00Z' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Memory Signals Overview' }),
    )
    expect(
      screen.getByRole('button', { name: 'Previous Memory Signals problems' }),
    ).toBeDisabled()
  })
  it.each([
    ['scope', 'as of'],
    ['scope', 'timezone'],
    ['scope', 'row identity'],
    ['method', 'as of'],
    ['method', 'timezone'],
    ['method', 'row identity'],
  ] as const)(
    'resets hidden %s copy pages after a changed %s while retaining equivalent reports',
    async (section, change) => {
      const { rerender } = render(card())
      await userEvent.click(
        screen.getByRole('button', { name: 'Memory Signals Details' }),
      )
      await userEvent.selectOptions(
        screen.getByLabelText('Memory Signals detail section'),
        section,
      )
      await userEvent.click(
        screen.getByRole('button', {
          name: `Next Memory Signals ${section} pages`,
        }),
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Memory Signals Overview' }),
      )
      rerender(
        <MemorySignalsCard
          view={{
            ...view,
            rows: view.rows.map((row) => ({
              ...row,
              reasons: row.reasons.map((reason) => ({ ...reason })),
            })),
          }}
          reportContext={{ ...summary.timeFrame }}
        />,
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Memory Signals Details' }),
      )
      expect(
        screen.getByRole('button', {
          name: `Previous Memory Signals ${section} pages`,
        }),
      ).toBeEnabled()
      await userEvent.click(
        screen.getByRole('button', { name: 'Memory Signals Overview' }),
      )
      const changedContext =
        change === 'as of'
          ? { ...summary.timeFrame, asOf: '2026-10-10T18:00:00Z' }
          : change === 'timezone'
            ? { ...summary.timeFrame, timeZone: 'America/New_York' }
            : summary.timeFrame
      const changedView =
        change === 'row identity'
          ? {
              ...view,
              rows: view.rows.map((row, index) =>
                index === 0 ? { ...row, slug: 'replacement-problem' } : row,
              ),
            }
          : view
      rerender(
        <MemorySignalsCard view={changedView} reportContext={changedContext} />,
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Memory Signals Details' }),
      )
      expect(
        screen.getByRole('button', {
          name: `Previous Memory Signals ${section} pages`,
        }),
      ).toBeDisabled()
      expect(
        screen.getByRole('button', {
          name: `Next Memory Signals ${section} pages`,
        }),
      ).toBeEnabled()
      if (section === 'scope')
        expect(
          screen.getByText(changedContext.asOf, { exact: false }),
        ).toBeVisible()
      else expect(screen.getByText(/Below recall means/)).toBeVisible()
    },
  )
  it('keeps empty state inside the same compact shell', () => {
    render(
      <MemorySignalsCard
        view={{ rows: [], totalQualifying: 0 }}
        reportContext={summary.timeFrame}
      />,
    )
    expect(screen.getByRole('region', { name: 'Memory signals' })).toHaveClass(
      'cp-analytics-card',
    )
    expect(screen.getByText('No current memory signals.')).toBeVisible()
  })
})
