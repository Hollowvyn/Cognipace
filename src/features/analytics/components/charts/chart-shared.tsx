export const DASHED_LINE_EVIDENCE_LABEL =
  'Dashed line crosses a period with no eligible evidence.'

export function ChartTrendNote({ pointCount }: { pointCount: number }) {
  return pointCount === 1 ? (
    <p className="m-0 text-[length:var(--cp-badge-font-size)] leading-snug text-muted-foreground">
      Not enough data for a trend yet.
    </p>
  ) : null
}

const countFormatter = new Intl.NumberFormat('en-US')

export function formatCount(value: number): string {
  return countFormatter.format(value)
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : `${Math.round(value * 100)}%`
}

export function formatDays(value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : `${value.toFixed(value >= 10 ? 0 : 1)}d`
}
