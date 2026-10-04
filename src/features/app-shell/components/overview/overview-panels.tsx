import { ExternalLink } from 'lucide-react'
import { isValidElement, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button, type ButtonProps } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { Surface } from '@/components/ui/surface'
import { ProblemDifficultyBadge } from '@/features/problems'
import { createLeetCodeProblemUrl } from '@/lib/leetcode'

import type {
  DashboardOverviewMetricView,
  DashboardOverviewPrimaryView,
  DashboardOverviewView,
} from '../../domain/dashboard-overview'
import { getQueueItemStatusPresentation } from '../../domain/queue-item-status-presentation'

export function OverviewPrimaryPanel({
  libraryAction,
  primary,
}: {
  libraryAction: ReactNode
  primary: DashboardOverviewPrimaryView
}) {
  if (primary.kind === 'queue-clear') {
    return (
      <Surface
        aria-label={primary.kicker}
        className="grid w-full gap-4"
        role="region"
      >
        <div className="grid gap-1">
          <PanelKicker>{primary.kicker}</PanelKicker>
          <h2 className="m-0 text-[length:var(--cp-title-font-size)] font-bold leading-tight text-foreground">
            {primary.title}
          </h2>
          <p className="m-0 max-w-3xl text-[length:var(--cp-copy-font-size)] leading-relaxed text-muted-foreground">
            {primary.detail}
          </p>
        </div>
        <div>
          <ActionButton action={libraryAction} className="w-full sm:w-auto" />
        </div>
      </Surface>
    )
  }

  return (
    <Surface
      aria-label={primary.kicker}
      className="grid w-full gap-4"
      role="region"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <PanelKicker>{primary.kicker}</PanelKicker>
          <h2 className="m-0 break-words text-[length:var(--cp-title-font-size)] font-bold leading-tight text-foreground">
            {primary.title}
          </h2>
          <p className="m-0 mt-2 max-w-3xl text-[length:var(--cp-copy-font-size)] leading-relaxed text-muted-foreground">
            {primary.detail}
          </p>
          {primary.dueAt ? (
            <p className="m-0 mt-2 text-[length:var(--cp-badge-font-size)] font-semibold uppercase text-muted-foreground">
              Review date: {formatDateLabel(primary.dueAt)}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
          <Badge tone={primary.isOverdue ? 'danger' : 'warning'}>
            {primary.categoryLabel}
          </Badge>
          <ProblemDifficultyBadge difficulty={primary.problem.difficulty} />
        </div>
      </div>
      <div>
        <Button asChild className="w-full sm:w-auto">
          <a
            href={createLeetCodeProblemUrl(primary.problem.problemSlug)}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink aria-hidden="true" />
            {primary.actionLabel}
          </a>
        </Button>
      </div>
    </Surface>
  )
}

export function OverviewMetrics({
  metrics,
}: {
  metrics: readonly DashboardOverviewMetricView[]
}) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <Surface
          aria-label={`${metric.label} metric`}
          className="grid min-h-[6rem] gap-2 !p-4"
          key={metric.label}
        >
          <div className="text-[length:var(--cp-kicker-font-size)] font-bold uppercase leading-none text-muted-foreground">
            {metric.label}
          </div>
          <div className="text-3xl font-bold leading-none text-foreground tabular-nums">
            {metric.value}
          </div>
          <p className="m-0 text-[length:var(--cp-badge-font-size)] leading-snug text-muted-foreground">
            {metric.caption}
          </p>
        </Surface>
      ))}
    </div>
  )
}

export function OverviewActiveTrackPanel({
  activeTrack,
  tracksAction,
}: {
  activeTrack: DashboardOverviewView['activeTrack']
  tracksAction: ReactNode
}) {
  const nextProblem = activeTrack.nextProblem

  if (!nextProblem) {
    return (
      <Surface className="grid w-full gap-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0">
            <PanelKicker>Active Track</PanelKicker>
            <h2 className="m-0 break-words text-[length:var(--cp-title-font-size)] font-bold leading-tight text-foreground">
              {activeTrack.title}
            </h2>
            {activeTrack.description ? (
              <p className="m-0 mt-2 max-w-3xl text-[length:var(--cp-copy-font-size)] leading-relaxed text-muted-foreground">
                {activeTrack.description}
              </p>
            ) : null}
          </div>
          {hasTrackProgress(activeTrack) ? (
            <TrackProgressBadge activeTrack={activeTrack} />
          ) : null}
        </div>

        {hasTrackProgress(activeTrack) ? (
          <TrackProgressSummary activeTrack={activeTrack} />
        ) : null}

        <InlineStatus>{activeTrack.detail}</InlineStatus>
        <div>
          <ActionButton action={tracksAction} variant="outline" />
        </div>
      </Surface>
    )
  }

  return (
    <Surface className="grid w-full gap-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <PanelKicker>Active Track</PanelKicker>
          <h2 className="m-0 break-words text-[length:var(--cp-title-font-size)] font-bold leading-tight text-foreground">
            {activeTrack.title}
          </h2>
          {activeTrack.description ? (
            <p className="m-0 mt-2 max-w-3xl text-[length:var(--cp-copy-font-size)] leading-relaxed text-muted-foreground">
              {activeTrack.description}
            </p>
          ) : null}
        </div>
        <TrackProgressBadge activeTrack={activeTrack} />
      </div>

      <TrackProgressSummary activeTrack={activeTrack} />

      <div className="grid gap-3 border-t border-border pt-4">
        <div className="grid gap-2">
          <PanelKicker>Next Up</PanelKicker>
          <div className="text-[length:var(--cp-copy-font-size)] font-semibold leading-tight text-foreground">
            {nextProblem.title}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {activeTrack.groupTitle ? (
              <Badge tone="neutral">{activeTrack.groupTitle}</Badge>
            ) : null}
            <ProblemDifficultyBadge difficulty={nextProblem.difficulty} />
          </div>
          <p className="m-0 text-[length:var(--cp-badge-font-size)] leading-snug text-muted-foreground">
            {activeTrack.detail}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a
              href={createLeetCodeProblemUrl(nextProblem.problemSlug)}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" />
              Continue Path
            </a>
          </Button>
          <ActionButton action={tracksAction} variant="outline" />
        </div>
      </div>
    </Surface>
  )
}

