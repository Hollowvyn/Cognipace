import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AnalyticsViews } from '../../api/analytics-contracts'
import { AnalyticsCardPager } from '../analytics-card-controls'
import { AnalyticsChartPanel } from '../analytics-chart-panel'
import { AnalyticsExactTable } from '../analytics-exact-table'
import { historicalReportContext } from '../charts/historical-chart-model'
import { backlogProvenanceText, OverdueBacklogChart } from '../workload-views'
export interface BacklogCardProps {
  view: AnalyticsViews['overdueBacklog']
}
type Section = 'days' | 'summary' | 'method'
type ExactRow = {
  id: string
  label: string
  values: Record<string, string | number>
}
export function BacklogCard({ view }: BacklogCardProps) {
  const [mode, setMode] = useState<'overview' | 'details'>('overview')
  const [section, setSection] = useState<Section>('days')
  const messageRef = useRef<HTMLParagraphElement>(null)
  const [messageHeight, setMessageHeight] = useState(0)
  useEffect(() => {
    const element = messageRef.current
    if (!element || mode !== 'overview') return
    const measure = () => {
      const height = element.getBoundingClientRect().height
      if (height > 0) setMessageHeight(height)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [mode, view.knownDays])
  const key = JSON.stringify([view.timeFrame, view.rows.map((row) => row.date)])
  const [pagination, setPagination] = useState({ key, page: 0 })
  if (pagination.key !== key) setPagination({ key, page: 0 })
  const page = pagination.key === key ? pagination.page : 0
  const setPage = (page: number) => setPagination({ key, page })
  const context = `${historicalReportContext(view.timeFrame)} · Last 30 local dates: ${view.rows[0]?.date ?? 'Unavailable'} through ${view.rows.at(-1)?.date ?? 'Unavailable'}`
  const methodPages = [
    <div key="reconstruction" className="cp-workload-copy">
      <p>
        Daily summaries over the independent last 30 local days, reconstructed
        from persisted FSRS review logs and current active, non-suspended card
        state.
      </p>
      <p>
        Unknown days are not measured and break straight connections. Known zero
        remains measured. Today is reconstructed through the as-of instant and
        is in progress.
      </p>
    </div>,
    <div key="threshold" className="cp-workload-copy">
      <p>
        Green means fewer than 5 overdue problems. Amber means 5 or more. A
        crossing is split at exactly 5 without adding a measured observation.
      </p>
      <p>
        The current value is the supplied last-day count. An unknown last day
        remains unavailable; no previous observation is carried forward.
      </p>
    </div>,
    <div key="context" className="cp-workload-copy">
      <p>{context}</p>
      <p>
        Known peak, known and unknown days describe this independent daily
        frame. Historical page selection does not change it.
      </p>
    </div>,
  ]
  const rows: ExactRow[] =
    section === 'summary'
      ? [
          ['Current backlog', view.currentBacklog ?? 'Not measured'],
          ['Known peak', view.peak ?? 'Not measured'],
          ['Known days', view.knownDays],
          ['Unknown days', view.selectedDays - view.knownDays],
          ['Below 5 days', view.withinWatchDays],
          ['At or above 5 days', view.aboveWatchDays],
          ['Selected days', view.selectedDays],
          ['Report as of', view.timeFrame.asOf],
          ['Timezone', view.timeFrame.timeZone],
          ['Timezone fallback', String(view.timeFrame.timeZoneFallback)],
          [
            'Selected period',
            `${view.rows[0]?.date ?? 'Unavailable'} through ${view.rows.at(-1)?.date ?? 'Unavailable'}`,
          ],
          ['Y domain', view.scale.domain.join(' to ')],
          ['Y ticks', view.scale.ticks.join(', ')],
        ].map(([label, value]) => ({
          id: String(label),
          label: String(label),
          values: { Value: value! },
        }))
      : view.rows.map((row) => ({
          id: row.date,
          label: row.date,
          values: {
            'Overdue problems': row.overdueCount ?? 'Not measured',
            'In progress': String(row.inProgress),
            'Watch status':
              row.overdueCount === null
                ? 'Unknown'
                : row.overdueCount < 5
                  ? 'Below 5 (<5)'
                  : 'At or above 5 (≥5)',
            'Observation context': row.inProgress
              ? 'Reconstructed through as of; In progress'
              : 'Reconstructed at local day end',
            'Scheduling provenance': backlogProvenanceText(row),
            'Report as of': view.timeFrame.asOf,
            Timezone: view.timeFrame.timeZone,
            'Timezone fallback': String(view.timeFrame.timeZoneFallback),
            'Selected period': `${view.rows[0]?.date ?? 'Unavailable'} through ${view.rows.at(-1)?.date ?? 'Unavailable'}`,
            'Period start': view.timeFrame.periodStart,
            'Period end (exclusive)': view.timeFrame.periodEnd,
          },
        }))
  const label = `Backlog ${section === 'days' ? 'Days' : 'Summary'} exact values`
  const fields = Object.keys(rows[0]?.values ?? {}).map((key) => ({
    key,
    label: key,
    value: (row: ExactRow) => row.values[key],
  }))
  return (
    <AnalyticsChartPanel
      compact
      className="cp-backlog-card"
      id="analytics-backlog"
      title="Overdue backlog"
      description="Daily overdue · last 30 days"
      mode={mode}
      headerAction={
        <Button
          className="cp-analytics-card-control"
          size="sm"
          variant="ghost"
          aria-label={
            mode === 'overview' ? 'Backlog Details' : 'Backlog Overview'
          }
          onClick={() => setMode(mode === 'overview' ? 'details' : 'overview')}
        >
          {mode === 'overview' ? 'Details' : 'Overview'}
        </Button>
      }
      hero={
        <div className="cp-workload-hero">
          <strong data-testid="backlog-current">
            {view.currentBacklog === null ? 'Unavailable' : view.currentBacklog}
          </strong>
          <span>
            Current overdue · {view.knownDays}/{view.selectedDays} known days
          </span>
        </div>
      }
      footer={
        mode === 'overview' ? (
          <span>Green &lt;5 · Amber ≥5 · Unknown breaks</span>
        ) : (
          <AnalyticsCardPager
            label={
              section === 'method' ? 'Backlog method pages' : 'Backlog rows'
            }
            page={page}
            pageSize={1}
            rowCount={section === 'method' ? methodPages.length : rows.length}
            onPageChange={setPage}
          />
        )
      }
    >
      {(geometry) => (
        <div className="cp-workload-content">
          {mode === 'overview' ? (
            <>
              {view.knownDays === 0 ? (
                <p ref={messageRef}>
                  Historical overdue backlog could not be reconstructed for this
                  period.
                </p>
              ) : null}
              <OverdueBacklogChart
                key={key}
                view={view}
                timeFrame={view.timeFrame}
                compact={{
                  width: geometry.width,
                  height: Math.max(
                    0,
                    geometry.bodyHeight -
                      (view.knownDays === 0
                        ? (messageHeight || (geometry.width < 360 ? 54 : 36)) +
                          8
                        : 0),
                  ),
                }}
              />
            </>
          ) : (
            <>
              <select
                className="cp-analytics-adapter-select"
                aria-label="Backlog detail section"
                value={section}
                onChange={(event) => {
                  setSection(event.target.value as Section)
                  setPage(0)
                }}
              >
                <option value="days">Days</option>
                <option value="summary">Summary</option>
                <option value="method">Method</option>
              </select>
              {section === 'method' ? (
                methodPages[Math.min(page, methodPages.length - 1)]
              ) : (
                <AnalyticsExactTable
                  key={section}
                  label={label}
                  rows={rows}
                  rowKey={(row) => row.id}
                  rowLabel={(row) => row.label}
                  rowLabelHeading={
                    section === 'days' ? 'Date' : 'Summary field'
                  }
                  fields={fields}
                  width={geometry.width}
                  page={page}
                  pageSize={1}
                  onPageChange={setPage}
                  resetKey={key}
                />
              )}
            </>
          )}
        </div>
      )}
    </AnalyticsChartPanel>
  )
}
