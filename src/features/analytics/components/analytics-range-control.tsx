import { useNavigate } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import type { AnalyticsRange } from '../api/analytics-contracts'
import { cn } from '@/utils/cn'

const rangeOptions: readonly { label: string; value: AnalyticsRange }[] = [
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: 'All time', value: 'all' },
]

export function AnalyticsRangeControl({ range }: { range: AnalyticsRange }) {
  const navigate = useNavigate({ from: '/analytics' })

  return (
    <div
      aria-labelledby="analytics-range-control-label"
      className="flex w-full min-w-0 max-w-full flex-wrap items-center rounded-[var(--cp-control-radius)] border border-border bg-card p-1 sm:inline-flex sm:w-auto"
      role="group"
    >
      <span className="sr-only" id="analytics-range-control-label">
        Analytics time range
      </span>
      {rangeOptions.map((option) => {
        const selected = option.value === range

        return (
          <Button
            aria-pressed={selected}
            className={cn(
              'min-w-0 flex-1 whitespace-nowrap border-transparent px-2 text-muted-foreground sm:min-w-[4.75rem] sm:flex-none sm:px-3',
              selected && 'bg-muted text-foreground',
            )}
            key={option.value}
            onClick={() => {
              if (selected) return

              void navigate({
                search: (previous) => ({
                  ...previous,
                  range: option.value,
                }),
              })
            }}
            size="sm"
            variant="ghost"
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
