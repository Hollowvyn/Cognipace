import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Table } from '@tanstack/react-table'

import { Button } from './button'

export function TablePagination<TData>({
  bulkActions,
  table,
  pageSizeOptions,
}: {
  bulkActions?: ReactNode
  table: Table<TData>
  pageSizeOptions?: readonly number[]
}) {
  const filteredCount = table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize } = table.getState().pagination
  const firstRow = filteredCount === 0 ? 0 : pageIndex * pageSize + 1
  const lastRow = Math.min(filteredCount, (pageIndex + 1) * pageSize)

  if (filteredCount === 0) {
    return null
  }

  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-2 text-[length:var(--cp-copy-font-size)] text-muted-foreground md:px-5">
      <div className="min-w-0 flex-1">{bulkActions}</div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {pageSizeOptions ? (
          <label className="inline-flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              aria-label="Rows per page"
              className="h-8 rounded-[var(--cp-control-radius)] border border-border bg-background px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onChange={(event) => {
                table.setPageSize(Number(event.target.value))
              }}
              value={pageSize}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span>Rows per page: {pageSize}</span>
        )}
        <span className="min-w-28 text-right tabular-nums">
          {firstRow}-{lastRow} of {filteredCount}
        </span>
        {table.getPageCount() > 1 ? (
          <div className="inline-flex items-center gap-1">
            <Button
              aria-label="Previous page"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              size="icon"
              variant="ghost"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              aria-label="Next page"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              size="icon"
              variant="ghost"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
