import { CircleOff, RefreshCw, Trash2, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { IconButton } from '@/components/ui/icon-button'
import { InlineStatus } from '@/components/ui/inline-status'
import { cn } from '@/utils/cn'

import {
  useClearActiveTrack,
  useDeleteTrack,
  useResetTrackProgress,
} from '../api/tracks-api'
import type { SerializedTrack } from '../api/tracks-contracts'

export type RenderTrackEditAction = (track: SerializedTrack) => ReactNode

export function TrackActions({
  ariaLabel,
  className,
  renderEditTrackAction,
  setActiveAction,
  showClearActive = false,
  track,
}: {
  ariaLabel: string
  className?: string | undefined
  renderEditTrackAction: RenderTrackEditAction
  setActiveAction?: ReactNode | undefined
  showClearActive?: boolean
  track: SerializedTrack
}) {
  const [confirmation, setConfirmation] = useState<
    'delete' | 'reset-progress' | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const clearActiveTrack = useClearActiveTrack()
  const deleteTrack = useDeleteTrack()
  const resetProgress = useResetTrackProgress()
  const isPending =
    clearActiveTrack.isPending ||
    deleteTrack.isPending ||
    resetProgress.isPending

  function openConfirmation(nextConfirmation: 'delete' | 'reset-progress') {
    setError(null)
    setConfirmation(nextConfirmation)
  }

  function closeConfirmation() {
    setError(null)
    setConfirmation(null)
  }

  async function runAction(action: () => Promise<unknown>) {
    setError(null)

    try {
      await action()
      setConfirmation(null)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Track action failed.',
      )
    }
  }

  const clearActiveAction = showClearActive ? (
    <TrackActionButton
      disabled={isPending}
      icon={CircleOff}
      label="Clear Active"
      onClick={() => {
        void runAction(() =>
          clearActiveTrack.mutateAsync({ surface: 'dashboard' }),
        )
      }}
    />
  ) : null

  return (
    <>
      {error && !confirmation ? (
        <InlineStatus role="alert" tone="danger">
          {error}
        </InlineStatus>
      ) : null}
      <div
        aria-label={ariaLabel}
        className={cn('flex flex-wrap gap-1.5', className)}
      >
        {setActiveAction ?? clearActiveAction}
        {renderEditTrackAction(track)}
        <TrackActionButton
          disabled={isPending}
          icon={RefreshCw}
          label="Reset Progress"
          onClick={() => openConfirmation('reset-progress')}
        />
        <TrackActionButton
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={isPending}
          icon={Trash2}
          label="Delete Track"
          onClick={() => openConfirmation('delete')}
        />
      </div>
      {confirmation === 'reset-progress' ? (
        <ConfirmationDialog
          confirmLabel="Reset Progress"
          description="This clears completed progress for this track."
          error={error}
          onCancel={closeConfirmation}
          onConfirm={() => {
            void runAction(() =>
              resetProgress.mutateAsync({
                surface: 'dashboard',
                trackId: track.id,
              }),
            )
          }}
          pending={isPending}
          title="Reset track progress?"
        />
      ) : null}
      {confirmation === 'delete' ? (
        <ConfirmationDialog
          confirmLabel="Delete Track"
          description="This permanently deletes this track and its groups."
          error={error}
          onCancel={closeConfirmation}
          onConfirm={() => {
            void runAction(() =>
              deleteTrack.mutateAsync({
                surface: 'dashboard',
                trackId: track.id,
              }),
            )
          }}
          pending={isPending}
          title="Delete track?"
        />
      ) : null}
    </>
  )
}

function TrackActionButton({
  className,
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  className?: string | undefined
  disabled: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <IconButton
      className={className}
      disabled={disabled}
      label={label}
      onClick={onClick}
      tooltip={label}
      variant="ghost"
    >
      <Icon aria-hidden="true" />
    </IconButton>
  )
}
