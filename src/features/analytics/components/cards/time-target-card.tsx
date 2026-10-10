import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { buildTimeTargetPresentation } from '../../domain/time-target-presentation'
import {
  AnalyticsChartPanel,
  type AnalyticsCardGeometry,
} from '../analytics-chart-panel'
import { AnalyticsCardPager } from '../analytics-card-controls'
import { AnalyticsExactTable } from '../analytics-exact-table'
import type { HistoricalChartTimeFrame } from '../charts/historical-chart'
import {
  formatHistoricalBucket,
  historicalIntervalContext,
  historicalReportContext,
  trimHistoricalEmptyEdges,
} from '../charts/historical-chart-model'
import { ComparisonChart, ProblemTrendChart } from '../problem-solving-charts'
import {
  difficulties,
  mixDifficulties,
  timeText,
  timeValue,
} from '../problem-solving-model'
import type {
  ProblemCohort,
  ProblemView,
  TimeUnits,
  TimingPopulation,
} from '../problem-solving-model'

type Section = 'trend' | 'compare' | 'intervals' | 'settings' | 'method'
type ExactRow = { id: string; label: string; values: Record<string, ReactNode> }
const pageSizeFor = (geometry: AnalyticsCardGeometry) =>
  Math.min(geometry.tablePageSize, geometry.width >= 480 ? 2 : 1)
const numberText = (value: number) => String(Number(value.toFixed(2)))
const signed = (value: number) => `${value > 0 ? '+' : ''}${numberText(value)}`

