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

function AnalyticsLineChart({ defaultIndex }: { defaultIndex: number }) {
  return (
    <div>
      <LineChart data={bridgeData} height={240} width={480}>
        <XAxis allowDuplicatedCategory={false} dataKey="bucket" />
        <YAxis domain={[0, 1]} />
        <Tooltip
          active
          content={<TooltipProbe />}
          defaultIndex={defaultIndex}
        />
        <LineSegments
          data={bridgeData}
          dataKey="value"
          seriesKey="observedCorrectness"
          stroke="var(--cp-analytics-observed)"
        />
      </LineChart>
      <div aria-label="Chart legend" role="list">
        <span role="listitem">Observed correctness</span>
      </div>
    </div>
  )
}

describe('LineSegments in a Recharts line chart', () => {
  it('preserves categories, bridges without synthetic data, and registers one semantic tooltip row', async () => {
    const { rerender } = render(<AnalyticsLineChart defaultIndex={0} />)

    const bridge = await screen.findByTestId('observedCorrectness-bridge-0-2')

    expect(bridge).toHaveAttribute('stroke-dasharray', '5 5')
    expect(document.querySelectorAll('circle')).toHaveLength(0)
    expect(screen.getAllByText('Observed correctness')).toHaveLength(1)
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
