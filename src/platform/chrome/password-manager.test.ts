import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'

import { openGooglePasswordManager } from './password-manager'

beforeEach(() => vi.restoreAllMocks())

describe('openGooglePasswordManager', () => {
  it('opens only the local manager URL with no credential data', async () => {
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue(undefined)
    await openGooglePasswordManager()
    expect(create).toHaveBeenCalledExactlyOnceWith({
      url: 'chrome://password-manager/passwords',
    })
  })
})
