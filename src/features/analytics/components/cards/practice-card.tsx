import type {
  AnalyticsReadiness,
  AnalyticsViews,
} from '../../api/analytics-contracts'
import type { AnalyticsTargets } from '@/features/settings/domain'
import type { HistoricalChartTimeFrame } from '../charts/historical-chart'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  AnalyticsChartPanel,
  type AnalyticsCardGeometry,
} from '../analytics-chart-panel'
import { AnalyticsCardPager } from '../analytics-card-controls'
import { AnalyticsExactTable } from '../analytics-exact-table'
import { AnalyticsTargetEditor } from '../analytics-target-editor'
import {
  PracticeRatingsLegend,
  PracticeRatingsPlot,
} from '../practice-ratings-view'
import { buildPracticeRatingsRows } from '../practice-ratings-model'
import {
  formatHistoricalBucket,
  historicalIntervalContext,
  historicalReportContext,
} from '../charts/historical-chart-model'
import { formatPercent } from '../charts/chart-shared'
export interface PracticeCardProps {
  view: AnalyticsViews['practiceRhythm']
  ratingsView: AnalyticsViews['ratingsMix']
  timeFrame?: HistoricalChartTimeFrame | undefined
  targets: AnalyticsTargets
  onSaveTarget?:
    | ((patch: Partial<AnalyticsTargets>) => Promise<unknown>)
    | undefined
  practiceReadiness?: AnalyticsReadiness | undefined
  ratingsReadiness?: AnalyticsReadiness | undefined
}
type Section =
  | 'ratings'
  | 'intervals'
  | 'comparison'
  | 'evidence'
  | 'goals'
  | 'method'
type ExactRow = { id: string; label: string; values: Record<string, ReactNode> }
const exactPercent = (value: number | null | undefined) =>
  value === null || value === undefined ? 'Unavailable' : `${value * 100}%`
const pageSize = (geometry: AnalyticsCardGeometry) =>
  Math.min(geometry.tablePageSize, geometry.width >= 480 ? 2 : 1)
