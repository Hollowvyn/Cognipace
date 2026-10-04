import { useCallback, useRef, useState } from 'react'

export type SettingsOperation = 'preferences' | 'reset' | 'ai'

export interface SettingsOperationGate {
  activeOperation: SettingsOperation | null
  acquire: (kind: SettingsOperation) => (() => void) | null
  isBusy: () => boolean
}

export function useSettingsOperationGate(): SettingsOperationGate {
  const lease = useRef<symbol | null>(null)
  const [activeOperation, setActiveOperation] =
    useState<SettingsOperation | null>(null)
  const acquire = useCallback((kind: SettingsOperation) => {
    if (lease.current) return null
    const acquired = Symbol(kind)
    lease.current = acquired
    setActiveOperation(kind)
    return () => {
      if (lease.current !== acquired) return
      lease.current = null
      setActiveOperation(null)
    }
  }, [])
  const isBusy = useCallback(() => lease.current !== null, [])
  return { activeOperation, acquire, isBusy }
}
