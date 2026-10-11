import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  readDueNotificationState,
  writeDueNotificationState,
} from './due-notification'

const storage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: storage } },
}))

describe('due notification storage transition', () => {
  beforeEach(() => {
    storage.get.mockReset()
    storage.set.mockReset()
    storage.set.mockResolvedValue(undefined)
  })

  it('marks an old UTC key as legacy when no local key exists', async () => {
    storage.get.mockResolvedValue({
      'cognipace:notification:lastNotifiedDate': '2026-05-30',
    })

    await expect(readDueNotificationState()).resolves.toEqual({
      lastNotifiedDate: '2026-05-30',
      isLegacyUtcDate: true,
    })
  })

  it('prefers the versioned local key and writes only that key', async () => {
    storage.get.mockResolvedValue({
      'cognipace:notification:lastNotifiedDate': '2026-05-30',
      'cognipace:notification:lastNotifiedLocalDate': '2026-05-29',
    })

    await expect(readDueNotificationState()).resolves.toEqual({
      lastNotifiedDate: '2026-05-29',
      isLegacyUtcDate: false,
    })
    await writeDueNotificationState('2026-05-30')
    expect(storage.set).toHaveBeenCalledWith({
      'cognipace:notification:lastNotifiedLocalDate': '2026-05-30',
    })
  })
})
