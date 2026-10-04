import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useSettingsOperationGate } from './use-settings-operation-gate'

describe('useSettingsOperationGate', () => {
  it('rejects concurrent acquisition before a React render and releases only its own lease', () => {
    const { result } = renderHook(() => useSettingsOperationGate())
    let release: (() => void) | null = null
    act(() => {
      release = result.current.acquire('ai')
      expect(result.current.isBusy()).toBe(true)
      expect(result.current.acquire('preferences')).toBeNull()
    })
    expect(result.current.activeOperation).toBe('ai')
    act(() => release?.())
    expect(result.current.activeOperation).toBeNull()
    let nextRelease: (() => void) | null = null
    act(() => {
      nextRelease = result.current.acquire('reset')
      release?.()
      expect(result.current.isBusy()).toBe(true)
    })
    expect(result.current.activeOperation).toBe('reset')
    act(() => nextRelease?.())
    expect(result.current.isBusy()).toBe(false)
  })
})
