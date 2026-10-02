import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ListChecks,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { IconButton } from '@/components/ui/icon-button'
import { InlineStatus } from '@/components/ui/inline-status'
import { Surface } from '@/components/ui/surface'
import { createLeetCodeProblemUrl } from '@/lib/leetcode'
import { cn } from '@/utils/cn'

import { useSetActiveGroup } from '../api/tracks-api'
import type {
  SerializedActiveTrack,
  SerializedTrack,
  SerializedTrackGroup,
  TrackProblemRow,
} from '../api/tracks-contracts'
import { getTrackTargetStatus } from '../domain'
import { TrackActions } from './track-actions'
import { TrackProblemTable } from './track-problem-table'
import type { RenderProblemEditAction } from '@/features/problems'

export type RenderTrackEditAction = (track: SerializedTrack) => ReactNode

export function ActiveTrackWorkspace({
  activeTrack,
  groups,
  renderEditProblemAction,
  renderEditTrackAction,
  rows,
  dueCount,
  generatedAt,
}: {
  activeTrack: NonNullable<SerializedActiveTrack>
  dueCount: number
  generatedAt: string
  groups: readonly SerializedTrackGroup[]
  renderEditProblemAction: RenderProblemEditAction
  renderEditTrackAction: RenderTrackEditAction
  rows: readonly TrackProblemRow[]
}) {
  const activeGroupId = activeTrack.activeGroup?.id ?? groups[0]?.id ?? null
  const activeRows = activeGroupId
    ? rows.filter((row) => row.membership.groupId === activeGroupId)
    : rows
  const groupProgressById = getGroupProgressById(groups, rows)

  return (
    <Surface className="grid w-full overflow-hidden p-0">
      <ActiveTrackHeader
        activeTrack={activeTrack}
        dueCount={dueCount}
        generatedAt={generatedAt}
        renderEditTrackAction={renderEditTrackAction}
      />
      <ActiveTrackGroups
        activeGroupId={activeGroupId}
        groupProgressById={groupProgressById}
        groups={groups}
        trackId={activeTrack.track.id}
      />
      {groups.length === 0 ? (
        <div className="border-t border-border px-4 py-5 md:px-5">
          <InlineStatus>No groups in this track.</InlineStatus>
        </div>
      ) : (
        <TrackProblemTable
          key={`${activeTrack.track.id}:${activeGroupId}`}
          renderEditProblemAction={renderEditProblemAction}
          rows={activeRows}
        />
      )}
    </Surface>
  )
}

