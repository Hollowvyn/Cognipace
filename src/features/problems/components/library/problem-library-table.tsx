import { ArrowDown, ArrowUp } from 'lucide-react'
import type { MouseEvent } from 'react'
import {
  flexRender,
  type Header,
  type Row,
  type Table,
} from '@tanstack/react-table'

import { TablePagination } from '@/components/ui/table-pagination'
import { cn } from '@/utils/cn'

import type {
  ProblemLibraryOptions,
  ProblemLibraryRow,
} from '../../api/problems-contracts'
import {
  ProblemBulkActionBar,
  type RenderSelectedRowsAction,
} from './problem-bulk-action-bar'
import { problemLibraryColumnIds } from './problem-library-filtering'
import { ProblemLibraryRowDetails } from './problem-library-row-details'
import type { RenderProblemEditAction } from './problem-row-actions'

export function ProblemLibraryTable({
  options,
  renderEditProblemAction,
  renderSelectedRowsAction,
  table,
}: {
  options: ProblemLibraryOptions
  renderEditProblemAction: RenderProblemEditAction
  renderSelectedRowsAction?: RenderSelectedRowsAction | undefined
  table: Table<ProblemLibraryRow>
}) {
  const selectedRows = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original)

  return (
    <>
      <div className="overflow-x-auto border-t border-border bg-card">
        <table className="w-full min-w-[58rem] border-collapse text-left text-[length:var(--cp-copy-font-size)]">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                className="border-b border-border bg-muted/50 text-[length:var(--cp-badge-font-size)] uppercase tracking-normal text-muted-foreground"
                key={headerGroup.id}
              >
                {headerGroup.headers.map((header) => (
                  <SortableHeader header={header} key={header.id} />
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <ProblemLibraryTableRow
                key={row.id}
                renderEditProblemAction={renderEditProblemAction}
                row={row}
              />
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination
        pageSizeOptions={[20, 30, 50]}
        bulkActions={
          <ProblemBulkActionBar
            onClearSelection={() => table.resetRowSelection()}
            options={options}
            renderSelectedRowsAction={renderSelectedRowsAction}
            selectedRows={selectedRows}
          />
        }
        table={table}
      />
    </>
  )
}

function SortableHeader({
  header,
}: {
  header: Header<ProblemLibraryRow, unknown>
}) {
  const sortDirection = header.column.getIsSorted()
  const canSort = header.column.getCanSort()

  return (
    <th
      aria-sort={
        sortDirection
          ? sortDirection === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none'
      }
      className={getHeaderClassName(header.column.id)}
      scope="col"
    >
      {header.isPlaceholder ? null : canSort ? (
        <button
          className="inline-flex items-center gap-1 rounded-[var(--cp-radius-sm)] text-left uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={header.column.getToggleSortingHandler()}
          type="button"
        >
          {flexRender(header.column.columnDef.header, header.getContext())}
          {sortDirection ? (
            sortDirection === 'asc' ? (
              <ArrowUp aria-hidden="true" className="size-3" />
            ) : (
              <ArrowDown aria-hidden="true" className="size-3" />
            )
          ) : null}
        </button>
      ) : (
        flexRender(header.column.columnDef.header, header.getContext())
      )}
    </th>
  )
}

function ProblemLibraryTableRow({
  renderEditProblemAction,
  row,
}: {
  renderEditProblemAction: RenderProblemEditAction
  row: Row<ProblemLibraryRow>
}) {
  function handleRowClick(event: MouseEvent<HTMLTableRowElement>) {
    if (shouldIgnoreRowExpansionClick(event.target)) {
      return
    }

    row.toggleExpanded()
  }

  return (
    <>
      <tr
        className={cn(
          'cursor-pointer border-b border-border transition-colors hover:bg-muted/45',
          row.getIsExpanded() && 'bg-muted/55',
        )}
        onClick={handleRowClick}
      >
        {row.getVisibleCells().map((cell) =>
          cell.column.id === problemLibraryColumnIds.title ? (
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
            <ProblemLibraryRowDetails
              renderEditProblemAction={renderEditProblemAction}
              row={row.original}
            />
          </td>
        </tr>
      ) : null}
    </>
  )
}

function shouldIgnoreRowExpansionClick(target: EventTarget) {
  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(
    target.closest(
      'a,button,input,label,select,textarea,[role="button"],[role="link"]',
    ),
  )
}

function getHeaderClassName(columnId: string) {
  if (
    columnId === problemLibraryColumnIds.selection ||
    columnId === problemLibraryColumnIds.expander
  ) {
    return 'w-10 px-4 py-2.5 text-center font-semibold'
  }

  return 'px-3 py-2.5 font-semibold'
}

function getCellClassName(columnId: string) {
  switch (columnId) {
    case problemLibraryColumnIds.selection:
    case problemLibraryColumnIds.expander:
      return 'px-4 py-2.5 text-center align-middle'
    case problemLibraryColumnIds.title:
      return 'max-w-[22rem] px-3 py-2.5 align-middle'
    case problemLibraryColumnIds.retention:
    case problemLibraryColumnIds.lastReviewedAt:
    case problemLibraryColumnIds.nextReviewAt:
      return 'whitespace-nowrap px-3 py-2.5 align-middle'
    default:
      return 'px-3 py-2.5 align-middle'
  }
}
