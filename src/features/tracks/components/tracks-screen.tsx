import { RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { Surface } from '@/components/ui/surface'
import type { RenderProblemEditAction } from '@/features/problems'

import { useTrackWorkspace } from '../api/tracks-api'
import type {
  SerializedTrack,
  TrackWorkspaceResponse,
} from '../api/tracks-contracts'
import {
  ActiveTrackWorkspace,
  type RenderTrackEditAction,
} from './active-track-workspace'
import { OtherTracksAccordion } from './other-tracks-accordion'

export interface TracksScreenProps {
  importTrackAction?: ReactNode
  newTrackAction: ReactNode
  renderEditProblemAction: RenderProblemEditAction
  renderEditTrackAction: RenderTrackEditAction
}

export function TracksScreen({
  importTrackAction,
  newTrackAction,
  renderEditProblemAction,
  renderEditTrackAction,
}: TracksScreenProps) {
  const workspaceQuery = useTrackWorkspace({ surface: 'dashboard' })
  const workspace = workspaceQuery.data

  if (workspaceQuery.isPending) {
    return <TracksLoadingState />
  }

  if (workspaceQuery.isError || !workspace) {
    return (
      <TracksErrorState
        onRetry={() => {
          void workspaceQuery.refetch()
        }}
      />
    )
  }

  return (
    <TracksWorkspaceView
      importTrackAction={importTrackAction}
      newTrackAction={newTrackAction}
      renderEditProblemAction={renderEditProblemAction}
      renderEditTrackAction={renderEditTrackAction}
      workspace={workspace}
    />
  )
}

function TracksWorkspaceView({
  importTrackAction,
  newTrackAction,
  renderEditProblemAction,
  renderEditTrackAction,
  workspace,
}: {
  importTrackAction?: ReactNode
  newTrackAction: ReactNode
  renderEditProblemAction: RenderProblemEditAction
  renderEditTrackAction: RenderTrackEditAction
  workspace: TrackWorkspaceResponse
}) {
  if (workspace.tracks.length === 0) {
    return (
      <NoTracksState
        importTrackAction={importTrackAction}
        newTrackAction={newTrackAction}
      />
    )
  }

  if (!workspace.activeTrack) {
    return (
      <TracksFrame>
        <NoActiveTrackState />
        <OtherTracksAccordion
          importTrackAction={importTrackAction}
          activeTrackId={null}
          generatedAt={workspace.generatedAt}
          newTrackAction={newTrackAction}
          renderEditTrackAction={renderEditTrackAction}
          tracks={workspace.tracks}
        />
      </TracksFrame>
    )
  }

  return (
    <TracksFrame>
      <ActiveTrackWorkspace
        activeTrack={workspace.activeTrack}
        dueCount={workspace.dueCount}
        generatedAt={workspace.generatedAt}
        groups={workspace.activeTrackGroups}
        renderEditProblemAction={renderEditProblemAction}
        renderEditTrackAction={renderEditTrackAction}
        rows={workspace.activeTrackRows}
      />
      <OtherTracksAccordion
        importTrackAction={importTrackAction}
        activeTrackId={workspace.activeTrack.track.id}
        generatedAt={workspace.generatedAt}
        newTrackAction={newTrackAction}
        renderEditTrackAction={renderEditTrackAction}
        tracks={workspace.tracks}
      />
    </TracksFrame>
  )
}

function TracksLoadingState() {
  return (
    <TracksFrame>
      <Surface className="w-full">
        <InlineStatus>Loading tracks…</InlineStatus>
      </Surface>
    </TracksFrame>
  )
}

function TracksErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <TracksFrame>
      <Surface className="grid w-full gap-3">
        <InlineStatus role="alert" tone="danger">
          Failed to load tracks.
        </InlineStatus>
        <div>
          <Button onClick={onRetry} size="sm" variant="outline">
            <RefreshCw aria-hidden="true" />
            Retry
          </Button>
        </div>
      </Surface>
    </TracksFrame>
  )
}

function NoTracksState({
  importTrackAction,
  newTrackAction,
}: {
  importTrackAction?: ReactNode
  newTrackAction: ReactNode
}) {
  return (
    <TracksFrame>
      <Surface className="grid w-full gap-3">
        <div className="grid gap-1">
          <h2 className="m-0 text-[length:var(--cp-title-font-size)] font-bold leading-tight text-foreground">
            No tracks yet.
          </h2>
          <p className="m-0 max-w-2xl text-[length:var(--cp-copy-font-size)] leading-relaxed text-muted-foreground">
            Create or import a track to organize ordered groups and start a
            focused practice path.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {newTrackAction}
          {importTrackAction}
        </div>
      </Surface>
    </TracksFrame>
  )
}

function NoActiveTrackState() {
  return (
    <Surface className="grid w-full gap-3">
      <div className="grid gap-1">
        <h2 className="m-0 text-[length:var(--cp-title-font-size)] font-bold leading-tight text-foreground">
          No active track selected.
        </h2>
        <p className="m-0 max-w-2xl text-[length:var(--cp-copy-font-size)] leading-relaxed text-muted-foreground">
          Set a track active from the list below.
        </p>
      </div>
    </Surface>
  )
}

function TracksFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-[var(--cp-surface-gap)]">{children}</div>
  )
}

export type { RenderTrackEditAction, SerializedTrack }
