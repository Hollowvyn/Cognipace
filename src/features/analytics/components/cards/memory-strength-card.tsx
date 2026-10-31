import type {
  AnalyticsReadiness,
  AnalyticsViews,
} from '../../api/analytics-contracts'
import type { HistoricalChartTimeFrame } from '../charts/historical-chart'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  AnalyticsChartPanel,
  type AnalyticsCardGeometry,
} from '../analytics-chart-panel'
import { AnalyticsCardPager } from '../analytics-card-controls'
import { AnalyticsExactTable } from '../analytics-exact-table'
import {
  MemoryLegend,
  MemoryStrengthPlot,
  memoryStrengthRows,
  memoryModelProvenanceText,
} from '../memory-practice-views'
import {
  formatHistoricalBucket,
  historicalIntervalContext,
  historicalReportContext,
} from '../charts/historical-chart-model'
export interface MemoryStrengthCardProps {
  view: AnalyticsViews['memoryStrength']
  timeFrame?: HistoricalChartTimeFrame | undefined
  readiness?: AnalyticsReadiness | undefined
}
type Section = 'intervals' | 'evidence' | 'method'
type ExactRow = { id: string; label: string; values: Record<string, ReactNode> }
const finite = (value: number | null): value is number =>
  value !== null && Number.isFinite(value)
const days = (value: number | null) =>
  finite(value) ? `${value} days` : 'Unavailable'
function headlineDays(value: number | null) {
  if (!finite(value)) return 'Unavailable'
  const scientific =
    Math.abs(value) >= 100_000 || (value !== 0 && Math.abs(value) < 0.01)
  return `${new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3, notation: scientific ? 'scientific' : 'standard' }).format(value)} days`
}
const pageSize = (geometry: AnalyticsCardGeometry) =>
  Math.min(geometry.tablePageSize, geometry.width >= 480 ? 2 : 1)
