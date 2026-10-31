import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type {
  AnalyticsTimeFrame,
  AnalyticsViews,
} from '../../api/analytics-contracts'
import { AnalyticsCardPager } from '../analytics-card-controls'
import { AnalyticsChartPanel } from '../analytics-chart-panel'
import { AnalyticsExactTable } from '../analytics-exact-table'
import { UpcomingLoadChart } from '../workload-views'
export interface UpcomingCardProps {
  view: AnalyticsViews['upcomingReviewLoad']
  reportContext: Pick<
    AnalyticsTimeFrame,
    'asOf' | 'timeZone' | 'timeZoneFallback'
  >
}
type Section = 'days' | 'summary' | 'method'
type ExactRow = {
  id: string
  label: string
  values: Record<string, string | number>
}
export function UpcomingCard({ view, reportContext }: UpcomingCardProps) {
  const [mode, setMode] = useState<'overview' | 'details'>('overview')
  const [section, setSection] = useState<Section>('days')
  const legendRef = useRef<HTMLUListElement>(null)
  const messageRef = useRef<HTMLParagraphElement>(null)
  const [copyHeights, setCopyHeights] = useState({ legend: 0, message: 0 })
  const key = JSON.stringify([
    reportContext.asOf,
    reportContext.timeZone,
    reportContext.timeZoneFallback,
    view.rows.map((row) => row.date),
  ])
  const [pagination, setPagination] = useState({ key, page: 0 })
  if (pagination.key !== key) setPagination({ key, page: 0 })
  const page = pagination.key === key ? pagination.page : 0
  const setPage = (page: number) => setPagination({ key, page })
  const first = view.rows[0],
    last = view.rows.at(-1)
  const due = view.rows.reduce((sum, row) => sum + row.dueCount, 0),
    overdue = view.rows.reduce((sum, row) => sum + row.overdueCount, 0)
  useEffect(() => {
    if (mode !== 'overview') return
    const measure = () => {
      const legend = legendRef.current?.getBoundingClientRect().height ?? 0
      const message = messageRef.current?.getBoundingClientRect().height ?? 0
      setCopyHeights((current) =>
        current.legend === legend && current.message === message
          ? current
          : { legend, message },
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    if (legendRef.current) observer.observe(legendRef.current)
    if (messageRef.current) observer.observe(messageRef.current)
    return () => observer.disconnect()
  }, [mode, due, overdue])
  const horizon = `${first?.date ?? 'Unavailable'} through ${last?.date ?? 'Unavailable'}`
  const methodPages = [
    <div key="snapshot" className="cp-workload-copy">
      <p>
        Fixed active, non-suspended FSRS schedule snapshot: Today plus the next
        13 local dates. Zero dates keep their real slots.
      </p>
      <p>
        Due earlier today remains Due today. Only cards due before today's local
        date are Overdue, and only Today's column includes them.
      </p>
    </div>,
    <div key="model" className="cp-workload-copy">
      <p>
        This snapshot does not simulate future reviews or rescheduling. Due and
        Overdue use actual separate counts; Total is their sum.
      </p>
      <p>
        Every date, including zero, is available to pointer, tap and keyboard
        inspection and exact Days.
      </p>
    </div>,
    <div key="context" className="cp-workload-copy">
      <p>Next 14 local dates: {horizon}.</p>
      <p>As of {reportContext.asOf}</p>
      <p>
        Timezone: {reportContext.timeZone}
        {reportContext.timeZoneFallback ? ' (fallback)' : ''}.
      </p>
      <p>
        Forward schedule context is independent of historical page selection.
      </p>
    </div>,
  ]
  const rows: ExactRow[] =
    section === 'summary'
      ? [
          ['14-day total', due + overdue],
          ['Due', due],
          ['Overdue', overdue],
          ['Today total', first ? first.dueCount + first.overdueCount : 0],
          ['Today due', first?.dueCount ?? 0],
          ['Today overdue', first?.overdueCount ?? 0],
          ['Local dates', view.rows.length],
          ['Forward period', horizon],
          ['Report as of', reportContext.asOf],
          ['Timezone', reportContext.timeZone],
          ['Timezone fallback', String(reportContext.timeZoneFallback)],
          ['Y domain', view.scale.domain.join(' to ')],
          ['Y ticks', view.scale.ticks.join(', ')],
        ].map(([label, value]) => ({
          id: String(label),
          label: String(label),
          values: { Value: value! },
        }))
      : view.rows.map((row) => ({
          id: row.date,
          label: row.today ? `Today · ${row.date}` : row.date,
          values: {
            Due: row.dueCount,
            Overdue: row.overdueCount,
            Total: row.dueCount + row.overdueCount,
            Today: String(row.today),
            'Report as of': reportContext.asOf,
            Timezone: reportContext.timeZone,
            'Timezone fallback': String(reportContext.timeZoneFallback),
            'Forward period': horizon,
          },
        }))
  const label = `Upcoming ${section === 'days' ? 'Days' : 'Summary'} exact values`
  const fields = Object.keys(rows[0]?.values ?? {}).map((key) => ({
    key,
    label: key,
    value: (row: ExactRow) => row.values[key],
  }))
  return (
    <AnalyticsChartPanel
      compact
      className="cp-upcoming-card"
      id="analytics-upcoming"
      title="Upcoming reviews"
      description="Scheduled reviews · next 14 days"
      mode={mode}
      headerAction={
        <Button
          className="cp-analytics-card-control"
          size="sm"
          variant="ghost"
          aria-label={
            mode === 'overview' ? 'Upcoming Details' : 'Upcoming Overview'
          }
          onClick={() => setMode(mode === 'overview' ? 'details' : 'overview')}
        >
          {mode === 'overview' ? 'Details' : 'Overview'}
        </Button>
      }
      hero={
        <div className="cp-workload-hero">
          <strong>{due + overdue} reviews</strong>
          <span>
            {due} Due · {overdue} Overdue
          </span>
        </div>
      }
      footer={
        mode === 'overview' ? (
          <span>{horizon}</span>
        ) : (
          <AnalyticsCardPager
            label={
              section === 'method' ? 'Upcoming method pages' : 'Upcoming rows'
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
              {due + overdue === 0 ? (
                <p>No reviews are currently scheduled in the next 14 days.</p>
              ) : null}
              <UpcomingLoadChart
                key={key}
                view={view}
                reportContext={reportContext}
                compact={{
                  width: geometry.width,
                  height: Math.max(
                    0,
                    geometry.bodyHeight -
                      (copyHeights.legend || (geometry.width < 360 ? 36 : 18)) -
                      8 -
                      (due + overdue === 0
                        ? (copyHeights.message ||
                            (geometry.width < 360 ? 36 : 18)) + 8
                        : 0),
                  ),
                }}
              />
              <ul
                ref={legendRef}
                className="cp-workload-legend"
                aria-label="Upcoming Review Load legend"
              >
                <li>Due — solid green</li>
                <li>Overdue — hatched pink</li>
              </ul>
            </>
          ) : (
            <>
              <select
                className="cp-analytics-adapter-select"
                aria-label="Upcoming detail section"
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
