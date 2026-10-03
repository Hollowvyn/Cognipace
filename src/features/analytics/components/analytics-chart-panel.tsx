import type { ReactNode } from 'react'

import { InlineStatus } from '@/components/ui/inline-status'
import { Surface } from '@/components/ui/surface'
import { cn } from '@/utils/cn'

export interface AnalyticsChartPanelProps {
  children?: ReactNode
  className?: string
  description: string
  emptyMessage?: ReactNode
  footer?: ReactNode
  historical?: boolean
  id: string
  question?: string | undefined
  title: string
  warning?: string | undefined
}

export function AnalyticsChartPanel({
  children,
  className,
  description,
  emptyMessage,
  footer,
  historical = false,
  id,
  question,
  title,
  warning,
}: AnalyticsChartPanelProps) {
  const titleId = `${id}-title`
  const questionId = `${id}-question`
  const descriptionId = `${id}-description`
  const hasEmptyState = emptyMessage !== undefined && emptyMessage !== null

  return (
    <Surface
      aria-describedby={
        question ? `${questionId} ${descriptionId}` : descriptionId
      }
      aria-labelledby={titleId}
      className={cn('grid min-w-0 gap-4', className)}
      data-analytics-historical={historical ? '' : undefined}
      id={id}
      role="region"
    >
      <header className="grid min-w-0 gap-1">
        <h2
          className="m-0 text-[length:var(--cp-section-title-font-size)] font-bold leading-tight text-foreground"
          id={titleId}
        >
          {title}
        </h2>
        {question ? (
          <p
            className="m-0 text-[length:var(--cp-copy-font-size)] font-medium leading-relaxed text-foreground"
            id={questionId}
          >
            {question}
          </p>
        ) : null}
        <p
          className="m-0 max-w-3xl text-[length:var(--cp-copy-font-size)] leading-relaxed text-muted-foreground"
          id={descriptionId}
        >
          {description}
        </p>
      </header>

      <div
        className={cn(
          'min-h-[16rem] min-w-0',
          hasEmptyState && 'grid place-items-center',
        )}
      >
        {hasEmptyState ? <InlineStatus>{emptyMessage}</InlineStatus> : children}
      </div>

      {footer ? (
        <footer className="min-w-0 text-[length:var(--cp-badge-font-size)] leading-snug text-muted-foreground">
          {footer}
        </footer>
      ) : null}
      {warning ? (
        <p className="m-0 text-[length:var(--cp-badge-font-size)] leading-snug text-muted-foreground">
          {warning}
        </p>
      ) : null}
    </Surface>
  )
}