export function MemoryStrengthCard({
  view,
  timeFrame,
  readiness,
}: MemoryStrengthCardProps) {
  const [mode, setMode] = useState<'overview' | 'details'>('overview')
  const [section, setSection] = useState<Section>('intervals')
  const [pagination, setPagination] = useState({ key: '', page: 0, method: 0 })
  const rows = memoryStrengthRows(view.rows)
  const supported = rows.filter((row) => finite(row.medianStrengthDays))
  const latest = supported.at(-1)
  const resetKey = `${timeFrame?.asOf}:${timeFrame?.requestedDays}:${timeFrame?.timeZone}:${timeFrame?.grouping?.unit}:${timeFrame?.grouping?.step}:${section}:${rows.map((row) => row.id).join('|')}`
  if (pagination.key !== resetKey)
    setPagination({ key: resetKey, page: 0, method: 0 })
  const page = pagination.key === resetKey ? pagination.page : 0
  const setPage = (page: number) =>
    setPagination((current) => ({ ...current, key: resetKey, page }))
  const methodPage = pagination.key === resetKey ? pagination.method : 0
  const setMethodPage = (method: number) =>
    setPagination((current) => ({ ...current, key: resetKey, method }))
  const exactRows: ExactRow[] =
    section === 'evidence'
      ? Object.entries(readiness ?? { status: 'Readiness unavailable' }).map(
          ([key, value]) => ({
            id: key,
            label: key,
            values: {
              Value:
                typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value),
            },
          }),
        )
      : rows.map((row) => {
          const hasRange =
            row.eligibleReviews >= 4 &&
            finite(row.medianStrengthDays) &&
            finite(row.q1) &&
            finite(row.q3)
          return {
            id: row.id,
            label: `${formatHistoricalBucket(row, timeFrame)}${row.isPartial ? ' (in progress)' : ''}`,
            values: {
              'Median strength': days(row.medianStrengthDays),
              'Middle 50%': hasRange
                ? `${days(row.q1)}–${days(row.q3)}`
                : 'Unavailable',
              'Eligible reviews': row.eligibleReviews,
              'Observed reviews': row.observedReviews ?? row.eligibleReviews,
              'Median change': finite(row.medianChangeDays)
                ? `${row.medianChangeDays >= 0 ? '+' : ''}${days(row.medianChangeDays)}`
                : 'Unavailable',
              'Model provenance': memoryModelProvenanceText(row),
              Evidence: row.evidence,
              'Period context': historicalIntervalContext(row, timeFrame),
              'Raw Q1': days(row.q1),
              'Raw Q3': days(row.q3),
              'Range support': hasRange
                ? 'Supported'
                : row.eligibleReviews < 4
                  ? 'Needs 4 eligible reviews'
                  : 'Finite median, Q1 and Q3 required',
              'Median days': row.medianStrengthDays,
              'Q1 days': row.q1,
              'Q3 days': row.q3,
              'Signed median change days': row.medianChangeDays,
              ID: row.id,
              Start: row.bucketStart,
              End: row.bucketEnd,
              Partial: String(row.isPartial),
              'Report as of': timeFrame?.asOf ?? 'Unavailable',
              Timezone: timeFrame?.timeZone ?? 'Unavailable',
            },
          }
        })
  const fields = Object.keys(exactRows[0]?.values ?? {}).map((label) => ({
    key: label,
    label,
    value: (row: ExactRow) => row.values[label],
  }))
  const methodPages = [
    <div key="meaning" className="cp-memory-method">
      <p>
        Memory strength is the reconstructed post-review FSRS stability median
        in days, using eligible reviews in each supplied interval. These are
        discrete interval medians; they are not cumulative or smoothed.
      </p>
      <p>
        The latest supported median and its eligible count describe that
        interval. A signed median change is supplied evidence, not a growth
        forecast.
      </p>
    </div>,
    <div key="support" className="cp-memory-method">
      <p>
        Finite zero and subday medians are measured. A single eligible review
        supports a median. Middle 50% whiskers require at least four eligible
        reviews and finite median, Q1 and Q3; unsupported raw quartiles remain
        reachable in Intervals.
      </p>
      <p>
        Dashed continuity crosses internal evidence gaps without adding reviews.
        A singleton is measurable but does not establish a trend.
      </p>
    </div>,
    <div key="context" className="cp-memory-method">
      <p>
        No valid post-review FSRS stability means unavailable. The chart retains
        original interval coordinates and the supplied fitted duration scale.
        Evidence exposes every selected-history readiness field and failure
        reason.
      </p>
      <p>{historicalReportContext(timeFrame)}</p>
    </div>,
  ]
  return (
    <AnalyticsChartPanel
      compact
      historical
      className="cp-historical-view cp-historical-memory cp-memory-strength-card"
      id="analytics-memory-strength"
      title="Memory strength"
      description="Post-review FSRS stability"
      mode={mode}
      headerAction={
        <Button
          className="cp-analytics-card-control"
          size="sm"
          variant="ghost"
          aria-label={
            mode === 'overview'
              ? 'Memory strength Details'
              : 'Memory strength Overview'
          }
          onClick={() => setMode(mode === 'overview' ? 'details' : 'overview')}
        >
          {mode === 'overview' ? 'Details' : 'Overview'}
        </Button>
      }
      hero={
        <div className="cp-memory-hero">
          <strong data-testid="memory-latest-value">
            {headlineDays(latest?.medianStrengthDays ?? null)}
          </strong>
          <span>
            {latest
              ? `${latest.eligibleReviews} reviews · latest median`
              : 'No eligible stability evidence'}
          </span>
        </div>
      }
      footer={(geometry) =>
        mode === 'overview' ? (
          <span>
            {supported.length === 1
              ? 'One interval; no trend yet'
              : supported.length
                ? 'Discrete interval medians'
                : 'No valid post-review stability'}
          </span>
        ) : section === 'method' ? (
          <AnalyticsCardPager
            label="Memory strength method pages"
            page={methodPage}
            pageSize={1}
            rowCount={methodPages.length}
            onPageChange={setMethodPage}
          />
        ) : (
          <AnalyticsCardPager
            label="Memory strength rows"
            page={page}
            pageSize={pageSize(geometry)}
            rowCount={exactRows.length}
            onPageChange={setPage}
          />
        )
      }
    >
      {(geometry) => (
        <div className="cp-memory-content">
          {mode === 'overview' ? (
            <>
              {supported.length ? (
                <MemoryStrengthPlot
                  rows={rows}
                  exactTooltip
                  view={view}
                  timeFrame={timeFrame}
                  compact={{
                    height: Math.max(0, geometry.bodyHeight - 30),
                    showGroupingLabel: false,
                  }}
                />
              ) : (
                <p>
                  No valid post-review FSRS stability is available in this
                  period.
                </p>
              )}
              <MemoryLegend />
            </>
          ) : (
            <>
              <select
                className="cp-analytics-adapter-select"
                aria-label="Memory strength detail section"
                value={section}
                onChange={(event) => {
                  setSection(event.target.value as Section)
                  setMethodPage(0)
                }}
              >
                <option value="intervals">Intervals</option>
                <option value="evidence">Evidence</option>
                <option value="method">Method</option>
              </select>
              {section === 'method' ? (
                methodPages[methodPage]
              ) : (
                <AnalyticsExactTable
                  label={`Memory strength ${section === 'intervals' ? 'Intervals' : 'Evidence'} exact values`}
                  rows={exactRows}
                  rowKey={(row) => row.id}
                  rowLabel={(row) => row.label}
                  rowLabelHeading={
                    section === 'intervals' ? 'Bucket' : 'Readiness field'
                  }
                  fields={fields}
                  width={geometry.width}
                  page={page}
                  pageSize={pageSize(geometry)}
                  onPageChange={setPage}
                  resetKey={resetKey}
                />
              )}
            </>
          )}
        </div>
      )}
    </AnalyticsChartPanel>
  )
}
