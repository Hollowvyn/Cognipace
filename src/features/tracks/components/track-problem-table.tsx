import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type PaginationState,
  type Row,
  type Updater,
} from '@tanstack/react-table'

import { Badge } from '@/components/ui/badge'
import { TablePagination } from '@/components/ui/table-pagination'
import {
  ProblemDifficultyBadge,
  ProblemRowActionsBar,
  ProblemRowDetails,
  ProblemRowPracticeActions,
  ProblemStatusBadge,
  type RenderProblemEditAction,
} from '@/features/problems'
import { createLeetCodeProblemUrl } from '@/lib/leetcode'
import { cn } from '@/utils/cn'

import type { TrackProblemRow } from '../api/tracks-contracts'
import { TrackProblemRemoveAction } from './track-problem-remove-action'

export function TrackProblemTable({
  renderEditProblemAction,
  rows,
}: {
  renderEditProblemAction: RenderProblemEditAction
  rows: readonly TrackProblemRow[]
}) {
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 15,
  })
  const lastPageIndex = Math.max(
    0,
    Math.ceil(rows.length / pagination.pageSize) - 1,
  )

  if (pagination.pageIndex > lastPageIndex) {
    setPagination({ ...pagination, pageIndex: lastPageIndex })
  }
  const columns = useMemo(() => createTrackProblemColumns(), [])
  const data = useMemo(
    () =>
      [...rows].sort(
        (rowA, rowB) =>
          rowA.membership.problemPosition - rowB.membership.problemPosition,
      ),
    [rows],
  )

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table owns table state and exposes non-memoizable handlers by design.
  const table = useReactTable({
    autoResetPageIndex: false,
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowCanExpand: () => true,
    getRowId: (row) =>
      `${row.membership.groupId}:${row.membership.problemPosition}:${row.problem.slug}`,
    onExpandedChange: (updater) => {
      setExpanded((current) => getSingleExpandedRow(updater, current))
    },
    onPaginationChange: setPagination,
    state: {
      expanded,
      pagination,
    },
  })

  if (rows.length === 0) {
    return (
      <div className="border-t border-border px-4 py-5 md:px-5">
        No problems in this group.
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto border-t border-border bg-card">
        <table className="w-full min-w-[54rem] border-collapse text-left text-[length:var(--cp-copy-font-size)]">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                className="border-b border-border bg-muted/50 text-[length:var(--cp-badge-font-size)] uppercase tracking-normal text-muted-foreground"
                key={headerGroup.id}
              >
                {headerGroup.headers.map((header) => (
                  <th
                    className={getHeaderClassName(header.column.id)}
                    key={header.id}
                    scope="col"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <TrackProblemTableRow
                key={row.id}
                renderEditProblemAction={renderEditProblemAction}
                row={row}
              />
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination table={table} />
    </>
  )
}

function TrackProblemTableRow({
  renderEditProblemAction,
  row,
}: {
  renderEditProblemAction: RenderProblemEditAction
  row: Row<TrackProblemRow>
}) {
  const [isRemoving, setIsRemoving] = useState(false)
  const [isPracticePending, setIsPracticePending] = useState(false)
  return (
    <>
      <tr
        className={cn(
          'border-b border-border transition-colors',
          row.getIsExpanded() && 'bg-muted/55',
        )}
      >
        {row.getVisibleCells().map((cell) =>
          cell.column.id === trackProblemColumnIds.problem ? (
            <th
              className={getCellClassName(cell.column.id)}
              key={cell.id}
              scope="row"
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </th>
          ) : (
            <td className={getCellClassName(cell.column.id)} key={cell.id}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ),
        )}
      </tr>
      {row.getIsExpanded() ? (
        <tr className="border-b border-border bg-background/35">
          <td
            className="px-6 py-5 md:px-8"
            colSpan={row.getVisibleCells().length}
          >
            {row.original.membership.completion.status === 'completed' ? (
              <p className="mb-4 flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {row.original.membership.completion.source === 'external'
                    ? 'External progress'
                    : 'Completed in this track'}
                </span>
                <span>
                  {formatDateCell(
                    row.original.membership.completion.completedAt,
                  )}
                </span>
                <span>
                  {row.original.membership.completion.completedRating === 'hard'
                    ? 'Hard'
                    : row.original.membership.completion.completedRating ===
                        'good'
                      ? 'Good'
                      : 'Easy'}
                </span>
              </p>
            ) : null}
            <ProblemRowDetails
              actions={
                <ProblemRowActionsBar>
                  <ProblemRowPracticeActions
                    afterEditAction={
                      <TrackProblemRemoveAction
                        disabled={isPracticePending || isRemoving}
                        onPendingChange={setIsRemoving}
                        row={row.original}
                      />
                    }
                    disabled={isRemoving}
                    onPendingChange={setIsPracticePending}
                    renderEditProblemAction={renderEditProblemAction}
                    row={row.original}
                  />
                </ProblemRowActionsBar>
              }
              row={row.original}
            />
          </td>
        </tr>
      ) : null}
    </>
  )
}

function createTrackProblemColumns(): ColumnDef<TrackProblemRow>[] {
  return [
    {
      id: trackProblemColumnIds.order,
      accessorFn: (row) => row.membership.problemPosition,
      header: 'Order',
      cell: ({ row }) => <ProblemOrderCell row={row} />,
    },
    {
      id: trackProblemColumnIds.problem,
      accessorFn: (row) => row.problem.title,
      header: 'Problem',
      cell: ({ row }) => <ProblemTitleCell row={row.original} />,
    },
    {
      id: trackProblemColumnIds.difficulty,
      accessorFn: (row) => row.problem.difficulty,
      header: 'Difficulty',
      cell: ({ row }) => (
        <ProblemDifficultyBadge difficulty={row.original.problem.difficulty} />
      ),
    },
    {
      id: trackProblemColumnIds.trackCompletion,
      accessorFn: (row) =>
        row.membership.completion.status === 'completed'
          ? row.membership.completion.completedAt
          : undefined,
      header: 'Completed',
      cell: ({ row }) => <TrackCompletionBadge row={row.original} />,
    },
    {
      id: trackProblemColumnIds.review,
      accessorFn: (row) => row.status,
      header: 'Review',
      cell: ({ row }) => <ProblemStatusBadge status={row.original.status} />,
    },
    {
      id: trackProblemColumnIds.lastReview,
      accessorFn: (row) => row.lastReviewedAt ?? undefined,
      header: 'Last Review',
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {formatDateCell(row.original.lastReviewedAt, 'Never reviewed')}
        </span>
      ),
    },
    {
      id: trackProblemColumnIds.nextReview,
      accessorFn: (row) => row.nextReviewAt ?? undefined,
      header: 'Next Review',
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {formatDateCell(row.original.nextReviewAt, 'Unscheduled')}
        </span>
      ),
    },
  ]
}

