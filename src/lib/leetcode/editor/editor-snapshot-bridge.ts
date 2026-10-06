import { z } from 'zod'

import { parseLeetCodeProblemLocation } from '../domain/problem-url'
import type { LeetCodeProblemLocation } from '../domain/types'
import {
  captureCompleteLeetCodeEditorSnapshot,
  completeCodeSnapshotSchema,
  type CompleteCodeSnapshot,
} from './complete-code-snapshot'

const identitySchema = z.strictObject({
  host: z.enum(['leetcode.com', 'www.leetcode.com']),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})
const envelope = {
  ...identitySchema.shape,
  channel: z.literal('cognipace:complete-editor:v1'),
  requestId: z.uuid(),
}
const requestSchema = z.strictObject({
  ...envelope,
  type: z.literal('snapshot-request'),
})
const responseSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ...envelope,
    type: z.literal('snapshot-response'),
    ok: z.literal(true),
    snapshot: completeCodeSnapshotSchema,
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('snapshot-response'),
    ok: z.literal(false),
  }),
])

type Identity = z.infer<typeof identitySchema>

function unavailable() {
  return new Error('Complete editor snapshot unavailable. Please retry.')
}

/** Isolated-world client. Page responses are data, never runtime authority. */
export async function readCompleteLeetCodeEditorSnapshot(
  location: LeetCodeProblemLocation,
  signal: AbortSignal,
  page: Window = window,
): Promise<CompleteCodeSnapshot> {
  const parsedIdentity = identitySchema.safeParse({
    host: location.host,
    slug: location.slug,
  })
  const current = readCurrentPage(page)
  if (
    !parsedIdentity.success ||
    !current ||
    signal.aborted ||
    !sameIdentity(parsedIdentity.data, current)
  ) {
    throw unavailable()
  }

  let request: z.infer<typeof requestSchema>
  try {
    request = requestSchema.parse({
      ...parsedIdentity.data,
      channel: 'cognipace:complete-editor:v1',
      type: 'snapshot-request',
      requestId: page.crypto.randomUUID(),
    })
  } catch {
    throw unavailable()
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let navigationCheck: ReturnType<typeof setInterval> | undefined

    const cleanup = () => {
      page.removeEventListener('message', onMessage)
      signal.removeEventListener('abort', onAbort)
      clearTimeout(timeout)
      clearInterval(navigationCheck)
    }
    const fail = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(unavailable())
    }
    const onAbort = () => fail()
    const stillOnPage = () => {
      const next = readCurrentPage(page)
      return (
        next !== null &&
        sameIdentity(request, next) &&
        next.origin === current.origin
      )
    }
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!stillOnPage()) {
        fail()
        return
      }
      if (event.source !== page || event.origin !== current.origin) return
      try {
        const response = responseSchema.safeParse(event.data)
        if (
          !response.success ||
          response.data.requestId !== request.requestId ||
          !sameIdentity(request, response.data)
        )
          return
        if (!response.data.ok) {
          fail()
          return
        }
        if (settled) return
        settled = true
        cleanup()
        resolve(response.data.snapshot)
      } catch {
        fail()
      }
    }

    try {
      page.addEventListener('message', onMessage)
      signal.addEventListener('abort', onAbort, { once: true })
      timeout = setTimeout(fail, 3_000)
      navigationCheck = setInterval(() => {
        if (!stillOnPage()) fail()
      }, 50)
      if (signal.aborted || !stillOnPage()) {
        fail()
        return
      }
      page.postMessage(request, current.origin)
    } catch {
      fail()
    }
  })
}

/** MAIN-world handler. It has no extension APIs, provider secrets or network. */
export function installLeetCodeEditorSnapshotBridge(page: Window = window) {
  const onMessage = (event: MessageEvent<unknown>) => {
    const current = readCurrentPage(page)
    if (!current || event.source !== page || event.origin !== current.origin)
      return
    try {
      const parsed = requestSchema.safeParse(event.data)
      if (!parsed.success || !sameIdentity(parsed.data, current)) return
      const snapshot = captureCompleteLeetCodeEditorSnapshot(page)
      const next = readCurrentPage(page)
      if (
        !next ||
        !sameIdentity(current, next) ||
        next.origin !== current.origin
      )
        return
      const response = responseSchema.parse({
        ...parsed.data,
        type: 'snapshot-response',
        ...(snapshot ? { ok: true, snapshot } : { ok: false }),
      })
      page.postMessage(response, current.origin)
    } catch {
      // Nothing from the untrusted page is logged or forwarded as an error.
    }
  }
  page.addEventListener('message', onMessage)
  return () => page.removeEventListener('message', onMessage)
}

function readCurrentPage(page: Window) {
  try {
    const url = new URL(page.location.href)
    if (url.protocol !== 'https:') return null
    const location = parseLeetCodeProblemLocation(url)
    if (!location) return null
    const parsed = identitySchema.safeParse({
      host: location.host,
      slug: location.slug,
    })
    return parsed.success ? { ...parsed.data, origin: url.origin } : null
  } catch {
    return null
  }
}

function sameIdentity(first: Identity, second: Identity) {
  return first.host === second.host && first.slug === second.slug
}
