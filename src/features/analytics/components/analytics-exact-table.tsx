import { useEffect, useRef, useState, type ReactNode } from 'react'

import { clampAnalyticsPage } from './analytics-card-controls'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'

export interface AnalyticsExactField<Row> {
  key: string
  label: string
  value(row: Row): ReactNode
}

export interface AnalyticsExactFieldGroup {
  key: string
  label: string
  fieldKeys: readonly string[]
}

export interface AnalyticsExactTableProps<Row> {
  label: string
  rows: readonly Row[]
  rowKey: (row: Row) => string
  rowLabel: (row: Row) => ReactNode
  rowLabelHeading: string
  fields: readonly AnalyticsExactField<Row>[]
  groups?: readonly AnalyticsExactFieldGroup[]
  width: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  /** Change for a fresh range/dataset when the row identities stay the same. */
  resetKey?: string | number
  emptyMessage?: ReactNode
}

export function AnalyticsExactTable<Row>({
  label,
  rows,
  rowKey,
  rowLabel,
  rowLabelHeading,
  fields,
  groups,
  width,
  page,
  pageSize,
  onPageChange,
  resetKey,
  emptyMessage = 'No exact values available.',
}: AnalyticsExactTableProps<Row>) {
  const size = Math.max(1, Math.floor(pageSize))
  const currentPage = clampAnalyticsPage(page, rows.length, size)
  const dataKey = JSON.stringify(rows.map(rowKey))
  const previous = useRef({ dataKey, width, size, resetKey })
  useEffect(() => {
    const changed =
      previous.current.dataKey !== dataKey ||
      previous.current.width !== width ||
      previous.current.size !== size ||
      previous.current.resetKey !== resetKey
    previous.current = { dataKey, width, size, resetKey }
    const nextPage = changed ? 0 : currentPage
    if (nextPage !== page) onPageChange(nextPage)
  }, [dataKey, width, size, resetKey, currentPage, page, onPageChange])

  // Narrow cards expose one value with the complete row label. Split supplied
  // groups, and include ungrouped fields, so fitting never removes evidence.
  const columnCount = width >= 480 ? 3 : width >= 360 ? 2 : 1
  const sourceGroups = groups
    ? [...groups]
    : [
        {
          key: 'values',
          label: 'Exact values',
          fieldKeys: fields.map((field) => field.key),
        },
      ]
  const missing = fields.filter(
    (field) =>
      !sourceGroups.some((group) => group.fieldKeys.includes(field.key)),
  )
  if (missing.length)
    sourceGroups.push({
      key: 'more-values',
      label: 'More values',
      fieldKeys: missing.map((field) => field.key),
    })
  const fittedGroups = sourceGroups.flatMap((group) => {
    const groupFields = group.fieldKeys.flatMap((key) =>
      fields.filter((field) => field.key === key),
    )
    return Array.from(
      { length: Math.ceil(groupFields.length / columnCount) },
      (_, index) => {
        const visibleFields = groupFields.slice(
          index * columnCount,
          (index + 1) * columnCount,
        )
        return {
          key: `${group.key}-${index}`,
          label: `${group.label}: ${visibleFields.map((field) => field.label).join(', ')}`,
          fields: visibleFields,
        }
      },
    )
  })
  const [groupKey, setGroupKey] = useState('')
  const selectedGroupIndex = Math.max(
    0,
    fittedGroups.findIndex((group) => group.key === groupKey),
  )
  const selectedGroup = fittedGroups[selectedGroupIndex]
  if (!rows.length) return <InlineStatus>{emptyMessage}</InlineStatus>

  return (
    <div className="cp-analytics-exact-values">
      {fittedGroups.length > 1 ? (
        <nav
          aria-label={`${label} fields`}
          className="cp-analytics-exact-fields"
        >
          <div className="cp-analytics-exact-field-actions">
            <Button
              aria-label={`Previous ${label} fields`}
              className="cp-analytics-card-control"
              disabled={selectedGroupIndex === 0}
              onClick={() =>
                setGroupKey(fittedGroups[selectedGroupIndex - 1]!.key)
              }
              size="sm"
              variant="ghost"
            >
              Previous fields
            </Button>
            <span>
              {selectedGroupIndex + 1} of {fittedGroups.length}
            </span>
            <Button
              aria-label={`Next ${label} fields`}
              className="cp-analytics-card-control"
              disabled={selectedGroupIndex === fittedGroups.length - 1}
              onClick={() =>
                setGroupKey(fittedGroups[selectedGroupIndex + 1]!.key)
              }
              size="sm"
              variant="ghost"
            >
              Next fields
            </Button>
          </div>
          <p aria-live="polite">{selectedGroup?.label}</p>
        </nav>
      ) : null}
      <table
        aria-label={label}
        className="cp-analytics-exact-table"
        data-layout={width < 300 ? 'stacked' : 'columns'}
        data-value-columns={selectedGroup?.fields.length ?? 0}
        role="table"
      >
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">
              {rowLabelHeading}
            </th>
            {selectedGroup?.fields.map((field) => (
              <th key={field.key} role="columnheader" scope="col">
                {field.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows
            .slice(currentPage * size, (currentPage + 1) * size)
            .map((row) => (
              <tr key={rowKey(row)} role="row">
                <th role="rowheader" scope="row">
                  {rowLabel(row)}
                </th>
                {selectedGroup?.fields.map((field) => (
                  <td key={field.key} role="cell">
                    {field.value(row) ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
