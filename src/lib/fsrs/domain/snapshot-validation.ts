export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCanonicalIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const parsed = new Date(value)

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
