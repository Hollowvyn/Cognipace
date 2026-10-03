import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { usePlotArea, useXAxisScale, useYAxisScale } from 'recharts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HistoricalChart } from './historical-chart'
import type { PositionedHistoricalRow } from './historical-chart-model'

const rows = [
  { id: 'first', bucketStart: '2026-09-01', bucketEnd: '2026-09-01', value: 0 },
  {
    id: 'unknown',
    bucketStart: '2026-09-02',
    bucketEnd: '2026-09-02',
    value: null,
  },
  { id: 'last', bucketStart: '2026-09-03', bucketEnd: '2026-09-03', value: 1 },
]

function Marks({
  data,
  selected,
  visible,
}: {
  data: PositionedHistoricalRow<(typeof rows)[number]>[]
  selected: PositionedHistoricalRow<(typeof rows)[number]> | null
  visible: boolean
}) {
  const plot = usePlotArea()
  const xScale = useXAxisScale()
  const yScale = useYAxisScale()
  if (!plot || !xScale || !yScale) return null
  return (
    <g
      data-bottom={plot.y + plot.height}
      data-selected={selected?.id}
      data-testid="marks"
      data-top={plot.y}
      data-visible={visible}
    >
      {data.map((row) =>
        row.value === null ? null : (
          <circle
            cx={xScale(row.x)}
            cy={yScale(row.value)}
            data-testid={`measured-${row.id}`}
            key={row.id}
            r={4}
          />
        ),
      )}
    </g>
  )
}

