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
import { CumulativeRecallPlot, SeriesSwitch } from '../recall-ratings-views'
import { buildCumulativeRecallPresentation } from '../../domain/cumulative-recall-presentation'
import {
  formatHistoricalBucket,
  historicalGroupingLabel,
  historicalIntervalContext,
  historicalReportContext,
} from '../charts/historical-chart-model'
import { formatPercent } from '../charts/chart-shared'
import { getAnalyticsDateKey } from '../../domain/analytics-time'
export interface RecallCardProps {
  view: AnalyticsViews['observedRecallVsFsrs']
  timeFrame?:
    | (HistoricalChartTimeFrame &
        Partial<
          Pick<
            AnalyticsViews['observedRecallVsFsrs']['timeFrame'],
            'history' | 'periodStart'
          >
        >)
    | undefined
  targets: AnalyticsTargets
  onSaveTarget?:
    | ((patch: Partial<AnalyticsTargets>) => Promise<unknown>)
    | undefined
  readiness?: AnalyticsReadiness | undefined
}
type Section = 'summary' | 'intervals' | 'goals' | 'method'
type ExactRow = { id: string; label: string; values: Record<string, ReactNode> }
const exactPercent = (value: number | null) =>
  value === null ? 'Unavailable' : `${value * 100}%`
const exactDifference = (value: number | null) =>
  value === null ? 'Unavailable' : `${value >= 0 ? '+' : ''}${value * 100} pp`
const pageSize = (geometry: AnalyticsCardGeometry) =>
  Math.min(geometry.tablePageSize, geometry.width >= 480 ? 2 : 1)
