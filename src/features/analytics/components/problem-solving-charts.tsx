import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  ComposedChart,
  Symbols,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from 'recharts'

import { ChartContainer } from '@/components/ui/chart'
import { ChartTrendNote } from './charts/chart-shared'
import { HistoricalChart } from './charts/historical-chart'
import type {
  HistoricalChartTimeFrame,
  PositionedHistoricalRow,
} from './charts/historical-chart'
import {
  formatHistoricalBucket,
  historicalIntervalContext,
  historicalReportContext,
} from './charts/historical-chart-model'
import { HistoricalTargetLine } from './charts/historical-target-line'
import { LineSegments } from './charts/line-segments'
import {
  comparisonText,
  difficulties,
  mixDifficulties,
  mixShares,
  outcomeLabel,
  outcomeNumerator,
  outcomeText,
  timeText,
  timeValue,
} from './problem-solving-model'
import type {
  DifficultyStats,
  KnownDifficulty,
  OutcomeMeasure,
  ProblemCohort,
  ProblemRow,
  ProblemView,
  TimeUnits,
  TimingPopulation,
} from './problem-solving-model'

interface PlotOptions {
  view: ProblemView
  cohort: ProblemCohort
  measure: OutcomeMeasure
  units: TimeUnits
  timing: TimingPopulation
  goal: number
  timeFrame?: HistoricalChartTimeFrame | undefined
  resetKey: string
}
const labelFor = (kind: 'outcome' | 'time') =>
  kind === 'outcome' ? 'Success by Difficulty' : 'Recorded Time by Difficulty'

export function ProblemTrendChart({
  kind,
  rows,
  shown,
  ...options
}: PlotOptions & {
  kind: 'outcome' | 'time'
  rows: ProblemRow[]
  shown: readonly (typeof difficulties)[number][]
}) {
  const { view, cohort, measure, units, timing, goal, timeFrame, resetKey } =
    options
  const seriesRows = rows.map((row) => {
    const value = (key: KnownDifficulty): number | null =>
      kind === 'outcome'
        ? row.difficulties[key][measure]
        : timeValue(
            row.difficulties[key].time[timing].medianSeconds,
            key,
            units,
            view.timeTargetsMinutes,
          )
    return {
      ...row,
      easy: value('easy'),
      medium: value('medium'),
      hard: value('hard'),
    }
  })
  if (shown.length === 0) return <Empty message="Select a difficulty." />
  const measured = rows.filter((row) =>
    shown.some(({ key }) =>
      kind === 'outcome'
        ? row.difficulties[key][measure] !== null
        : row.difficulties[key].time[timing].medianSeconds !== null,
    ),
  ).length
  if (measured === 0)
    return (
      <Empty
        message={
          kind === 'outcome'
            ? 'No valid outcomes for the selected difficulties in this period.'
            : 'No eligible recorded assessment time for the selected difficulties in this period.'
        }
      />
    )
  const name = `${labelFor(kind)} chart`
  const scale =
    kind === 'outcome'
      ? view.cohorts[cohort].outcomeScale
      : view.cohorts[cohort].timeScales[timing][units]
  const format =
    kind === 'outcome'
      ? outcomeText
      : (value: number | null) => timeText(value, units)
  const label =
    kind === 'outcome'
      ? `${outcomeLabel(measure)} (%)`
      : units === 'minutes'
        ? 'Recorded time (min)'
        : 'Time target used (%)'
  const window = rows.length
    ? `${formatHistoricalBucket(rows[0]!, timeFrame)}–${formatHistoricalBucket(rows.at(-1)!, timeFrame)}`
    : ''
  return (
    <div className="grid gap-2">
      <HistoricalChart
        rows={seriesRows}
        config={{}}
        name={name}
        description={`${label}. Easy circles, Medium diamonds, Hard triangles. Known-difficulty activity window ${window}. Scale ${format(scale.domain[0])}–${format(scale.domain[1])}; hiding a difficulty does not change dates or scale. Long-dash bridges add no observations. ${historicalReportContext(timeFrame)}`}
        yAxes={[{ label, scale, format, padding: { top: 8, bottom: 8 } }]}
        height={288}
        startAtFirstPoint
        timeFrame={timeFrame}
        inspectionResetKey={resetKey}
        tooltip={(row) => (
          <div className="grid gap-2 rounded border border-border bg-popover p-2.5 text-xs leading-relaxed shadow-md">
            <p className="m-0 font-semibold">
              {formatHistoricalBucket(row, timeFrame)}
            </p>
            <p className="m-0 text-muted-foreground">
              {historicalIntervalContext(row, timeFrame)}
            </p>
            {shown.map((difficulty) => (
              <ProblemStats
                key={difficulty.key}
                stats={row.difficulties[difficulty.key]}
                difficulty={difficulty}
                kind={kind}
                {...options}
              />
            ))}
            <p className="m-0 text-muted-foreground">
              {historicalReportContext(timeFrame)}
            </p>
          </div>
        )}
      >
        {(positioned, selected) => (
          <>
            {kind === 'outcome' ? (
              <HistoricalTargetLine
                value={goal}
                testId="problem-outcome-target"
              />
            ) : units === 'targetPercent' ? (
              <HistoricalTargetLine value={100} testId="problem-time-target" />
            ) : (
              shown.map(({ key, color }) => (
                <HistoricalTargetLine
                  key={key}
                  value={view.timeTargetsMinutes[key]}
                  stroke={color}
                  testId={`problem-time-target-${key}`}
                />
              ))
            )}
            {kind === 'time' && shown.length === 1 ? (
              <TimeWhiskers
                rows={positioned}
                difficulty={shown[0]!.key}
                options={options}
              />
            ) : null}
            {shown.map(({ key, label: seriesLabel, color, shape }) => (
              <LineSegments
                data={positioned}
                dataKey={key}
                seriesKey={seriesLabel}
                key={key}
                stroke={color}
                type="linear"
                showMeasuredDots
                markerShape={shape}
                activeIndex={
                  selected
                    ? positioned.findIndex((row) => row.id === selected.id)
                    : null
                }
                bridgeDasharray="9 7"
                testId={`problem-${kind}-${key}`}
              />
            ))}
          </>
        )}
      </HistoricalChart>
      <ChartTrendNote pointCount={measured} />
    </div>
  )
}

