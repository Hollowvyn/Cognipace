export type DashboardSection =
  | 'overview'
  | 'tracks'
  | 'library'
  | 'analytics'
  | 'settings'

export type DashboardRoutePresentation = 'page' | 'modal' | 'modal-placeholder'

export interface DashboardRouteStaticData {
  navLabel?: string
  presentation: DashboardRoutePresentation
  section: DashboardSection
  title: string
}

declare module '@tanstack/router-core' {
  interface StaticDataRouteOption {
    navLabel?: string
    presentation?: DashboardRoutePresentation
    section?: DashboardSection
    title?: string
  }
}

export const dashboardPaths = {
  overview: '/',
  tracks: '/tracks',
  library: '/library',
  analytics: '/analytics',
  settings: '/settings',
  devSmoke: '/dev/smoke',
  trackNew: '/tracks/new',
  trackImport: '/tracks/import',
  trackEdit: '/tracks/$trackId/edit',
  trackProblemEdit: '/tracks/problems/$problemSlug/edit',
  libraryTrackNew: '/library/tracks/new',
  problemNew: '/library/problems/new',
  problemEdit: '/library/problems/$problemSlug/edit',
} as const satisfies Record<string, string>

export type DashboardTopLevelPath =
  | typeof dashboardPaths.overview
  | typeof dashboardPaths.tracks
  | typeof dashboardPaths.library
  | typeof dashboardPaths.analytics
  | typeof dashboardPaths.settings

export type DashboardModalClosePath =
  | typeof dashboardPaths.tracks
  | typeof dashboardPaths.library

export interface DashboardTopLevelRoute {
  activeExact?: boolean
  path: DashboardTopLevelPath
  staticData: DashboardRouteStaticData & {
    navLabel: string
    presentation: 'page'
  }
}

interface DashboardModalRoute {
  closeTo: DashboardModalClosePath
  description: string
  relativePath: string
  staticData: DashboardRouteStaticData & {
    presentation: 'modal' | 'modal-placeholder'
  }
}

export const dashboardRouteMeta = {
  overview: {
    activeExact: true,
    path: dashboardPaths.overview,
    staticData: {
      navLabel: 'Overview',
      presentation: 'page',
      section: 'overview',
      title: 'Overview',
    },
  },
  tracks: {
    path: dashboardPaths.tracks,
    staticData: {
      navLabel: 'Tracks',
      presentation: 'page',
      section: 'tracks',
      title: 'Tracks',
    },
  },
  library: {
    path: dashboardPaths.library,
    staticData: {
      navLabel: 'Library',
      presentation: 'page',
      section: 'library',
      title: 'Library',
    },
  },
  analytics: {
    path: dashboardPaths.analytics,
    staticData: {
      navLabel: 'Analytics',
      presentation: 'page',
      section: 'analytics',
      title: 'Analytics',
    },
  },
  settings: {
    path: dashboardPaths.settings,
    staticData: {
      navLabel: 'Settings',
      presentation: 'page',
      section: 'settings',
      title: 'Settings',
    },
  },
} as const satisfies Record<DashboardSection, DashboardTopLevelRoute>

export const dashboardTopLevelRoutes = [
  dashboardRouteMeta.overview,
  dashboardRouteMeta.tracks,
  dashboardRouteMeta.library,
  dashboardRouteMeta.analytics,
  dashboardRouteMeta.settings,
] as const satisfies readonly DashboardTopLevelRoute[]

export const dashboardHiddenRouteMeta = {
  devSmoke: {
    path: dashboardPaths.devSmoke,
    staticData: {
      presentation: 'page',
      section: 'settings',
      title: 'Dev Smoke',
    },
  },
} as const satisfies Record<
  string,
  {
    path: string
    staticData: DashboardRouteStaticData & { presentation: 'page' }
  }
>

export const dashboardModalRouteMeta = {
  trackImport: {
    closeTo: dashboardPaths.tracks,
    description: 'Add a study path from a JSON file.',
    relativePath: 'import',
    staticData: {
      presentation: 'modal',
      section: 'tracks',
      title: 'Import tracks',
    },
  },
  trackNew: {
    closeTo: dashboardPaths.tracks,
    description: 'Create a custom track from existing Library problems.',
    relativePath: 'new',
    staticData: {
      presentation: 'modal',
      section: 'tracks',
      title: 'New Track',
    },
  },
  trackEdit: {
    closeTo: dashboardPaths.tracks,
    description: "Edit this track's metadata, groups, and ordered problems.",
    relativePath: '$trackId/edit',
    staticData: {
      presentation: 'modal',
      section: 'tracks',
      title: 'Edit Track',
    },
  },
  trackProblemEdit: {
    closeTo: dashboardPaths.tracks,
    description: "Edit this problem's core Library metadata from Tracks.",
    relativePath: 'problems/$problemSlug/edit',
    staticData: {
      presentation: 'modal',
      section: 'tracks',
      title: 'Edit Problem',
    },
  },
  libraryTrackNew: {
    closeTo: dashboardPaths.library,
    description: 'Create a track from selected Library problems.',
    relativePath: 'tracks/new',
    staticData: {
      presentation: 'modal',
      section: 'library',
      title: 'New Track',
    },
  },
  problemNew: {
    closeTo: dashboardPaths.library,
    description: 'Create a LeetCode problem in your Library.',
    relativePath: 'problems/new',
    staticData: {
      presentation: 'modal',
      section: 'library',
      title: 'New Problem',
    },
  },
  problemEdit: {
    closeTo: dashboardPaths.library,
    description: "Edit this problem's core Library metadata.",
    relativePath: 'problems/$problemSlug/edit',
    staticData: {
      presentation: 'modal',
      section: 'library',
      title: 'Edit Problem',
    },
  },
} as const satisfies Record<string, DashboardModalRoute>
