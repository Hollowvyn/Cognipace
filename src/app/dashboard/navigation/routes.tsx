import {
  RouterProvider,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router'

import { DashboardShell } from '../dashboard-shell'
import {
  dashboardHiddenRouteMeta,
  dashboardModalRouteMeta,
  dashboardPaths,
  dashboardRouteMeta,
} from './route-manifest'
import { AnalyticsPage } from '../screens/analytics-page'
import { analyticsRangeSchema } from '@/features/analytics/api/analytics-contracts'
import { DevSmokePage } from '../screens/dev-smoke-page'
import { LibraryPage } from '../screens/library-page'
import { OverviewPage } from '../screens/overview-page'
import {
  EditProblemFromTracksModalPage,
  EditProblemModalPage,
  NewProblemModalPage,
} from '../screens/problem-modal-pages'
import { SettingsPage } from '../screens/settings-page'
import {
  EditTrackModalPage,
  ImportTracksModalPage,
  NewLibrarySelectionTrackModalPage,
  NewTrackModalPage,
} from '../screens/track-modal-pages'
import { TracksPage } from '../screens/tracks-page'
export { dashboardPaths } from './route-manifest'

const rootRoute = createRootRoute({
  component: DashboardShell,
})

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: OverviewPage,
  staticData: dashboardRouteMeta.overview.staticData,
})

const tracksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tracks',
  component: TracksPage,
  staticData: dashboardRouteMeta.tracks.staticData,
})

const trackNewRoute = createRoute({
  getParentRoute: () => tracksRoute,
  path: dashboardModalRouteMeta.trackNew.relativePath,
  component: NewTrackModalPage,
  staticData: dashboardModalRouteMeta.trackNew.staticData,
})

const trackImportRoute = createRoute({
  getParentRoute: () => tracksRoute,
  path: dashboardModalRouteMeta.trackImport.relativePath,
  component: ImportTracksModalPage,
  staticData: dashboardModalRouteMeta.trackImport.staticData,
})

const trackEditRoute = createRoute({
  getParentRoute: () => tracksRoute,
  path: dashboardModalRouteMeta.trackEdit.relativePath,
  component: EditTrackModalPage,
  staticData: dashboardModalRouteMeta.trackEdit.staticData,
})

const trackProblemEditRoute = createRoute({
  getParentRoute: () => tracksRoute,
  path: dashboardModalRouteMeta.trackProblemEdit.relativePath,
  component: EditProblemFromTracksModalPage,
  staticData: dashboardModalRouteMeta.trackProblemEdit.staticData,
})

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library',
  component: LibraryPage,
  staticData: dashboardRouteMeta.library.staticData,
})

const problemNewRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: dashboardModalRouteMeta.problemNew.relativePath,
  component: NewProblemModalPage,
  staticData: dashboardModalRouteMeta.problemNew.staticData,
})

const libraryTrackNewRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: dashboardModalRouteMeta.libraryTrackNew.relativePath,
  component: NewLibrarySelectionTrackModalPage,
  validateSearch: (search: Record<string, unknown>) => ({
    draft: typeof search.draft === 'string' ? search.draft : undefined,
  }),
  staticData: dashboardModalRouteMeta.libraryTrackNew.staticData,
})

const problemEditRoute = createRoute({
  getParentRoute: () => libraryRoute,
  path: dashboardModalRouteMeta.problemEdit.relativePath,
  component: EditProblemModalPage,
  staticData: dashboardModalRouteMeta.problemEdit.staticData,
})

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analytics',
  component: AnalyticsPage,
  validateSearch: (search: Record<string, unknown>) => {
    const rawRange =
      typeof search.range === 'string' ? Number(search.range) : search.range
    const parsed = analyticsRangeSchema.safeParse(rawRange)
    const context =
      typeof search.context === 'string' ? { context: search.context } : {}

    return { range: parsed.success ? parsed.data : 30, ...context }
  },
  staticData: dashboardRouteMeta.analytics.staticData,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
  staticData: dashboardRouteMeta.settings.staticData,
})

const devSmokeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: dashboardPaths.devSmoke,
  component: DevSmokePage,
  staticData: dashboardHiddenRouteMeta.devSmoke.staticData,
})

const routeTree = rootRoute.addChildren([
  overviewRoute,
  tracksRoute.addChildren([
    trackImportRoute,
    trackNewRoute,
    trackEditRoute,
    trackProblemEditRoute,
  ]),
  libraryRoute.addChildren([
    problemNewRoute,
    libraryTrackNewRoute,
    problemEditRoute,
  ]),
  analyticsRoute,
  settingsRoute,
  devSmokeRoute,
])

interface CreateDashboardRouterOptions {
  history?: RouterHistory
}

export function createDashboardRouter(
  options: CreateDashboardRouterOptions = {},
) {
  return createRouter({
    history: options.history ?? createHashHistory(),
    routeTree,
  })
}

export const dashboardRouter = createDashboardRouter()
export type DashboardRouter = typeof dashboardRouter

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof dashboardRouter
  }
}

export function DashboardApp({
  router = dashboardRouter,
}: {
  router?: DashboardRouter
}) {
  return <RouterProvider router={router} />
}
