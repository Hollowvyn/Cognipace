import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
import type { AnalyticsViews } from '../../api/analytics-contracts'
import { defaultAnalyticsTargets } from '@/features/settings'
import { TopicsCard } from './topics-card'
const summary = createSerializedAnalyticsSummary()
const rows: AnalyticsViews['topicPerformance']['rows'] = Array.from(
  { length: 17 },
  (_, i) => ({
    id: `topic-${i}`,
    topic:
      i === 0
        ? 'A complete long topic name with direct overlapping membership and readable evidence'
        : `Topic ${i + 1}`,
    reviewSuccess: 0.7,
    goodEasy: 7,
    validRatings: 10,
    distinctProblems: 3,
    evidence: 'Measured',
    ratingCountsByDifficulty: {
      easy: { again: 1, hard: 2, good: 3, easy: 4 },
      medium: { again: 0, hard: 0, good: 0, easy: 0 },
      hard: { again: 0, hard: 0, good: 0, easy: 0 },
      unknown: { again: 0, hard: 0, good: 0, easy: 0 },
    },
  }),
)
const view = {
  ...summary.views.topicPerformance,
  rows,
  lowEvidenceTopics: [
    { topic: 'Insufficient topic', validRatings: 9, distinctProblems: 2 },
  ],
  additionalLowEvidenceTopics: 6,
}
function card(frame = summary.timeFrame, save?: () => Promise<unknown>) {
  return (
    <TopicsCard
      view={view}
      timeFrame={frame}
      targets={defaultAnalyticsTargets}
      onSaveTarget={save}
    />
  )
}
async function details(section = 'scores') {
  await userEvent.click(screen.getByRole('button', { name: 'Topics Details' }))
  await userEvent.selectOptions(
    screen.getByLabelText('Topics detail section'),
    section,
  )
}
async function allFields(label: string) {
  const values = new Map<string, string>()
  while (true) {
    const t = screen.getByRole('table', { name: label })
    const headers = within(t).getAllByRole('columnheader').slice(1)
    const cells = within(t).getAllByRole('cell')
    headers.forEach((h, i) =>
      values.set(h.textContent ?? '', cells[i]?.textContent ?? ''),
    )
    const next = screen.getByRole('button', { name: `Next ${label} fields` })
    if (next.hasAttribute('disabled')) break
    await userEvent.click(next)
  }
  return values
}
describe('TopicsCard', () => {
  it('pages every ordered weighted topic with complete names and no weighted percentage goal', async () => {
    render(card())
    expect(
      screen.getByRole('region', { name: 'Topic performance' }),
    ).toHaveAttribute('data-mode', 'overview')
    expect(screen.getByText(rows[0]!.topic)).toBeVisible()
    expect(
      screen.getAllByRole('button', { name: /Inspect topic/ }).length,
    ).toBeLessThanOrEqual(3)
    expect(
      screen.queryByRole('button', { name: /Target/ }),
    ).not.toBeInTheDocument()
    while (
      !screen
        .getByRole('button', { name: 'Next Topics overview' })
        .hasAttribute('disabled')
    )
      await userEvent.click(
        screen.getByRole('button', { name: 'Next Topics overview' }),
      )
    expect(screen.getByText('Topic 17')).toBeVisible()
  })
  it('retains native roving keyboard inspection and exact raw context', () => {
    render(card())
    const inspect = screen.getAllByRole('button', { name: /Inspect topic/ })[0]!
    fireEvent.keyDown(inspect, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Topic 17')
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Weighted score: 74 /100',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Next Topics inspection pages' }),
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Review Success: 70%')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Good + Easy: 7')
    fireEvent.click(
      screen.getByRole('button', { name: 'Next Topics inspection pages' }),
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      summary.timeFrame.asOf,
    )
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
  it('preserves exact weighted and original seven rating fields plus all sixteen matrix cells', async () => {
    render(card())
    await details()
    const scores = await allFields('Topics Scores exact values')
    expect(scores.get('Weighted score')).toBe('74 /100')
    expect(scores.get('Weighted points')).toBe('740')
    expect(scores.get('Weighted units')).toBe('10')
    await userEvent.selectOptions(
      screen.getByLabelText('Topics detail section'),
      'ratings',
    )
    const fields = await allFields('Topics Ratings exact values')
    expect(fields.has('ID')).toBe(false)
    for (const field of [
      'Review Success',
      'Goal status',
      'Good + Easy',
      'Valid ratings',
      'Distinct problems',
      'Evidence',
      'Target Review Success',
      'Selected period',
    ])
      expect(fields.has(field)).toBe(true)
    for (const d of ['Easy', 'Medium', 'Hard', 'Unknown'])
      for (const r of ['Again', 'Hard', 'Good', 'Easy'])
        expect(fields.has(`${d} difficulty · ${r}`)).toBe(true)
  })
  it('keeps pinned inspection pages reachable across pointer leave and footer focus', async () => {
    const user = userEvent.setup()
    render(card())
    const mark = screen.getAllByRole('button', { name: /Inspect topic/ })[0]!
    fireEvent.focus(mark)
    fireEvent.keyDown(mark, { key: 'Enter' })
    const next = screen.getByRole('button', {
      name: 'Next Topics inspection pages',
    })
    fireEvent.pointerLeave(mark)
    fireEvent.blur(mark, { relatedTarget: next })
    expect(screen.getByRole('tooltip')).toHaveTextContent(rows[0]!.topic)
    await user.click(next)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Good + Easy: 7')
    await user.click(
      screen.getByRole('button', { name: 'Next Topics inspection pages' }),
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Selected period')
    expect(
      screen.queryByRole('button', { name: 'Next Topics overview' }),
    ).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(
      screen.getByRole('button', { name: 'Next Topics overview' }),
    ).toBeEnabled()
  })
  it.each(['keyboard', 'touch'] as const)(
    'dismisses %s-pinned inspection when footer focus leaves the card',
    async (input) => {
      const user = userEvent.setup()
      render(
        <>
          {card()}
          <button>Outside card</button>
        </>,
      )
      const mark = screen.getAllByRole('button', { name: /Inspect topic/ })[0]!
      if (input === 'keyboard') {
        fireEvent.focus(mark)
        fireEvent.keyDown(mark, { key: 'Enter' })
      } else fireEvent.pointerDown(mark, { pointerType: 'touch' })
      await act(async () => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        )
      })
      fireEvent.pointerLeave(mark)
      await user.click(
        screen.getByRole('button', { name: 'Next Topics inspection pages' }),
      )
      expect(screen.getByRole('tooltip')).toHaveTextContent('Good + Easy: 7')
      await user.tab()
      expect(screen.getByRole('button', { name: 'Outside card' })).toHaveFocus()
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Next Topics overview' }),
      ).toBeEnabled()
    },
  )
  it('uses included local dates in Method and retains the exact exclusive end in Details', async () => {
    const frame = {
      ...summary.timeFrame,
      asOf: '2026-10-05T16:00:00.000Z',
      timeZone: 'America/New_York',
      periodStart: '2026-09-06T04:00:00.000Z',
      periodEnd: '2026-10-06T04:00:00.000Z',
      buckets: [
        {
          ...summary.timeFrame.buckets[0]!,
          startKey: '2026-09-06',
          endKey: '2026-10-05',
        },
      ],
    }
    render(card(frame))
    await details('method')
    for (let index = 0; index < 3; index++)
      await userEvent.click(
        screen.getByRole('button', { name: 'Next Topics method pages' }),
      )
    expect(screen.getByText(/Selected period/)).toHaveTextContent(
      'Selected period 2026-09-06 through 2026-10-05',
    )
    expect(screen.getByText(/Selected period/)).not.toHaveTextContent(
      '2026-10-06',
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Topics detail section'),
      'scores',
    )
    const values = await allFields('Topics Scores exact values')
    expect(values.get('Selected period')).toBe('2026-09-06 through 2026-10-05')
    expect(values.get('Period end (exclusive)')).toBe(
      '2026-10-06T04:00:00.000Z',
    )
    expect(values.get('Period start')).toBe('2026-09-06T04:00:00.000Z')
  })
  it('uses the report timezone for empty-bucket period fallback dates', async () => {
    const frame = {
      ...summary.timeFrame,
      asOf: '2026-10-05T03:00:00.000Z',
      timeZone: 'Asia/Tokyo',
      periodStart: '2026-09-05T15:00:00.000Z',
      periodEnd: '2026-10-05T15:00:00.000Z',
      buckets: [],
    }
    render(card(frame))
    await details('method')
    for (let index = 0; index < 3; index++)
      await userEvent.click(
        screen.getByRole('button', { name: 'Next Topics method pages' }),
      )
    expect(screen.getByText(/Selected period/)).toHaveTextContent(
      'Selected period 2026-09-06 through 2026-10-05',
    )
  })
  it('keeps independent low evidence and omitted count honest', async () => {
    render(card())
    await details('evidence')
    expect(screen.getByText(/6 additional low-evidence topics/)).toBeVisible()
    expect(
      screen.getByRole('table', { name: 'Topics Evidence exact values' }),
    ).toHaveTextContent('Insufficient topic')
  })
  it('keeps goal drafts mounted through overview and saves the original one-key target', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(card(summary.timeFrame, save))
    await details('ratings')
    await userEvent.click(
      screen.getByRole('button', { name: /Edit Review Success goal/ }),
    )
    const input = screen.getByRole('spinbutton', {
      name: 'Target Review Success (%)',
    })
    await userEvent.clear(input)
    await userEvent.type(input, '95')
    await userEvent.click(
      screen.getByRole('button', { name: 'Topics Overview' }),
    )
    await details('ratings')
    await userEvent.click(
      screen.getByRole('button', { name: /Edit Review Success goal/ }),
    )
    expect(screen.getByRole('spinbutton')).toHaveValue(95)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(save).toHaveBeenCalledWith({ targetReviewSuccess: 0.95 })
  })
  it('resets hidden pages on changed context and retains equivalent rerenders', async () => {
    const { rerender } = render(card())
    await details()
    await userEvent.click(
      screen.getByRole('button', { name: 'Next Topics rows' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Topics Overview' }),
    )
    rerender(card({ ...summary.timeFrame }))
    await details()
    expect(
      screen.getByRole('button', { name: 'Previous Topics rows' }),
    ).toBeEnabled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Topics Overview' }),
    )
    rerender(card({ ...summary.timeFrame, asOf: '2026-10-10T17:00:00Z' }))
    await details()
    expect(
      screen.getByRole('button', { name: 'Previous Topics rows' }),
    ).toBeDisabled()
  })
})