function TimeWhiskers({
  rows,
  difficulty,
  options,
}: {
  rows: PositionedHistoricalRow<ProblemRow>[]
  difficulty: KnownDifficulty
  options: PlotOptions
}) {
  const xScale = useXAxisScale()
  const yScale = useYAxisScale()
  if (!xScale || !yScale) return null
  const color = difficulties.find(({ key }) => key === difficulty)!.color
  return (
    <g aria-hidden="true">
      {rows.map((row, index) => {
        const stats = row.difficulties[difficulty].time[options.timing]
        const low = timeValue(
          stats.q1Seconds,
          difficulty,
          options.units,
          options.view.timeTargetsMinutes,
        )
        const high = timeValue(
          stats.q3Seconds,
          difficulty,
          options.units,
          options.view.timeTargetsMinutes,
        )
        if (low === null || high === null || stats.timedAssessments < 4)
          return null
        const x = xScale(row.x),
          y1 = yScale(low),
          y2 = yScale(high)
        if (x === undefined || y1 === undefined || y2 === undefined) return null
        return (
          <g
            data-testid={`problem-time-${difficulty}-quartiles-${index}`}
            data-low={low}
            data-high={high}
            key={row.id}
            stroke={color}
            strokeWidth={1.5}
            strokeOpacity={0.8}
          >
            <line x1={x} x2={x} y1={y1} y2={y2} />
            <line x1={x - 5} x2={x + 5} y1={y1} y2={y1} />
            <line x1={x - 5} x2={x + 5} y1={y2} y2={y2} />
          </g>
        )
      })}
    </g>
  )
}