export interface TimeTargetCardProps {
  view: ProblemView
  timeFrame?: HistoricalChartTimeFrame | undefined
}
export function TimeTargetCard({ view, timeFrame }: TimeTargetCardProps) {
  const [mode, setMode] = useState<'overview' | 'details'>('overview')
  const [cohort, setCohort] = useState<ProblemCohort>('newProblems')
  const [timing, setTiming] = useState<TimingPopulation>('all')
  const [units, setUnits] = useState<TimeUnits>('targetPercent')
  const [visible, setVisible] = useState({
    easy: true,
    medium: true,
    hard: true,
  })
  const [section, setSection] = useState<Section>('trend')
  const [exactDisplay, setExactDisplay] = useState<
    'intervals' | 'compare' | 'period'
  >('intervals')
  const [pagination, setPagination] = useState({ key: '', page: 0, method: 0 })
  const selected = view.cohorts[cohort]
  const presentation = buildTimeTargetPresentation(
    selected,
    view.timeTargetsMinutes,
    timing,
  )
  const shown = difficulties.filter(({ key }) => visible[key])
  const activityRows = trimHistoricalEmptyEdges(selected.rows, (row) =>
    difficulties.some(
      ({ key }) => row.difficulties[key].recordedAssessments > 0,
    ),
  )
  const resetKey = `${timeFrame?.asOf}:${timeFrame?.requestedDays}:${timeFrame?.timeZone}:${timeFrame?.grouping?.unit}:${timeFrame?.grouping?.step}:${cohort}:${timing}:${units}:${section}:${exactDisplay}:${shown.map(({ key }) => key).join(':')}`
  // The report can refresh while Overview has unmounted its exact table.
  if (pagination.key !== resetKey)
    setPagination({ key: resetKey, page: 0, method: 0 })
  const page = pagination.key === resetKey ? pagination.page : 0
  const setPage = (page: number) =>
    setPagination((current) => ({ ...current, key: resetKey, page }))
  const methodPage = pagination.key === resetKey ? pagination.method : 0
  const setMethodPage = (method: number) =>
    setPagination((current) => ({ ...current, key: resetKey, method }))
  const context = historicalReportContext(timeFrame)
  const plotOptions = {
    view,
    cohort,
    timing,
    units,
    measure: 'successRate' as const,
    goal: 0,
    timeFrame,
    resetKey,
  }
  const priorPeriod = view.previousPeriod
    ? `${view.previousPeriod.start}–${view.previousPeriod.asOf}`
    : 'No previous period for All time'
  const labels = [
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
    'Report as of',
    'Timezone',
    'Prior period',
    'Median seconds',
    'Q1 seconds',
    'Q3 seconds',
    'Percent of target',
    'Difference minutes',
    'Difference percent',
    'Prior timed / eligible',
    'Prior median seconds',
    'Prior Q1 seconds',
    'Prior Q3 seconds',
    'Prior recorded seconds',
    'Prior raw recorded',
    'Prior valid',
    'Prior invalid',
  ]
  const sourceRows =
    exactDisplay === 'intervals'
      ? selected.rows.flatMap((interval) =>
          mixDifficulties.map((difficulty) => ({
            id: `${interval.id}:${difficulty.key}`,
            difficulty,
            stats: interval.difficulties[difficulty.key],
            interval,
          })),
        )
      : mixDifficulties.map((difficulty) => ({
          id: difficulty.key,
          difficulty,
          stats: selected.totals.difficulties[difficulty.key],
          interval: null,
        }))
  const exactRows: ExactRow[] = sourceRows.map(
    ({ id, difficulty, stats, interval }) => {
      const key = difficulty.key,
        recorded = stats.time[timing],
        priorStats = selected.previous.difficulties[key],
        prior = priorStats.time[timing]
      const target = key === 'unknown' ? null : view.timeTargetsMinutes[key]
      const value = (seconds: number | null) =>
        key === 'unknown'
          ? seconds === null
            ? 'Unavailable'
            : `${seconds / 60} min (no target)`
          : timeText(
              timeValue(seconds, key, units, view.timeTargetsMinutes),
              units,
            )
      const ratio =
        target === null || recorded.medianSeconds === null
          ? null
          : (recorded.medianSeconds / (target * 60)) * 100
      return {
        id,
        label: `${interval ? formatHistoricalBucket(interval, timeFrame) + ' · ' : ''}${key === 'unknown' ? 'Unclassified' : difficulty.label}`,
        values: {
          'Raw recorded': stats.recordedAssessments,
          Valid: stats.validRatings,
          Invalid: stats.excludedInvalidRatings,
          'Timed / eligible': `${recorded.timedAssessments}/${recorded.eligibleAssessments}`,
          Median: value(recorded.medianSeconds),
          Q1: value(recorded.q1Seconds),
          Q3: value(recorded.q3Seconds),
          'Current target':
            target === null
              ? 'No target'
              : timeText(units === 'minutes' ? target : 100, units),
          'Recorded seconds': recorded.totalSeconds,
          Context: interval
            ? historicalIntervalContext(interval, timeFrame)
            : 'Selected period',
          'Report as of': timeFrame?.asOf ?? 'Unavailable',
          Timezone: timeFrame?.timeZone ?? 'Unavailable',
          'Prior period': priorPeriod,
          'Median seconds': recorded.medianSeconds ?? 'Unavailable',
          'Q1 seconds': recorded.q1Seconds ?? 'Unavailable',
          'Q3 seconds': recorded.q3Seconds ?? 'Unavailable',
          'Percent of target': ratio === null ? 'Unavailable' : `${ratio}%`,
          'Difference minutes':
            target === null || recorded.medianSeconds === null
              ? 'Unavailable'
              : recorded.medianSeconds / 60 - target,
          'Difference percent': ratio === null ? 'Unavailable' : ratio - 100,
          'Prior timed / eligible': view.previousPeriod
            ? `${prior.timedAssessments}/${prior.eligibleAssessments}`
            : 'Unavailable',
          'Prior median seconds': view.previousPeriod
            ? (prior.medianSeconds ?? 'Unavailable')
            : 'Unavailable',
          'Prior Q1 seconds': view.previousPeriod
            ? (prior.q1Seconds ?? 'Unavailable')
            : 'Unavailable',
          'Prior Q3 seconds': view.previousPeriod
            ? (prior.q3Seconds ?? 'Unavailable')
            : 'Unavailable',
          'Prior recorded seconds': view.previousPeriod
            ? prior.totalSeconds
            : 'Unavailable',
          'Prior raw recorded': view.previousPeriod
            ? priorStats.recordedAssessments
            : null,
          'Prior valid': view.previousPeriod ? priorStats.validRatings : null,
          'Prior invalid': view.previousPeriod
            ? priorStats.excludedInvalidRatings
            : null,
        },
      }
    },
  )
  const methodPages = [
    <div className="cp-time-target-method" key="recorded">
      <p>
        Recorded assessment time excludes paused time, can include running idle
        time, and cannot recover earlier unsaved work. Only finite positive
        saved seconds count as timed.
      </p>
      <p>
        Successful timing means valid Hard, Good or Easy ratings, rather than
        persisted correctness. Medians need one timed observation; middle 50%
        needs four. Isolate one difficulty in Trend to see quartiles.
      </p>
    </div>,
    <div className="cp-time-target-method" key="policy">
      <p>
        Current Settings allowances and current catalog difficulty are
        references, rather than historical policy snapshots or a speed score.
        Strict Timing can rate an accepted overtime solution Again.
      </p>
      <p>
        Unclassified contributes timing coverage and recorded seconds, but has
        no difficulty target. Missing time is unavailable, not zero. Coverage is
        summed across all classifications; separate difficulty medians are never
        averaged.
      </p>
    </div>,
    <div className="cp-time-target-method" key="cohort">
      <p>
        New problems uses the earliest retained raw assessment per problem
        before validity, period, difficulty or timing filters. Invalid first
        ratings do not promote later records. Follow-up practice contains every
        later raw assessment; hints, retries and earlier exposure are unknown.
      </p>
      <p>
        Trend retains the known-difficulty raw activity window and every
        internal gap, even for an untimed subset. Compare always shows all three
        known difficulties. {context}
      </p>
    </div>,
  ]
  return (
    <AnalyticsChartPanel
      compact
      className="cp-historical-view cp-historical-problem-solving"
      historical
      id="analytics-time-target"
      title="Time vs target"
      description="Median time by difficulty"
      mode={mode}
      headerAction={
        <Button
          className="cp-analytics-card-control"
          aria-label={mode === 'overview' ? 'Time Details' : 'Time Overview'}
          size="sm"
          variant="ghost"
          onClick={() => setMode(mode === 'overview' ? 'details' : 'overview')}
        >
          {mode === 'overview' ? 'Details' : 'Overview'}
        </Button>
      }
      hero={
        <div
          className="cp-time-target-hero"
          data-testid="time-coverage"
          aria-label="Timing coverage across all classifications"
        >
          <strong>{presentation.coverage.timedAssessments} timed</strong>
          <span>
            {presentation.coverage.eligibleAssessments} eligible ·{' '}
            {cohort === 'newProblems'
              ? 'first attempts'
              : 'follow-up assessments'}
          </span>
        </div>
      }
      footer={(geometry) =>
        mode === 'overview' ? (
          <>
            <span>
              {timing === 'all'
                ? 'All timed assessments'
                : 'Hard + Good + Easy timing'}
            </span>
            <Button
              className="cp-analytics-card-control"
              size="sm"
              variant="ghost"
              onClick={() => {
                setSection('settings')
                setMode('details')
              }}
            >
              Options
            </Button>
          </>
        ) : section === 'method' ? (
          <AnalyticsCardPager
            label="Time method pages"
            page={methodPage}
            pageSize={1}
            rowCount={methodPages.length}
            onPageChange={setMethodPage}
          />
        ) : section === 'intervals' ? (
          <AnalyticsCardPager
            label="Time rows"
            page={page}
            pageSize={pageSizeFor(geometry)}
            rowCount={exactRows.length}
            onPageChange={setPage}
          />
        ) : (
          <span>
            {presentation.coverage.timedAssessments}/
            {presentation.coverage.eligibleAssessments} timed · Unclassified{' '}
            {presentation.unclassified.timedAssessments}/
            {presentation.unclassified.eligibleAssessments}
          </span>
        )
      }
    >
      {(geometry) => (
        <div className="cp-time-target-content">
          {mode === 'overview' ? (
            <>
              <select
                className="cp-analytics-adapter-select"
                aria-label="Time population"
                value={cohort}
                onChange={(event) =>
                  setCohort(event.target.value as ProblemCohort)
                }
              >
                <option value="newProblems">New problems</option>
                <option value="followupPractice">Follow-up practice</option>
              </select>
              <div className="cp-time-target-bars">
                {presentation.rows.map((row) => {
                  const difficulty = difficulties.find(
                    ({ key }) => key === row.difficulty,
                  )!
                  const ratio = row.percentOfTarget
                  const maximum = presentation.percentDomain[1]
                  // Three rows share the shell's remaining Overview height.
                  const barHeight = geometry.bodyHeight < 240 ? 13 : 14
                  const status =
                    ratio === null
                      ? 'Unavailable'
                      : ratio < 100
                        ? 'Under target'
                        : ratio > 100
                          ? 'Over target'
                          : 'On target'
                  return (
                    <div
                      key={row.difficulty}
                      className="cp-time-target-bar-row"
                      data-testid={`time-target-${row.difficulty}`}
                    >
                      <p>
                        <strong>{difficulty.label}</strong> ·{' '}
                        {row.medianSeconds === null
                          ? 'Unavailable'
                          : `${numberText(row.medianSeconds / 60)} / ${numberText(row.targetMinutes)} min`}
                      </p>
                      <svg
                        aria-label={`${difficulty.label}: ${row.medianSeconds === null ? 'Unavailable' : `${row.medianSeconds / 60} min against ${row.targetMinutes} min; ${ratio}% of target; ${row.differenceMinutes} min difference; ${status}`}`}
                        role="img"
                        viewBox={`0 0 100 ${barHeight}`}
                        preserveAspectRatio="none"
                        width="100%"
                        height={barHeight}
                      >
                        <line
                          x1={(100 / maximum) * 100}
                          x2={(100 / maximum) * 100}
                          y1={0}
                          y2={barHeight}
                          stroke="var(--color-muted-foreground)"
                          strokeDasharray="2 2"
                        />
                        {ratio === null ? null : (
                          <>
                            <rect
                              data-testid={`time-target-${row.difficulty}-base`}
                              x={0}
                              y={1}
                              width={(Math.min(ratio, 100) / maximum) * 100}
                              height={barHeight - 2}
                              fill="var(--cp-analytics-first-success)"
                            />
                            {ratio > 100 ? (
                              <rect
                                data-testid={`time-target-${row.difficulty}-excess`}
                                x={(100 / maximum) * 100}
                                y={1}
                                width={((ratio - 100) / maximum) * 100}
                                height={barHeight - 2}
                                fill="var(--cp-analytics-attention)"
                              />
                            ) : null}
                          </>
                        )}
                      </svg>
                      <p>
                        {ratio === null
                          ? 'Unavailable'
                          : `${numberText(ratio)}% · ${signed(row.differenceMinutes!)} min · ${status}`}
                      </p>
                    </div>
                  )
                })}
              </div>
              <p className="cp-time-target-unclassified">
                Unclassified: {presentation.unclassified.timedAssessments}/
                {presentation.unclassified.eligibleAssessments} timed; no
                target.
              </p>
            </>
          ) : (
            <>
              <select
                className="cp-analytics-adapter-select"
                aria-label="Time detail section"
                value={section}
                onChange={(event) => {
                  setSection(event.target.value as Section)
                  setPage(0)
                  setMethodPage(0)
                }}
              >
                <option value="trend">Trend</option>
                <option value="compare">Compare</option>
                <option value="intervals">Intervals</option>
                <option value="settings">Settings</option>
                <option value="method">Method</option>
              </select>
              {section === 'trend' ? (
                <ProblemTrendChart
                  kind="time"
                  rows={activityRows}
                  shown={shown}
                  {...plotOptions}
                  compact={{
                    height: Math.max(0, geometry.bodyHeight - 40),
                    showGroupingLabel: false,
                  }}
                />
              ) : null}
              {section === 'compare' ? (
                <ComparisonChart
                  kind="time"
                  {...plotOptions}
                  compact={{
                    height: Math.max(0, geometry.bodyHeight - 40),
                    showGroupingLabel: false,
                  }}
                />
              ) : null}
              {section === 'intervals' ? (
                <>
                  <select
                    className="cp-analytics-adapter-select"
                    aria-label="Time exact population"
                    value={exactDisplay}
                    onChange={(event) => {
                      setExactDisplay(event.target.value as typeof exactDisplay)
                      setPage(0)
                    }}
                  >
                    <option value="intervals">
                      Intervals · all classifications
                    </option>
                    <option value="compare">
                      Compare · all classifications
                    </option>
                    <option value="period">Selected-period coverage</option>
                  </select>
                  <AnalyticsExactTable
                    label="Time Intervals exact values"
                    rows={exactRows}
                    rowKey={(row) => row.id}
                    rowLabel={(row) => row.label}
                    rowLabelHeading={
                      exactDisplay === 'intervals'
                        ? 'Interval · difficulty'
                        : 'Difficulty'
                    }
                    fields={labels.map((label) => ({
                      key: label,
                      label,
                      value: (row: ExactRow) => row.values[label],
                    }))}
                    width={geometry.width}
                    page={page}
                    pageSize={pageSizeFor(geometry)}
                    onPageChange={setPage}
                    resetKey={resetKey}
                  />
                </>
              ) : null}
              {section === 'settings' ? (
                <div className="cp-time-target-settings">
                  <label>
                    Population
                    <select
                      className="cp-analytics-adapter-select"
                      aria-label="Time population"
                      value={cohort}
                      onChange={(event) =>
                        setCohort(event.target.value as ProblemCohort)
                      }
                    >
                      <option value="newProblems">New problems</option>
                      <option value="followupPractice">
                        Follow-up practice
                      </option>
                    </select>
                  </label>
                  <label>
                    Timing population
                    <select
                      className="cp-analytics-adapter-select"
                      aria-label="Timing population"
                      value={timing}
                      onChange={(event) =>
                        setTiming(event.target.value as TimingPopulation)
                      }
                    >
                      <option value="all">All timed assessments</option>
                      <option value="successful">
                        Successful ratings only
                      </option>
                    </select>
                  </label>
                  <label>
                    Time units
                    <select
                      className="cp-analytics-adapter-select"
                      aria-label="Time units"
                      value={units}
                      onChange={(event) =>
                        setUnits(event.target.value as TimeUnits)
                      }
                    >
                      <option value="targetPercent">% of current target</option>
                      <option value="minutes">Minutes</option>
                    </select>
                  </label>
                  <div
                    className="cp-time-target-difficulties"
                    role="group"
                    aria-label="Time Trend difficulties"
                  >
                    {difficulties.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={visible[key]}
                        onClick={() =>
                          setVisible((current) => ({
                            ...current,
                            [key]: !current[key],
                          }))
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p>
                    Visibility changes Trend only. Compare retains all three
                    groups; units and subset retain their full fitted scales.
                  </p>
                </div>
              ) : null}
              {section === 'method' ? methodPages[methodPage] : null}
            </>
          )}
        </div>
      )}
    </AnalyticsChartPanel>
  )
}
