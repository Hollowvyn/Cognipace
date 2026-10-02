import type { LeetCodeProblemLocation } from './types'

/** Parses a canonical LeetCode problem URL into normalized location data. */
export function parseLeetCodeProblemLocation(
  locationInput: string | URL,
): LeetCodeProblemLocation | null {
  const parsedUrl = readAbsoluteUrl(locationInput)

  if (!parsedUrl || !isLeetCodeHost(parsedUrl.hostname)) {
    return null
  }

  const [pathSection, slugPathSegment] = parsedUrl.pathname
    .split('/')
    .filter(Boolean)

  if (pathSection !== 'problems' || !slugPathSegment) {
    return null
  }

  const normalizedSlug = normalizeLeetCodeSlug(slugPathSegment)

  if (!normalizedSlug) {
    return null
  }

  return {
    slug: normalizedSlug,
    url: createLeetCodeProblemUrl(normalizedSlug),
    host: parsedUrl.hostname,
  }
}

/** Parses either a LeetCode problem URL or a raw problem slug. */
export function parseLeetCodeProblemInput(problemInput: string) {
  const parsedLocation = parseLeetCodeProblemLocation(problemInput)

  if (parsedLocation) {
    return parsedLocation
  }

  if (
    readAbsoluteUrl(problemInput) ||
    /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(problemInput.trim())
  ) {
    return null
  }

  const normalizedSlug = normalizeLeetCodeSlug(problemInput)

  if (!normalizedSlug) {
    return null
  }

  return {
    slug: normalizedSlug,
    url: createLeetCodeProblemUrl(normalizedSlug),
    host: 'leetcode.com',
  } satisfies LeetCodeProblemLocation
}

/** Normalizes user/page LeetCode slug input into the canonical slug format. */
export function normalizeLeetCodeSlug(slugInput: string) {
  const parsedLocation = parseLeetCodeProblemLocation(slugInput)

  if (parsedLocation) {
    return parsedLocation.slug
  }

  return slugInput
    .trim()
    .toLowerCase()
    .replace(/^problems\//, '')
    .replace(/\/.*/, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Builds the canonical LeetCode problem URL for a slug. */
export function createLeetCodeProblemUrl(slug: string) {
  return `https://leetcode.com/problems/${normalizeLeetCodeSlug(slug)}/`
}

/** Converts a normalized LeetCode slug into a readable fallback title. */
export function titleFromLeetCodeSlug(slug: string) {
  return normalizeLeetCodeSlug(slug)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Returns true when a value is a canonical LeetCode problem URL. */
export function isLeetCodeProblemUrl(locationInput: string | URL) {
  return Boolean(parseLeetCodeProblemLocation(locationInput))
}

/** Returns true for supported LeetCode hostnames. */
export function isLeetCodeHost(hostname: string) {
  return hostname === 'leetcode.com' || hostname === 'www.leetcode.com'
}

function readAbsoluteUrl(urlInput: string | URL) {
  if (urlInput instanceof URL) {
    return urlInput
  }

  try {
    return new URL(urlInput)
  } catch {
    return null
  }
}