export function OverviewQueuePreview({
  items,
}: {
  items: DashboardOverviewView['queuePreview']
}) {
  return (
    <Surface
      aria-label="Today Queue"
      className="grid w-full gap-4"
      role="region"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[length:var(--cp-title-font-size)] font-bold leading-tight text-foreground">
            Today Queue
          </h2>
        </div>
        <Badge tone="neutral">Showing {items.length}</Badge>
      </div>

      {items.length === 0 ? (
        <InlineStatus>No items are waiting in today's queue.</InlineStatus>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {items.map((item) => (
            <li
              className="grid min-w-0 gap-3 rounded-[var(--cp-panel-radius)] border border-border bg-background/40 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={`${item.category}:${item.problem.problemSlug}:${item.state.cardId}`}
            >
              <div className="min-w-0">
                <div className="truncate text-[length:var(--cp-copy-font-size)] font-semibold text-foreground">
                  {item.problem.title}
                </div>
                <div className="mt-1 text-[length:var(--cp-badge-font-size)] font-semibold uppercase text-muted-foreground">
                  {formatQueueItemState(item)}
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                <ProblemDifficultyBadge difficulty={item.problem.difficulty} />
                <Button asChild size="sm" variant="outline">
                  <a
                    aria-label={`Open ${item.problem.title}`}
                    href={createLeetCodeProblemUrl(item.problem.problemSlug)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <ExternalLink aria-hidden="true" />
                    Open
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  )
}

function TrackProgressBadge({
  activeTrack,
}: {
  activeTrack: DashboardOverviewView['activeTrack']
}) {
  return (
    <Badge
      className="shrink-0 justify-self-start md:justify-self-end"
      tone="warning"
    >
      {activeTrack.progress.percent}%
    </Badge>
  )
}

function TrackProgressSummary({
  activeTrack,
}: {
  activeTrack: DashboardOverviewView['activeTrack']
}) {
  return (
    <div className="grid gap-2">
      <div
        aria-label="Active track progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={activeTrack.progress.percent}
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${activeTrack.progress.percent}%` }}
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[length:var(--cp-badge-font-size)] text-muted-foreground">
        <span>
          {activeTrack.progress.completedCount}/
          {activeTrack.progress.totalCount} problems traversed
        </span>
        {activeTrack.groupTitle ? (
          <span>Current chapter: {activeTrack.groupTitle}</span>
        ) : null}
      </div>
    </div>
  )
}

function hasTrackProgress(activeTrack: DashboardOverviewView['activeTrack']) {
  return activeTrack.trackId !== null && activeTrack.progress.totalCount > 0
}

function ActionButton({
  action,
  className,
  size = 'md',
  variant = 'primary',
}: {
  action: ReactNode
  className?: string
  size?: ButtonProps['size']
  variant?: ButtonProps['variant']
}) {
  if (isValidElement(action)) {
    return (
      <Button asChild className={className} size={size} variant={variant}>
        {action}
      </Button>
    )
  }

  return (
    <Button className={className} size={size} variant={variant}>
      {action}
    </Button>
  )
}

function PanelKicker({ children }: { children: ReactNode }) {
  return (
    <div className="text-[length:var(--cp-kicker-font-size)] font-bold uppercase leading-none text-muted-foreground">
      {children}
    </div>
  )
}

function formatQueueItemState(
  item: DashboardOverviewView['queuePreview'][number],
) {
  const { label } = getQueueItemStatusPresentation(item.reason)

  return item.category === 'due' && item.state.dueAt
    ? `${label} · ${formatDateLabel(item.state.dueAt)}`
    : label
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function formatDateLabel(dateInput: string) {
  const date = new Date(dateInput)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  return dateFormatter.format(date)
}