export function DifficultyMixChart({
  rows,
  measure,
  timeFrame,
  resetKey,
}: {
  rows: ProblemRow[]
  measure: 'assessments' | 'time'
  timeFrame?: HistoricalChartTimeFrame | undefined
  resetKey: string
}) {
  const hasValue = rows.some((row) => mixShares(row, measure)[0] !== null)
  if (!hasValue)
    return (
      <Empty
        message={
          measure === 'assessments'
            ? 'No recorded assessments in this period.'
            : 'No positive recorded assessment time in this period.'
        }
      />
    )
  return (
    <HistoricalChart
      rows={rows}
      config={{}}
      name="Difficulty Mix chart"
      description={`Share of ${measure === 'assessments' ? 'all raw recorded assessments' : 'positive saved recorded time'} by current catalog Easy, Medium, Hard and Unknown difficulty. Includes invalid ratings. Empty intervals are unavailable. ${historicalReportContext(timeFrame)}`}
      height={236}
      timeFrame={timeFrame}
      inspectionResetKey={resetKey}
      yAxes={[
        {
          label:
            measure === 'assessments'
              ? 'Assessments (%)'
              : 'Recorded-time allocation (%)',
          scale: { domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1] },
          format: outcomeText,
        },
      ]}
      tooltip={(row) => (
        <div className="grid gap-1 rounded border border-border bg-popover p-2.5 text-xs leading-relaxed shadow-md">
          <p className="m-0 font-semibold">
            {formatHistoricalBucket(row, timeFrame)}
          </p>
          {mixDifficulties.map(({ key, label, color }, index) => (
            <p className="m-0" key={key}>
              <span style={{ color }}>{label}</span>:{' '}
              {outcomeText(mixShares(row, measure)[index] ?? null)} ·{' '}
              {row.difficulties[key].recordedAssessments} assessments ·{' '}
              {row.difficulties[key].time.all.totalSeconds} recorded seconds
            </p>
          ))}
          <p className="m-0 text-muted-foreground">
            {historicalIntervalContext(row, timeFrame)} ·{' '}
            {historicalReportContext(timeFrame)}
          </p>
        </div>
      )}
    >
      {(positioned) => <MixStacks rows={positioned} measure={measure} />}
    </HistoricalChart>
  )
}
function MixStacks({
  rows,
  measure,
}: {
  rows: PositionedHistoricalRow<ProblemRow>[]
  measure: 'assessments' | 'time'
}) {
  const xScale = useXAxisScale(),
    yScale = useYAxisScale()
  if (!xScale || !yScale) return null
  return (
    <g aria-hidden="true">
      {rows.map((row) => {
        const start = xScale(row.startX),
          end = xScale(row.endX),
          center = xScale(row.x)
        if (start === undefined || end === undefined || center === undefined)
          return null
        const width = Math.max(2, (end - start) * 0.68)
        let cumulative = 0
        return mixShares(row, measure).map((share, index) => {
          if (share === null || share === 0) return null
          const category = mixDifficulties[index]!
          const low = yScale(cumulative),
            high = yScale(cumulative + share)
          cumulative += share
          if (low === undefined || high === undefined) return null
          return (
            <g
              key={category.key}
              data-testid={`problem-mix-${row.id}-${category.key}`}
              data-share={share}
            >
              <rect
                x={center - width / 2}
                y={high}
                width={width}
                height={Math.max(0, low - high)}
                fill={category.color}
              />
              {low - high >= 18 && width >= 32 ? (
                <text
                  x={center}
                  y={(high + low) / 2 + 4}
                  textAnchor="middle"
                  fill="var(--cp-analytics-rating-label)"
                  fontSize={11}
                  fontWeight={600}
                >
                  {Math.round(share * 100)}%
                </text>
              ) : null}
            </g>
          )
        })
      })}
    </g>
  )
}

