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
  return {
    ...practice(index),
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
    ...overrides,
  }
}
function view(
  rows: PracticeRow[],
  targetReviewSuccess = 0.9,
): AnalyticsViews['practiceRhythm'] {
  return {
    rows,
    targetReviewSuccess,
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
const part = (id: string) => screen.getByTestId(`practice-${id}`)
const tooltip = () => screen.getByRole('tooltip')
const number = (node: Element, attribute: string) =>
  Number(node.getAttribute(attribute))
const inspect = (key = 'Home') =>
  fireEvent.keyDown(
    screen.getByRole('button', {
      name: 'Inspect Practice Rhythm chart',
    }),
    { key },
  )
const measureTextBox = vi.fn()
beforeEach(() => {
  measureTextBox.mockImplementation(function (this: SVGElement) {
    return {
      width: (this.textContent?.length ?? 0) * 7,
      height: 12,
    }
  })
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: measureTextBox,
  })
})

describe('merged Practice Rhythm chart', () => {
  it('stacks exact Easy/Good/Hard/Again shares on the fixed percent axis with an independent right count scale and boundary targets', () => {
    const r = [ratings(0), ratings(1)]
    const { rerender } = render(
      <PracticeRatingsView
        view={view([practice(0), practice(1)])}
        ratingsView={ratingsView(r)}
      />,
    )
    const rects = ['easy', 'good', 'hard', 'again'].map((key) =>
      part(`ratings-${key}-0`),
    )
    const height = rects.reduce((sum, rect) => sum + number(rect, 'height'), 0)
    const bottom = number(rects[0]!, 'y') + number(rects[0]!, 'height')
    rects.forEach((rect, index) => {
      expect(number(rect, 'height') / height).toBeCloseTo(
        [0.2, 0.3, 0.1, 0.4][index]!,
      )
      if (index > 0)
        expect(number(rect, 'y') + number(rect, 'height')).toBeCloseTo(
          number(rects[index - 1]!, 'y'),
        )
    })
    expect(
      (bottom - number(part('reviews-marker-0'), 'cy')) / height,
    ).toBeCloseTo(0.5)
    expect(part('reviews-marker-0')).toHaveAttribute('r', '3')
    inspect()
    expect(part('reviews-marker-0')).toHaveAttribute('r', '4')
    expect(part('reviews-solid-0-1')).toHaveAttribute('stroke-width', '1.5')
    expect(
      screen.getByRole('img', { name: 'Practice Rhythm chart' }),
    ).toHaveAccessibleDescription(
      expect.stringContaining('right count axis: 0–20'),
    )
    expect(screen.getByText('100%')).toBeVisible()
    expect(
      screen.queryByTestId('practice-success-markers'),
    ).not.toBeInTheDocument()
    const originalY = number(rects[0]!, 'y')
    for (const target of [0, 1]) {
      rerender(
        <PracticeRatingsView
          view={view(
            [practice(0, { completedReviews: 0 }), practice(1)],
            target,
          )}
          ratingsView={ratingsView(r)}
        />,
      )
      expect(number(part('ratings-easy-0'), 'y')).toBe(originalY)
      expect(number(part('reviews-marker-0'), 'cy')).toBeCloseTo(bottom)
      expect(
        number(part('success-target').querySelector('line')!, 'y1'),
      ).toBeCloseTo(target === 0 ? bottom : bottom - height)
      expect(
        screen.getByText(`Target Review Success ${target * 100}%`),
      ).toBeVisible()
    }
  })

  it('distinguishes zero and unavailable composition and keeps precise Table data after count hiding', async () => {
    const user = userEvent.setup()
    render(
      <PracticeRatingsView
        timeFrame={timeFrame}
        view={view([
          practice(0, {
            completedReviews: 0,
            isPartial: true,
            evidence: 'not-measured',
          }),
          practice(1, { validRatings: 8, goodEasy: 6 }),
          practice(2, { validRatings: 0, goodEasy: 0, reviewSuccess: null }),
        ])}
        ratingsView={ratingsView([
          ratings(0, { easy: 1, easyShare: 1 / 6 }),
          ratings(2, {
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
          }),
        ])}
      />,
    )
    expect(part('reviews-marker-0')).toBeVisible()
    expect(part('ratings-empty-2')).toHaveAttribute(
      'fill',
      expect.stringMatching(/^url\(#/),
    )
    inspect()
    for (const text of [
      'Completed reviews0',
      'Easy1 (16.7%)',
      'Good + Easy2 of 9',
      'Review Success13%',
      'Practice evidenceNot measured',
      'Ratings evidenceMeasured',
      'America/New_York',
      'In progress',
    ])
      expect(tooltip()).toHaveTextContent(text)
    inspect('ArrowRight')
    expect(part('ratings-empty-1')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Rating composition unavailable'),
    )
    expect(tooltip()).not.toHaveTextContent('No valid ratings')
    expect(tooltip()).toHaveTextContent('Good + Easy6 of 8')
    inspect('End')
    expect(tooltip()).toHaveTextContent(
      'No valid ratings · composition unavailable',
    )
    expect(tooltip()).toHaveTextContent('Completed reviews10')
    const toggle = screen.getByRole('button', { name: 'Reviews' })
    toggle.focus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.queryByTestId('practice-reviews-line'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Reviews', { selector: 'svg text' }),
    ).not.toBeInTheDocument()
    const chart = screen.getByRole('img', { name: 'Practice Rhythm chart' })
    expect(chart).toHaveAttribute(
      'aria-roledescription',
      'Stacked rating shares',
    )
    expect(chart).toHaveAccessibleDescription(
      expect.stringContaining('Review volume is hidden'),
    )
    inspect()
    expect(tooltip()).not.toHaveTextContent('Completed reviews')
    await user.click(screen.getByRole('tab', { name: 'Table' }))
    const table = within(
      screen.getByRole('table', { name: 'Practice Rhythm exact values' }),
    )
    expect(
      table.getByRole('columnheader', { name: 'Completed reviews' }),
    ).toBeVisible()
    expect(
      table
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.children[1]?.textContent),
    ).toEqual(['0', '10', '10'])
    expect(table.getAllByRole('row')[1]).toHaveTextContent('1 (16.7%)')
  })

  it('keeps zero shares at zero and 12px labels clear of target, count bridges and oversized measured text without changing geometry', async () => {
    const user = userEvent.setup()
    const props = {
      view: view(
        [
          practice(0, { completedReviews: 0 }),
          practice(2, { completedReviews: 4 }),
        ],
        0.35,
      ),
      ratingsView: ratingsView([
        ratings(0, { hard: 0, hardShare: 0, againShare: 0.5 }),
        ratings(1),
        ratings(2),
      ]),
    }
    const { rerender } = render(<PracticeRatingsView {...props} />)
    expect(part('ratings-hard-0')).toHaveAttribute('height', '0')
    expect(
      screen.queryByTestId('practice-ratings-hard-label-0'),
    ).not.toBeInTheDocument()
    expect(part('reviews-bridge-0-2')).toHaveAttribute(
      'stroke-dasharray',
      '7 5',
    )
    expect(
      screen.queryByTestId('practice-reviews-marker-1'),
    ).not.toBeInTheDocument()
    inspect('End')
    inspect('ArrowLeft')
    expect(tooltip()).toHaveTextContent('Completed reviewsUnavailable')
    const easy = part('ratings-easy-label-1')
    expect(easy).toHaveAttribute('font-size', '12')
    expect(easy).not.toBeVisible()
    expect(part('ratings-good-label-1')).not.toBeVisible()
    const height = part('ratings-easy-1').getAttribute('height')
    await user.click(screen.getByRole('button', { name: 'Reviews' }))
    expect(part('ratings-easy-label-1')).toBeVisible()
    expect(part('ratings-good-label-1')).not.toBeVisible()
    expect(part('ratings-easy-1')).toHaveAttribute('height', height)
    measureTextBox.mockReturnValue({
      width: 50,
      height: 12,
    })
    rerender(
      <PracticeRatingsView
        view={view([practice(0)])}
        ratingsView={ratingsView([ratings(0)])}
      />,
    )
    expect(part('ratings-easy-label-0')).not.toBeVisible()
    expect(part('ratings-easy-label-0')).toHaveAttribute('font-size', '12')
    inspect()
    expect(tooltip()).toHaveTextContent('Easy2 (20%)')
  })

  it('keeps the goal editor and supplied summary available in empty Chart and Table', async () => {
    const user = userEvent.setup()
    render(
      <PracticeRatingsView
        view={view([])}
        ratingsView={ratingsView([])}
        targetControl={<button type="button">Change goal</button>}
      />,
    )
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
    for (const tab of ['Chart', 'Table']) {
      await user.click(screen.getByRole('tab', { name: tab }))
      expect(screen.getByRole('button', { name: 'Change goal' })).toBeVisible()
      expect(screen.queryByRole('rowheader')).not.toBeInTheDocument()
    }
  })
})