function Fixture({
  data = rows,
  initialIndex = 0,
  inspectionResetKey = '',
  dualAxes = false,
}: {
  data?: typeof rows
  initialIndex?: number
  inspectionResetKey?: string
  dualAxes?: boolean
}) {
  return (
    <HistoricalChart
      config={{ value: { color: 'green' } }}
      description="Measured values with unknown periods."
      initialIndex={initialIndex}
      inspectionResetKey={inspectionResetKey}
      name="Example historical chart"
      rows={data}
      tooltip={(row) => (
        <p>
          {row.id}: {row.value === null ? 'Not measured' : row.value}
        </p>
      )}
      yAxes={[
        {
          label: 'Recall (%)',
          scale: { domain: [0, 1], ticks: [0, 0.5, 1] },
          format: (value) => `${value * 100}%`,
        },
        ...(dualAxes
          ? [
              {
                id: 'success',
                label: 'Review Success (%)',
                scale: {
                  domain: [0, 1] as [number, number],
                  ticks: [0, 0.5, 1],
                },
                format: (value: number) => `${value * 100}%`,
                orientation: 'right' as const,
              },
            ]
          : []),
      ]}
    >
      {(data, selected, visible) => (
        <Marks data={data} selected={selected} visible={visible} />
      )}
    </HistoricalChart>
  )
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 640,
    height: 288,
    x: 0,
    y: 0,
    right: 640,
    bottom: 288,
    toJSON() {},
  })
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('HistoricalChart inspection', () => {
  it('starts hidden and reserves render clearance for supplied domain boundary values', async () => {
    render(<Fixture initialIndex={1} />)
    const marks = await screen.findByTestId('marks')
    expect(marks).toHaveAttribute('data-selected', 'unknown')
    expect(marks).toHaveAttribute('data-visible', 'false')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(
      screen.getByTestId('historical-chart-selected-guide'),
    ).toBeInTheDocument()
    const bottom = Number(marks.getAttribute('data-bottom'))
    const top = Number(marks.getAttribute('data-top'))
    expect(
      Number(screen.getByTestId('measured-first').getAttribute('cy')),
    ).toBeLessThanOrEqual(bottom - 8)
    expect(
      Number(screen.getByTestId('measured-last').getAttribute('cy')),
    ).toBeGreaterThanOrEqual(top + 8)
    expect(screen.queryByTestId('measured-unknown')).not.toBeInTheDocument()
    expect(screen.getByText('Recall (%)')).toBeInTheDocument()
    expect(screen.getByText('Local date · 3-day summaries')).toBeInTheDocument()
    const chart = screen.getByRole('img', { name: 'Example historical chart' })
    expect(chart).toHaveAccessibleDescription(
      'Measured values with unknown periods.',
    )
    expect(chart).not.toContainElement(
      screen.getByRole('button', { name: 'Inspect Example historical chart' }),
    )
  })

  it('inspects every original row with focus and arrows, clamps at edges, and hides on Escape', async () => {
    render(<Fixture />)
    const control = await screen.findByRole('button', {
      name: 'Inspect Example historical chart',
    })
    fireEvent.focus(control)
    expect(screen.getByRole('tooltip')).toHaveTextContent('first: 0')
    expect(screen.getByRole('tooltip').parentElement).toHaveAttribute(
      'aria-live',
      'polite',
    )
    fireEvent.keyDown(control, { key: 'ArrowLeft' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('first: 0')
    fireEvent.keyDown(control, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'unknown: Not measured',
    )
    expect(screen.queryByTestId('measured-unknown')).not.toBeInTheDocument()
    fireEvent.keyDown(control, { key: 'End' })
    fireEvent.keyDown(control, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('last: 1')
    fireEvent.keyDown(control, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.keyDown(control, { key: 'ArrowLeft' })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'unknown: Not measured',
    )
  })

  it('chooses the nearest bucket from actual hover and tap coordinates across the full plot', async () => {
    render(<Fixture />)
    const control = await screen.findByRole('button', {
      name: 'Inspect Example historical chart',
    })
    const width = Number.parseFloat(control.style.width)
    vi.spyOn(control, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 0,
      width,
      height: 200,
      x: 100,
      y: 0,
      right: 100 + width,
      bottom: 200,
      toJSON() {},
    })
    fireEvent.pointerMove(control, { clientX: 100 + width / 2 })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'unknown: Not measured',
    )
    expect(screen.getByRole('tooltip').parentElement).toHaveAttribute(
      'aria-live',
      'off',
    )
    fireEvent.pointerDown(control, { clientX: 100 + width - 2 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('last: 1')
    fireEvent.pointerDown(control, { clientX: 101 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('first: 0')
  })

  it('dismisses a hover tooltip with Escape while keyboard focus remains elsewhere', async () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        <Fixture />
      </>,
    )
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' })
    elsewhere.focus()
    const control = await screen.findByRole('button', {
      name: 'Inspect Example historical chart',
    })
    fireEvent.pointerMove(control, { clientX: 320 })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(document.activeElement).toBe(elsewhere)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(elsewhere)
  })

  it('stacks measured dual-axis headers on a narrow plot', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 260,
      height: 288,
      x: 0,
      y: 0,
      right: 260,
      bottom: 288,
      toJSON() {},
    })
    render(<Fixture dualAxes />)
    await screen.findByTestId('marks')
    const left = screen.getByText('Recall (%)')
    const right = screen.getByText('Review Success (%)')
    expect(
      Number(right.getAttribute('y')) - Number(left.getAttribute('y')),
    ).toBe(14)
    expect(screen.getAllByText('Local date · 3-day summaries')).toHaveLength(1)
  })

  it('keeps a tooltip within the chart host when a narrow plot is under 160px', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 180,
      height: 288,
      x: 0,
      y: 0,
      right: 180,
      bottom: 288,
      toJSON() {},
    })
    render(<Fixture />)
    const control = await screen.findByRole('button', {
      name: 'Inspect Example historical chart',
    })
    expect(Number.parseFloat(control.style.width)).toBeLessThan(160)
    fireEvent.focus(control)
    const tooltip = screen.getByRole('tooltip').parentElement!
    expect(Number.parseFloat(tooltip.style.left)).toBeGreaterThanOrEqual(8)
    expect(
      Number.parseFloat(tooltip.style.left) +
        Number.parseFloat(tooltip.style.width),
    ).toBeLessThanOrEqual(172)
  })

  it('hides details when series visibility changes while preserving the selected period', async () => {
    const { rerender } = render(<Fixture inspectionResetKey="both" />)
    const control = await screen.findByRole('button', {
      name: 'Inspect Example historical chart',
    })
    fireEvent.keyDown(control, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('last: 1')
    rerender(<Fixture inspectionResetKey="observed" />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByTestId('marks')).toHaveAttribute('data-selected', 'last')
    fireEvent.keyDown(control, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('last: 1')
  })

  it('resets inspection when the row set changes and clamps the requested initial row', async () => {
    const { rerender } = render(<Fixture initialIndex={2} />)
    const control = await screen.findByRole('button', {
      name: 'Inspect Example historical chart',
    })
    fireEvent.focus(control)
    expect(screen.getByRole('tooltip')).toHaveTextContent('last: 1')
    rerender(<Fixture data={[rows[0]!]} initialIndex={2} />)
    await waitFor(() =>
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('marks')).toHaveAttribute(
      'data-selected',
      'first',
    )
    fireEvent.keyDown(control, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('first: 0')
    rerender(<Fixture data={[]} />)
    expect(
      screen.queryByRole('button', {
        name: 'Inspect Example historical chart',
      }),
    ).not.toBeInTheDocument()
  })
})
