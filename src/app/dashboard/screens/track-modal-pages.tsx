import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { RouteModal } from '@/app/dashboard/layout/route-modal'
import {
  type DashboardModalClosePath,
  dashboardModalRouteMeta,
  dashboardPaths,
} from '@/app/dashboard/navigation/route-manifest'
import { LibrarySelectionTrackForm, TrackForm } from '@/features/tracks'
import { ImportContentPanel } from '@/features/imports'

export function ImportTracksModalPage() {
  const [canDismiss, setCanDismiss] = useState(true)
  return (
    <RouteModal
      closeTo={dashboardModalRouteMeta.trackImport.closeTo}
      description={dashboardModalRouteMeta.trackImport.description}
      dismissDisabled={!canDismiss}
      title="Import tracks"
      variant="form"
    >
      <div className="pb-[var(--cp-panel-padding)]">
        <ImportContentPanel
          onDismissAvailabilityChange={setCanDismiss}
          variant="tracks"
        />
      </div>
    </RouteModal>
  )
}

export function NewTrackModalPage() {
  const closeToTracks = useCloseToTracks()

  return (
    <RouteModal
      closeTo={dashboardModalRouteMeta.trackNew.closeTo}
      title="New Track"
      variant="form"
    >
      <TrackForm
        mode="create"
        onCancel={closeToTracks}
        onSaved={closeToTracks}
      />
    </RouteModal>
  )
}

export function EditTrackModalPage() {
  const closeToTracks = useCloseToTracks()
  const params = useParams({ from: dashboardPaths.trackEdit })
  const [title, setTitle] = useState<string>(
    dashboardModalRouteMeta.trackEdit.staticData.title,
  )

  return (
    <RouteModal
      closeTo={dashboardModalRouteMeta.trackEdit.closeTo}
      title={title}
      variant="form"
    >
      <TrackForm
        mode="edit"
        onCancel={closeToTracks}
        onLoaded={(track) => setTitle(`Edit: ${track.title}`)}
        onSaved={closeToTracks}
        trackId={params.trackId}
      />
    </RouteModal>
  )
}

export function NewLibrarySelectionTrackModalPage() {
  const closeToLibrary = useCloseTo(dashboardPaths.library)
  const search = useSearch({ from: dashboardPaths.libraryTrackNew })

  return (
    <RouteModal
      closeTo={dashboardModalRouteMeta.libraryTrackNew.closeTo}
      title="New Track"
      variant="form"
    >
      <LibrarySelectionTrackForm
        draftId={search.draft}
        onCancel={closeToLibrary}
        onSaved={closeToLibrary}
      />
    </RouteModal>
  )
}

function useCloseToTracks() {
  return useCloseTo(dashboardPaths.tracks)
}

function useCloseTo(path: DashboardModalClosePath) {
  const navigate = useNavigate()

  return () => {
    void navigate({ replace: true, to: path })
  }
}
