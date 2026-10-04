import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ChartTable } from '@/components/ui/chart-table'
import { createLeetCodeProblemUrl } from '@/lib/leetcode'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { formatCount, formatPercent } from './charts/chart-shared'
import { RetentionMapChart } from './retention-map-chart'
import {
  formatDate,
  formatDuration,
  formatGap,
  statusColor,
  statusLabel,
} from './retention-map-model'

export function RetentionMapView({
  timeZone = 'UTC',
  view,
}: {
  timeZone?: string
  view: AnalyticsViews['retentionMap']
}) {
  const [belowTarget, setBelowTarget] = useState(false)
  const rows = useMemo(
    () =>
      belowTarget
        ? view.rows.filter((row) => row.retrievability < view.targetRetention)
        : view.rows,
    [belowTarget, view.rows, view.targetRetention],
  )
  if (view.rows.length === 0)
    return (
      <Empty message="No active reviewed problems have enough current FSRS data for the Retention Map." />
    )
  const counts = [
    ['on-target', view.statusCounts.onTarget, '●'],
    ['watch', view.statusCounts.watch, '◆'],
    ['needs-attention', view.statusCounts.needsAttention, '▲'],
  ] as const
  return (
    <div className="cp-retention-map grid min-w-0 gap-3">
      <div className="cp-retention-summary">
        <p className="m-0 text-sm text-muted-foreground">
          All {formatCount(view.totalEligible)} eligible reviewed{' '}
          {view.totalEligible === 1 ? 'problem' : 'problems'}
        </p>
        <div aria-label="Retention Map filter" className="flex gap-1">
          <Button
            aria-pressed={!belowTarget}
            onClick={() => setBelowTarget(false)}
            size="sm"
            variant={!belowTarget ? 'primary' : 'outline'}
          >
            All
          </Button>
          <Button
            aria-pressed={belowTarget}
            onClick={() => setBelowTarget(true)}
            size="sm"
            variant={belowTarget ? 'primary' : 'outline'}
          >
            Below target
          </Button>
        </div>
      </div>
      <ul
        aria-label="Retention Map status counts"
        className="cp-retention-status-counts"
        role="list"
      >
        {counts.map(([status, count, shape]) => (
          <li key={status}>
            <span aria-hidden="true" style={{ color: statusColor(status) }}>
              {shape}
            </span>
            <span>
              {formatCount(count)} {statusLabel(status)}
            </span>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          No reviewed problems are below the FSRS scheduling target.
        </p>
      ) : null}
      <ChartTable
        chart={
          <RetentionMapChart rows={rows} timeZone={timeZone} view={view} />
        }
        table={<RetentionMapTable rows={rows} timeZone={timeZone} />}
      />
    </div>
  )
}

export function MemorySignalsView({
  view,
}: {
  view: AnalyticsViews['memorySignals']
}) {
  if (view.rows.length === 0) {
    return <Empty message="No current problems meet these attention signals." />
  }

  return (
    <div className="grid gap-2">
      <p className="m-0 text-sm text-muted-foreground">
        {formatCount(view.totalQualifying)} qualifying problem
        {view.totalQualifying === 1 ? '' : 's'}; showing the first{' '}
        {formatCount(view.rows.length)} by severity.
      </p>
      <MemorySignalsList rows={view.rows} />
    </div>
  )
}

function RetentionMapTable({
  rows,
  timeZone,
}: {
  rows: AnalyticsViews['retentionMap']['rows']
  timeZone: string
}) {
  const { page, setPage, visibleRows, start, end, pageCount } = usePagination(
    rows,
    7,
  )
  return (
    <div className="grid gap-3">
      <div className="min-w-0 overflow-x-auto">
        <table
          aria-label={`Retention Map rows ${start} through ${end} of ${rows.length}`}
          className="w-full min-w-[64rem] border-collapse text-left text-sm"
        >
          <caption className="sr-only">Retention Map data table</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted-foreground">
              {[
                'Rank',
                'Problem',
                'Estimated recall now',
                'FSRS target',
                'Target gap',
                'Memory durability',
                'Last reviewed',
                'Due',
                'Difficulty',
                'Lapses',
                'Status',
              ].map((label) => (
                <th className="px-2 pb-2" key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr className="border-b border-border align-top" key={row.slug}>
                <td className="px-2 py-2 text-right tabular-nums">
                  {row.rank}
                </td>
                <th className="px-2 py-2 font-medium" scope="row">
                  <a
                    className="text-primary underline-offset-4 hover:underline"
                    href={createLeetCodeProblemUrl(row.slug)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {row.title}
                  </a>
                </th>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatPercent(row.retrievability)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatPercent(row.targetRetention)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatGap(row.targetGap)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatDuration(row.targetDurationDays)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatDate(row.lastReviewedAt, timeZone)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatDate(row.dueAt, timeZone)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {row.difficulty.toFixed(1)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatCount(row.lapseCount)}
                </td>
                <td className="px-2 py-2">{statusLabel(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        end={end}
        onNext={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
        onPrevious={() => setPage((value) => Math.max(0, value - 1))}
        page={page}
        pageCount={pageCount}
        start={start}
        total={rows.length}
      />
    </div>
  )
}

function MemorySignalsList({
  rows,
}: {
  rows: AnalyticsViews['memorySignals']['rows']
}) {
  const { page, setPage, visibleRows, start, end, pageCount } = usePagination(
    rows,
    5,
  )
  return (
    <div className="grid w-full max-w-[36rem] gap-3 [&>div]:flex-wrap">
      <ol
        aria-label={`Memory Signals rows ${start} through ${end} of ${rows.length}`}
        className="m-0 grid list-none divide-y divide-border p-0 text-sm"
        role="list"
        start={start}
      >
        {visibleRows.map((row) => (
          <li
            className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 py-3"
            key={row.slug}
            value={row.rank}
          >
            <span className="text-center text-xs text-muted-foreground tabular-nums">
              {row.rank}
            </span>
            <div className="min-w-0">
              <a
                className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [overflow-wrap:anywhere]"
                href={createLeetCodeProblemUrl(row.slug)}
                rel="noopener noreferrer"
                target="_blank"
              >
                {row.title}
              </a>
              <p className="m-0 mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
                {row.reasons.map((reason) => (
                  <span
                    className="min-w-0 [overflow-wrap:anywhere]"
                    key={reason.kind}
                    style={{
                      color:
                        reason.kind === 'below-recall'
                          ? 'var(--cp-analytics-risk)'
                          : reason.kind === 'overdue'
                            ? 'var(--cp-analytics-attention)'
                            : 'var(--color-muted-foreground)',
                    }}
                  >
                    {reason.label}
                  </span>
                ))}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <Pagination
        end={end}
        onNext={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
        onPrevious={() => setPage((value) => Math.max(0, value - 1))}
        page={page}
        pageCount={pageCount}
        start={start}
        total={rows.length}
      />
    </div>
  )
}

function usePagination<T>(rows: readonly T[], pageSize: number) {
  const [page, setPage] = useState(0)
  const [previousRows, setPreviousRows] = useState(rows)
  if (rows !== previousRows) {
    setPreviousRows(rows)
    setPage(0)
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleRows = rows.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  )
  const start = rows.length === 0 ? 0 : currentPage * pageSize + 1
  return {
    page: currentPage,
    setPage,
    visibleRows,
    start,
    end: visibleRows.length === 0 ? 0 : start + visibleRows.length - 1,
    pageCount,
  }
}

function Pagination({
  end,
  onNext,
  onPrevious,
  page,
  pageCount,
  start,
  total,
}: {
  end: number
  onNext: () => void
  onPrevious: () => void
  page: number
  pageCount: number
  start: number
  total: number
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p
        aria-live="polite"
        className="m-0 text-xs text-muted-foreground"
        role="status"
      >
        Showing {start}–{end} of {total}
      </p>
      <div className="flex gap-2">
        <Button
          aria-label="Previous page"
          disabled={page === 0}
          onClick={onPrevious}
          size="sm"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          aria-label="Next page"
          disabled={page >= pageCount - 1}
          onClick={onNext}
          size="sm"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  )
}

function Empty({ message }: { message: string }) {
  return <p className="m-0 text-sm text-muted-foreground">{message}</p>
}