export function ComparisonChart({
  kind,
  ...options
}: PlotOptions & { kind: 'outcome' | 'time' }) {
  const { view, cohort, units, measure, timing, goal, timeFrame, resetKey } =
    options
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const controls = useRef<Array<HTMLButtonElement | null>>([])
  const [inspection, setInspection] = useState<{
    key: string
    index: number
    visible: boolean
    keyboard: boolean
  } | null>(null)
  const current = view.cohorts[cohort]
  const selectedIndex =
    inspection?.key === resetKey && inspection.visible ? inspection.index : -1
  const selected = difficulties[selectedIndex]
  const scale =
    kind === 'outcome'
      ? { domain: [0, 1] as [number, number], ticks: [0, 0.25, 0.5, 0.75, 1] }
      : current.timeScales[timing][units]
  const onSelect = (index: number, keyboard: boolean, focus = false) => {
    setInspection({ key: resetKey, index, visible: true, keyboard })
    if (focus) controls.current[index]?.focus({ preventScroll: true })
  }
  const dismiss = () =>
    setInspection((value) => value && { ...value, visible: false })
  const format =
    kind === 'outcome'
      ? outcomeText
      : (value: number | null) => timeText(value, units)
  return (
    <div className="relative grid gap-2">
      <ChartContainer
        accessibleName={`${labelFor(kind)} comparison`}
        aria-label={`${labelFor(kind)} comparison`}
        className="aspect-auto"
        config={{}}
        initialDimension={{ width: 640, height: 288 }}
        style={{ height: 288 }}
        ref={setHost}
      >
        <ComposedChart
          accessibilityLayer={false}
          data={difficulties}
          margin={{ top: 20, left: 0, right: 8, bottom: 10 }}
          role="img"
          aria-label={`${labelFor(kind)} comparison`}
        >
          <desc>
            {kind === 'outcome'
              ? `${outcomeLabel(measure)} outcome columns, zero baseline.`
              : 'Recorded assessment time medians and available middle 50% ranges.'}{' '}
            All three current catalog difficulties, including unavailable
            groups. {historicalReportContext(timeFrame)}.
          </desc>
          <XAxis
            dataKey="label"
            scale="band"
            axisLine={false}
            tickLine={false}
            interval={0}
            type="category"
          />
          <YAxis
            domain={[...scale.domain]}
            ticks={[...scale.ticks]}
            tickFormatter={format}
            axisLine={false}
            tickLine={false}
            width={64}
            padding={{ top: 20, bottom: 8 }}
            allowDataOverflow
          />
          {kind === 'outcome' ? (
            <HistoricalTargetLine
              value={goal}
              testId="problem-compare-target"
            />
          ) : units === 'targetPercent' ? (
            <HistoricalTargetLine
              value={100}
              testId="problem-compare-time-target"
            />
          ) : null}
          <CompareMarks
            host={host}
            controls={controls}
            selectedIndex={selectedIndex}
            kind={kind}
            options={options}
            onSelect={onSelect}
            dismiss={dismiss}
          />
        </ComposedChart>
      </ChartContainer>
      <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
        {difficulties.map(({ key, label, symbol, color }) => (
          <div key={key}>
            <p className="m-0 font-semibold" style={{ color }}>
              {symbol} {label}
            </p>
            {kind === 'outcome' ? (
              <>
                <p className="m-0">
                  {outcomeText(current.totals.difficulties[key][measure])} · n=
                  {current.totals.difficulties[key].validRatings}
                </p>
                <p className="m-0">
                  Prior{' '}
                  {outcomeText(current.previous.difficulties[key][measure])} ·
                  n={current.previous.difficulties[key].validRatings}
                </p>
                <p className="m-0">
                  {comparisonText(
                    current.totals.difficulties[key],
                    current.previous.difficulties[key],
                    measure,
                  )}
                </p>
              </>
            ) : (
              <p className="m-0">
                {current.totals.difficulties[key].time[timing].timedAssessments}
                /
                {
                  current.totals.difficulties[key].time[timing]
                    .eligibleAssessments
                }{' '}
                timed
              </p>
            )}
          </div>
        ))}
      </div>
      {selected ? (
        <div
          className="pointer-events-none absolute right-2 top-2 z-20 max-w-[calc(100%-1rem)] rounded border border-border bg-popover p-2.5 text-xs shadow-md"
          role="tooltip"
          aria-live={inspection?.keyboard ? 'polite' : 'off'}
        >
          <ProblemStats
            stats={current.totals.difficulties[selected.key]}
            difficulty={selected}
            kind={kind}
            {...options}
          />
          {kind === 'outcome' ? (
            <>
              <p className="m-0">
                Prior:{' '}
                {outcomeText(
                  current.previous.difficulties[selected.key][measure],
                )}{' '}
                · {current.previous.difficulties[selected.key].validRatings}{' '}
                valid
              </p>
              <p className="m-0">
                {comparisonText(
                  current.totals.difficulties[selected.key],
                  current.previous.difficulties[selected.key],
                  measure,
                )}
              </p>
            </>
          ) : null}
          <p className="m-0 text-muted-foreground">
            {historicalReportContext(timeFrame)}
          </p>
        </div>
      ) : null}
    </div>
  )
}
function CompareMarks({
  host,
  controls,
  selectedIndex,
  kind,
  options,
  onSelect,
  dismiss,
}: {
  host: HTMLDivElement | null
  controls: RefObject<Array<HTMLButtonElement | null>>
  selectedIndex: number
  kind: 'outcome' | 'time'
  options: PlotOptions
  onSelect: (index: number, keyboard: boolean, focus?: boolean) => void
  dismiss: () => void
}) {
  const plot = usePlotArea(),
    yScale = useYAxisScale()
  if (!plot || !yScale) return null
  const slot = plot.width / 3
  const current = options.view.cohorts[options.cohort]
  return (
    <>
      <g aria-hidden="true">
        {difficulties.map(({ key, label, shape, color }, index) => {
          const stats = current.totals.difficulties[key]
          const time = stats.time[options.timing]
          const value =
            kind === 'outcome'
              ? stats[options.measure]
              : timeValue(
                  time.medianSeconds,
                  key,
                  options.units,
                  options.view.timeTargetsMinutes,
                )
          const x = plot.x + slot * (index + 0.5)
          const y = value === null ? undefined : yScale(value)
          const baseline = yScale(0)
          const low = timeValue(
            time.q1Seconds,
            key,
            options.units,
            options.view.timeTargetsMinutes,
          )
          const high = timeValue(
            time.q3Seconds,
            key,
            options.units,
            options.view.timeTargetsMinutes,
          )
          const lowY = low === null ? undefined : yScale(low),
            highY = high === null ? undefined : yScale(high)
          return (
            <g
              key={key}
              data-testid={`problem-compare-${kind}-${key}`}
              data-value={value ?? 'unavailable'}
            >
              {kind === 'time' && options.units === 'minutes' ? (
                <line
                  x1={x - 28}
                  x2={x + 28}
                  y1={yScale(options.view.timeTargetsMinutes[key])}
                  y2={yScale(options.view.timeTargetsMinutes[key])}
                  stroke={color}
                  strokeDasharray="5 5"
                />
              ) : null}
              {y === undefined || baseline === undefined ? (
                <text
                  x={x}
                  y={plot.y + plot.height / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-muted-foreground)"
                >
                  Unavailable
                </text>
              ) : (
                <>
                  {kind === 'outcome' ? (
                    value === 0 ? (
                      <line
                        x1={x - 18}
                        x2={x + 18}
                        y1={baseline}
                        y2={baseline}
                        stroke={color}
                        strokeWidth={3}
                      />
                    ) : (
                      <rect
                        x={x - 18}
                        y={y}
                        width={36}
                        height={Math.max(0, baseline - y)}
                        rx={3}
                        fill={color}
                      />
                    )
                  ) : (
                    <>
                      {lowY !== undefined &&
                      highY !== undefined &&
                      time.timedAssessments >= 4 ? (
                        <g
                          data-testid={`problem-compare-time-${key}-quartiles`}
                          stroke={color}
                          strokeWidth={2}
                        >
                          <line x1={x} x2={x} y1={lowY} y2={highY} />
                          <line x1={x - 10} x2={x + 10} y1={lowY} y2={lowY} />
                          <line x1={x - 10} x2={x + 10} y1={highY} y2={highY} />
                        </g>
                      ) : null}
                      <Symbols
                        cx={x}
                        cy={y}
                        type={shape}
                        size={10}
                        sizeType="diameter"
                        fill="var(--color-card)"
                        stroke={color}
                        strokeWidth={shape === 'circle' ? 2.5 : 2}
                      />
                    </>
                  )}
                  {selectedIndex === index ? (
                    <circle
                      cx={x}
                      cy={y}
                      r={9}
                      fill="none"
                      stroke="var(--color-foreground)"
                      strokeWidth={1.5}
                    />
                  ) : null}
                  <text
                    x={x}
                    y={y - 10}
                    textAnchor="middle"
                    fontSize={12}
                    fill="var(--color-foreground)"
                  >
                    {kind === 'outcome'
                      ? outcomeText(value)
                      : timeText(value, options.units)}
                  </text>
                </>
              )}
              <title>{label}</title>
            </g>
          )
        })}
      </g>
      {host
        ? createPortal(
            difficulties.map(({ key, label }, index) => (
              <button
                type="button"
                key={key}
                aria-label={`Inspect ${label} ${kind} comparison`}
                className="absolute rounded border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                tabIndex={
                  index === (selectedIndex < 0 ? 0 : selectedIndex) ? 0 : -1
                }
                ref={(node) => {
                  controls.current[index] = node
                }}
                onFocus={() => onSelect(index, true)}
                onBlur={dismiss}
                onPointerMove={() => onSelect(index, false)}
                onPointerDown={(event) => {
                  event.currentTarget.focus({ preventScroll: true })
                  onSelect(index, false)
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType !== 'touch') dismiss()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    dismiss()
                    return
                  }
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? 2
                        : event.key === 'ArrowLeft'
                          ? Math.max(0, index - 1)
                          : event.key === 'ArrowRight'
                            ? Math.min(2, index + 1)
                            : index
                  if (
                    [
                      'Home',
                      'End',
                      'ArrowLeft',
                      'ArrowRight',
                      'Enter',
                      ' ',
                    ].includes(event.key)
                  ) {
                    event.preventDefault()
                    onSelect(next, true, true)
                  }
                }}
                style={{
                  left: plot.x + index * slot,
                  top: plot.y,
                  width: slot,
                  height: plot.height,
                  touchAction: 'pan-y',
                }}
              />
            )),
            host,
          )
        : null}
    </>
  )
}
function ProblemStats({
  stats,
  difficulty,
  kind,
  measure,
  units,
  timing,
  view,
  goal,
}: {
  stats: DifficultyStats
  difficulty: (typeof difficulties)[number]
  kind: 'outcome' | 'time'
  measure: OutcomeMeasure
  units: TimeUnits
  timing: TimingPopulation
  view: ProblemView
  goal: number
}) {
  const recorded = stats.time[timing]
  const value = (seconds: number | null) =>
    timeText(
      timeValue(seconds, difficulty.key, units, view.timeTargetsMinutes),
      units,
    )
  return (
    <div className="grid gap-0.5">
      <p className="m-0 font-semibold" style={{ color: difficulty.color }}>
        {difficulty.symbol} {difficulty.label}
      </p>
      <p className="m-0">
        {stats.recordedAssessments} recorded · {stats.validRatings} valid ·{' '}
        {stats.excludedInvalidRatings} invalid ratings excluded from outcomes
      </p>
      {kind === 'outcome' ? (
        <>
          <p className="m-0">
            {outcomeLabel(measure)}: {outcomeText(stats[measure])} (
            {outcomeNumerator(stats, measure)}/{stats.validRatings})
          </p>
          <p className="m-0">
            Again {stats.again} · Hard {stats.hard} · Good {stats.good} · Easy{' '}
            {stats.easy}
          </p>
          <p className="m-0">Chosen goal: {outcomeText(goal)}</p>
        </>
      ) : (
        <>
          <p className="m-0">
            Median: {value(recorded.medianSeconds)} ·{' '}
            {recorded.timedAssessments}/{recorded.eligibleAssessments} timed
          </p>
          <p className="m-0">
            Middle 50%: {value(recorded.q1Seconds)}–{value(recorded.q3Seconds)}
          </p>
          <p className="m-0">
            Current target:{' '}
            {timeText(
              units === 'minutes'
                ? view.timeTargetsMinutes[difficulty.key]
                : 100,
              units,
            )}
          </p>
        </>
      )}
    </div>
  )
}
function Empty({ message }: { message: string }) {
  return (
    <p className="m-0 grid min-h-48 place-items-center text-center text-sm text-muted-foreground">
      {message}
    </p>
  )
}