export function RecallCard({
  view,
  timeFrame = view.timeFrame,
  targets,
  onSaveTarget,
  readiness,
}: RecallCardProps) {
  const [mode, setMode] = useState<'overview' | 'details' | 'goals'>('overview')
  const [section, setSection] = useState<Section>('summary')
  const [series, setSeries] = useState({ observed: true, estimate: true })
  const [metric, setMetric] = useState<'recall' | 'reviewSuccess'>('recall')
  const [pagination, setPagination] = useState({ key: '', page: 0 })
  const [methodPage, setMethodPage] = useState(0)
  const [metadataHeight, setMetadataHeight] = useState(0)
  const headerRef = useRef<HTMLButtonElement>(null)
  const metadataRef = useRef<HTMLDivElement>(null)
  const presentation = buildCumulativeRecallPresentation(view.rows)
  const totals = presentation.totals
  const lastUpdate = presentation.rows.at(-1)?.lastUpdatedInterval
  const lastDate = getAnalyticsDateKey(
    new Date(timeFrame.asOf),
    timeFrame.timeZone,
  )
  const firstDate =
    timeFrame.history?.displayStartKey ??
    (timeFrame.periodStart
      ? getAnalyticsDateKey(new Date(timeFrame.periodStart), timeFrame.timeZone)
      : (view.rows[0]?.bucketStart ?? lastDate))
  const pairedFrame =
    totals.pairedReviews > 0
      ? `Paired ${formatHistoricalBucket({ bucketStart: firstDate, bucketEnd: lastDate }, timeFrame)} · ${historicalGroupingLabel(timeFrame)}`
      : `No paired history · ${historicalGroupingLabel(timeFrame)}`
  useEffect(() => {
    const metadata = metadataRef.current
    if (
      mode !== 'overview' ||
      !metadata ||
      typeof ResizeObserver === 'undefined'
    )
      return
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === metadata)
      if (entry && entry.contentRect.height > 0)
        setMetadataHeight(entry.contentRect.height)
    })
    observer.observe(metadata)
    return () => observer.disconnect()
  }, [mode])
  const resetKey = `${timeFrame.asOf}:${timeFrame.requestedDays}:${timeFrame.timeZone}:${timeFrame.grouping?.unit}:${timeFrame.grouping?.step}:${section}:${view.rows.map((row) => row.id).join('|')}`
  if (pagination.key !== resetKey) setPagination({ key: resetKey, page: 0 })
  const page = pagination.key === resetKey ? pagination.page : 0
  const setPage = (page: number) => setPagination({ key: resetKey, page })
  const openGoal = (next: typeof metric) => {
    setMetric(next)
    setSection('goals')
    setMode('goals')
  }
  const summaryValues: Record<string, ReactNode> = {
    Recalled: totals.recalledCount,
    'Paired reviews': totals.pairedReviews,
    'Observed recall': exactPercent(totals.observedRecall),
    'FSRS estimate': exactPercent(totals.fsrsEstimate),
    Difference: exactDifference(totals.difference),
    'Estimate sum': totals.estimateSum,
    Provenance: 'Reconstructed',
    'Target Recall': exactPercent(targets.targetRecall),
    'Target Review Success': exactPercent(targets.targetReviewSuccess),
    'Period context': historicalReportContext(timeFrame),
    'Report as of': timeFrame.asOf,
    Timezone: timeFrame.timeZone,
    ...Object.fromEntries(
      Object.entries(readiness ?? {}).map(([key, value]) => [
        `Selected history ${key}`,
        typeof value === 'object' ? JSON.stringify(value) : String(value),
      ]),
    ),
  }
  const exactRows: ExactRow[] =
    section === 'summary'
      ? [
          {
            id: 'selected',
            label: 'Selected paired reviews',
            values: summaryValues,
          },
        ]
      : presentation.rows.map((row) => ({
          id: row.id,
          label: `${formatHistoricalBucket(row, timeFrame)}${row.isPartial ? ' (in progress)' : ''}`,
          values: {
            Recalled: row.recalledCount,
            'Paired reviews': row.pairedReviews,
            'Observed recall': exactPercent(row.observedRecall),
            'FSRS estimate': exactPercent(row.fsrsEstimate),
            Difference: exactDifference(row.difference),
            Provenance: 'Reconstructed',
            Evidence: row.evidence,
            'Period context': historicalIntervalContext(row, timeFrame),
            'Interval estimate sum':
              row.pairedReviews * (row.fsrsEstimate ?? 0),
            'Cumulative pairs': row.cumulativePairedReviews,
            'Cumulative recalled': row.cumulativeRecalledCount,
            'Cumulative estimate sum': row.cumulativeEstimateSum,
            'Cumulative observed recall': exactPercent(
              row.cumulativeObservedRecall,
            ),
            'Cumulative FSRS estimate': exactPercent(
              row.cumulativeFsrsEstimate,
            ),
            'Cumulative difference': exactDifference(row.cumulativeDifference),
            State: row.state,
            'Last update': row.lastUpdatedInterval
              ? `${row.lastUpdatedInterval.id}: ${row.lastUpdatedInterval.bucketStart}–${row.lastUpdatedInterval.bucketEnd}`
              : 'None',
            ID: row.id,
            Start: row.bucketStart,
            End: row.bucketEnd,
            Partial: String(row.isPartial),
            'Report as of': timeFrame.asOf,
            Timezone: timeFrame.timeZone,
            'Target Recall': exactPercent(targets.targetRecall),
          },
        }))
  const fields = Object.keys(exactRows[0]?.values ?? summaryValues).map(
    (label) => ({
      key: label,
      label,
      value: (row: ExactRow) => row.values[label],
    }),
  )
  const methodPages = [
    <div key="pairs" className="cp-recall-method">
      <p>
        Repeat reviews with a valid rating and reconstructed pre-review FSRS
        estimate form identical observed and estimated pairs. Initial reviews
        build memory but are excluded; replay before the range reconstructs
        state without adding pairs to this period.
      </p>
      <p>
        Again is a valid failure in the denominator. Hard, Good and Easy count
        as recalled. Genuine 0% is measured.
      </p>
    </div>,
    <div key="pooling" className="cp-recall-method">
      <p>
        Cumulative recall pools recalled / paired counts. The FSRS estimate
        pools the full precision estimate sum / paired reviews, without
        averaging rounded interval percentages.
      </p>
      <p>
        Updated intervals add pairs. Held intervals add no sample and retain the
        last update; long dashes continue through the actual report as-of.
        Leading unavailable intervals have no curve or marker.
      </p>
    </div>,
    <div key="context" className="cp-recall-method">
      <p>
        The supplied eligible-pair window determines dates. Selected-history
        readiness remains independent of this shorter display frame and is
        available in Summary.
      </p>
      <p>
        FSRS estimates are reconstructed, not historical policy snapshots.
        Visibility preserves both fitted series, dates and the saved Recall
        goal. {historicalReportContext(timeFrame)}
      </p>
    </div>,
  ]
  const isTable = section === 'summary' || section === 'intervals'
  return (
    <AnalyticsChartPanel
      compact
      historical
      className="cp-historical-view cp-historical-recall cp-recall-card"
      id="analytics-recall"
      title="Recall"
      description="Observed recall and FSRS estimate"
      mode={mode}
      headerAction={
        <Button
          ref={headerRef}
          className="cp-analytics-card-control"
          size="sm"
          variant="ghost"
          aria-label={
            mode === 'overview' ? 'Recall Details' : 'Recall Overview'
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
        <div className="cp-recall-hero">
          {totals.observedRecall === null ? (
            <>
              <strong data-testid="recall-observed-value">Unavailable</strong>
              <span>
                Observed / FSRS ·{' '}
                <span data-testid="recall-pair-count">0 / 0 pairs</span>
              </span>
            </>
          ) : (
            <div className="cp-recall-summary">
              <div className="cp-recall-primary">
                <strong data-testid="recall-observed-value">
                  {`${Math.round(totals.observedRecall * 100)}%`}
                </strong>
                <span>Observed recall</span>
              </div>
              <div className="cp-recall-context">
                <span data-testid="recall-estimate-value">
                  FSRS average{' '}
                  <b>
                    {totals.fsrsEstimate === null
                      ? 'Unavailable'
                      : `${Math.round(totals.fsrsEstimate * 100)}%`}
                  </b>
                </span>
                <span data-testid="recall-pair-count">
                  {totals.recalledCount} / {totals.pairedReviews} recalled /
                  paired reviews
                </span>
              </div>
            </div>
          )}
        </div>
      }
      footer={(geometry) =>
        mode === 'overview' ? (
          <>
            <span data-testid="recall-last-update">
              {lastUpdate
                ? `Updated during ${formatHistoricalBucket(lastUpdate, timeFrame)}`
                : 'No eligible paired reviews'}
            </span>
            <Button
              className="cp-analytics-card-control"
              size="sm"
              variant="ghost"
              onClick={() => openGoal('recall')}
            >
              Target Recall {formatPercent(targets.targetRecall)}
            </Button>
          </>
        ) : section === 'method' ? (
          <AnalyticsCardPager
            label="Recall method pages"
            page={methodPage}
            pageSize={1}
            rowCount={methodPages.length}
            onPageChange={setMethodPage}
          />
        ) : isTable ? (
          <AnalyticsCardPager
            label="Recall rows"
            page={page}
            pageSize={pageSize(geometry)}
            rowCount={exactRows.length}
            onPageChange={setPage}
          />
        ) : (
          <span>Saved goals preserve review evidence.</span>
        )
      }
    >
      {(geometry) => (
        <div className="cp-recall-content">
          {mode === 'overview' ? (
            <>
              <div className="cp-recall-metadata" ref={metadataRef}>
                <p data-testid="recall-frame">{pairedFrame}</p>
                <div className="cp-recall-series">
                  <SeriesSwitch
                    label="Observed recall"
                    shape="circle"
                    pressed={series.observed}
                    onClick={() =>
                      setSeries((current) => ({
                        ...current,
                        observed: !current.observed,
                      }))
                    }
                  />
                  <SeriesSwitch
                    label="FSRS estimate"
                    shape="diamond"
                    pressed={series.estimate}
                    onClick={() =>
                      setSeries((current) => ({
                        ...current,
                        estimate: !current.estimate,
                      }))
                    }
                  />
                  <span className="cp-recall-hold-key">
                    <svg aria-hidden="true" height="12" width="22">
                      <line
                        stroke="currentColor"
                        strokeDasharray="9 7"
                        x1="0"
                        x2="22"
                        y1="6"
                        y2="6"
                      />
                    </svg>
                    No new paired reviews
                  </span>
                </div>
              </div>
              {totals.pairedReviews ? (
                <CumulativeRecallPlot
                  rows={presentation.rows}
                  view={{ ...view, targetRecall: targets.targetRecall }}
                  timeFrame={timeFrame}
                  series={series}
                  height={Math.max(
                    0,
                    geometry.bodyHeight -
                      (metadataHeight || (geometry.width >= 440 ? 52 : 74)) -
                      8,
                  )}
                />
              ) : (
                <p>
                  No repeat reviews have a valid rating and reconstructed FSRS
                  estimate. Initial reviews build memory for later comparisons.
                </p>
              )}
            </>
          ) : (
            <>
              <select
                className="cp-analytics-adapter-select"
                aria-label="Recall detail section"
                value={section}
                onChange={(event) => {
                  const next = event.target.value as Section
                  setSection(next)
                  setMode(next === 'goals' ? 'goals' : 'details')
                  setMethodPage(0)
                }}
              >
                <option value="summary">Summary</option>
                <option value="intervals">Intervals</option>
                <option value="goals">Goals</option>
                <option value="method">Method</option>
              </select>
              {isTable ? (
                <AnalyticsExactTable
                  label={`Recall ${section === 'summary' ? 'Summary' : 'Intervals'} exact values`}
                  rows={exactRows}
                  rowKey={(row) => row.id}
                  rowLabel={(row) => row.label}
                  rowLabelHeading={
                    section === 'summary' ? 'Population' : 'Bucket'
                  }
                  fields={fields}
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
          <div className="cp-recall-goals" hidden={mode !== 'goals'}>
            <div className="cp-recall-goal-buttons">
              {(['recall', 'reviewSuccess'] as const).map((key) => (
                <Button
                  key={key}
                  className="cp-analytics-card-control"
                  size="sm"
                  variant="ghost"
                  aria-pressed={metric === key}
                  onClick={() => setMetric(key)}
                >
                  {key === 'recall'
                    ? `Target Recall ${formatPercent(targets.targetRecall)}`
                    : `Target Review Success ${formatPercent(targets.targetReviewSuccess)}`}
                </Button>
              ))}
            </div>
            {onSaveTarget ? (
              (['recall', 'reviewSuccess'] as const).map((key) => (
                <AnalyticsTargetEditor
                  key={key}
                  targets={targets}
                  metric={key}
                  onSave={onSaveTarget}
                  surface="goals"
                  open={mode === 'goals' && metric === key}
                  returnFocusRef={headerRef}
                  onOpenChange={(open) => {
                    if (!open && mode === 'goals' && metric === key) {
                      setSection('summary')
                      setMode('details')
                    }
                  }}
                />
              ))
            ) : (
              <p>Goals are managed in Settings.</p>
            )}
          </div>
        </div>
      )}
    </AnalyticsChartPanel>
  )
}
