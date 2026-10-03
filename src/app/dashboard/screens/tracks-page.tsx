import { Link, Outlet } from '@tanstack/react-router'
import { Pencil, Plus, Upload } from 'lucide-react'

import {
  DashboardPage,
  DashboardPageBody,
  DashboardPageHeader,
} from '@/app/dashboard/layout/dashboard-page'
import { useDashboardChrome } from '@/app/dashboard/dashboard-shell'
import {
  dashboardPaths,
  dashboardRouteMeta,
} from '@/app/dashboard/navigation/route-manifest'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { TracksScreen } from '@/features/tracks'

export function TracksPage() {
  const { headerActions } = useDashboardChrome()

  return (
    <DashboardPage className="mx-auto w-full max-w-[64rem]">
      <DashboardPageHeader
        actions={headerActions}
        title={dashboardRouteMeta.tracks.staticData.title}
      >
        Manage the active curriculum, groups, and ordered practice path.
      </DashboardPageHeader>
      <DashboardPageBody>
        <TracksScreen
          importTrackAction={
            <IconButton
              asChild
              label="Import tracks"
              tooltip="Import tracks"
              variant="outline"
            >
              <Link to={dashboardPaths.trackImport}>
                <Upload aria-hidden="true" />
              </Link>
            </IconButton>
          }
          newTrackAction={
            <Button asChild size="sm">
              <Link to={dashboardPaths.trackNew}>
                <Plus aria-hidden="true" />
                New Track
              </Link>
            </Button>
          }
          renderEditProblemAction={(problem) => (
            <Button asChild size="sm" variant="ghost">
              <Link
                params={{ problemSlug: problem.slug }}
                to={dashboardPaths.trackProblemEdit}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            </Button>
          )}
          renderEditTrackAction={(track) => (
            <IconButton
              asChild
              label="Edit Track"
              tooltip="Edit Track"
              variant="ghost"
            >
              <Link
                params={{ trackId: track.id }}
                to={dashboardPaths.trackEdit}
              >
                <Pencil aria-hidden="true" />
              </Link>
            </IconButton>
          )}
        />
      </DashboardPageBody>
      <Outlet />
    </DashboardPage>
  )
}
