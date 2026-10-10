import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AnalyticsTargets } from '@/features/settings'
import type {
  AnalyticsTimeFrame,
  AnalyticsViews,
} from '../../api/analytics-contracts'
import { aggregatePerformance } from '../../domain/performance-presentation'
import { getAnalyticsDateKey } from '../../domain/analytics-time'
import {
  AnalyticsCardPager,
  clampAnalyticsPage,
} from '../analytics-card-controls'
import {
  AnalyticsChartPanel,
  type AnalyticsCardGeometry,
} from '../analytics-chart-panel'
import { AnalyticsExactTable } from '../analytics-exact-table'
import { AnalyticsTargetEditor } from '../analytics-target-editor'
import { historicalReportContext } from '../charts/historical-chart-model'
export interface TopicsCardProps {
  view: AnalyticsViews['topicPerformance']
  timeFrame: AnalyticsTimeFrame
  targets: AnalyticsTargets
  onSaveTarget?:
    | ((patch: Partial<AnalyticsTargets>) => Promise<unknown>)
    | undefined
}
type Section = 'scores' | 'ratings' | 'evidence' | 'method'
type Topic = AnalyticsViews['topicPerformance']['rows'][number]
type ExactRow = {
  id: string
  label: string
  values: Record<string, string | number>
}
const difficulties = ['easy', 'medium', 'hard', 'unknown'] as const
const ratings = ['again', 'hard', 'good', 'easy'] as const
const capitalize = (value: string) => value[0]!.toUpperCase() + value.slice(1)
const percent = (value: number) => `${value * 100}%`
function overviewSize(geometry: AnalyticsCardGeometry, rows: Topic[]) {
  const chars = Math.max(14, Math.floor((geometry.width - 54) / 7))
  const lines = Math.max(
    1,
    ...rows.map((row) => Math.ceil(row.topic.length / chars)),
  )
  return Math.max(
    1,
    Math.min(
      geometry.problemPageSize,
      Math.floor((geometry.bodyHeight - 26) / (lines * 18 + 38)),
    ),
  )
}
export function TopicsCard({
  view,
  timeFrame,
  targets,
  onSaveTarget,
}: TopicsCardProps) {
  const [mode, setMode] = useState<'overview' | 'details' | 'goals'>('overview')
  const [section, setSection] = useState<Section>('scores')
  const key = JSON.stringify([
    timeFrame.asOf,
    timeFrame.timeZone,
    timeFrame.timeZoneFallback,
    timeFrame.requestedDays,
    timeFrame.periodStart,
    timeFrame.periodEnd,
    timeFrame.grouping,
    timeFrame.history,
    view.rows.map((row) => row.id),
    view.lowEvidenceTopics.map((row) => row.topic),
  ])
  const [pagination, setPagination] = useState({
    key,
    rows: 0,
    overview: 0,
    method: 0,
  })
  if (pagination.key !== key)
    setPagination({ key, rows: 0, overview: 0, method: 0 })
  const pages =
    pagination.key === key
      ? pagination
      : { key, rows: 0, overview: 0, method: 0 }
  const setPage = (field: 'rows' | 'overview' | 'method', page: number) =>
    setPagination((current) => ({ ...current, key, [field]: page }))
  const [inspection, setInspection] = useState({
    key,
    index: 0,
    visible: false,
    pinned: false,
    announce: false,
  })
  if (inspection.key !== key)
    setInspection({
      key,
      index: 0,
      visible: false,
      pinned: false,
      announce: false,
    })
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const headerRef = useRef<HTMLButtonElement>(null)
  const goalRef = useRef<HTMLButtonElement>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const [inspectionPage, setInspectionPage] = useState(0)
  const tooltipId = useId()
  const selected = view.rows[Math.min(inspection.index, view.rows.length - 1)]
  const period = `${timeFrame.buckets[0]?.startKey ?? getAnalyticsDateKey(new Date(timeFrame.periodStart), timeFrame.timeZone)} through ${timeFrame.buckets.at(-1)?.endKey ?? getAnalyticsDateKey(new Date(timeFrame.asOf), timeFrame.timeZone)}`
  const context = `${historicalReportContext(timeFrame)} · Selected period ${period} · As of ${timeFrame.asOf} · Timezone ${timeFrame.timeZone}${timeFrame.timeZoneFallback ? ' (fallback)' : ''}`
  useEffect(() => {
    if (!inspection.visible) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        setInspection((current) => ({
          ...current,
          visible: false,
          pinned: false,
        }))
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [inspection.visible])
  const select = (
    index: number,
    size: number,
    keyboard = false,
    pinned = false,
  ) => {
    const next = Math.max(0, Math.min(index, view.rows.length - 1))
    setPage('overview', Math.floor(next / size))
    if (next !== inspection.index || !inspection.visible) setInspectionPage(0)
    setInspection({
      key,
      index: next,
      visible: true,
      pinned: pinned || keyboard,
      announce: keyboard,
    })
    if (keyboard)
      requestAnimationFrame(() =>
        refs.current.get(view.rows[next]!.id)?.focus(),
      )
  }
  const closeInspection = () =>
    setInspection((current) => ({
      ...current,
      visible: false,
      pinned: false,
      announce: false,
    }))
  const goalStatus = (row: Topic) =>
    row.reviewSuccess < targets.targetReviewSuccess
      ? 'Below target'
      : 'At or above target'
  const methodPages = [
    <div key="rubric" className="cp-topics-copy">
      <p>
        All assessments use the shared weighted rubric: Again 0, Hard 50, Good
        80, Easy 100 points. Difficulty influence is Easy 1, Medium 2, Hard 3,
        Unknown 1.
      </p>
      <p>
        Weighted score = weighted points / weighted units, on a fixed 0–100
        axis. Valid ratings count raw evidence, not weighted units.
      </p>
    </div>,
    <div key="membership" className="cp-topics-copy">
      <p>
        Current direct catalog topic assignments apply to retained
        selected-period history. Memberships can overlap, without ancestor
        rollups.
      </p>
      <p>
        A topic is not an additive contribution to the page score. At least 10
        valid ratings across 3 distinct valid-reviewed problems qualify. Low
        evidence is listed separately.
      </p>
    </div>,
    <div key="ranking" className="cp-topics-copy">
      <p>
        Every qualifying topic remains in source order: unrounded weighted score
        ascending, valid count descending, then normalized name.
      </p>
      <p>
        The Review Success goal applies only to the raw Good + Easy percentage
        in Ratings. It changes no weighted score or observations.
      </p>
    </div>,
    <div key="context" className="cp-topics-copy">
      <p>{context}</p>
      <p>
        Evidence includes the alphabetical first five low-evidence topics and
        the exact additional count. Their scores are not promoted into the
        qualifying rank.
      </p>
    </div>,
  ]
  const rows: ExactRow[] =
    section === 'evidence'
      ? view.lowEvidenceTopics.map((row, index) => ({
          id: `low-${index}`,
          label: row.topic,
          values: {
            'Valid ratings': row.validRatings,
            'Distinct problems': row.distinctProblems,
            Evidence: 'Below qualifying evidence gate',
            'Required valid ratings': 10,
            'Required distinct problems': 3,
            'Additional low-evidence topics': view.additionalLowEvidenceTopics,
            'Qualifying topics': view.rows.length,
            'Stronger qualifying topics': view.strongerQualifyingTopics,
            'Selected period': period,
            'Report as of': timeFrame.asOf,
            Timezone: timeFrame.timeZone,
            'Timezone fallback': String(timeFrame.timeZoneFallback),
            'Period start': timeFrame.periodStart,
            'Period end (exclusive)': timeFrame.periodEnd,
            'Requested range':
              timeFrame.requestedDays === null
                ? 'All time'
                : `${timeFrame.requestedDays} days`,
            Grouping: timeFrame.grouping
              ? `${timeFrame.grouping.step} ${timeFrame.grouping.unit}`
              : 'Unavailable',
          },
        }))
      : view.rows.map((row) => {
          const stats = aggregatePerformance(row.ratingCountsByDifficulty)
          return {
            id: row.id,
            label: row.topic,
            values:
              section === 'ratings'
                ? {
                    'Review Success': percent(row.reviewSuccess),
                    'Goal status': goalStatus(row),
                    'Good + Easy': row.goodEasy,
                    'Valid ratings': row.validRatings,
                    'Distinct problems': row.distinctProblems,
                    Evidence: row.evidence,
                    'Target Review Success': percent(
                      targets.targetReviewSuccess,
                    ),
                    'Selected period': period,
                    'Report as of': timeFrame.asOf,
                    Timezone: timeFrame.timeZone,
                    'Timezone fallback': String(timeFrame.timeZoneFallback),
                    'Period start': timeFrame.periodStart,
                    'Period end (exclusive)': timeFrame.periodEnd,
                    'Requested range':
                      timeFrame.requestedDays === null
                        ? 'All time'
                        : `${timeFrame.requestedDays} days`,
                    Grouping: timeFrame.grouping
                      ? `${timeFrame.grouping.step} ${timeFrame.grouping.unit}`
                      : 'Unavailable',
                    ...Object.fromEntries(
                      difficulties.flatMap((d) =>
                        ratings.map((r) => [
                          `${capitalize(d)} difficulty · ${capitalize(r)}`,
                          row.ratingCountsByDifficulty[d][r],
                        ]),
                      ),
                    ),
                    'Raw Review Success': row.reviewSuccess,
                    'Raw target Review Success': targets.targetReviewSuccess,
                  }
                : {
                    'Weighted score':
                      stats.score === null
                        ? 'Unavailable'
                        : `${stats.score} /100`,
                    'Weighted points': stats.weightedPoints,
                    'Weighted units': stats.weightedUnits,
                    'Valid ratings': row.validRatings,
                    'Distinct problems': row.distinctProblems,
                    'Unclassified ratings': stats.unclassifiedRatings,
                    Evidence: row.evidence,
                    'Selected period': period,
                    'Report as of': timeFrame.asOf,
                    Timezone: timeFrame.timeZone,
                    'Timezone fallback': String(timeFrame.timeZoneFallback),
                    'Period start': timeFrame.periodStart,
                    'Period end (exclusive)': timeFrame.periodEnd,
                    'Requested range':
                      timeFrame.requestedDays === null
                        ? 'All time'
                        : `${timeFrame.requestedDays} days`,
                    Grouping: timeFrame.grouping
                      ? `${timeFrame.grouping.step} ${timeFrame.grouping.unit}`
                      : 'Unavailable',
                  },
          }
        })
  const label = `Topics ${capitalize(section)} exact values`
  const fields = Object.keys(rows[0]?.values ?? {}).map((key) => ({
    key,
    label: key,
    value: (row: ExactRow) => row.values[key],
  }))
  const changeMode = () => {
    closeInspection()
    setMode(mode === 'overview' ? 'details' : 'overview')
  }
  return (
    <div
      className="cp-topics-card-scope"
      style={{ minWidth: 0 }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          closeInspection()
      }}
    >
      <AnalyticsChartPanel
        compact
        historical
        className="cp-topics-card"
        id="analytics-topics"
        title="Topic performance"
        description="Weighted scores across all assessments"
        mode={mode}
        headerAction={
          <Button
            ref={headerRef}
            className="cp-analytics-card-control"
            size="sm"
            variant="ghost"
            aria-label={
              mode === 'overview' ? 'Topics Details' : 'Topics Overview'
            }
            onClick={changeMode}
          >
            {mode === 'overview' ? 'Details' : 'Overview'}
          </Button>
        }
        hero={
          <div className="cp-topics-hero">
            <strong>{view.rows.length} qualifying topics</strong>
            <span>Weakest to strongest · full direct memberships</span>
          </div>
        }
        footer={(geometry) =>
          mode === 'overview' && inspection.visible ? (
            <AnalyticsCardPager
              key="inspection"
              label="Topics inspection pages"
              page={inspectionPage}
              pageSize={1}
              rowCount={3}
              onPageChange={setInspectionPage}
            />
          ) : mode === 'overview' ? (
            <AnalyticsCardPager
              key="overview"
              label="Topics overview"
              page={pages.overview}
              pageSize={overviewSize(geometry, view.rows)}
              rowCount={view.rows.length}
              onPageChange={(page) => {
                setPage('overview', page)
                closeInspection()
              }}
            />
          ) : mode === 'goals' ? (
            <span>Goal applies to raw Review Success.</span>
          ) : (
            <AnalyticsCardPager
              label={
                section === 'method' ? 'Topics method pages' : 'Topics rows'
              }
              page={section === 'method' ? pages.method : pages.rows}
              pageSize={1}
              rowCount={section === 'method' ? methodPages.length : rows.length}
              onPageChange={(page) =>
                setPage(section === 'method' ? 'method' : 'rows', page)
              }
            />
          )
        }
      >
        {(geometry) => {
          const size = overviewSize(geometry, view.rows),
            start =
              clampAnalyticsPage(pages.overview, view.rows.length, size) * size
          return (
            <div className="cp-topics-content">
              {mode === 'overview' ? (
                <>
                  {view.rows.length ? (
                    <div
                      className="cp-topics-plot"
                      aria-label="Weighted topics, fixed 0 to 100 points"
                    >
                      <div className="cp-topics-axis">
                        <span>0</span>
                        <span>50</span>
                        <span>100 points</span>
                      </div>
                      {view.rows
                        .slice(start, start + size)
                        .map((row, offset) => {
                          const index = start + offset,
                            stats = aggregatePerformance(
                              row.ratingCountsByDifficulty,
                            )
                          return (
                            <button
                              key={row.id}
                              ref={(element) => {
                                if (element) refs.current.set(row.id, element)
                                else refs.current.delete(row.id)
                              }}
                              type="button"
                              className="cp-topic-mark"
                              aria-label={`Inspect topic ${row.topic}`}
                              aria-describedby={
                                inspection.visible && inspection.index === index
                                  ? tooltipId
                                  : undefined
                              }
                              tabIndex={
                                inspection.index >= start &&
                                inspection.index < start + size
                                  ? index === inspection.index
                                    ? 0
                                    : -1
                                  : offset === 0
                                    ? 0
                                    : -1
                              }
                              onFocus={() => select(index, size, true)}
                              onBlur={(event) => {
                                if (
                                  !event.relatedTarget ||
                                  !(
                                    event.relatedTarget instanceof HTMLElement
                                  ) ||
                                  !event.currentTarget
                                    .closest('.cp-topics-card')
                                    ?.contains(event.relatedTarget)
                                )
                                  closeInspection()
                              }}
                              onPointerMove={() => {
                                if (!inspection.pinned) select(index, size)
                              }}
                              onPointerDown={(event) => {
                                event.currentTarget.focus()
                                select(index, size, false, true)
                              }}
                              onPointerLeave={() => {
                                if (!inspection.pinned) closeInspection()
                              }}
                              onKeyDown={(event) => {
                                if (
                                  ![
                                    'ArrowLeft',
                                    'ArrowRight',
                                    'Home',
                                    'End',
                                    'Enter',
                                    ' ',
                                    'Escape',
                                  ].includes(event.key)
                                )
                                  return
                                event.preventDefault()
                                if (event.key === 'Escape') {
                                  closeInspection()
                                  return
                                }
                                select(
                                  event.key === 'Home'
                                    ? 0
                                    : event.key === 'End'
                                      ? view.rows.length - 1
                                      : index +
                                        (event.key === 'ArrowLeft'
                                          ? -1
                                          : event.key === 'ArrowRight'
                                            ? 1
                                            : 0),
                                  size,
                                  true,
                                )
                              }}
                            >
                              <span className="cp-topic-name">{row.topic}</span>
                              <span className="cp-topic-bar-row">
                                <span className="cp-topic-track">
                                  <span
                                    className="cp-topic-bar"
                                    data-weighted-score={stats.score}
                                    style={{ width: `${stats.score ?? 0}%` }}
                                  />
                                </span>
                                <span>
                                  {stats.score?.toFixed(1) ?? '—'} /100
                                </span>
                              </span>
                            </button>
                          )
                        })}
                    </div>
                  ) : (
                    <p>
                      No topics meet the 10-rating / 3-problem evidence gate.
                    </p>
                  )}
                  {inspection.visible && selected ? (
                    <div
                      id={tooltipId}
                      role="tooltip"
                      className="cp-topic-tooltip"
                    >
                      {inspectionPage === 0 ? (
                        <>
                          <strong>{selected.topic}</strong>
                          <p>
                            Weighted score:{' '}
                            {
                              aggregatePerformance(
                                selected.ratingCountsByDifficulty,
                              ).score
                            }{' '}
                            /100
                          </p>
                          <p>
                            Weighted points:{' '}
                            {
                              aggregatePerformance(
                                selected.ratingCountsByDifficulty,
                              ).weightedPoints
                            }{' '}
                            · Weighted units:{' '}
                            {
                              aggregatePerformance(
                                selected.ratingCountsByDifficulty,
                              ).weightedUnits
                            }
                          </p>
                        </>
                      ) : inspectionPage === 1 ? (
                        <>
                          <strong>
                            Topic {inspection.index + 1} · Ratings
                          </strong>
                          <p>
                            Review Success:{' '}
                            {Number((selected.reviewSuccess * 100).toFixed(1))}%
                            · Target Review Success:{' '}
                            {percent(targets.targetReviewSuccess)}
                          </p>
                          <p>Goal status: {goalStatus(selected)}</p>
                          <p>
                            Good + Easy: {selected.goodEasy} · Valid ratings:{' '}
                            {selected.validRatings} · Distinct problems:{' '}
                            {selected.distinctProblems} · Evidence:{' '}
                            {selected.evidence}
                          </p>
                        </>
                      ) : (
                        <>
                          <strong>
                            Topic {inspection.index + 1} · Selected period
                          </strong>
                          <p>
                            {period} ·{' '}
                            {timeFrame.requestedDays === null
                              ? 'All time'
                              : `${timeFrame.requestedDays} days`}
                          </p>
                          <p>As of {timeFrame.asOf}</p>
                          <p>
                            Timezone: {timeFrame.timeZone}
                            {timeFrame.timeZoneFallback ? ' (fallback)' : ''}
                          </p>
                        </>
                      )}
                    </div>
                  ) : null}
                  <span aria-live="polite" className="sr-only" role="status">
                    {inspection.announce && inspection.visible && selected
                      ? `${selected.topic}. Weighted score ${aggregatePerformance(selected.ratingCountsByDifficulty).score} out of 100. Weighted points ${aggregatePerformance(selected.ratingCountsByDifficulty).weightedPoints}. Weighted units ${aggregatePerformance(selected.ratingCountsByDifficulty).weightedUnits}. Review Success ${percent(selected.reviewSuccess)}. Target Review Success ${percent(targets.targetReviewSuccess)}. ${goalStatus(selected)}. Good plus Easy ${selected.goodEasy}. ${selected.validRatings} valid ratings across ${selected.distinctProblems} distinct problems. ${selected.evidence}. Selected period ${period}. As of ${timeFrame.asOf}. Timezone ${timeFrame.timeZone}.`
                      : ''}
                  </span>
                </>
              ) : mode !== 'goals' ? (
                <>
                  <select
                    className="cp-analytics-adapter-select"
                    aria-label="Topics detail section"
                    value={section}
                    onChange={(event) => {
                      if (event.target.value === section) return
                      setSection(event.target.value as Section)
                      setPage('rows', 0)
                      setPage('method', 0)
                    }}
                  >
                    <option value="scores">Scores</option>
                    <option value="ratings">Ratings</option>
                    <option value="evidence">Evidence</option>
                    <option value="method">Method</option>
                  </select>
                  {section === 'ratings' ? (
                    <Button
                      ref={goalRef}
                      className="cp-analytics-card-control cp-topics-goal-trigger"
                      size="sm"
                      variant="ghost"
                      aria-label="Edit Review Success goal"
                      onClick={() => {
                        setGoalOpen(true)
                        setMode('goals')
                      }}
                    >
                      Review Success goal {percent(targets.targetReviewSuccess)}
                    </Button>
                  ) : null}
                  {section === 'evidence' ? (
                    <p>
                      {view.additionalLowEvidenceTopics} additional low-evidence
                      topics. Qualification requires 10 valid ratings over 3
                      distinct problems.
                    </p>
                  ) : null}
                  {section === 'method' ? (
                    methodPages[Math.min(pages.method, methodPages.length - 1)]
                  ) : (
                    <AnalyticsExactTable
                      key={section}
                      label={label}
                      rows={rows}
                      rowKey={(row) => row.id}
                      rowLabel={(row) => row.label}
                      rowLabelHeading="Topic"
                      fields={fields}
                      width={geometry.width}
                      page={pages.rows}
                      pageSize={1}
                      onPageChange={(page) => setPage('rows', page)}
                      resetKey={`${key}:${section}`}
                      emptyMessage={
                        section === 'evidence'
                          ? 'No returned low-evidence topics.'
                          : 'No qualifying topics.'
                      }
                    />
                  )}
                </>
              ) : null}
              <div className="cp-topics-goals" hidden={mode !== 'goals'}>
                {onSaveTarget ? (
                  <AnalyticsTargetEditor
                    targets={targets}
                    metric="reviewSuccess"
                    onSave={onSaveTarget}
                    surface="goals"
                    open={goalOpen && mode === 'goals'}
                    returnFocusRef={goalRef.current ? goalRef : headerRef}
                    onOpenChange={(open) => {
                      setGoalOpen(open)
                      if (!open && mode === 'goals') setMode('details')
                    }}
                  />
                ) : (
                  <p>Review Success goals are managed in Settings.</p>
                )}
              </div>
            </div>
          )
        }}
      </AnalyticsChartPanel>
    </div>
  )
}
