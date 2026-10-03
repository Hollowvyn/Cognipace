import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { PracticeRatingsView } from './practice-ratings-view'

type PracticeRow = AnalyticsViews['practiceRhythm']['rows'][number]
type RatingsRow = AnalyticsViews['ratingsMix']['rows'][number]
const timeFrame = {
  asOf: '2026-10-02T06:44:00Z',
  timeZone: 'America/New_York',
  requestedDays: 30,
}
function practice(
  index: number,
  overrides: Partial<PracticeRow> = {},
): PracticeRow {
  return {
    id: `period-${index}`,
    bucketStart: `2026-09-${String(1 + index * 3).padStart(2, '0')}`,
    bucketEnd: `2026-09-${String(3 + index * 3).padStart(2, '0')}`,
    isPartial: false,
    completedReviews: 10,
    validRatings: 9,
    goodEasy: 2,
    reviewSuccess: 0.13,
    evidence: 'measured',
    ...overrides,
  }
}
function ratings(
  index: number,
  overrides: Partial<RatingsRow> = {},
): RatingsRow {
  const p = practice(index)
  return {
    id: p.id,
    bucketStart: p.bucketStart,
    bucketEnd: p.bucketEnd,
    isPartial: false,
    again: 4,
    hard: 1,
    good: 3,
    easy: 2,
    againShare: 0.4,
    hardShare: 0.1,
    goodShare: 0.3,
    easyShare: 0.2,
    validRatings: 10,
    challengingReviews: 5,
    evidence: 'measured',
    ...overrides,
  }
}
const emptyRatings = (index: number) =>
  ratings(index, {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    againShare: null,
    hardShare: null,
    goodShare: null,
    easyShare: null,
    validRatings: 0,
    challengingReviews: 0,
    evidence: 'not-measured',
  })
function view(
  rows: PracticeRow[],
  target = 0.9,
): AnalyticsViews['practiceRhythm'] {
  return {
    rows,
    targetReviewSuccess: target,
    countScale: { domain: [0, 20], ticks: [0, 5, 10, 15, 20] },
    percentageScale: { domain: [0.1, 0.9], ticks: [0.1, 0.3, 0.5, 0.7, 0.9] },
  }
}
function ratingsView(rows: RatingsRow[]): AnalyticsViews['ratingsMix'] {
  return {
    rows,
    selectedValidRatings: 37,
    selectedHardAgain: 12,
    comparison: {
      direction: 'up',
      difference: 0.15,
      previousHardAgainShare: 0.2,
      previousValidRatings: 25,
    },
  }
}
const number = (node: Element, attribute: string) =>
  Number(node.getAttribute(attribute))
const inspect = () =>
  screen.getByRole('button', { name: 'Inspect Practice Rhythm chart' })
const measureTextBox = vi.fn(function (this: SVGElement) {
  return {
    x: 0,
    y: 0,
    width: (this.textContent?.length ?? 0) * 7,
    height: 12,
  } as DOMRect
})
beforeEach(() => {
  measureTextBox.mockImplementation(function (this: SVGElement) {
    return {
      x: 0,
      y: 0,
      width: (this.textContent?.length ?? 0) * 7,
      height: 12,
    } as DOMRect
  })
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: measureTextBox,
  })
})

