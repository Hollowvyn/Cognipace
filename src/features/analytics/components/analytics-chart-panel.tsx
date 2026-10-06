import { useEffect, useRef, useState, type ReactNode } from 'react'

import { InlineStatus } from '@/components/ui/inline-status'
import { Surface } from '@/components/ui/surface'
import { cn } from '@/utils/cn'

export type AnalyticsCardMode = 'overview' | 'details' | 'goals' | 'selection'

export interface AnalyticsCardGeometry {
  width: number
  bodyHeight: number
  tablePageSize: number
  problemPageSize: number
}

type AnalyticsCardContent =
  | ReactNode
  | ((geometry: AnalyticsCardGeometry) => ReactNode)

function cardGeometry(
  width: number,
  bodyHeight: number,
): AnalyticsCardGeometry {
  const wide = width >= 360
  return {
    width,
    bodyHeight,
    tablePageSize: Math.max(
      1,
      Math.min(wide ? 4 : 3, Math.floor((bodyHeight - 56) / 44)),
    ),
    problemPageSize: Math.max(
      1,
      Math.min(wide ? 3 : 2, Math.floor((bodyHeight - 18) / 70)),
    ),
  }
}

export interface AnalyticsChartPanelProps {
  children?: AnalyticsCardContent
  className?: string
  compact?: boolean
  compactBody?: boolean
  description: string
  emptyMessage?: ReactNode
  footer?: AnalyticsCardContent
  headerAction?: ReactNode
  hero?: ReactNode
  historical?: boolean
  id: string
  mode?: AnalyticsCardMode
  question?: string | undefined
  title: string
  warning?: string | undefined
}

export function AnalyticsChartPanel({
  children,
  className,
  compact = false,
  compactBody = false,
  description,
  emptyMessage,
  footer,
  headerAction,
  hero,
  historical = false,
  id,
  mode = 'overview',
  question,
  title,
  warning,
}: AnalyticsChartPanelProps) {
  const titleId = `${id}-title`
  const questionId = `${id}-question`
  const descriptionId = `${id}-description`
  const hasEmptyState = emptyMessage !== undefined && emptyMessage !== null
  const bodyRef = useRef<HTMLDivElement>(null)
  const [geometry, setGeometry] = useState(() =>
    cardGeometry(400, mode === 'overview' ? 234 : 306),
  )

  useEffect(() => {
    const body = bodyRef.current
    if (!compact || !body || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === body)
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width <= 0 || height <= 0) return
      setGeometry((current) =>
        current.width === width && current.bodyHeight === height
          ? current
          : cardGeometry(width, height),
      )
    })
    observer.observe(body)
    return () => observer.disconnect()
  }, [compact])

  const content = typeof children === 'function' ? children(geometry) : children
  const footerContent = typeof footer === 'function' ? footer(geometry) : footer

  if (compact) {
    return (
      <Surface
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className={cn('cp-analytics-card', className)}
        data-analytics-historical={historical ? '' : undefined}
        data-mode={mode}
        id={id}
        role="region"
      >
        <header className="cp-analytics-card-header">
          <div className="cp-analytics-card-heading">
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          {headerAction}
        </header>
        <div className="cp-analytics-card-hero" hidden={mode !== 'overview'}>
          {hero}
        </div>
        <div
          className={cn(
            'cp-analytics-card-body',
            hasEmptyState && 'grid place-items-center',
          )}
          ref={bodyRef}
        >
          {hasEmptyState ? (
            <InlineStatus>{emptyMessage}</InlineStatus>
          ) : (
            content
          )}
        </div>
        <footer className="cp-analytics-card-footer">
          {footerContent}
          {warning ? <p className="m-0">{warning}</p> : null}
        </footer>
      </Surface>
    )
  }

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
          'min-w-0',
          !compactBody && 'min-h-[16rem]',
          hasEmptyState && 'grid place-items-center',
        )}
      >
        {hasEmptyState ? <InlineStatus>{emptyMessage}</InlineStatus> : content}
      </div>

      {footerContent ? (
        <footer className="min-w-0 text-[length:var(--cp-badge-font-size)] leading-snug text-muted-foreground">
          {footerContent}
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