const categories = ['easy', 'good', 'hard', 'again'] as const
export function PracticeCard({
  view,
  ratingsView,
  timeFrame,
  targets,
  onSaveTarget,
  practiceReadiness,
  ratingsReadiness,
}: PracticeCardProps) {
  const [mode, setMode] = useState<'overview' | 'details' | 'goals'>('overview')
  const [section, setSection] = useState<Section>('ratings')
  const [showReviews, setShowReviews] = useState(true)
  const [pagination, setPagination] = useState({ key: '', page: 0, method: 0 })
  const [legendHeight, setLegendHeight] = useState(0)
  const headerRef = useRef<HTMLButtonElement>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const legend = legendRef.current
    if (mode !== 'overview' || !legend || typeof ResizeObserver === 'undefined')
      return
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === legend)
      if (entry && entry.contentRect.height > 0)
        setLegendHeight(entry.contentRect.height)
    })
    observer.observe(legend)
    return () => observer.disconnect()
  }, [mode])
  const rows = buildPracticeRatingsRows(view.rows, ratingsView.rows)
  const completed = view.rows.reduce(
    (sum, row) => sum + row.completedReviews,
    0,
  )
  const share = ratingsView.selectedValidRatings
    ? ratingsView.selectedHardAgain / ratingsView.selectedValidRatings
    : null
  const comparison = ratingsView.comparison
  const priorSupported =
    comparison.previousHardAgainShare !== null &&
    comparison.difference !== null &&
    comparison.direction !== null
  const resetKey = `${timeFrame?.asOf}:${timeFrame?.requestedDays}:${timeFrame?.timeZone}:${timeFrame?.grouping?.unit}:${timeFrame?.grouping?.step}:${section}:${rows.map((row) => row.id).join('|')}`
  if (pagination.key !== resetKey)
    setPagination({ key: resetKey, page: 0, method: 0 })
  const page = pagination.key === resetKey ? pagination.page : 0
  const setPage = (page: number) =>
    setPagination((current) => ({ ...current, key: resetKey, page }))
  const methodPage = pagination.key === resetKey ? pagination.method : 0
  const setMethodPage = (method: number) =>
    setPagination((current) => ({ ...current, key: resetKey, method }))
  let exactRows: ExactRow[]
  if (section === 'ratings')
    exactRows = categories.map((key) => {
      const count = ratingsView.rows.reduce((sum, row) => sum + row[key], 0)
      return {
        id: key,
        label: key[0]!.toUpperCase() + key.slice(1),
        values: {
          Count: count,
          Share: exactPercent(
            ratingsView.selectedValidRatings
              ? count / ratingsView.selectedValidRatings
              : null,
          ),
          'Valid ratings': ratingsView.selectedValidRatings,
          'Selected Hard + Again': ratingsView.selectedHardAgain,
          'Selected challenging share': exactPercent(share),
        },
      }
    })
  else if (section === 'comparison')
    exactRows = [
      {
        id: 'comparison',
        label: 'Hard + Again',
        values: {
          'Selected count': ratingsView.selectedHardAgain,
          'Selected valid ratings': ratingsView.selectedValidRatings,
          'Selected share': exactPercent(share),
          'Prior share': priorSupported
            ? exactPercent(comparison.previousHardAgainShare)
            : 'Unavailable',
          'Prior valid ratings': priorSupported
            ? comparison.previousValidRatings
            : 'Unavailable',
          Direction: priorSupported ? comparison.direction : 'Unavailable',
          Difference: priorSupported
            ? `${comparison.difference! >= 0 ? '+' : ''}${comparison.difference! * 100} pp`
            : 'Unavailable',
          'Comparison support': priorSupported
            ? 'Equivalent prior period with sufficient evidence'
            : timeFrame?.requestedDays === null
              ? 'No previous period for All time'
              : 'Insufficient comparable evidence',
          'Period context': historicalReportContext(timeFrame),
        },
      },
    ]
  else if (section === 'evidence')
    exactRows = [
      ['Practice', practiceReadiness] as const,
      ['Ratings', ratingsReadiness] as const,
    ].flatMap(([name, readiness]) =>
      Object.entries(
        readiness ?? {
          status: 'Readiness unavailable',
        },
      ).map(([key, value]) => ({
        id: `${name}:${key}`,
        label: `${name} ${key}`,
        values: {
          Value:
            typeof value === 'object' ? JSON.stringify(value) : String(value),
        },
      })),
    )
  else
    exactRows = rows.map((row) => ({
      id: row.id,
      label: `${formatHistoricalBucket(row, timeFrame)}${row.isPartial ? ' (in progress)' : ''}`,
      values: {
        'Completed reviews': row.completedReviews ?? 'Unavailable',
        ...Object.fromEntries(
          categories.map((key) => [
            key[0]!.toUpperCase() + key.slice(1),
            row.ratings
              ? `${row.ratings[key]} (${exactPercent(row.ratings.validRatings ? row.ratings[`${key}Share`] : null)})`
              : 'Unavailable',
          ]),
        ),
        'Good + Easy': row.practice
          ? `${row.practice.goodEasy} / ${row.practice.validRatings}`
          : 'Unavailable',
        'Review Success': exactPercent(row.practice?.reviewSuccess),
        'Target Review Success': exactPercent(targets.targetReviewSuccess),
        'Valid ratings': row.ratings?.validRatings ?? 'Unavailable',
        'Challenging reviews': row.ratings?.challengingReviews ?? 'Unavailable',
        'Practice evidence': row.practice?.evidence ?? 'Unavailable',
        'Ratings evidence': row.ratings?.evidence ?? 'Unavailable',
        'Period context': historicalIntervalContext(row, timeFrame),
        ID: row.id,
        'Practice ID': row.practice?.id ?? 'Unavailable',
        'Ratings ID': row.ratings?.id ?? 'Unavailable',
        Start: row.bucketStart,
        End: row.bucketEnd,
        Partial: String(row.isPartial),
        'Practice partial': row.practice
          ? String(row.practice.isPartial)
          : 'Unavailable',
        'Ratings partial': row.ratings
          ? String(row.ratings.isPartial)
          : 'Unavailable',
        'Practice valid ratings': row.practice?.validRatings ?? 'Unavailable',
        'Practice Good + Easy': row.practice?.goodEasy ?? 'Unavailable',
        ...Object.fromEntries(
          categories.flatMap((key) => [
            [`${key} count`, row.ratings?.[key] ?? 'Unavailable'],
            [`${key} share`, row.ratings?.[`${key}Share`] ?? 'Unavailable'],
          ]),
        ),
        'Report as of': timeFrame?.asOf ?? 'Unavailable',
        Timezone: timeFrame?.timeZone ?? 'Unavailable',
      },
    }))
  const fields = Object.keys(exactRows[0]?.values ?? {}).map((label) => ({
    key: label,
    label,
    value: (row: ExactRow) => row.values[label],
  }))
  const methodPages = [
    <div key="association" className="cp-practice-method">
      <p>
        Association, not causation. Completed reviews use the Practice source
        and a separate right count axis. Count-line crossings with the target
        have no percentage meaning.
      </p>
      <p>
        Rating shares use only the Ratings source. Easy, Good, Hard and Again
        stack from bottom to top; the Good + Easy boundary represents Review
        Success.
      </p>
    </div>,
    <div key="missing" className="cp-practice-method">
      <p>
        The exact interval union matches ID, start and end, preserving source
        identity, partial edges and internal gaps. Missing counterparts are
        unavailable. Known completed zero and finite 0% Review Success are
        measured.
      </p>
      <p>
        Full-height neutral stripes mean unavailable composition or no valid
        ratings. A measured zero category has zero height. Labels appear only
        when they fit and avoid the count line and target.
      </p>
    </div>,
    <div key="readiness" className="cp-practice-method">
      <p>
        Practice and Ratings have independent selected-history readiness. Every
        supplied readiness field and failure reason is available in Evidence.
      </p>
      <p>
        Hard + Again comparison requires supported equivalent prior evidence.
        All time has no prior delta. Goals preserve the fixed 0–100% share axis
        and separate count fit. {historicalReportContext(timeFrame)}
      </p>
    </div>,
  ]
  const isTable = !['method', 'goals'].includes(section)
  const tableLabel = `Practice ${section[0]!.toUpperCase() + section.slice(1)} exact values`
  return (
    <AnalyticsChartPanel
      compact
      historical
      className="cp-historical-view cp-historical-practice-ratings cp-practice-card"
      id="analytics-practice"
      title="Practice"
      description="Rating mix and completed reviews"
      mode={mode}
      headerAction={
        <Button
          ref={headerRef}
          className="cp-analytics-card-control"
          size="sm"
          variant="ghost"
          aria-label={
            mode === 'overview' ? 'Practice Details' : 'Practice Overview'
          }
          onClick={() =>
            setMode(
              mode === 'overview'
                ? section === 'goals'
                  ? 'goals'
                  : 'details'
                : 'overview',
            )
          }
        >
          {mode === 'overview' ? 'Details' : 'Overview'}
        </Button>
      }
      hero={
        <div className="cp-practice-hero">
          <strong>{completed} reviews</strong>
          <span>
            {ratingsView.selectedHardAgain} / {ratingsView.selectedValidRatings}{' '}
            Challenging reviews · {formatPercent(share)}
          </span>
        </div>
      }
      footer={(geometry) =>
        mode === 'overview' ? (
          <>
            <span>Count · rating shares</span>
            <Button
              className="cp-analytics-card-control"
              size="sm"
              variant="ghost"
              onClick={() => {
                setSection('goals')
                setMode('goals')
              }}
            >
              Target Review Success {formatPercent(targets.targetReviewSuccess)}
            </Button>
          </>
        ) : section === 'method' ? (
          <AnalyticsCardPager
            label="Practice method pages"
            page={methodPage}
            pageSize={1}
            rowCount={methodPages.length}
            onPageChange={setMethodPage}
          />
        ) : isTable ? (
          <AnalyticsCardPager
            label="Practice rows"
            page={page}
            pageSize={pageSize(geometry)}
            rowCount={exactRows.length}
            onPageChange={setPage}
          />
        ) : (
          <span>Goal does not move either axis.</span>
        )
      }
    >
      {(geometry) => (
        <div className="cp-practice-content">
          {mode === 'overview' ? (
            <>
              {rows.length ? (
                <PracticeRatingsPlot
                  view={{
                    ...view,
                    targetReviewSuccess: targets.targetReviewSuccess,
                  }}
                  ratingsView={ratingsView}
                  timeFrame={timeFrame}
                  showReviews={showReviews}
                  compact={{
                    height: Math.max(
                      0,
                      geometry.bodyHeight -
                        (legendHeight ||
                          (geometry.width >= 480
                            ? 38
                            : geometry.width >= 360
                              ? 54
                              : 74)) -
                        8,
                    ),
                    showGroupingLabel: false,
                  }}
                />
              ) : (
                <p>
                  No completed reviews or valid ratings are available in this
                  period.
                </p>
              )}
              <div className="cp-practice-legend" ref={legendRef}>
                <PracticeRatingsLegend
                  compactFriendly
                  showReviews={showReviews}
                  onToggle={() => setShowReviews((current) => !current)}
                />
              </div>
            </>
          ) : (
            <>
              <select
                className="cp-analytics-adapter-select"
                aria-label="Practice detail section"
                value={section}
                onChange={(event) => {
                  const next = event.target.value as Section
                  setSection(next)
                  setMode(next === 'goals' ? 'goals' : 'details')
                  setMethodPage(0)
                }}
              >
                <option value="ratings">Ratings</option>
                <option value="intervals">Intervals</option>
                <option value="comparison">Comparison</option>
                <option value="evidence">Evidence</option>
                <option value="goals">Goals</option>
                <option value="method">Method</option>
              </select>
              {isTable ? (
                <AnalyticsExactTable
                  label={tableLabel}
                  rows={exactRows}
                  rowKey={(row) => row.id}
                  rowLabel={(row) => row.label}
                  rowLabelHeading={
                    section === 'intervals'
                      ? 'Bucket'
                      : section === 'evidence'
                        ? 'Source · field'
                        : 'Population'
                  }
                  fields={fields}
                  groups={
                    section === 'intervals'
                      ? [
                          {
                            key: 'ratings',
                            label: 'Ratings',
                            fieldKeys: [
                              'Easy',
                              'Good',
                              'Hard',
                              'Again',
                              'Valid ratings',
                              'Challenging reviews',
                            ],
                          },
                          {
                            key: 'counts',
                            label: 'Counts',
                            fieldKeys: [
                              'Completed reviews',
                              'Practice valid ratings',
                              'Practice Good + Easy',
                            ],
                          },
                          {
                            key: 'outcomes',
                            label: 'Outcomes',
                            fieldKeys: [
                              'Good + Easy',
                              'Review Success',
                              'Target Review Success',
                            ],
                          },
                          {
                            key: 'evidence',
                            label: 'Evidence',
                            fieldKeys: [
                              'Practice evidence',
                              'Ratings evidence',
                              'Period context',
                              'ID',
                              'Practice ID',
                              'Ratings ID',
                              'Start',
                              'End',
                              'Partial',
                              'Practice partial',
                              'Ratings partial',
                              'Report as of',
                              'Timezone',
                            ],
                          },
                        ]
                      : [
                          {
                            key: 'values',
                            label: 'Exact values',
                            fieldKeys: fields.map((field) => field.key),
                          },
                        ]
                  }
                  width={geometry.width}
                  page={page}
                  pageSize={pageSize(geometry)}
                  onPageChange={setPage}
                  resetKey={resetKey}
                />
              ) : null}
              {section === 'method' ? methodPages[methodPage] : null}
            </>
          )}
          <div className="cp-practice-goals" hidden={mode !== 'goals'}>
            {onSaveTarget ? (
              <AnalyticsTargetEditor
                targets={targets}
                metric="reviewSuccess"
                onSave={onSaveTarget}
                surface="goals"
                open={mode === 'goals'}
                returnFocusRef={headerRef}
                onOpenChange={(open) => {
                  if (!open && mode === 'goals') {
                    setSection('ratings')
                    setMode('details')
                  }
                }}
              />
            ) : (
              <p>Goals are managed in Settings.</p>
            )}
          </div>
        </div>
      )}
    </AnalyticsChartPanel>
  )
}
