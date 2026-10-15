import { describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'

import {
  appShellQueryKeys,
  getDashboardAppShellDataViaRuntime,
  getOverlayAppShellDataViaRuntime,
  getPopupAppShellDataViaRuntime,
  openDashboardViaRuntime,
} from './app-shell-api'
import type { AppShellData } from './app-shell-contracts'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

describe('app-shell runtime API', () => {
  it('uses explicit query keys for each surface', () => {
    expect(appShellQueryKeys.popup()).toEqual(['app-shell-data', 'popup'])
    expect(appShellQueryKeys.dashboard()).toEqual([
      'app-shell-data',
      'dashboard',
    ])
    expect(appShellQueryKeys.overlay('two-sum')).toEqual([
      'app-shell-data',
      'overlay',
      'two-sum',
    ])
    expect(appShellQueryKeys.overlay()).toEqual([
      'app-shell-data',
      'overlay',
      null,
    ])
  })

  it('reads overlay app-shell data with the optional problem slug', async () => {
    const measure = vi.spyOn(performance, 'measure')
    const payload = { surface: 'overlay' } as AppShellData
    vi.mocked(sendMessage).mockResolvedValueOnce(payload)

    await expect(getOverlayAppShellDataViaRuntime('two-sum')).resolves.toBe(
      payload,
    )
    expect(sendMessage).toHaveBeenCalledWith('app.getShellData', {
      surface: 'overlay',
      problemSlug: 'two-sum',
    })
    expect(measure).toHaveBeenCalledWith(
      'cognipace.overlay.page.app-shell',
      expect.any(Object),
    )
  })

  it('reads dashboard app-shell data through the dashboard surface request', async () => {
    const payload = { surface: 'dashboard' } as AppShellData
    vi.mocked(sendMessage).mockResolvedValueOnce(payload)

    await expect(getDashboardAppShellDataViaRuntime()).resolves.toBe(payload)
    expect(sendMessage).toHaveBeenCalledWith('app.getShellData', {
      surface: 'dashboard',
    })
  })

  it('asks the background service worker to open dashboard pages for content scripts', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(null)

    await expect(openDashboardViaRuntime('settings')).resolves.toBeNull()
    expect(sendMessage).toHaveBeenCalledWith('app.openDashboard', {
      surface: 'content-script',
      route: 'settings',
    })
  })

  it('rejects an unexpected surface at the client boundary', async () => {
    const payload = {
      surface: 'dashboard',
    } as AppShellData
    vi.mocked(sendMessage).mockResolvedValueOnce(payload)

    await expect(getPopupAppShellDataViaRuntime()).rejects.toThrow(
      'Expected popup app-shell data.',
    )
  })
})
