import { Check, ChevronDown, ChevronUp, LibraryBig } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { InlineStatus } from '@/components/ui/inline-status'
import { cn } from '@/utils/cn'

import { useSetActiveTrack } from '../api/tracks-api'
import type { SerializedTrackWorkspaceRow } from '../api/tracks-contracts'
import { getTrackTargetStatus } from '../domain'
import { TrackActions, type RenderTrackEditAction } from './track-actions'
import { TrackCardPreview } from './track-card-preview'

export function OtherTracksAccordion({
  activeTrackId,
  generatedAt,
  importTrackAction,
  newTrackAction,
  renderEditTrackAction,
  tracks,
}: {
  activeTrackId: string | null
  generatedAt: string
  importTrackAction?: ReactNode
  newTrackAction?: ReactNode
  renderEditTrackAction: RenderTrackEditAction
  tracks: readonly SerializedTrackWorkspaceRow[]
}) {
  const [isExpandedByUser, setIsExpandedByUser] = useState(true)
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null)
  const collectionId = useId()
  const [error, setError] = useState<string | null>(null)
  const previousTrackCountRef = useRef(tracks.length)
  const setActiveTrack = useSetActiveTrack()
  const isOpen = isExpandedByUser
  const canToggle = tracks.length > 0

  function toggleCollection() {
    setIsExpandedByUser((current) => !current)
    setExpandedTrackId(null)
  }

  useEffect(() => {
    const previousTrackCount = previousTrackCountRef.current
    previousTrackCountRef.current = tracks.length

    if (tracks.length > previousTrackCount) {
      setIsExpandedByUser(true)
    }
  }, [tracks.length])

  if (tracks.length === 0 && !newTrackAction && !importTrackAction) {
    return null
  }

  async function setActive(trackId: string) {
    setError(null)

    try {
      await setActiveTrack.mutateAsync({
        surface: 'dashboard',
        trackId,
      })
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to set active track.',
      )
    }
  }

  return (
    <section
      aria-label="All tracks"
      className="overflow-hidden rounded-[var(--cp-panel-radius)] border border-border bg-card text-card-foreground shadow-surface"
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-4 bg-muted/40 px-4 py-5 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[var(--cp-control-radius)] bg-primary/10 text-primary">
            <LibraryBig aria-hidden="true" className="size-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="m-0 font-serif text-2xl font-semibold leading-tight text-foreground">
                <button
                  aria-controls={collectionId}
                  aria-expanded={isOpen}
                  className="rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                  disabled={!canToggle}
                  onClick={toggleCollection}
                  type="button"
                >
                  All tracks
                </button>
              </h2>
              <Badge
                className="rounded-full bg-card tabular-nums"
                variant="outline"
              >
                {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
              </Badge>
            </div>
            <p className="m-0 mt-1 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
              Your complete study collection
            </p>
          </div>
        </div>
        <div
          aria-label="All tracks actions"
          className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end"
        >
          {newTrackAction}
          {importTrackAction}
          {tracks.length > 0 ? (
            <IconButton
              aria-controls={collectionId}
              aria-expanded={isOpen}
              label={isOpen ? 'Hide all tracks' : 'Show all tracks'}
              onClick={toggleCollection}
              tooltip={isOpen ? 'Hide all tracks' : 'Show all tracks'}
              variant="ghost"
            >
              {isOpen ? (
                <ChevronUp aria-hidden="true" />
              ) : (
                <ChevronDown aria-hidden="true" />
              )}
            </IconButton>
          ) : null}
        </div>
      </header>
      {isOpen ? (
        <div className="border-t border-border" id={collectionId}>
          {error ? (
            <InlineStatus className="m-4 md:m-5" role="alert" tone="danger">
              {error}
            </InlineStatus>
          ) : null}
          <div className="grid gap-2 p-3">
            {tracks.map((row) => (
              <OtherTrackRow
                key={row.track.id}
                disabled={setActiveTrack.isPending}
                isActive={row.track.id === activeTrackId}
                isPreviewOpen={row.track.id === expandedTrackId}
                onTogglePreview={() => {
                  setExpandedTrackId((current) =>
                    current === row.track.id ? null : row.track.id,
                  )
                }}
                onSetActive={() => {
                  void setActive(row.track.id)
                }}
                generatedAt={generatedAt}
                renderEditTrackAction={renderEditTrackAction}
                row={row}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function OtherTrackRow({
  disabled,
  generatedAt,
  isActive,
  isPreviewOpen,
  onSetActive,
  onTogglePreview,
  renderEditTrackAction,
  row,
}: {
  disabled: boolean
  generatedAt: string
  isActive: boolean
  isPreviewOpen: boolean
  onSetActive: () => void
  onTogglePreview: () => void
  renderEditTrackAction: RenderTrackEditAction
  row: SerializedTrackWorkspaceRow
}) {
  const titleId = useId()
  const previewId = useId()
  const previewToggleRef = useRef<HTMLButtonElement>(null)
  const targetStatus = getTrackTargetStatus({
    dueAt: row.track.dueAt,
    generatedAt,
    progress: row.progress,
  })

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'min-w-0 overflow-hidden rounded-[var(--cp-control-radius)] border-2 border-transparent border-l-4',
        isActive
          ? 'bg-primary/10'
          : isPreviewOpen
            ? 'bg-muted/20'
            : 'border-t-border',
        isPreviewOpen
          ? 'border-primary/70 border-l-primary'
          : isActive && 'border-primary/50 border-l-primary',
      )}
    >
      <div
        className={cn(
          'relative grid min-w-0 gap-3 px-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-4',
          isPreviewOpen && 'bg-muted/30',
        )}
      >
        <button
          aria-controls={previewId}
          aria-expanded={isPreviewOpen}
          aria-label={`Preview ${row.track.title}`}
          className="absolute inset-0 cursor-pointer rounded-[var(--cp-control-radius)] transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={onTogglePreview}
          ref={previewToggleRef}
          type="button"
        />
        <div className="pointer-events-none relative min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3
              className="m-0 min-w-0 break-words text-base font-bold leading-tight text-foreground"
              id={titleId}
            >
              {row.track.title}
            </h3>
            {isActive ? (
              <Badge
                className="shrink-0 rounded-full border-primary bg-primary text-primary-foreground"
                tone="success"
              >
                <Check aria-hidden="true" className="size-3" />
                Active
              </Badge>
            ) : null}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'ml-auto size-4 shrink-0 text-muted-foreground transition-transform',
                isPreviewOpen && 'rotate-180',
              )}
            />
          </div>
          {row.track.description ? (
            <p className="m-0 mt-1 line-clamp-2 text-[length:var(--cp-badge-font-size)] leading-snug text-muted-foreground">
              {row.track.description}
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 text-[length:var(--cp-badge-font-size)] text-muted-foreground">
            <ProgressText row={row} />
            {targetStatus.catalogLabel ? (
              <span
                className={cn(
                  targetStatus.tone === 'danger' && 'text-destructive',
                )}
                data-cp-tone={
                  targetStatus.tone === 'danger' ? 'danger' : undefined
                }
              >
                {targetStatus.catalogLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div className="relative">
          <TrackActions
            ariaLabel={`${row.track.title} catalog actions`}
            className="justify-start md:justify-end"
            renderEditTrackAction={renderEditTrackAction}
            setActiveAction={
              isActive ? null : (
                <Button
                  aria-label={`Set ${row.track.title} active`}
                  disabled={disabled}
                  onClick={onSetActive}
                  size="sm"
                  variant="outline"
                >
                  Set active
                </Button>
              )
            }
            showClearActive={isActive}
            track={row.track}
          />
        </div>
      </div>
      {isPreviewOpen ? (
        <section
          aria-label={`${row.track.title} preview`}
          className="border-t border-border bg-background/20 px-3 py-4 md:px-4"
          id={previewId}
        >
          <TrackCardPreview
            onRetry={() => previewToggleRef.current?.focus()}
            trackId={row.track.id}
          />
        </section>
      ) : null}
    </article>
  )
}

function ProgressText({ row }: { row: SerializedTrackWorkspaceRow }) {
  const percent = Math.max(0, Math.min(row.progress.percent, 100))
  return (
    <div className="grid w-full max-w-[22rem] gap-1.5">
      <div className="flex justify-between gap-3 tabular-nums">
        <span
          aria-label={`${row.track.title} progress: ${row.progress.completedCount} of ${row.progress.totalCount}`}
        >
          {row.progress.completedCount} of {row.progress.totalCount} completed
        </span>
        <span className="font-semibold text-foreground">{percent}%</span>
      </div>
      <div
        aria-label={`${row.track.title} completion`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
