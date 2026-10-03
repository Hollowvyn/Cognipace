export interface HistoricalChartTimeFrame {
  asOf: string
  timeZone: string
  requestedDays: number
}

export interface HistoricalChartRow {
  id: string
  bucketStart: string
  bucketEnd: string
}

export type PositionedHistoricalRow<Row extends HistoricalChartRow> = Row & {
  x: number
  startX: number
  endX: number
}

const calendarDayMs = 86_400_000

/** UTC ordinals represent local date keys, not elapsed instants in the report zone. */
export function historicalDayOrdinal(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00.000Z`) / calendarDayMs
}

export function formatHistoricalDate(
  dateKey: string,
  timeFrame?: HistoricalChartTimeFrame,
  includeYear = false,
): string {
  const [year, month, day] = dateKey.split('-')
  const reportYear = timeFrame
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: timeFrame.timeZone,
        year: 'numeric',
      }).format(new Date(timeFrame.asOf))
    : year
  return `${month}/${day}${includeYear || year !== reportYear ? `/${year?.slice(-2)}` : ''}`
}

export function formatHistoricalBucket(
  row: Pick<HistoricalChartRow, 'bucketStart' | 'bucketEnd'>,
  timeFrame?: HistoricalChartTimeFrame,
): string {
  const crossYear = row.bucketStart.slice(0, 4) !== row.bucketEnd.slice(0, 4)
  const start = formatHistoricalDate(row.bucketStart, timeFrame, crossYear)
  return row.bucketStart === row.bucketEnd
    ? start
    : `${start}–${formatHistoricalDate(row.bucketEnd, timeFrame, crossYear)}`
}

export function historicalGroupingLabel(timeFrame?: HistoricalChartTimeFrame) {
  return timeFrame?.requestedDays === 14
    ? 'Daily summaries'
    : timeFrame?.requestedDays === 90
      ? 'Weekly summaries'
      : '3-day summaries'
}

export function historicalIntervalContext(
  row: Pick<HistoricalChartRow, 'bucketStart' | 'bucketEnd'> & {
    isPartial: boolean
  },
  timeFrame?: HistoricalChartTimeFrame,
): string {
  const intervalDays =
    historicalDayOrdinal(row.bucketEnd) -
    historicalDayOrdinal(row.bucketStart) +
    1
  const expectedDays =
    timeFrame?.requestedDays === 14
      ? 1
      : timeFrame?.requestedDays === 90
        ? 7
        : 3
  return [
    historicalGroupingLabel(timeFrame),
    !row.isPartial && intervalDays < expectedDays
      ? `${intervalDays}-day shortened interval`
      : null,
    row.isPartial ? 'In progress' : 'Complete interval',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function historicalReportContext(timeFrame?: HistoricalChartTimeFrame) {
  if (!timeFrame) return ''
  return `As of ${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timeFrame.timeZone,
  }).format(new Date(timeFrame.asOf))} (${timeFrame.timeZone})`
}

function dateKeyFromOrdinal(ordinal: number): string {
  return new Date(Math.floor(ordinal) * calendarDayMs)
    .toISOString()
    .slice(0, 10)
}

/** Keep the activity window intact, including every empty interval inside it. */
export function trimHistoricalEmptyEdges<Row>(
  rows: readonly Row[],
  hasData: (row: Row) => boolean,
): Row[] {
  const first = rows.findIndex(hasData)
  if (first === -1) return []
  let last = rows.length - 1
  while (last > first && !hasData(rows[last]!)) last -= 1
  return rows.slice(first, last + 1)
}

export function buildHistoricalChartModel<Row extends HistoricalChartRow>(
  rows: readonly Row[],
  timeFrame?: HistoricalChartTimeFrame,
  width = 640,
) {
  const positionedRows: PositionedHistoricalRow<Row>[] = rows.map((row) => {
    const startX = historicalDayOrdinal(row.bucketStart)
    const endX = historicalDayOrdinal(row.bucketEnd) + 1
    return { ...row, startX, endX, x: (startX + endX) / 2 }
  })
  const domain: [number, number] = positionedRows.length
    ? [positionedRows[0]!.startX, positionedRows.at(-1)!.endX]
    : [0, 1]
  const firstDay = domain[0]
  const lastDay = domain[1] - 1
  const span = lastDay - firstDay
  const longestLabel = Math.max(
    formatHistoricalDate(dateKeyFromOrdinal(firstDay), timeFrame).length,
    formatHistoricalDate(dateKeyFromOrdinal(lastDay), timeFrame).length,
  )
  // Leave room for the label itself and a readable gap. Dates are independent
  // of row midpoints: omitting a tick never omits an observation.
  const minimumSpacing = longestLabel * 7 + 28
  const capacity = Math.max(
    2,
    Math.min(6, Math.floor(width / minimumSpacing) + 1),
  )
  const minimumStep = span / (capacity - 1)
  const step =
    [1, 2, 3, 7, 14, 21, 28, 35, 42, 56, 84].find(
      (candidate) => candidate >= minimumStep,
    ) ?? Math.ceil(minimumStep / 7) * 7
  const days = [firstDay]
  if (span > 0) {
    for (let day = firstDay + step; day < lastDay; day += step) {
      // Reserve the final calendar date. Avoid crowding it with an interior
      // weekly tick when the surviving range ends shortly after that tick.
      if (lastDay - day >= minimumStep) days.push(day)
    }
    days.push(lastDay)
  }
  const ticks = positionedRows.length ? days.map((day) => day + 0.5) : []
  return {
    rows: positionedRows,
    domain,
    ticks,
    formatTick: (value: number) =>
      formatHistoricalDate(dateKeyFromOrdinal(value), timeFrame),
  }
}

export function nearestHistoricalRowIndex(
  rows: readonly { x: number }[],
  position: number,
): number {
  let selected = 0
  let distance = Infinity
  rows.forEach((row, index) => {
    const nextDistance = Math.abs(row.x - position)
    if (nextDistance < distance) {
      selected = index
      distance = nextDistance
    }
  })
  return selected
}

export function sparseHistoricalYTicks(
  ticks: readonly number[],
  maximum = 6,
): number[] {
  if (ticks.length <= maximum) return [...ticks]
  return Array.from(
    { length: maximum },
    (_, index) =>
      ticks[Math.round((index * (ticks.length - 1)) / (maximum - 1))]!,
  )
}