function ProblemOrderCell({ row }: { row: Row<TrackProblemRow> }) {
  const isExpanded = row.getIsExpanded()

  return (
    <div className="inline-flex items-center gap-2">
      <button
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${row.original.problem.title}`}
        className="inline-flex size-7 items-center justify-center rounded-[var(--cp-control-radius)] text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={row.getToggleExpandedHandler()}
        type="button"
      >
        <DisclosureIcon icon={isExpanded ? ChevronDown : ChevronRight} />
      </button>
      <span className="tabular-nums text-muted-foreground">
        {row.original.membership.problemPosition}
      </span>
    </div>
  )
}

function ProblemTitleCell({ row }: { row: TrackProblemRow }) {
  return (
    <a
      className={cn(
        'block min-w-0 truncate font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        row.status === 'suspended' &&
          'text-muted-foreground line-through decoration-muted-foreground/80 hover:text-foreground',
      )}
      href={createLeetCodeProblemUrl(row.problem.slug)}
      onClick={(event) => event.stopPropagation()}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="truncate">{row.problem.title}</span>
    </a>
  )
}

function TrackCompletionBadge({ row }: { row: TrackProblemRow }) {
  const isCompleted = row.membership.completion.status === 'completed'

  return (
    <Badge
      data-cp-track-completed={isCompleted ? 'true' : 'false'}
      tone={isCompleted ? 'success' : 'danger'}
    >
      {isCompleted ? 'Yes' : 'No'}
    </Badge>
  )
}

function DisclosureIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden="true" className="size-4" />
}

function getSingleExpandedRow(
  updater: Updater<ExpandedState>,
  current: ExpandedState,
) {
  const next = typeof updater === 'function' ? updater(current) : updater

  if (next === true) {
    return current
  }

  const expandedRowIds = Object.keys(next).filter((rowId) => next[rowId])
  const rowId = expandedRowIds[expandedRowIds.length - 1]

  return rowId ? { [rowId]: true } : {}
}

function getHeaderClassName(columnId: string) {
  if (columnId === trackProblemColumnIds.order) {
    return 'w-28 px-4 py-2.5 font-semibold'
  }

  return 'px-3 py-2.5 font-semibold'
}

function getCellClassName(columnId: string) {
  switch (columnId) {
    case trackProblemColumnIds.order:
      return 'px-4 py-2.5 align-middle'
    case trackProblemColumnIds.problem:
      return 'max-w-[22rem] px-3 py-2.5 align-middle'
    case trackProblemColumnIds.lastReview:
    case trackProblemColumnIds.nextReview:
      return 'whitespace-nowrap px-3 py-2.5 align-middle'
    default:
      return 'px-3 py-2.5 align-middle'
  }
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function formatDateCell(value: string | null, emptyLabel = '—') {
  if (!value) {
    return emptyLabel
  }

  return dateFormatter.format(new Date(value))
}

const trackProblemColumnIds = {
  difficulty: 'difficulty',
  lastReview: 'lastReview',
  nextReview: 'nextReview',
  order: 'order',
  problem: 'problem',
  review: 'review',
  trackCompletion: 'trackCompletion',
} as const
