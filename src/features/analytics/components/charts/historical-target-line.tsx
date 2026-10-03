import { usePlotArea, useYAxisScale } from 'recharts'

export function HistoricalTargetLine({
  value,
  yAxisId = 0,
  testId,
  stroke = 'var(--cp-analytics-target)',
}: {
  value: number
  yAxisId?: string | number
  testId: string
  stroke?: string
}) {
  const plot = usePlotArea()
  const yScale = useYAxisScale(yAxisId)
  if (!plot || !yScale) return null
  const y = yScale(value)
  if (y === undefined) return null
  return (
    <g aria-hidden="true" data-testid={testId}>
      <line
        stroke={stroke}
        strokeDasharray="5 5"
        strokeOpacity={0.8}
        x1={plot.x}
        x2={plot.x + plot.width}
        y1={y}
        y2={y}
      />
    </g>
  )
}
