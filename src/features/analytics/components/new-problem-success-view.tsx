import { useState } from 'react'
import type { ReactNode } from 'react'

import { ChartTable } from '@/components/ui/chart-table'
import type { AnalyticsTargets } from '@/features/settings/domain'

import { AnalyticsTargetEditor } from './analytics-target-editor'
import { formatCount } from './charts/chart-shared'
import type { HistoricalChartTimeFrame } from './charts/historical-chart'
import {
  formatHistoricalBucket,
  historicalIntervalContext,
  historicalReportContext,
  trimHistoricalEmptyEdges,
} from './charts/historical-chart-model'
import { HistoricalTable } from './charts/historical-table'
import {
  ComparisonChart,
  DifficultyMixChart,
  ProblemTrendChart,
} from './problem-solving-charts'
import {
  comparisonText,
  difficulties,
  mixDifficulties,
  mixShares,
  outcomeLabel,
  outcomeNumerator,
  outcomeText,
  problemGoal,
  timeText,
  timeValue,
} from './problem-solving-model'
import type {
  DifficultyStats,
  OutcomeMeasure,
  ProblemCohort,
  ProblemRow,
  ProblemView,
  TimeUnits,
  TimingPopulation,
} from './problem-solving-model'

interface ProblemTableRow {
  id: string
  difficulty: (typeof difficulties)[number]
  stats: DifficultyStats
  interval: ProblemRow | null
  previous: DifficultyStats | null
}

