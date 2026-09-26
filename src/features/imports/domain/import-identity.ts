import { normalizeLeetCodeSlug } from '@/lib/leetcode'

export function readImportSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const slug = value.trim().toLowerCase()
  return slug.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    ? slug
    : null
}

/** Preserves the existing taxonomy ID convention used for company labels. */
export function normalizeCompanyImportKey(value: string) {
  return normalizeLeetCodeSlug(value)
}

function readLeetCodeUrlIdentity(value: string): string | null {
  if (value.includes('\\')) return null
  for (const character of value) {
    const codePoint = character.charCodeAt(0)
    if (codePoint <= 0x1f || codePoint === 0x7f) return null
  }

  // The URL parser can discard even empty user information, so reject an @ in
  // the authority itself before parsing. An @ in the path/query is harmless.
  const match = value.match(/^https:\/\/([^/?#]*)(\/[^?#]*)?/i)
  const authority = match?.[1]
  const rawPath = match?.[2] ?? ''
  if (authority === undefined || authority.includes('@')) return null

  const rawSegments = rawPath.split('/')
  if (rawSegments[1] !== 'problems') return null
  const rawSlug = readImportSlug(rawSegments[2])
  if (!rawSlug) return null

  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
      return null
    }
    if (
      url.hostname !== 'leetcode.com' &&
      url.hostname !== 'www.leetcode.com'
    ) {
      return null
    }

    // Reject URL path normalization when it would change the problem identity.
    const parsedSegments = url.pathname.split('/')
    if (parsedSegments[1] !== 'problems') return null
    const parsedSlug = readImportSlug(parsedSegments[2])
    return parsedSlug === rawSlug ? parsedSlug : null
  } catch {
    return null
  }
}

/** Accepts a slug or a canonical LeetCode problem URL. */
export function readProblemIdentity(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const input = value.trim()
  const slug = readImportSlug(input)
  if (slug) return slug

  return readLeetCodeUrlIdentity(input)
}

/** Accepts only a strict LeetCode URL, for object `url` fields. */
export function readProblemUrlIdentity(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const input = value.trim()
  if (!/^https:\/\//i.test(input)) return null
  return readLeetCodeUrlIdentity(input)
}
