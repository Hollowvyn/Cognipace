import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  AnalyticsTimeFrame,
  AnalyticsViews,
} from '../../api/analytics-contracts'
import { RetentionCard } from './retention-card'

const timeFrame: AnalyticsTimeFrame = {
  asOf: '2026-10-10T12:00:00.000Z',
  timeZone: 'America/Los_Angeles',
  timeZoneFallback: false,
  requestedDays: 30,
  periodStart: '2026-09-11T07:00:00.000Z',
  periodEnd: '2026-10-11T07:00:00.000Z',
  buckets: [],
  grouping: { unit: 'day', step: 1 },
}

function fixture(count = 150, overlap = false): AnalyticsViews['retentionMap'] {
  const rows = Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    slug: `problem-${index + 1}`,
    title: `Problem ${index + 1}`,
    retrievability: overlap
      ? 0.7
      : index % 3 === 0
        ? 0.95
        : index % 3 === 1
          ? 0.85
          : 0.7,
    targetRetention: 0.9,
    targetGap: overlap
      ? -0.2
      : index % 3 === 0
        ? 0.05
        : index % 3 === 1
          ? -0.05
          : -0.2,
    targetDurationDays: overlap ? 3 : 1 + index / 10,
    lastReviewedAt: '2026-08-20T02:00:00.000Z',
    dueAt: '2026-08-21T02:00:00.000Z',
    difficulty: 4.2,
    lapseCount: 2,
    status: overlap
      ? ('needs-attention' as const)
      : index % 3 === 0
        ? ('on-target' as const)
        : index % 3 === 1
          ? ('watch' as const)
          : ('needs-attention' as const),
    region: 'highest-attention' as const,
  }))
  return {
    rows,
    totalEligible: count,
    statusCounts: {
      onTarget: rows.filter((row) => row.status === 'on-target').length,
      watch: rows.filter((row) => row.status === 'watch').length,
      needsAttention: rows.filter((row) => row.status === 'needs-attention')
        .length,
    },
    recallScale: { domain: [0.6, 1], ticks: [0.6, 0.8, 1] },
    durationScale: { domain: [1, 20], ticks: [1, 7, 20] },
    targetRetention: 0.9,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function inspector() {
  return screen.getByRole('button', { name: /Inspect Retention Map/ })
}

function resizeFixture() {
  const observers: { callback: ResizeObserverCallback; targets: Element[] }[] =
    []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      item: (typeof observers)[number]
      constructor(callback: ResizeObserverCallback) {
        this.item = { callback, targets: [] }
        observers.push(this.item)
      }
      observe = (target: Element) => {
        this.item.targets.push(target)
      }
      unobserve = () => {}
      disconnect = () => {}
    },
  )
  return (width: number, height = 306) => {
    const body = document.querySelector('.cp-analytics-card-body')!
    act(() => {
      observers
        .filter((observer) => observer.targets.includes(body))
        .forEach((observer) =>
          observer.callback(
            [
              {
                target: body,
                contentRect: { width, height },
              } as ResizeObserverEntry,
            ],
            {} as ResizeObserver,
          ),
        )
    })
  }
}

function pointerFixture() {
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      readonly pointerId: number
      readonly pointerType: string
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
        this.pointerType = init.pointerType ?? 'mouse'
      }
    },
  )
}

function clickPoint(control: HTMLElement, slug: string, detail = 0) {
  const left = parseFloat(control.style.left)
  const top = parseFloat(control.style.top)
  const width = parseFloat(control.style.width)
  const height = parseFloat(control.style.height)
  vi.spyOn(control, 'getBoundingClientRect').mockReturnValue({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  })
  const glyph = document.querySelector(
    `[data-retention-map-point="${slug}"]`,
  )!.firstElementChild!
  const xy =
    glyph.tagName.toLowerCase() === 'circle'
      ? [Number(glyph.getAttribute('cx')), Number(glyph.getAttribute('cy'))]
      : glyph.getAttribute('points')!.split(' ')[0]!.split(',').map(Number)
  fireEvent.click(control, { clientX: xy[0], clientY: xy[1]! + 30, detail })
}