export function NewProblemSuccessView({
  view,
  timeFrame,
  onSaveTarget,
}: {
  view: ProblemView
  timeFrame?: HistoricalChartTimeFrame | undefined
  onSaveTarget?:
    | ((patch: Partial<AnalyticsTargets>) => Promise<unknown>)
    | undefined
}) {
  const [cohort, setCohort] = useState<ProblemCohort>('newProblems')
  const [mode, setMode] = useState<'trend' | 'compare'>('trend')
  const [measure, setMeasure] = useState<OutcomeMeasure>('successRate')
  const [visible, setVisible] = useState({
    easy: true,
    medium: true,
    hard: true,
  })
  const [units, setUnits] = useState<TimeUnits>('targetPercent')
  const [timing, setTiming] = useState<TimingPopulation>('all')
  const [mixMeasure, setMixMeasure] = useState<'assessments' | 'time'>(
    'assessments',
  )
  const selected = view.cohorts[cohort]
  const shown = difficulties.filter(({ key }) => visible[key])
  const rows = trimHistoricalEmptyEdges(selected.rows, (row) =>
    difficulties.some(
      ({ key }) => row.difficulties[key].recordedAssessments > 0,
    ),
  )
  const mixRows = trimHistoricalEmptyEdges(selected.rows, (row) =>
    mixDifficulties.some(
      ({ key }) => row.difficulties[key].recordedAssessments > 0,
    ),
  )
  const goal = problemGoal(view, cohort, measure)
  const resetKey = `${cohort}:${mode}:${measure}:${units}:${timing}:${shown.map(({ key }) => key).join(':')}`
  const totals = selected.totals
  const trendRows = rows.flatMap((row) =>
    shown.map((difficulty) => ({
      id: `${row.id}:${difficulty.key}`,
      difficulty,
      stats: row.difficulties[difficulty.key],
      interval: row,
      previous: null,
    })),
  )
  const compareRows = difficulties.map((difficulty) => ({
    id: difficulty.key,
    difficulty,
    stats: totals.difficulties[difficulty.key],
    interval: null,
    previous: selected.previous.difficulties[difficulty.key],
  }))
  const tableRows: ProblemTableRow[] =
    mode === 'trend' ? trendRows : compareRows
  const period = formatPriorPeriod(view, timeFrame)
  const timeAxis =
    units === 'minutes'
      ? 'Recorded assessment time (min)'
      : 'Recorded assessment time (% of current target)'
  return (
    <div className="cp-historical-view cp-historical-problem-solving grid min-w-0 gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Choice
          label="Assessment population"
          value={cohort}
          onChange={setCohort}
          options={[
            ['newProblems', 'New problems'],
            ['followupPractice', 'Follow-up practice'],
          ]}
        />
        <Choice
          label="View"
          value={mode}
          onChange={setMode}
          options={[
            ['trend', 'Trend'],
            ['compare', 'Compare'],
          ]}
        />
      </div>
      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        Selected population: {formatCount(totals.assessmentDays)} assessment
        days · {formatCount(totals.recordedAssessments)} assessments ·{' '}
        {formatCount(totals.distinctProblems)} distinct problems · Good + Easy{' '}
        {formatCount(totals.goodEasy)}/{formatCount(totals.validRatings)} valid
        ({outcomeText(totals.goodEasyRate)}) ·{' '}
        {formatCount(totals.excludedInvalidRatings)} invalid ratings excluded
        from outcomes.
      </p>
      {cohort === 'followupPractice' ? (
        <p className="m-0 text-xs text-muted-foreground">
          Later raw assessments can differ from FSRS-paired Recall. Recall and
          Review Success goals are rating aspirations for this population.
        </p>
      ) : null}
      {mode === 'trend' ? (
        <div
          aria-label="Trend difficulties"
          className="flex flex-wrap gap-2"
          role="group"
        >
          {difficulties.map(({ key, label, color, symbol }) => (
            <button
              aria-pressed={visible[key]}
              className={`rounded border px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${visible[key] ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30 opacity-45'}`}
              key={key}
              onClick={() =>
                setVisible((current) => ({ ...current, [key]: !current[key] }))
              }
              type="button"
            >
              <span aria-hidden="true" style={{ color }}>
                {symbol}
              </span>{' '}
              {label}
            </button>
          ))}
          <span className="self-center text-xs text-muted-foreground">
            Shared by both Trend plots
          </span>
        </div>
      ) : (
        <p className="m-0 text-xs text-muted-foreground">
          Compare shows all three difficulties. Previous period:{' '}
          {formatPriorPeriod(view, timeFrame)}. Sparse comparison means fewer
          than 10 valid ratings in either period.
        </p>
      )}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Plot
          title="Success by Difficulty"
          paired
          controls={
            <div className="grid min-w-0 justify-items-end gap-2">
              {onSaveTarget ? (
                <AnalyticsTargetEditor
                  key={goal.metric}
                  metric={goal.metric}
                  onSave={onSaveTarget}
                  targets={view.targets}
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {goal.label} {outcomeText(goal.value)}
                </span>
              )}
              <Choice
                label="Outcome measure"
                value={measure}
                onChange={setMeasure}
                options={[
                  ['successRate', 'Hard + Good + Easy'],
                  ['goodEasyRate', 'Good + Easy'],
                ]}
              />
            </div>
          }
        >
          <ChartTable
            chart={
              mode === 'trend' ? (
                <ProblemTrendChart
                  kind="outcome"
                  rows={rows}
                  shown={shown}
                  view={view}
                  cohort={cohort}
                  measure={measure}
                  units={units}
                  timing={timing}
                  goal={goal.value}
                  timeFrame={timeFrame}
                  resetKey={resetKey}
                />
              ) : (
                <ComparisonChart
                  kind="outcome"
                  view={view}
                  cohort={cohort}
                  measure={measure}
                  units={units}
                  timing={timing}
                  goal={goal.value}
                  timeFrame={timeFrame}
                  resetKey={resetKey}
                />
              )
            }
            table={
              <HistoricalTable
                caption="Success by Difficulty exact values"
                headers={
                  mode === 'trend'
                    ? [
                        'Interval · difficulty',
                        'Recorded',
                        'Valid',
                        'Invalid excluded',
                        outcomeLabel(measure),
                        'Numerator / valid',
                        goal.label,
                        'Context',
                      ]
                    : [
                        'Difficulty',
                        'Recorded',
                        'Valid',
                        'Invalid excluded',
                        outcomeLabel(measure),
                        'Numerator / valid',
                        goal.label,
                        'Prior rate',
                        'Prior valid',
                        'Change',
                        'Prior period',
                      ]
                }
                rows={tableRows}
                resetKey={resetKey}
                cells={(row) => [
                  row.interval
                    ? `${formatHistoricalBucket(row.interval, timeFrame)} · ${row.difficulty.label}`
                    : row.difficulty.label,
                  row.stats.recordedAssessments,
                  row.stats.validRatings,
                  row.stats.excludedInvalidRatings,
                  outcomeText(row.stats[measure]),
                  `${outcomeNumerator(row.stats, measure)}/${row.stats.validRatings}`,
                  outcomeText(goal.value),
                  ...(row.previous
                    ? [
                        outcomeText(row.previous[measure]),
                        row.previous.validRatings,
                        comparisonText(row.stats, row.previous, measure),
                        period,
                      ]
                    : [
                        row.interval
                          ? historicalIntervalContext(row.interval, timeFrame)
                          : 'Selected period',
                      ]),
                ]}
              />
            }
          />
        </Plot>
        <Plot
          title="Recorded Time by Difficulty"
          paired
          controls={
            <div className="grid min-w-0 justify-items-end gap-2">
              <Choice
                label="Time units"
                value={units}
                onChange={setUnits}
                options={[
                  ['targetPercent', '% of current target'],
                  ['minutes', 'Minutes'],
                ]}
              />
              <Choice
                label="Timing population"
                value={timing}
                onChange={setTiming}
                options={[
                  ['all', 'All timed assessments'],
                  ['successful', 'Successful ratings only'],
                ]}
                select
              />
              <span className="text-xs text-muted-foreground">
                {units === 'targetPercent'
                  ? '100% = current difficulty target'
                  : difficulties
                      .map(
                        ({ key, label }) =>
                          `${label} ${view.timeTargetsMinutes[key]} min`,
                      )
                      .join(' · ')}
              </span>
            </div>
          }
        >
          <ChartTable
            chart={
              mode === 'trend' ? (
                <ProblemTrendChart
                  kind="time"
                  rows={rows}
                  shown={shown}
                  view={view}
                  cohort={cohort}
                  measure={measure}
                  units={units}
                  timing={timing}
                  goal={goal.value}
                  timeFrame={timeFrame}
                  resetKey={resetKey}
                />
              ) : (
                <ComparisonChart
                  kind="time"
                  view={view}
                  cohort={cohort}
                  measure={measure}
                  units={units}
                  timing={timing}
                  goal={goal.value}
                  timeFrame={timeFrame}
                  resetKey={resetKey}
                />
              )
            }
            table={
              <HistoricalTable
                caption="Recorded Time by Difficulty exact values"
                headers={[
                  'Interval · difficulty',
                  'Raw recorded',
                  'Valid',
                  'Invalid',
                  'Timed / eligible',
                  'Median',
                  'Q1',
                  'Q3',
                  'Current target',
                  'Recorded seconds',
                  'Context',
                ]}
                rows={tableRows}
                resetKey={resetKey}
                cells={(row) => {
                  const key = row.difficulty.key
                  const stats = row.stats.time[timing]
                  const value = (seconds: number | null) =>
                    timeText(
                      timeValue(seconds, key, units, view.timeTargetsMinutes),
                      units,
                    )
                  return [
                    row.interval
                      ? `${formatHistoricalBucket(row.interval, timeFrame)} · ${row.difficulty.label}`
                      : row.difficulty.label,
                    row.stats.recordedAssessments,
                    row.stats.validRatings,
                    row.stats.excludedInvalidRatings,
                    `${stats.timedAssessments}/${stats.eligibleAssessments}`,
                    value(stats.medianSeconds),
                    value(stats.q1Seconds),
                    value(stats.q3Seconds),
                    timeText(
                      units === 'minutes' ? view.timeTargetsMinutes[key] : 100,
                      units,
                    ),
                    stats.totalSeconds,
                    row.interval
                      ? historicalIntervalContext(row.interval, timeFrame)
                      : 'Selected period',
                  ]
                }}
              />
            }
          />
          <p className="m-0 text-xs text-muted-foreground">
            {timeAxis}. Median with 1–3 timed observations; middle 50% requires
            at least 4. Isolate one difficulty in Trend to see its quartiles.
          </p>
        </Plot>
      </div>
      <Plot
        title="Difficulty Mix"
        controls={
          <Choice
            label="Difficulty Mix measure"
            value={mixMeasure}
            onChange={setMixMeasure}
            options={[
              ['assessments', 'Assessment share'],
              ['time', 'Recorded-time share'],
            ]}
          />
        }
      >
        <div
          aria-label="Difficulty Mix legend"
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
        >
          {mixDifficulties.map(({ key, color, label, symbol }) => (
            <span key={key}>
              <span aria-hidden="true" style={{ color }}>
                {symbol}
              </span>{' '}
              {label}
            </span>
          ))}
        </div>
        <ChartTable
          chart={
            <DifficultyMixChart
              rows={mixRows}
              measure={mixMeasure}
              timeFrame={timeFrame}
              resetKey={`${cohort}:${mixMeasure}`}
            />
          }
          table={
            <HistoricalTable
              caption="Difficulty Mix exact values"
              headers={[
                'Interval · difficulty',
                'Assessments',
                'Recorded seconds',
                'Share',
                'Context',
              ]}
              resetKey={`${cohort}:${mixMeasure}`}
              rows={mixRows.flatMap((row) =>
                mixDifficulties.map((difficulty, index) => ({
                  ...row,
                  id: `${row.id}:${difficulty.key}`,
                  difficulty,
                  share: mixShares(row, mixMeasure)[index] ?? null,
                })),
              )}
              cells={(row) => [
                `${formatHistoricalBucket(row, timeFrame)} · ${row.difficulty.label}`,
                row.difficulties[row.difficulty.key].recordedAssessments,
                row.difficulties[row.difficulty.key].time.all.totalSeconds,
                outcomeText(row.share),
                historicalIntervalContext(row, timeFrame),
              ]}
            />
          }
        />
      </Plot>
      <p className="m-0 text-xs text-muted-foreground">
        The paired plots include Easy, Medium and Hard only; Unknown remains in
        the summary and Difficulty Mix. {historicalReportContext(timeFrame)}
      </p>
      <details className="text-xs leading-relaxed text-muted-foreground">
        <summary>Calculation details</summary>
        <p>
          New problems selects the first recorded assessment in retained history
          per problem across cards and modes, before rating, period, difficulty
          or time filters. Follow-up practice contains every later raw
          assessment. Invalid earliest ratings are excluded from outcomes
          without promoting a later record. Hints, retries and prior exposure
          are unknown.
        </p>
        <p>
          {outcomeLabel(measure)} divides by all valid ratings, including Again.
          Current catalog difficulty classifies historical assessments. Unknown
          is included in Mix and excluded from the three outcome and time
          series. Mix counts all raw assessments, including invalid ratings;
          recorded-time share uses positive saved durations.
        </p>
        <p>
          Recorded assessment time excludes paused time, can include running
          idle time, and cannot recover earlier unsaved work. Only positive
          finite saved durations count. Successful timing requires Hard, Good or
          Easy. Current time targets are references, not historical timing
          compliance or a speed score; Strict Timing can turn an accepted
          overtime solution into Again. Period rates use summed counts.
          Long-dash bridges cross missing evidence without creating
          observations.
        </p>
      </details>
    </div>
  )
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  select = false,
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
  select?: boolean
}) {
  return select ? (
    <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="h-9 max-w-full rounded border border-border bg-card px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => onChange(event.target.value as T)}
        value={value}
      >
        {options.map(([key, title]) => (
          <option key={key} value={key}>
            {title}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <div
      aria-label={label}
      role="group"
      className="inline-flex max-w-full flex-wrap rounded border border-border bg-muted/30 p-0.5"
    >
      {options.map(([key, title]) => (
        <button
          type="button"
          key={key}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`rounded px-2.5 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {title}
        </button>
      ))}
    </div>
  )
}
function Plot({
  title,
  controls,
  children,
  paired = false,
}: {
  title: string
  controls: ReactNode
  children: ReactNode
  paired?: boolean
}) {
  return (
    <section
      aria-label={title}
      className="relative grid min-w-0 content-start gap-3 rounded border border-border p-3"
    >
      <div
        className={
          paired
            ? 'grid min-w-0 content-start gap-2 lg:min-h-32'
            : 'flex min-w-0 flex-wrap items-start justify-between gap-2'
        }
      >
        <h3 className="m-0 text-sm font-semibold">{title}</h3>
        {controls}
      </div>
      {children}
    </section>
  )
}
function formatPriorPeriod(
  view: ProblemView,
  timeFrame?: HistoricalChartTimeFrame,
) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: timeFrame?.timeZone ?? 'UTC',
  })
  return `${formatter.format(new Date(view.previousPeriod.start))}–${formatter.format(new Date(view.previousPeriod.asOf))}`
}
