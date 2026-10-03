import { render, screen, waitFor } from '@testing-library/react'
import { LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { describe, expect, it } from 'vitest'

import { LineSegments } from './line-segments'

function TooltipProbe({
  active,
  payload,
}: {
  active?: boolean
  payload?: readonly {
    name?: string | number
    type?: string
    value?: number | string
  }[]
}) {
  const visibleItems = active
    ? (payload?.filter((item) => item.type !== 'none') ?? [])
    : []

  return (
    <output data-testid="line-segments-tooltip">
      {visibleItems.map((item) => `${item.name}:${item.value}`).join(',')}
    </output>
  )
}

const bridgeData = [
  { bucket: 'Aug 01', value: 0.8 },
  { bucket: 'Aug 02', value: null },
  { bucket: 'Aug 03', value: 0.84 },
] as const

const observedSeries = {
  key: 'observedCorrectness',
  color: 'var(--cp-analytics-observed)',
} as const

function AnalyticsLineChart({ defaultIndex }: { defaultIndex: number }) {
  return (
    <LineChart data={bridgeData} height={240} width={480}>
      <XAxis allowDuplicatedCategory={false} dataKey="bucket" />
      <YAxis domain={[0, 1]} />
      <Tooltip active content={<TooltipProbe />} defaultIndex={defaultIndex} />
      <LineSegments
        data={bridgeData}
        dataKey="value"
        seriesKey={observedSeries.key}
        stroke={observedSeries.color}
      />
    </LineChart>
  )
}

describe('LineSegments in a Recharts line chart', () => {
  it('preserves a complete active glyph at the padded domain boundary outside Recharts curve clipping', async () => {
    const data = [
      { x: 0.5, value: 1 },
      { x: 1.5, value: 0 },
    ]
    render(
      <LineChart data={data} height={288} margin={{ top: 32 }} width={640}>
        <XAxis allowDataOverflow dataKey="x" domain={[0, 2]} type="number" />
        <YAxis
          allowDataOverflow
          domain={[0, 1]}
          padding={{ top: 8, bottom: 8 }}
        />
        <LineSegments
          activeIndex={0}
          data={data}
          dataKey="value"
          markerShape="circle"
          seriesKey="boundary"
          showMeasuredDots
          stroke="green"
        />
      </LineChart>,
    )
    const marker = await screen.findByTestId('boundary-marker-0')
    const circle = marker.querySelector('circle')!
    const cy = Number(circle.getAttribute('cy'))
    const extent =
      Number(circle.getAttribute('r')) +
      Number(circle.getAttribute('stroke-width')) / 2
    expect(cy).toBe(40)
    expect(extent).toBe(6.5)
    const clippingStarts = Array.from(document.querySelectorAll('rect'))
      .filter(
        (rect) => rect.parentElement?.tagName.toLowerCase() === 'clippath',
      )
      .map((rect) => Number(rect.getAttribute('y')))
    expect(clippingStarts).toContain(40)
    expect(marker.closest('[clip-path]')).toBeNull()
    expect(cy - extent).toBeGreaterThanOrEqual(32)
    expect(marker.closest('.recharts-zIndex-layer_600')).not.toBeNull()
    const curve = screen.getByTestId('boundary-solid-0-1')
    expect(
      curve.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0)
  })

  it('renders optional opaque diamonds and longer bridges, highlighting only measured rows', async () => {
    const { rerender } = render(
      <LineChart data={bridgeData} height={240} width={480}>
        <XAxis dataKey="bucket" />
        <YAxis domain={[0, 1]} />
        <LineSegments
          activeIndex={1}
          bridgeDasharray="12 6"
          bridgeStrokeWidth={1.5}
          data={bridgeData}
          dataKey="value"
          markerFill="purple"
          markerShape="diamond"
          seriesKey="model"
          showMeasuredDots
          stroke="purple"
        />
      </LineChart>,
    )
    expect(await screen.findByTestId('model-bridge-0-2')).toHaveAttribute(
      'stroke-dasharray',
      '12 6',
    )
    expect(screen.getByTestId('model-bridge-0-2')).toHaveAttribute(
      'stroke-width',
      '1.5',
    )
    expect(screen.getByTestId('model-marker-0')).toHaveAttribute(
      'data-marker-shape',
      'diamond',
    )
    expect(
      screen.getByTestId('model-marker-0').querySelector('path'),
    ).toHaveAttribute('fill', 'purple')
    expect(
      screen.getByTestId('model-marker-0').querySelector('path'),
    ).toHaveAttribute('stroke-width', '1.5')
    expect(screen.queryByTestId('model-marker-1')).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-active-marker="true"]'),
    ).not.toBeInTheDocument()
    rerender(
      <LineChart data={bridgeData} height={240} width={480}>
        <XAxis dataKey="bucket" />
        <YAxis domain={[0, 1]} />
        <LineSegments
          activeIndex={2}
          data={bridgeData}
          dataKey="value"
          markerFill="green"
          markerShape="circle"
          seriesKey="model"
          showMeasuredDots
          stroke="green"
        />
      </LineChart>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('model-marker-2')).toHaveAttribute(
        'data-active-marker',
        'true',
      ),
    )
    expect(
      document.querySelectorAll('[data-active-marker="true"]'),
    ).toHaveLength(1)
    expect(
      screen.getByTestId('model-marker-2').querySelector('circle'),
    ).toHaveAttribute('r', '5')
    expect(
      screen.getByTestId('model-marker-2').querySelector('circle'),
    ).toHaveAttribute('stroke-width', '3')
    expect(
      screen.getByTestId('model-marker-2').querySelectorAll('circle'),
    ).toHaveLength(1)
    expect(
      screen.getByTestId('model-marker-0').querySelector('circle'),
    ).toHaveAttribute('r', '4')
    expect(
      screen.getByTestId('model-marker-0').querySelector('circle'),
    ).toHaveAttribute('stroke-width', '2.5')
  })

  it('renders one explicit measured marker for a single-point series', async () => {
    render(
      <LineChart data={bridgeData.slice(0, 1)} height={240} width={480}>
        <XAxis dataKey="bucket" />
        <YAxis domain={[0, 1]} />
        <LineSegments
          data={bridgeData.slice(0, 1)}
          dataKey="value"
          markerShape="circle"
          seriesKey="single"
          showMeasuredDots
          stroke="green"
        />
      </LineChart>,
    )
    expect(await screen.findByTestId('single-marker-0')).toBeInTheDocument()
    expect(document.querySelectorAll('circle')).toHaveLength(1)
  })

  it('preserves categories, bridges without synthetic data, and registers one semantic tooltip row', async () => {
    const { rerender } = render(<AnalyticsLineChart defaultIndex={0} />)

    const bridge = await screen.findByTestId('observedCorrectness-bridge-0-2')

    expect(bridge).toHaveAttribute('stroke-dasharray', '5 5')
    expect(document.querySelectorAll('circle')).toHaveLength(0)
    const xAxisTicks = Array.from(
      document.querySelectorAll('tspan'),
      (tick) => tick.textContent,
    ).filter((label): label is string => label?.startsWith('Aug') ?? false)
    expect(xAxisTicks).toEqual(['Aug 01', 'Aug 02', 'Aug 03'])
    expect(bridge).toHaveAttribute(
      'd',
      expect.stringMatching(/^M65,[^L]+L475,/),
    )

    await waitFor(() => {
      expect(screen.getByTestId('line-segments-tooltip')).toHaveTextContent(
        'observedCorrectness:0.8',
      )
    })

    expect(
      screen.getByTestId('line-segments-tooltip').textContent?.split(','),
    ).toHaveLength(1)

    rerender(<AnalyticsLineChart defaultIndex={1} />)

    await waitFor(() => {
      expect(screen.getByTestId('line-segments-tooltip')).toBeEmptyDOMElement()
    })
  })
})
