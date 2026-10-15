import { useQuery } from '@tanstack/react-query'

import { sendMessage } from '@/extension/messaging'
import type { DashboardRoute } from '@/platform/chrome/extension-pages'
import { queryKeys } from '@/platform/query/query-keys'
import { timeOverlayStartup } from '@/lib/performance/overlay-startup-timing'

import { type AppShellData, type AppShellRequest } from './app-shell-contracts'

export const appShellQueryKeys = queryKeys.appShell

async function getAppShellDataViaRuntime(request: AppShellRequest) {
  return sendMessage('app.getShellData', request)
}

export async function getPopupAppShellDataViaRuntime() {
  return readAppShellSurface(
    await getAppShellDataViaRuntime({ surface: 'popup' }),
    'popup',
  )
}

export async function getDashboardAppShellDataViaRuntime() {
  return readAppShellSurface(
    await getAppShellDataViaRuntime({ surface: 'dashboard' }),
    'dashboard',
  )
}

export async function getOverlayAppShellDataViaRuntime(
  problemSlug?: string | null,
) {
  return timeOverlayStartup('page.app-shell', async () =>
    readAppShellSurface(
      await getAppShellDataViaRuntime({
        surface: 'overlay',
        ...(problemSlug ? { problemSlug } : {}),
      }),
      'overlay',
    ),
  )
}

export function openDashboardViaRuntime(route?: DashboardRoute) {
  return sendMessage('app.openDashboard', {
    surface: 'content-script',
    ...(route ? { route } : {}),
  })
}

export function usePopupAppShellData() {
  return useQuery({
    queryKey: appShellQueryKeys.popup(),
    queryFn: getPopupAppShellDataViaRuntime,
  })
}

export function useDashboardAppShellData() {
  return useQuery({
    queryKey: appShellQueryKeys.dashboard(),
    queryFn: getDashboardAppShellDataViaRuntime,
  })
}

export function useOverlayAppShellData(problemSlug?: string | null) {
  return useQuery({
    enabled: problemSlug !== null && problemSlug !== undefined,
    queryKey: appShellQueryKeys.overlay(problemSlug),
    queryFn: () => getOverlayAppShellDataViaRuntime(problemSlug),
  })
}

function readAppShellSurface<TSurface extends AppShellData['surface']>(
  data: AppShellData,
  surface: TSurface,
): Extract<AppShellData, { surface: TSurface }> {
  if (!hasAppShellSurface(data, surface)) {
    throw new Error(`Expected ${surface} app-shell data.`)
  }

  return data
}

function hasAppShellSurface<TSurface extends AppShellData['surface']>(
  data: AppShellData,
  surface: TSurface,
): data is Extract<AppShellData, { surface: TSurface }> {
  return data.surface === surface
}

export type {
  AppShellPracticeProgress,
  AppShellProblemSummary,
  DashboardAppShellData,
  DashboardOverviewData,
  OverlayNextStep,
  OverlayAppShellData,
  PopupAppShellData,
} from './app-shell-contracts'
