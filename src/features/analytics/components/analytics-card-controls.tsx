import type { RefObject } from 'react'

import { Button } from '@/components/ui/button'

export interface AnalyticsCardControlsProps<Value extends string> {
  label: string
  value: Value
  options: readonly { value: Value; label: string; disabled?: boolean }[]
  onChange: (value: Value) => void
}

export function AnalyticsCardControls<Value extends string>({
  label,
  value,
  options,
  onChange,
}: AnalyticsCardControlsProps<Value>) {
  return (
    <div aria-label={label} className="cp-analytics-card-controls" role="group">
      {options.map((option) => (
        <Button
          aria-label={`${label}: ${option.label}`}
          aria-pressed={option.value === value}
          className="cp-analytics-card-control"
          disabled={option.disabled}
          key={option.value}
          onClick={() => onChange(option.value)}
          size="sm"
          variant={option.value === value ? 'secondary' : 'ghost'}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

export function clampAnalyticsPage(
  page: number,
  rowCount: number,
  pageSize: number,
) {
  return Math.max(0, Math.min(page, Math.ceil(rowCount / pageSize) - 1))
}

export interface AnalyticsCardPagerProps {
  label: string
  page: number
  pageSize: number
  rowCount: number
  onPageChange: (page: number) => void
}

export function AnalyticsCardPager({
  label,
  page,
  pageSize,
  rowCount,
  onPageChange,
}: AnalyticsCardPagerProps) {
  const size = Math.max(1, Math.floor(pageSize))
  const currentPage = clampAnalyticsPage(page, rowCount, size)
  const start = rowCount === 0 ? 0 : currentPage * size + 1
  const end = Math.min(rowCount, (currentPage + 1) * size)
  return (
    <nav aria-label={label} className="cp-analytics-card-pager">
      <Button
        aria-label={`Previous ${label}`}
        className="cp-analytics-card-control"
        disabled={currentPage === 0}
        onClick={() => onPageChange(currentPage - 1)}
        size="sm"
        variant="ghost"
      >
        Previous
      </Button>
      <span aria-live="polite">
        {start}–{end} of {rowCount}
      </span>
      <Button
        aria-label={`Next ${label}`}
        className="cp-analytics-card-control"
        disabled={end >= rowCount}
        onClick={() => onPageChange(currentPage + 1)}
        size="sm"
        variant="ghost"
      >
        Next
      </Button>
    </nav>
  )
}

export interface AnalyticsCardCloseButtonProps {
  label: string
  onClose: () => void
  returnFocusRef: RefObject<HTMLElement | null>
}

export function AnalyticsCardCloseButton({
  label,
  onClose,
  returnFocusRef,
}: AnalyticsCardCloseButtonProps) {
  const close = () => {
    onClose()
    requestAnimationFrame(() => returnFocusRef.current?.focus())
  }
  return (
    <Button
      aria-label={label}
      className="cp-analytics-card-control"
      onClick={close}
      size="sm"
      variant="ghost"
    >
      Close
    </Button>
  )
}
