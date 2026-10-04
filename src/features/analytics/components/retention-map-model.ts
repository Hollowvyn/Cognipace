import type { AnalyticsViews } from '../api/analytics-contracts'

export type RetentionRow = AnalyticsViews['retentionMap']['rows'][number]
export interface RetentionViewport {
  duration: [number, number]
  recall: [number, number]
}
export interface PlotPoint {
  x: number
  y: number
}

export function fullViewport(
  view: AnalyticsViews['retentionMap'],
): RetentionViewport {
  return {
    duration: [...view.durationScale.domain],
    recall: [...view.recallScale.domain],
  }
}

function fitSpan(
  domain: [number, number],
  full: [number, number],
): [number, number] {
  const span = Math.min(
    full[1] - full[0],
    Math.max((full[1] - full[0]) / 16, domain[1] - domain[0]),
  )
  if (span === full[1] - full[0]) return [...full]
  const start = Math.max(
    full[0],
    Math.min(full[1] - span, (domain[0] + domain[1] - span) / 2),
  )
  return [start, start + span]
}

export function constrainViewport(
  view: RetentionViewport,
  full: RetentionViewport,
): RetentionViewport {
  const fullDuration = full.duration.map(Math.log) as [number, number]
  const duration = fitSpan(
    view.duration.map(Math.log) as [number, number],
    fullDuration,
  )
  return {
    duration: duration.map((value, index) =>
      Math.abs(value - fullDuration[index]!) < 1e-12
        ? full.duration[index]!
        : Math.exp(value),
    ) as [number, number],
    recall: fitSpan(view.recall, full.recall),
  }
}

export function zoomViewport(
  view: RetentionViewport,
  full: RetentionViewport,
  factor: number,
  anchor = { x: 0.5, y: 0.5 },
): RetentionViewport {
  const zoom = (
    domain: [number, number],
    fraction: number,
  ): [number, number] => {
    const span = domain[1] - domain[0]
    const position = domain[0] + span * fraction
    return [
      position - (span * fraction) / factor,
      position + (span * (1 - fraction)) / factor,
    ]
  }
  return constrainViewport(
    {
      duration: zoom(
        view.duration.map(Math.log) as [number, number],
        anchor.x,
      ).map(Math.exp) as [number, number],
      recall: zoom(view.recall, anchor.y),
    },
    full,
  )
}

export function panViewport(
  view: RetentionViewport,
  full: RetentionViewport,
  dx: number,
  dy: number,
): RetentionViewport {
  const move = (domain: [number, number], delta: number): [number, number] => {
    const offset = (domain[1] - domain[0]) * delta
    return [domain[0] + offset, domain[1] + offset]
  }
  return constrainViewport(
    {
      duration: move(view.duration.map(Math.log) as [number, number], dx).map(
        Math.exp,
      ) as [number, number],
      recall: move(view.recall, dy),
    },
    full,
  )
}

export function containsRow(
  view: RetentionViewport,
  row: RetentionRow,
): boolean {
  return (
    row.targetDurationDays >= view.duration[0] &&
    row.targetDurationDays <= view.duration[1] &&
    row.retrievability >= view.recall[0] &&
    row.retrievability <= view.recall[1]
  )
}

export function revealRow(
  view: RetentionViewport,
  full: RetentionViewport,
  row: RetentionRow,
): RetentionViewport {
  if (containsRow(view, row)) return view
  const reveal = (
    domain: [number, number],
    value: number,
  ): [number, number] => {
    const span = domain[1] - domain[0]
    const inset = span * 0.04
    const start =
      value < domain[0] + inset
        ? value - inset
        : value > domain[1] - inset
          ? value + inset - span
          : domain[0]
    return [start, start + span]
  }
  return constrainViewport(
    {
      duration: reveal(
        view.duration.map(Math.log) as [number, number],
        Math.log(row.targetDurationDays),
      ).map(Math.exp) as [number, number],
      recall: reveal(view.recall, row.retrievability),
    },
    full,
  )
}

/** Expand the box uniformly in screen space before inverting the public scales. */
export function boxViewport(
  view: RetentionViewport,
  full: RetentionViewport,
  width: number,
  height: number,
  start: PlotPoint,
  end: PlotPoint,
  inverseX: (pixel: number) => unknown,
  inverseY: (pixel: number) => unknown,
): RetentionViewport | null {
  const dx = Math.abs(end.x - start.x)
  const dy = Math.abs(end.y - start.y)
  if (dx < 12 || dy < 12) return null
  const currentZoom = Math.max(
    Math.log(full.duration[1] / full.duration[0]) /
      Math.log(view.duration[1] / view.duration[0]),
    (full.recall[1] - full.recall[0]) / (view.recall[1] - view.recall[0]),
  )
  const factor = Math.min(width / dx, height / dy, 16 / currentZoom)
  const cx = (start.x + end.x) / 2
  const cy = (start.y + end.y) / 2
  const candidate = {
    duration: [
      Number(inverseX(cx - width / factor / 2)),
      Number(inverseX(cx + width / factor / 2)),
    ] as [number, number],
    recall: [
      Number(inverseY(cy + height / factor / 2)),
      Number(inverseY(cy - height / factor / 2)),
    ] as [number, number],
  }
  return candidate.duration.every(
    (value) => Number.isFinite(value) && value > 0,
  ) && candidate.recall.every(Number.isFinite)
    ? constrainViewport(candidate, full)
    : null
}

export function durationTicks(domain: [number, number]): number[] {
  const candidates: number[] = []
  const multipliers = domain[1] / domain[0] >= 100 ? [1] : [1, 2, 5]
  for (
    let power = Math.floor(Math.log10(domain[0]));
    power <= Math.ceil(Math.log10(domain[1]));
    power++
  ) {
    for (const multiplier of multipliers) {
      const value = multiplier * 10 ** power
      if (value >= domain[0] && value <= domain[1]) candidates.push(value)
    }
  }
  if (candidates.length < 2) return [...domain]
  return candidates.length <= 5
    ? candidates
    : Array.from(
        { length: 5 },
        (_, index) =>
          candidates[Math.round((index * (candidates.length - 1)) / 4)]!,
      )
}

export function recallTicks(domain: [number, number]): number[] {
  const span = domain[1] - domain[0]
  const step =
    span > 0.75
      ? 0.25
      : span > 0.4
        ? 0.2
        : span > 0.15
          ? 0.1
          : span > 0.07
            ? 0.05
            : span > 0.025
              ? 0.02
              : 0.01
  const values: number[] = []
  for (
    let value = Math.ceil(domain[0] / step) * step;
    value <= domain[1] + 1e-9;
    value += step
  )
    values.push(Number(value.toFixed(4)))
  return values
}

export function statusLabel(status: RetentionRow['status']) {
  return status === 'on-target'
    ? 'On target now'
    : status === 'watch'
      ? 'Watch'
      : 'Needs attention'
}
export function statusColor(status: RetentionRow['status']) {
  return status === 'on-target'
    ? 'var(--cp-analytics-healthy)'
    : status === 'watch'
      ? 'var(--cp-analytics-attention)'
      : 'var(--cp-analytics-risk)'
}
export function formatDuration(value: number) {
  return `${value > 0 && value < 0.1 ? new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 }).format(value) : Number(value.toFixed(1))}d`
}
export function formatGap(value: number) {
  return `${value >= 0 ? '+' : '−'}${Math.round(Math.abs(value) * 100)} pp`
}
export function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: '2-digit',
  }).format(new Date(value))
}
