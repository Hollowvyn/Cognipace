import { z } from 'zod'

const utcTimestampSchema = z.iso.datetime()

/** Lossless chronological key for UTC ISO dates, including submillisecond precision. */
export function utcIsoSortKey(timestamp: string): string {
  utcTimestampSchema.parse(timestamp)
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?Z$/.exec(
      timestamp,
    )
  if (!match) throw new Error('Invalid UTC timestamp.')
  // No terminal Z: an empty fraction is a prefix of (and sorts before) any
  // positive fraction; removing trailing zeroes makes equivalent instants tie.
  const fraction = match[3] ?? ''
  let end = fraction.length
  while (end > 0 && fraction[end - 1] === '0') end--
  return `${match[1]}:${match[2] ?? '00'}.${fraction.slice(0, end)}`
}
