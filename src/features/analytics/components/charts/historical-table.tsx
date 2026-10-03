import { useState } from 'react'

/** Exact feature-owned historical values with the existing seven-row paging. */
export function HistoricalTable<Row extends { id: string }>({
  caption,
  headers,
  rows,
  cells,
  resetKey,
}: {
  caption: string
  headers: readonly string[]
  rows: readonly Row[]
  cells: (row: Row) => Array<string | number>
  resetKey: string
}) {
  const [pagination, setPagination] = useState({ key: resetKey, page: 0 })
  const page = pagination.key === resetKey ? pagination.page : 0
  const pageSize = 7
  const visible = rows.slice(page * pageSize, (page + 1) * pageSize)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  return (
    <div className="grid min-w-0 gap-3">
      <div className="min-w-0 overflow-x-auto pb-2">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {headers.map((header) => (
                <th
                  className="px-2 py-2 text-left font-semibold"
                  key={header}
                  scope="col"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr className="border-t border-border" key={row.id}>
                {cells(row).map((cell, index) =>
                  index === 0 ? (
                    <th
                      className="px-2 py-2 text-left font-medium"
                      key={`${row.id}-${headers[index]}`}
                      scope="row"
                    >
                      {cell}
                    </th>
                  ) : (
                    <td
                      className="px-2 py-2 text-right tabular-nums"
                      key={`${row.id}-${headers[index]}`}
                    >
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            Page {page + 1} of {pages}
          </span>
          <button
            className="rounded border px-2 py-1 text-sm disabled:opacity-50"
            disabled={page === 0}
            onClick={() =>
              setPagination({ key: resetKey, page: Math.max(0, page - 1) })
            }
            type="button"
          >
            Previous
          </button>
          <button
            className="rounded border px-2 py-1 text-sm disabled:opacity-50"
            disabled={page >= pages - 1}
            onClick={() =>
              setPagination({
                key: resetKey,
                page: Math.min(pages - 1, page + 1),
              })
            }
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}