describe('compact Retention card', () => {
  it.each([31, 150])(
    'plots every one of %i rows and preserves full counts and coordinates after filtering',
    (count) => {
      const view = fixture(count)
      render(<RetentionCard view={view} timeFrame={timeFrame} />)
      const card = screen.getByRole('region', { name: 'Retention map' })
      expect(card).toHaveAttribute('data-mode', 'overview')
      expect(
        document.querySelectorAll('[data-retention-map-point]'),
      ).toHaveLength(count)
      const point = document
        .querySelector('[data-retention-map-point="problem-2"] polygon')!
        .getAttribute('points')
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Retention Map filter: Below target',
        }),
      )
      expect(
        document.querySelectorAll('[data-retention-map-point]'),
      ).toHaveLength(view.rows.filter((row) => row.retrievability < 0.9).length)
      expect(
        document.querySelector(
          '[data-retention-map-point="problem-2"] polygon',
        ),
      ).toHaveAttribute('points', point)
      expect(
        screen.getByRole('list', { name: 'Retention Map status counts' }),
      ).toHaveTextContent(`${view.statusCounts.onTarget} On target now`)
    },
  )

  it('reveals End after zoom, uses all three pinned groups, and focuses the remounted inspector on Close', async () => {
    const user = userEvent.setup()
    render(<RetentionCard view={fixture()} timeFrame={timeFrame} />)
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.keyDown(inspector(), { key: 'End' })
    expect(
      document.querySelector('[data-retention-map-point="problem-150"]'),
    ).not.toBeNull()
    fireEvent.keyDown(inspector(), { key: 'Enter' })
    const dialog = screen.getByRole('dialog', {
      name: 'Problem 150 memory details',
    })
    expect(dialog).toHaveTextContent('−20 pp')
    await user.click(
      screen.getByRole('button', { name: 'Pinned memory fields: Schedule' }),
    )
    expect(dialog).toHaveTextContent('08/19/26')
    await user.click(
      screen.getByRole('button', { name: 'Pinned memory fields: State' }),
    )
    expect(dialog).toHaveTextContent('FSRS difficulty')
    expect(dialog).toHaveTextContent('4.2')
    await user.click(screen.getByRole('button', { name: 'Return to map' }))
    expect(inspector()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(inspector(), { key: 'Enter' })
    fireEvent.keyDown(inspector(), { key: 'Enter' })
    await user.click(screen.getByRole('button', { name: /Close Problem 150/ }))
    expect(inspector()).toHaveFocus()
    expect(inspector()).toHaveAttribute('aria-expanded', 'false')
  })

  it('pages all 17 coincident candidates with complete canonical links, then pins the last member', async () => {
    const user = userEvent.setup()
    render(<RetentionCard view={fixture(17, true)} timeFrame={timeFrame} />)
    clickPoint(inspector(), 'problem-1')
    const seen = new Set<string>()
    for (;;) {
      const dialog = screen.getByRole('dialog', { name: 'Nearby memories' })
      for (const link of within(dialog).getAllByRole('link')) {
        seen.add(link.textContent)
        expect(link.getAttribute('href')).toMatch(
          /^https:\/\/leetcode.com\/problems\/problem-\d+\/$/,
        )
      }
      expect(
        within(dialog).getAllByRole('button', { name: /Choose Problem/ })
          .length,
      ).toBeLessThanOrEqual(3)
      const next = screen.getByRole('button', {
        name: 'Next Retention candidates',
      })
      if (next.hasAttribute('disabled')) break
      await user.click(next)
    }
    expect(seen.size).toBe(17)
    await user.click(screen.getByRole('button', { name: 'Choose Problem 17' }))
    expect(
      screen.getByRole('dialog', { name: 'Problem 17 memory details' }),
    ).toHaveTextContent('Rank 17')
  })

  it('keeps the real mounted native target through slow click sequences and restores a previous pin', async () => {
    vi.useFakeTimers()
    render(<RetentionCard view={fixture(17, true)} timeFrame={timeFrame} />)
    const original = inspector()
    clickPoint(original, 'problem-1', 1)
    await act(() => vi.advanceTimersByTime(650))
    expect(original.isConnected).toBe(true)
    expect(inspector()).toBe(original)
    clickPoint(original, 'problem-1', 2)
    fireEvent.doubleClick(original)
    await act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(inspector(), { key: 'End' })
    fireEvent.keyDown(inspector(), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Return to map' }))
    const returned = inspector()
    clickPoint(returned, 'problem-1', 1)
    await act(() => vi.advanceTimersByTime(650))
    expect(returned.isConnected).toBe(true)
    clickPoint(returned, 'problem-1', 2)
    fireEvent.doubleClick(returned)
    await act(() => vi.advanceTimersByTime(1000))
    expect(inspector()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Open pinned memory' }))
    expect(
      screen.getByRole('dialog', { name: 'Problem 17 memory details' }),
    ).toBeInTheDocument()
  })

  it('exposes every original field and resets hidden Problems only when semantic report context changes', async () => {
    const user = userEvent.setup()
    const view = fixture(17)
    const { rerender } = render(
      <RetentionCard view={view} timeFrame={timeFrame} />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Retention Map Details' }),
    )
    await user.selectOptions(
      screen.getByLabelText('Retention Map detail section'),
      'problems',
    )
    const headers = new Set<string>()
    for (;;) {
      screen
        .getAllByRole('columnheader')
        .forEach((header) => headers.add(header.textContent))
      const next = screen.getByRole('button', {
        name: 'Next Retention Problems fields',
      })
      if (next.hasAttribute('disabled')) break
      await user.click(next)
    }
    for (const header of [
      'Rank',
      'Problem',
      'Estimated recall now',
      'FSRS target',
      'Target gap',
      'Memory durability',
      'Last reviewed',
      'Due',
      'Difficulty',
      'Lapses',
      'Status',
    ])
      expect(headers.has(header)).toBe(true)
    await user.click(
      screen.getByRole('button', { name: 'Next Retention problems' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Retention Map Overview' }),
    )
    rerender(
      <RetentionCard
        view={{ ...view, rows: [...view.rows] }}
        timeFrame={{ ...timeFrame }}
      />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Retention Map Details' }),
    )
    expect(
      screen.getByRole('navigation', { name: 'Retention problems' }),
    ).toHaveTextContent('4–6 of 17')
    await user.click(
      screen.getByRole('button', { name: 'Retention Map Overview' }),
    )
    rerender(
      <RetentionCard
        view={view}
        timeFrame={{
          ...timeFrame,
          asOf: '2026-10-10T13:00:00.000Z',
          timeZone: 'UTC',
          requestedDays: 14,
        }}
      />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Retention Map Details' }),
    )
    expect(
      screen.getByRole('navigation', { name: 'Retention problems' }),
    ).toHaveTextContent('1–3 of 17')
  })

  it('resets Problems while hidden on width changes and fits long titles with all narrow fields reachable', async () => {
    const resize = resizeFixture()
    const user = userEvent.setup()
    const view = fixture(17)
    const { rerender } = render(
      <RetentionCard view={view} timeFrame={timeFrame} />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Retention Map Details' }),
    )
    resize(500)
    await user.selectOptions(
      screen.getByLabelText('Retention Map detail section'),
      'problems',
    )
    await user.click(
      screen.getByRole('button', { name: 'Next Retention problems' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Retention Map Overview' }),
    )
    resize(254, 240)
    await user.click(
      screen.getByRole('button', { name: 'Retention Map Details' }),
    )
    expect(
      screen.getByRole('navigation', { name: 'Retention problems' }),
    ).toHaveTextContent('1–2 of 17')
    const title =
      'An intentionally very long full problem title for testing every linked retention and memory signal candidate without truncation or shrinking'
    rerender(
      <RetentionCard
        view={{
          ...view,
          rows: view.rows.map((row, index) =>
            index === 0 ? { ...row, title } : row,
          ),
        }}
        timeFrame={timeFrame}
      />,
    )
    expect(
      screen.getByRole('navigation', { name: 'Retention problems' }),
    ).toHaveTextContent('1–1 of 17')
    expect(screen.getByRole('link', { name: title })).toHaveAttribute(
      'href',
      'https://leetcode.com/problems/problem-1/',
    )
    const headers = new Set<string>()
    for (;;) {
      screen
        .getAllByRole('columnheader')
        .forEach((header) => headers.add(header.textContent))
      const next = screen.getByRole('button', {
        name: 'Next Retention Problems fields',
      })
      if (next.hasAttribute('disabled')) break
      await user.click(next)
    }
    expect(headers.size).toBe(12)
    expect(screen.getByRole('table')).toHaveAttribute('data-value-columns', '1')
  })

  it('binds native wheel to each remounted inspector and cleans gesture cancellation before the next pin', async () => {
    pointerFixture()
    const user = userEvent.setup()
    render(<RetentionCard view={fixture(17, true)} timeFrame={timeFrame} />)
    await user.click(
      screen.getByRole('button', { name: 'Retention Map Details' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Retention Map Overview' }),
    )
    const control = inspector()
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      clientX: 80,
      clientY: 80,
    })
    act(() => {
      control.dispatchEvent(wheel)
    })
    expect(wheel.defaultPrevented).toBe(true)
    fireEvent.keyDown(control, { key: 'Enter' })
    await user.click(screen.getByRole('button', { name: 'Return to map' }))
    const returned = inspector()
    const nextWheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    })
    act(() => {
      returned.dispatchEvent(nextWheel)
    })
    expect(nextWheel.defaultPrevented).toBe(true)
    fireEvent.pointerDown(returned, { pointerId: 1, clientX: 55, clientY: 44 })
    fireEvent.pointerMove(returned, { pointerId: 1, clientX: 180, clientY: 95 })
    fireEvent.keyDown(returned, { key: 'Escape' })
    expect(returned).toHaveAttribute('aria-expanded', 'true')
    clickPoint(returned, 'problem-1')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(returned, { key: 'Escape' })
    expect(returned).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(returned, { key: 'Enter' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('cancels deferred pointer presentation on report, mode, blur and Escape changes', async () => {
    vi.useFakeTimers()
    const view = fixture(17, true)
    const { rerender } = render(
      <RetentionCard view={view} timeFrame={timeFrame} />,
    )
    clickPoint(inspector(), 'problem-1', 1)
    rerender(
      <RetentionCard
        view={view}
        timeFrame={{ ...timeFrame, asOf: '2026-10-10T13:00:00.000Z' }}
      />,
    )
    await act(() => vi.advanceTimersByTime(1001))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Retention Map Details' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Retention Map Overview' }),
    )
    clickPoint(inspector(), 'problem-1', 1)
    fireEvent.blur(window)
    await act(() => vi.advanceTimersByTime(1001))
    expect(screen.queryByRole('dialog')).toBeNull()
    clickPoint(inspector(), 'problem-1', 1)
    fireEvent.resize(window)
    await act(() => vi.advanceTimersByTime(1001))
    expect(screen.queryByRole('dialog')).toBeNull()
    clickPoint(inspector(), 'problem-1', 1)
    fireEvent.keyDown(inspector(), { key: 'Escape' })
    await act(() => vi.advanceTimersByTime(1001))
    expect(inspector()).toHaveAttribute('aria-expanded', 'false')
  })

  it.each(['blur', 'resize', 'pointercancel', 'lostpointercapture'])(
    'cleans %s cancellation and suppresses the trailing click after a remount',
    async (reason) => {
      pointerFixture()
      const user = userEvent.setup()
      render(<RetentionCard view={fixture(17, true)} timeFrame={timeFrame} />)
      fireEvent.keyDown(inspector(), { key: 'Enter' })
      await user.click(screen.getByRole('button', { name: 'Return to map' }))
      const control = inspector()
      clickPoint(control, 'problem-1', 2)
      const left = parseFloat(control.style.left),
        top = parseFloat(control.style.top)
      fireEvent.pointerDown(control, { clientX: left + 10, clientY: top + 10 })
      fireEvent.pointerMove(control, { clientX: left + 160, clientY: top + 50 })
      expect(
        document.querySelector('rect[stroke-dasharray="4 3"]'),
      ).not.toBeNull()
      if (reason === 'blur') fireEvent.blur(window)
      else if (reason === 'resize') fireEvent.resize(window)
      else if (reason === 'pointercancel') fireEvent.pointerCancel(control)
      else fireEvent.lostPointerCapture(control)
      expect(document.querySelector('rect[stroke-dasharray="4 3"]')).toBeNull()
      clickPoint(control, 'problem-1', 1)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(control).toHaveAttribute('aria-expanded', 'true')
      fireEvent.keyDown(control, { key: 'Escape' })
      fireEvent.keyDown(control, { key: 'Enter' })
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    },
  )

  it('distinguishes no eligible data from known zero filter matches and clears a removed pin', async () => {
    const user = userEvent.setup()
    const view = fixture(1)
    const { rerender } = render(
      <RetentionCard view={view} timeFrame={timeFrame} />,
    )
    fireEvent.keyDown(inspector(), { key: 'Enter' })
    await user.click(screen.getByRole('button', { name: 'Return to map' }))
    await user.click(
      screen.getByRole('button', {
        name: 'Retention Map filter: Below target',
      }),
    )
    expect(inspector()).toBeDisabled()
    expect(inspector()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('status')).toHaveTextContent(
      'No reviewed problems are below',
    )
    expect(
      screen.getByRole('list', { name: 'Retention Map status counts' }),
    ).toHaveTextContent('1 On target now')
    rerender(<RetentionCard view={fixture(0)} timeFrame={timeFrame} />)
    expect(
      screen.getByText(/No active reviewed problems have enough current FSRS/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Retention Map Details' }),
    ).toBeInTheDocument()
  })

  it('returns focus to a reachable header action when refreshed data removes the inspected cohort', () => {
    const { rerender } = render(
      <RetentionCard view={fixture(1)} timeFrame={timeFrame} />,
    )
    fireEvent.keyDown(inspector(), { key: 'Enter' })
    expect(
      screen.getByRole('button', { name: 'Close Problem 1 memory details' }),
    ).toHaveFocus()
    rerender(
      <RetentionCard
        view={fixture(0)}
        timeFrame={{ ...timeFrame, asOf: '2026-10-10T13:00:00.000Z' }}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Retention Map Details' }),
    ).toHaveFocus()
  })

  it('suppresses thin drag clicks and preserves touch pinch/pan after Overview remount', async () => {
    pointerFixture()
    const user = userEvent.setup()
    render(<RetentionCard view={fixture()} timeFrame={timeFrame} />)
    await user.click(
      screen.getByRole('button', { name: 'Retention Map Details' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Retention Map Overview' }),
    )
    const control = inspector()
    clickPoint(control, 'problem-1', 2)
    const left = parseFloat(control.style.left),
      top = parseFloat(control.style.top)
    fireEvent.pointerDown(control, { clientX: left + 15, clientY: top + 15 })
    fireEvent.pointerMove(control, { clientX: left + 100, clientY: top + 17 })
    fireEvent.pointerUp(control, { clientX: left + 100, clientY: top + 17 })
    clickPoint(control, 'problem-1', 1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      document.querySelectorAll('[data-retention-map-point]'),
    ).toHaveLength(150)
    fireEvent.pointerDown(control, {
      pointerType: 'touch',
      pointerId: 1,
      clientX: left + 100,
      clientY: top + 20,
    })
    fireEvent.pointerDown(control, {
      pointerType: 'touch',
      pointerId: 2,
      clientX: left + 200,
      clientY: top + 20,
    })
    fireEvent.pointerMove(control, {
      pointerType: 'touch',
      pointerId: 2,
      clientX: left + 400,
      clientY: top + 20,
    })
    expect(
      document.querySelectorAll('[data-retention-map-point]').length,
    ).toBeLessThan(150)
    fireEvent.pointerUp(control, {
      pointerType: 'touch',
      pointerId: 2,
      clientX: left + 400,
      clientY: top + 20,
    })
    fireEvent.pointerMove(control, {
      pointerType: 'touch',
      pointerId: 1,
      clientX: left + 140,
      clientY: top + 30,
    })
    fireEvent.pointerUp(control, {
      pointerType: 'touch',
      pointerId: 1,
      clientX: left + 140,
      clientY: top + 30,
    })
    fireEvent.click(control, {
      detail: 1,
      clientX: left + 140,
      clientY: top + 30,
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(
      document.querySelectorAll('[data-retention-map-point]'),
    ).toHaveLength(150)
    fireEvent.keyDown(control, { key: 'End' })
    fireEvent.keyDown(control, { key: 'Enter' })
    expect(
      screen.getByRole('dialog', { name: 'Problem 150 memory details' }),
    ).toBeInTheDocument()
  })
})