describe('merged Practice Rhythm chart', () => {
  it('uses supplied shares in Easy/Good/Hard/Again order on a fixed axis independently of count', () => {
    const props = {
      view: view([practice(0)]),
      ratingsView: ratingsView([ratings(0)]),
    }
    const { rerender } = render(<PracticeRatingsView {...props} />)
    const easy = screen.getByTestId('practice-ratings-easy-0')
    const good = screen.getByTestId('practice-ratings-good-0')
    const hard = screen.getByTestId('practice-ratings-hard-0')
    const again = screen.getByTestId('practice-ratings-again-0')
    const height = [easy, good, hard, again].reduce(
      (sum, rect) => sum + number(rect, 'height'),
      0,
    )
    expect(number(easy, 'height') / height).toBeCloseTo(0.2)
    expect(number(good, 'height') / height).toBeCloseTo(0.3)
    expect(number(hard, 'height') / height).toBeCloseTo(0.1)
    expect(number(again, 'height') / height).toBeCloseTo(0.4)
    expect(number(good, 'y') + number(good, 'height')).toBeCloseTo(
      number(easy, 'y'),
    )
    expect(number(again, 'y') + number(again, 'height')).toBeCloseTo(
      number(hard, 'y'),
    )
    const circle = screen.getByTestId('practice-reviews-marker-0')
    const bottom = number(easy, 'y') + number(easy, 'height')
    expect((bottom - number(circle, 'cy')) / height).toBeCloseTo(0.5)
    expect(circle).toHaveAttribute('r', '3')
    const originalY = number(easy, 'y')
    rerender(
      <PracticeRatingsView
        {...props}
        view={view([practice(0, { completedReviews: 0 })])}
      />,
    )
    expect(number(screen.getByTestId('practice-ratings-easy-0'), 'y')).toBe(
      originalY,
    )
    expect(
      number(screen.getByTestId('practice-reviews-marker-0'), 'cy'),
    ).toBeCloseTo(bottom)
    expect(screen.getByText('100%')).toBeVisible()
    expect(
      screen.queryByTestId('practice-success-markers'),
    ).not.toBeInTheDocument()
  })

  it.each([0, 1])(
    'keeps target %s visible on the percentage axis',
    (target) => {
      render(
        <PracticeRatingsView
          view={view([practice(0)], target)}
          ratingsView={ratingsView([ratings(0)])}
        />,
      )
      const rect = screen.getByTestId(
        target === 0 ? 'practice-ratings-easy-0' : 'practice-ratings-again-0',
      )
      const targetLine = screen
        .getByTestId('practice-success-target')
        .querySelector('line')!
      expect(number(targetLine, 'y1')).toBeCloseTo(
        number(rect, 'y') + (target === 0 ? number(rect, 'height') : 0),
      )
      expect(
        screen.getByText(`Target Review Success ${target * 100}%`),
      ).toBeVisible()
    },
  )

  it('distinguishes known zero, count-only and missing count in gaps and inspection', () => {
    render(
      <PracticeRatingsView
        view={view([
          practice(0, { completedReviews: 0 }),
          practice(1, { validRatings: 0, goodEasy: 0, reviewSuccess: null }),
          practice(3),
        ])}
        ratingsView={ratingsView([
          ratings(0),
          emptyRatings(1),
          ratings(2),
          ratings(3),
        ])}
        timeFrame={timeFrame}
      />,
    )
    expect(screen.getByTestId('practice-reviews-marker-0')).toBeVisible()
    expect(screen.getByTestId('practice-ratings-empty-1')).toBeVisible()
    expect(
      screen.queryByTestId('practice-reviews-marker-2'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('practice-reviews-bridge-1-3')).toHaveAttribute(
      'stroke-dasharray',
      '7 5',
    )
    fireEvent.keyDown(inspect(), { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Completed reviews0')
    fireEvent.keyDown(inspect(), { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'No valid ratings · composition unavailable',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Completed reviews10')
    fireEvent.keyDown(inspect(), { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Completed reviewsUnavailable',
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Practice evidenceUnavailable',
    )
  })

  it('does not claim zero ratings when a positive practice cohort lacks its composition counterpart', () => {
    render(
      <PracticeRatingsView
        view={view([practice(0, { validRatings: 8, goodEasy: 6 })])}
        ratingsView={ratingsView([])}
      />,
    )
    expect(screen.getByTestId('practice-ratings-empty-0')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Rating composition unavailable'),
    )
    fireEvent.keyDown(inspect(), { key: 'Home' })
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('Rating composition unavailable')
    expect(tooltip).not.toHaveTextContent('No valid ratings')
    expect(tooltip).toHaveTextContent('Completed reviews10')
    expect(tooltip).toHaveTextContent('Good + Easy6 of 8')
  })

  it('preserves precise ratings, supplied success, both evidence states and full cross-year context', () => {
    const p = practice(0, {
      bucketStart: '2025-12-30',
      bucketEnd: '2026-01-01',
      isPartial: true,
      evidence: 'not-measured',
    })
    const r = ratings(0, {
      bucketStart: p.bucketStart,
      bucketEnd: p.bucketEnd,
      easy: 1,
      easyShare: 1 / 6,
    })
    render(
      <PracticeRatingsView
        view={view([p])}
        ratingsView={ratingsView([r])}
        timeFrame={timeFrame}
      />,
    )
    fireEvent.keyDown(inspect(), { key: 'Home' })
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('12/30/25–01/01/26')
    expect(tooltip).toHaveTextContent('Easy1 (16.7%)')
    expect(tooltip).toHaveTextContent('Good + Easy2 of 9')
    expect(tooltip).toHaveTextContent('Review Success13%')
    expect(tooltip).toHaveTextContent('Practice evidenceNot measured')
    expect(tooltip).toHaveTextContent('Ratings evidenceMeasured')
    expect(tooltip).toHaveTextContent('2025-12-30–2026-01-01')
    expect(tooltip).toHaveTextContent('In progress')
    expect(tooltip).toHaveTextContent('America/New_York')
    fireEvent.keyDown(inspect(), { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.keyDown(inspect(), { key: ' ' })
    expect(screen.getByRole('tooltip')).toBeVisible()
  })

  it('toggles count presentation together without changing dates, targets, inspection or Table values', async () => {
    const user = userEvent.setup()
    const props = {
      view: view([practice(0), practice(1)]),
      ratingsView: ratingsView([ratings(0), ratings(1)]),
    }
    const { container } = render(<PracticeRatingsView {...props} />)
    fireEvent.keyDown(inspect(), { key: 'End' })
    const rowTitle = within(screen.getByRole('tooltip')).getByText(
      /09\/04–09\/06/,
    ).textContent
    const dates = Array.from(
      container.querySelectorAll('.recharts-xAxis text'),
    ).map((node) => node.textContent)
    const goalY = screen
      .getByTestId('practice-success-target')
      .querySelector('line')!
      .getAttribute('y1')
    const toggle = screen.getByRole('button', { name: 'Reviews' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    toggle.focus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('img', { name: 'Practice Rhythm chart' }),
    ).toHaveAttribute('aria-roledescription', 'Stacked rating shares')
    expect(
      screen.queryByTestId('practice-reviews-line'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Reviews', { selector: 'svg text' }),
    ).not.toBeInTheDocument()
    expect(
      Array.from(container.querySelectorAll('desc')).some((node) =>
        node.textContent?.includes('Review volume is hidden'),
      ),
    ).toBe(true)
    expect(
      screen.getByTestId('practice-success-target').querySelector('line'),
    ).toHaveAttribute('y1', goalY)
    fireEvent.keyDown(inspect(), { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(rowTitle)
    expect(screen.getByRole('tooltip')).not.toHaveTextContent(
      'Completed reviews',
    )
    expect(
      Array.from(container.querySelectorAll('.recharts-xAxis text')).map(
        (node) => node.textContent,
      ),
    ).toEqual(dates)
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    const table = screen.getByRole('table', {
      name: 'Practice Rhythm exact values',
    })
    expect(
      within(table).getByRole('columnheader', { name: 'Completed reviews' }),
    ).toBeVisible()
    expect(within(table).getAllByRole('rowheader')).toHaveLength(2)
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.children[1]?.textContent),
    ).toEqual(['10', '10'])
  })

  it('uses seven-row pagination and resets page and inspection when the interval window changes', async () => {
    const user = userEvent.setup()
    const p = Array.from({ length: 9 }, (_, index) => practice(index))
    const r = Array.from({ length: 9 }, (_, index) => ratings(index))
    const props = { view: view(p), ratingsView: ratingsView(r) }
    const { rerender } = render(<PracticeRatingsView {...props} />)
    fireEvent.keyDown(inspect(), { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/25–09/27')
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(7)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(2)
    rerender(
      <PracticeRatingsView
        view={view(p.slice(0, 8))}
        ratingsView={ratingsView(r.slice(0, 8))}
      />,
    )
    expect(screen.getByText('Page 1 of 2')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Chart' }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.keyDown(inspect(), { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/01–09/03')
  })

  it('keeps the goal editor available above empty Chart and Table with supplied totals and eligible comparison', async () => {
    const user = userEvent.setup()
    render(
      <PracticeRatingsView
        view={view([])}
        ratingsView={ratingsView([])}
        targetControl={<button type="button">Change goal</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Change goal' })).toBeVisible()
    expect(
      screen.getByText(
        'No completed reviews or valid ratings are available in this period.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Inspect Practice Rhythm chart' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/12 of 37/)).toBeVisible()
    expect(screen.getByText(/up 15 pp/)).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    expect(screen.getByRole('button', { name: 'Change goal' })).toBeVisible()
    expect(screen.queryByRole('rowheader')).not.toBeInTheDocument()
  })

  it('keeps a zero category at zero height and omits labels that cannot fit at 12px', () => {
    render(
      <PracticeRatingsView
        view={view([practice(0)])}
        ratingsView={ratingsView([
          ratings(0, {
            hard: 0,
            hardShare: 0,
            againShare: 0.5,
          }),
        ])}
      />,
    )
    expect(screen.getByTestId('practice-ratings-hard-0')).toHaveAttribute(
      'height',
      '0',
    )
    expect(
      screen.queryByTestId('practice-ratings-hard-label-0'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('practice-ratings-easy-label-0')).toHaveAttribute(
      'font-size',
      '12',
    )
    expect(screen.getByTestId('practice-ratings-easy-label-0')).toBeVisible()
  })

  it('hides labels colliding with target and interpolated count segments without moving shares', async () => {
    const user = userEvent.setup()
    render(
      <PracticeRatingsView
        view={view(
          [
            practice(0, { completedReviews: 0 }),
            practice(2, { completedReviews: 4 }),
          ],
          0.35,
        )}
        ratingsView={ratingsView([ratings(0), ratings(1), ratings(2)])}
      />,
    )
    // Easy label is centered at 10%; the count bridge crosses it at the
    // missing middle count. Neither endpoint marker is near that text.
    expect(
      screen.getByTestId('practice-ratings-easy-label-1'),
    ).not.toBeVisible()
    expect(
      screen.getByTestId('practice-ratings-good-label-1'),
    ).not.toBeVisible()
    const height = screen
      .getByTestId('practice-ratings-easy-1')
      .getAttribute('height')
    await user.click(screen.getByRole('button', { name: 'Reviews' }))
    expect(screen.getByTestId('practice-ratings-easy-label-1')).toBeVisible()
    expect(
      screen.getByTestId('practice-ratings-good-label-1'),
    ).not.toBeVisible()
    expect(screen.getByTestId('practice-ratings-easy-1')).toHaveAttribute(
      'height',
      height,
    )
  })

  it('hides measured text when the measured box exceeds its segment and keeps precise data available', () => {
    measureTextBox.mockReturnValue({
      x: 0,
      y: 0,
      width: 50,
      height: 12,
    } as DOMRect)
    render(
      <PracticeRatingsView
        view={view([practice(0)])}
        ratingsView={ratingsView([ratings(0)])}
      />,
    )
    expect(
      screen.getByTestId('practice-ratings-easy-label-0'),
    ).not.toBeVisible()
    expect(screen.getByTestId('practice-ratings-easy-label-0')).toHaveAttribute(
      'font-size',
      '12',
    )
    fireEvent.keyDown(inspect(), { key: 'Home' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Easy2 (20%)')
    expect(screen.getByTestId('practice-reviews-marker-0')).toHaveAttribute(
      'r',
      '4',
    )
  })
})
