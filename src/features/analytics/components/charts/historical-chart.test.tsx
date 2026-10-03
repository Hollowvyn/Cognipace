import { fireEvent, render, screen } from '@testing-library/react'
import { usePlotArea, useXAxisScale, useYAxisScale } from 'recharts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HistoricalChart, type HistoricalYAxis } from './historical-chart'
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

const recallAxis: HistoricalYAxis = {
  label: 'Recall (%)',
  scale: { domain: [0, 1], ticks: [0, 0.5, 1] },
  format: (value) => `${value * 100}%`,
}

function bounds(width = 640, left = 0) {
  return new DOMRect(left, 0, width, 288)
}

function inspect() {
  return screen.getByRole('button', {
    name: 'Inspect Example historical chart',
  })
}

function Fixture({
  data = rows,
  initialIndex = 0,
  inspectionResetKey = '',
}: {
  data?: typeof rows
  initialIndex?: number
  inspectionResetKey?: string
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
        recallAxis,
        {
          ...recallAxis,
          id: 'success',
          label: 'Review Success (%)',
          orientation: 'right',
        },
      ]}
    >
      {(data, selected, visible) => (
        <Marks data={data} selected={selected} visible={visible} />
      )}
    </HistoricalChart>
  )
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    bounds(),
  )
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerType: string
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerType = init.pointerType ?? 'mouse'
      }
    },
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('HistoricalChart inspection', () => {
  it('starts hidden with boundary clearance, then inspects every original row with keyboard clamping and Escape', async () => {
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
    const control = inspect()
    expect(chart).not.toContainElement(control)
    fireEvent.focus(control)
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'unknown: Not measured',
    )
    fireEvent.keyDown(control, { key: 'Home' })
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

  it('chooses the nearest bucket from actual hover and tap coordinates across the plot, then dismisses with Escape while focus stays elsewhere', () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        <Fixture />
      </>,
    )
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' })
    elsewhere.focus()
    const control = inspect()
    const width = Number.parseFloat(control.style.width)
    vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(
      bounds(width, 100),
    )
    fireEvent.pointerMove(control, { clientX: 100 + width / 2 })
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'unknown: Not measured',
    )
    expect(screen.getByRole('tooltip').parentElement).toHaveAttribute(
      'aria-live',
      'off',
    )
    expect(document.activeElement).toBe(elsewhere)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(elsewhere)
    fireEvent.pointerDown(control, { clientX: 100 + width - 2 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('last: 1')
    fireEvent.pointerDown(control, { clientX: 101, pointerType: 'touch' })
    fireEvent.pointerLeave(control, { pointerType: 'touch' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('first: 0')
    fireEvent.pointerLeave(control, { pointerType: 'mouse' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('stacks dual-axis headers and contains inspection details in a narrow chart host', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      bounds(180),
    )
    render(<Fixture />)
    await screen.findByTestId('marks')
    const left = screen.getByText('Recall (%)')
    const right = screen.getByText('Review Success (%)')
    expect(
      Number(right.getAttribute('y')) - Number(left.getAttribute('y')),
    ).toBe(14)
    expect(screen.getAllByText('Local date · 3-day summaries')).toHaveLength(1)
    const control = inspect()
    expect(Number.parseFloat(control.style.width)).toBeLessThan(160)
    fireEvent.focus(control)
    const tooltip = screen.getByRole('tooltip').parentElement!
    expect(Number.parseFloat(tooltip.style.left)).toBeGreaterThanOrEqual(8)
    expect(
      Number.parseFloat(tooltip.style.left) +
        Number.parseFloat(tooltip.style.width),
    ).toBeLessThanOrEqual(172)
  })

  it('hides details when series visibility changes while preserving selection, then resets and clamps when rows change', () => {
    const { rerender } = render(
      <Fixture inspectionResetKey="both" initialIndex={2} />,
    )
    const control = inspect()
    fireEvent.keyDown(control, { key: 'End' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('last: 1')
    rerender(<Fixture inspectionResetKey="observed" />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByTestId('marks')).toHaveAttribute('data-selected', 'last')
    fireEvent.keyDown(control, { key: 'ArrowRight' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('last: 1')
    rerender(<Fixture data={[rows[0]!]} initialIndex={2} />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
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
