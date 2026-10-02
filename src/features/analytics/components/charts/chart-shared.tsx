export const DASHED_LINE_EVIDENCE_LABEL =
  'Dashed line crosses a period with no eligible evidence.'

const dateLabelFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const countFormatter = new Intl.NumberFormat('en-US')

export function formatCount(value: number): string {
  return countFormatter.format(value)
}

export function formatChartDate(value: string): string {
  return dateLabelFormatter.format(new Date(`${value}T00:00:00.000Z`))
}

export function formatBucketLabel(
  bucketStart: string,
  bucketEnd: string,
): string {
  if (bucketStart === bucketEnd) return formatChartDate(bucketStart)

  return `${formatChartDate(bucketStart)}–${formatChartDate(bucketEnd)}`
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : `${Math.round(value * 100)}%`
}

export function formatPercentagePoints(
  value: number | null | undefined,
): string {
  return value === null || value === undefined
    ? '—'
    : `${Math.round(value * 100)} points`
}

export function formatDays(value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : `${value.toFixed(value >= 10 ? 0 : 1)}d`
}
