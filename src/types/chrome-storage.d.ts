declare const chrome: {
  storage: {
    local: {
      get(keys: string[]): Promise<Record<string, unknown>>
      getBytesInUse(keys: string | string[] | null): Promise<number>
      QUOTA_BYTES?: number
      set(items: Record<string, unknown>): Promise<void>
      remove(keys: string[]): Promise<void>
    }
  }
}