function ActiveTrackHeader({
  activeTrack,
  dueCount,
  generatedAt,
  renderEditTrackAction,
}: {
  activeTrack: NonNullable<SerializedActiveTrack>
  dueCount: number
  generatedAt: string
  renderEditTrackAction: RenderTrackEditAction
}) {
  const targetStatus = getTrackTargetStatus({
    dueAt: activeTrack.track.dueAt,
    generatedAt,
    progress: activeTrack.progress,
  })

  return (
    <div className="grid gap-4 px-4 pb-4 pt-4 md:px-5 lg:px-7 lg:py-5">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <h2 className="m-0 break-words text-[length:var(--cp-title-font-size)] font-bold leading-tight text-foreground">
            {activeTrack.track.title}
          </h2>
          {activeTrack.track.description ? (
            <p className="m-0 mt-2 max-w-3xl break-words text-[length:var(--cp-copy-font-size)] leading-relaxed text-muted-foreground">
              {activeTrack.track.description}
            </p>
          ) : null}
        </div>
        <TrackActions
          ariaLabel={`${activeTrack.track.title} track actions`}
          className="justify-start md:justify-end"
          renderEditTrackAction={renderEditTrackAction}
          showClearActive
          track={activeTrack.track}
        />
      </div>
      <div
        className={cn(
          'grid min-w-0 gap-3',
          targetStatus.hasTarget ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        <ProgressSummaryPanel progress={activeTrack.progress} />
        {targetStatus.hasTarget ? (
          <TargetSummaryPanel targetStatus={targetStatus} />
        ) : null}
      </div>
      <div className="grid gap-3 border-y border-border py-3 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-border">
        <MetricBlock
          ariaLabel="Reviews due metric"
          icon={<CalendarClock aria-hidden="true" />}
          label="Reviews Due"
          value={<span className="tabular-nums">{dueCount}</span>}
        />
        <MetricBlock
          ariaLabel="Next metric"
          icon={<ListChecks aria-hidden="true" />}
          label="Next"
          value={
            activeTrack.nextProblem ? (
              <a
                className="truncate font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                href={createLeetCodeProblemUrl(activeTrack.nextProblem.slug)}
                rel="noopener noreferrer"
                target="_blank"
              >
                {activeTrack.nextProblem.title}
              </a>
            ) : (
              <span className="text-muted-foreground">None</span>
            )
          }
        />
      </div>
    </div>
  )
}

function ProgressSummaryPanel({
  progress,
}: {
  progress: NonNullable<SerializedActiveTrack>['progress']
}) {
  const remainingCount = Math.max(
    progress.totalCount - progress.completedCount,
    0,
  )

  return (
    <div
      aria-label="Track progress summary"
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[var(--cp-panel-radius)] border border-border bg-muted/25 p-3"
    >
      <ProgressRing percent={progress.percent} />
      <div className="min-w-0">
        <div className="text-[length:var(--cp-badge-font-size)] font-bold uppercase text-muted-foreground">
          Progress
        </div>
        <div className="mt-1 truncate text-[length:var(--cp-copy-font-size)] font-bold text-foreground tabular-nums">
          {progress.completedCount} of {progress.totalCount}
        </div>
        <div className="mt-1 truncate text-[length:var(--cp-badge-font-size)] text-muted-foreground">
          {remainingCount} {remainingCount === 1 ? 'problem' : 'problems'} left
        </div>
      </div>
    </div>
  )
}

function TargetSummaryPanel({
  targetStatus,
}: {
  targetStatus: ReturnType<typeof getTrackTargetStatus>
}) {
  return (
    <div
      aria-label="Track target summary"
      className={cn(
        'grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[var(--cp-panel-radius)] border bg-[var(--cp-tone-bg)] p-3',
        targetStatus.tone === 'danger'
          ? 'border-destructive/35 border-l-2 text-destructive'
          : 'border-[color:var(--cp-tone-border)] text-[color:var(--cp-tone-fg)]',
      )}
      data-cp-tone={targetStatus.tone}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-10 place-items-center rounded-full border bg-[var(--cp-tone-bg)]',
          targetStatus.tone === 'danger'
            ? 'border-destructive/30 text-destructive'
            : 'border-[color:var(--cp-tone-border)] text-[color:var(--cp-tone-fg)]',
        )}
      >
        <CalendarClock className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[length:var(--cp-badge-font-size)] font-bold uppercase text-muted-foreground">
          Target
        </div>
        <div className="mt-1 truncate text-[length:var(--cp-copy-font-size)] font-bold text-foreground">
          {targetStatus.dateLabel}
        </div>
        <div
          className={cn(
            'mt-1 truncate text-[length:var(--cp-badge-font-size)] font-semibold',
            targetStatus.tone === 'danger'
              ? 'text-destructive'
              : 'text-[color:var(--cp-tone-fg)]',
          )}
        >
          {targetStatus.detailLabel ? (
            <>
              <span>{targetStatus.statusLabel}</span>
              <span aria-hidden="true"> · </span>
              <span>{targetStatus.detailLabel}</span>
            </>
          ) : (
            targetStatus.statusLabel
          )}
        </div>
      </div>
    </div>
  )
}

