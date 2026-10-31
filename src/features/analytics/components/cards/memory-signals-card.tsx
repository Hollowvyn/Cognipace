import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createLeetCodeProblemUrl } from '@/lib/leetcode'
import type {
  AnalyticsTimeFrame,
  AnalyticsViews,
} from '../../api/analytics-contracts'
import {
  AnalyticsCardPager,
  clampAnalyticsPage,
} from '../analytics-card-controls'
import {
  AnalyticsChartPanel,
  type AnalyticsCardGeometry,
} from '../analytics-chart-panel'
export interface MemorySignalsCardProps {
  view: AnalyticsViews['memorySignals']
  reportContext: Pick<
    AnalyticsTimeFrame,
    'asOf' | 'timeZone' | 'timeZoneFallback'
  >
}
type Section = 'problems' | 'scope' | 'method'
type Row = AnalyticsViews['memorySignals']['rows'][number]
function pageSize(
  geometry: AnalyticsCardGeometry,
  rows: Row[],
  details: boolean,
) {
  const chars = Math.max(12, Math.floor((geometry.width - 32) / 7))
  const height = Math.max(
    70,
    ...rows.map(
      (row) =>
        Math.ceil(row.title.length / chars) * 18 +
        row.reasons.reduce(
          (sum, reason) =>
            sum +
            Math.ceil(
              (reason.label.length + (details ? reason.kind.length + 3 : 0)) /
                chars,
            ) *
              18,
          0,
        ) +
        30,
    ),
  )
  return Math.max(
    1,
    Math.min(
      geometry.problemPageSize,
      Math.floor((geometry.bodyHeight - (details ? 40 : 0)) / height),
    ),
  )
}
export function MemorySignalsCard({
  view,
  reportContext,
}: MemorySignalsCardProps) {
  const [mode, setMode] = useState<'overview' | 'details'>('overview')
  const [section, setSection] = useState<Section>('problems')
  const key = JSON.stringify([
    reportContext.asOf,
    reportContext.timeZone,
    reportContext.timeZoneFallback,
    view.rows.map((row) => [row.rank, row.slug]),
  ])
  const [pagination, setPagination] = useState({ key, page: 0, copyPage: 0 })
  if (pagination.key !== key) setPagination({ key, page: 0, copyPage: 0 })
  const page = pagination.key === key ? pagination.page : 0
  const copyPage = pagination.key === key ? pagination.copyPage : 0
  const setPage = (page: number) =>
    setPagination((current) => ({ ...current, key, page }))
  const setCopyPage = (copyPage: number) =>
    setPagination((current) => ({ ...current, key, copyPage }))
  const scopePages = [
    <div key="counts" className="cp-signals-copy">
      <p>
        {view.totalQualifying} qualifying; {view.rows.length} returned by
        severity. The list shows up to 25 problems.
      </p>
      <p>
        Current active, non-suspended, reviewed problems with FSRS data. Current
        model estimates are independent of selected historical range.
      </p>
    </div>,
    <div key="context" className="cp-signals-copy">
      <p>As of {reportContext.asOf}</p>
      <p>
        Timezone: {reportContext.timeZone}
        {reportContext.timeZoneFallback ? ' (fallback)' : ''}.
      </p>
    </div>,
  ]
  const methodPages = [
    <div key="reasons" className="cp-signals-copy">
      <p>
        Below recall means estimated recall below the FSRS scheduling target,
        independent of your personal Recall goal. Overdue means due before the
        report's local date.
      </p>
      <p>
        Low durability means the modeled total latest-review-to-target interval
        is below 7 days. It is not time remaining or time until due.
      </p>
    </div>,
    <div key="rank" className="cp-signals-copy">
      <p>
        Severity order prioritizes below recall by largest shortfall, then
        overdue by most local days, then low durability by shortest total
        interval. Normalized title breaks ties.
      </p>
      <p>
        Each problem shows all of its current flags in their original order.
      </p>
    </div>,
  ]
  scopePages.reverse()
  const countCopy =
    view.totalQualifying > view.rows.length
      ? `${view.totalQualifying} qualifying; first ${view.rows.length} by severity`
      : `${view.totalQualifying} qualifying; ${view.rows.length} returned by severity`
  const isProblems = mode === 'overview' || section === 'problems'
  const copies = section === 'scope' ? scopePages : methodPages
  return (
    <AnalyticsChartPanel
      compact
      className="cp-memory-signals-card"
      id="analytics-memory-signals"
      title="Memory signals"
      description="Problems that need attention"
      mode={mode}
      headerAction={
        <Button
          className="cp-analytics-card-control"
          size="sm"
          variant="ghost"
          aria-label={
            mode === 'overview'
              ? 'Memory Signals Details'
              : 'Memory Signals Overview'
          }
          onClick={() => setMode(mode === 'overview' ? 'details' : 'overview')}
        >
          {mode === 'overview' ? 'Details' : 'Overview'}
        </Button>
      }
      hero={
        <div className="cp-signals-hero">
          <strong>{view.totalQualifying} qualifying</strong>
          <span>{countCopy}</span>
        </div>
      }
      footer={(geometry) =>
        isProblems ? (
          <AnalyticsCardPager
            label="Memory Signals problems"
            page={page}
            pageSize={pageSize(geometry, view.rows, mode === 'details')}
            rowCount={view.rows.length}
            onPageChange={setPage}
          />
        ) : (
          <AnalyticsCardPager
            label={`Memory Signals ${section} pages`}
            page={copyPage}
            pageSize={1}
            rowCount={copies.length}
            onPageChange={setCopyPage}
          />
        )
      }
    >
      {(geometry) => {
        const size = pageSize(geometry, view.rows, mode === 'details'),
          start = clampAnalyticsPage(page, view.rows.length, size) * size
        return (
          <div className="cp-signals-content">
            {mode === 'details' ? (
              <select
                className="cp-analytics-adapter-select"
                aria-label="Memory Signals detail section"
                value={section}
                onChange={(event) => {
                  setSection(event.target.value as Section)
                  setCopyPage(0)
                }}
              >
                <option value="problems">Problems</option>
                <option value="scope">Scope</option>
                <option value="method">Method</option>
              </select>
            ) : null}
            {isProblems ? (
              view.rows.length ? (
                <ol
                  className="cp-signals-problems"
                  aria-label={
                    mode === 'overview'
                      ? 'Memory Signals problems'
                      : 'Memory Signals exact problems'
                  }
                  start={view.rows[start]?.rank ?? 1}
                >
                  {view.rows.slice(start, start + size).map((row) => (
                    <li key={row.slug} value={row.rank}>
                      <div className="cp-signals-title">
                        <span>#{row.rank}</span>
                        <a
                          href={createLeetCodeProblemUrl(row.slug)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {row.title}
                        </a>
                      </div>
                      <ul className="cp-signals-reasons">
                        {row.reasons.map((reason, index) => (
                          <li
                            key={`${reason.kind}-${index}`}
                            data-signal-kind={reason.kind}
                          >
                            {mode === 'details' ? (
                              <span className="cp-signal-kind">
                                {reason.kind}:{' '}
                              </span>
                            ) : null}
                            {reason.label}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No current memory signals.</p>
              )
            ) : (
              copies[Math.min(copyPage, copies.length - 1)]
            )}
          </div>
        )
      }}
    </AnalyticsChartPanel>
  )
}