function ProgressRing({ percent }: { percent: number }) {
  const clampedPercent = Math.max(0, Math.min(percent, 100))

  return (
    <span
      aria-label={`${clampedPercent}% complete`}
      className="grid size-11 shrink-0 place-items-center rounded-full"
      role="img"
      style={{
        background: `conic-gradient(var(--cp-color-primary) ${clampedPercent}%, var(--cp-color-muted) 0)`,
      }}
    >
      <span className="grid size-8 place-items-center rounded-full bg-card text-[0.625rem] font-bold text-foreground tabular-nums">
        {clampedPercent}
      </span>
    </span>
  )
}

function ActiveTrackGroups({
  activeGroupId,
  groupProgressById,
  groups,
  trackId,
}: {
  activeGroupId: string | null
  groupProgressById: ReadonlyMap<string, TrackGroupProgress>
  groups: readonly SerializedTrackGroup[]
  trackId: string
}) {
  const setActiveGroup = useSetActiveGroup()
  const [error, setError] = useState<string | null>(null)
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const [scrollState, setScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
    hasOverflow: false,
  })
  const activeTabRef = useRef<HTMLButtonElement | null>(null)
  const pendingRevealKeyRef = useRef<string | null>(null)
  const groupOrderKey = groups.map((group) => group.id).join('\u0000')
  const layoutKey = [trackId, activeGroupId ?? '', groupOrderKey].join('\u0000')

  const updateScrollState = useCallback(() => {
    const tabList = tabListRef.current

    if (!tabList) {
      return
    }

    const maxScrollLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth)

    setScrollState({
      canScrollLeft: tabList.scrollLeft > 1,
      canScrollRight: tabList.scrollLeft < maxScrollLeft - 1,
      hasOverflow: maxScrollLeft > 1,
    })
  }, [])

  useLayoutEffect(() => {
    pendingRevealKeyRef.current = layoutKey
    updateScrollState()
  }, [layoutKey, updateScrollState])

  useLayoutEffect(() => {
    if (pendingRevealKeyRef.current !== layoutKey) {
      return
    }
    const tabList = tabListRef.current
    const hasOverflow = tabList
      ? tabList.scrollWidth - tabList.clientWidth > 1
      : false
    if (hasOverflow && !tabList?.classList.contains('px-9')) {
      return
    }
    pendingRevealKeyRef.current = null

    activeTabRef.current?.scrollIntoView?.({
      behavior: 'auto',
      block: 'nearest',
      inline: 'nearest',
    })
    updateScrollState()
  }, [layoutKey, scrollState.hasOverflow, updateScrollState])

  useEffect(() => {
    updateScrollState()

    window.addEventListener('resize', updateScrollState)

    return () => {
      window.removeEventListener('resize', updateScrollState)
    }
  }, [groups.length, updateScrollState])

  if (groups.length <= 1) {
    return null
  }

  async function selectGroup(groupId: string) {
    if (groupId === activeGroupId) {
      return
    }

    setError(null)

    try {
      await setActiveGroup.mutateAsync({
        groupId,
        surface: 'dashboard',
        trackId,
      })
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to change active group.',
      )
    }
  }

  return (
    <div className="min-w-0 border-t border-border px-4 py-3 md:px-5 lg:px-7">
      {error ? (
        <InlineStatus className="mb-3" role="alert" tone="danger">
          {error}
        </InlineStatus>
      ) : null}
      <div className="relative min-w-0">
        {scrollState.canScrollLeft ? (
          <TrackGroupScrollButton
            direction="left"
            onClick={() => {
              scrollTrackGroups(tabListRef.current, 'left')
            }}
          />
        ) : null}
        {scrollState.canScrollRight ? (
          <TrackGroupScrollButton
            direction="right"
            onClick={() => {
              scrollTrackGroups(tabListRef.current, 'right')
            }}
          />
        ) : null}
        <div
          aria-label="Track groups"
          aria-orientation="horizontal"
          className={cn(
            'flex min-w-0 flex-nowrap gap-6 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            scrollState.hasOverflow && 'px-9',
          )}
          onScroll={updateScrollState}
          ref={tabListRef}
          role="tablist"
        >
          {groups.map((group) => {
            const isActive = group.id === activeGroupId
            const progress =
              groupProgressById.get(group.id) ?? emptyGroupProgress

            return (
              <button
                aria-label={`${group.title}, ${progress.completedCount} of ${progress.totalCount} completed`}
                aria-selected={isActive}
                className={cn(
                  'inline-flex min-h-12 min-w-0 max-w-[min(18rem,72vw)] shrink-0 items-center gap-2 border-b-2 px-0 py-3 text-[length:var(--cp-badge-font-size)] font-bold uppercase leading-none scroll-mx-14 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
                disabled={setActiveGroup.isPending}
                key={group.id}
                onClick={() => {
                  void selectGroup(group.id)
                }}
                role="tab"
                ref={isActive ? activeTabRef : undefined}
                type="button"
              >
                <span className="min-w-0 max-w-full truncate">
                  {group.title}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'shrink-0 text-muted-foreground tabular-nums',
                    isActive && 'text-primary/80',
                  )}
                >
                  · {progress.completedCount}/{progress.totalCount}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TrackGroupScrollButton({
  direction,
  onClick,
}: {
  direction: 'left' | 'right'
  onClick: () => void
}) {
  const isLeft = direction === 'left'

  return (
    <span
      className={cn(
        'pointer-events-none absolute inset-y-0 z-10 flex w-14 items-center',
        isLeft
          ? 'left-0 justify-start bg-gradient-to-r from-card via-card/95 to-transparent'
          : 'right-0 justify-end bg-gradient-to-l from-card via-card/95 to-transparent',
      )}
    >
      <IconButton
        className="pointer-events-auto size-8 border-border bg-card/95 text-muted-foreground shadow-surface hover:text-foreground"
        label={`Scroll track groups ${direction}`}
        onClick={onClick}
        size="sm"
        tooltip={`Scroll ${direction}`}
        type="button"
        variant="outline"
      >
        {isLeft ? (
          <ChevronLeft aria-hidden="true" />
        ) : (
          <ChevronRight aria-hidden="true" />
        )}
      </IconButton>
    </span>
  )
}

function scrollTrackGroups(
  tabList: HTMLDivElement | null,
  direction: 'left' | 'right',
) {
  if (!tabList) {
    return
  }

  tabList.scrollBy({
    behavior: 'smooth',
    left:
      (direction === 'left' ? -1 : 1) *
      Math.max(180, tabList.clientWidth * 0.72),
  })
}

type TrackGroupProgress = {
  completedCount: number
  totalCount: number
}

function getGroupProgressById(
  groups: readonly SerializedTrackGroup[],
  rows: readonly TrackProblemRow[],
) {
  const progressByGroup = new Map<string, TrackGroupProgress>(
    groups.map((group) => [
      group.id,
      {
        completedCount: 0,
        totalCount: 0,
      },
    ]),
  )

  for (const row of rows) {
    const progress = progressByGroup.get(row.membership.groupId)

    if (!progress) {
      continue
    }

    progress.totalCount += 1

    if (row.membership.completion.status === 'completed') {
      progress.completedCount += 1
    }
  }

  return progressByGroup
}

const emptyGroupProgress = {
  completedCount: 0,
  totalCount: 0,
} satisfies TrackGroupProgress

function MetricBlock({
  ariaLabel,
  icon,
  label,
  value,
}: {
  ariaLabel: string
  icon: ReactNode
  label: string
  value: ReactNode
}) {
  return (
    <div
      aria-label={ariaLabel}
      className="grid min-w-0 gap-1 sm:px-3 sm:first:pl-0"
    >
      <div className="flex min-w-0 items-center gap-1.5 text-[length:var(--cp-badge-font-size)] font-bold uppercase text-muted-foreground">
        <span className="[&_svg]:size-3.5">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="min-w-0 truncate text-[length:var(--cp-copy-font-size)] font-bold text-foreground">
        {value}
      </div>
    </div>
  )
}
