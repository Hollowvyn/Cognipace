import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseLeetCodeProblemLocation } from '../domain/problem-url'
import {
  installLeetCodeEditorSnapshotBridge,
  readCompleteLeetCodeEditorSnapshot,
} from './editor-snapshot-bridge'

const href = 'https://leetcode.com/problems/two-sum/description/'
const location = parseLeetCodeProblemLocation(href)!
const snapshot = {
  code: 'all code\nlast line',
  language: 'python',
  capturedAt: 123,
}

function makePage(initialHref = href) {
  const target = new EventTarget()
  const page = Object.assign(target, {
    document,
    location: { href: initialHref },
    crypto: window.crypto,
    postMessage: vi.fn(),
  })
  return page as unknown as Window & { postMessage: ReturnType<typeof vi.fn> }
}

function deliver(
  page: Window,
  data: unknown,
  origin = 'https://leetcode.com',
  source: unknown = page,
) {
  const event = new MessageEvent('message', { data, origin })
  Object.defineProperty(event, 'source', { value: source })
  page.dispatchEvent(event)
}

function requestFrom(page: ReturnType<typeof makePage>) {
  return page.postMessage.mock.calls[0]?.[0] as Record<string, unknown>
}

function response(request: Record<string, unknown>, overrides = {}) {
  return {
    ...request,
    type: 'snapshot-response',
    ok: true,
    snapshot,
    ...overrides,
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('isolated complete snapshot bridge', () => {
  it('correlates a UUID, host and problem slug, then cleans up on success', async () => {
    const page = makePage()
    const remove = vi.spyOn(page, 'removeEventListener')
    const controller = new AbortController()
    const abortRemove = vi.spyOn(controller.signal, 'removeEventListener')
    const result = readCompleteLeetCodeEditorSnapshot(
      location,
      controller.signal,
      page,
    )
    const request = requestFrom(page)
    expect(request).toMatchObject({
      type: 'snapshot-request',
      host: 'leetcode.com',
      slug: 'two-sum',
    })
    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(page.postMessage.mock.calls[0]?.[1]).toBe('https://leetcode.com')
    deliver(page, response(request))
    await expect(result).resolves.toEqual(snapshot)
    expect(remove).toHaveBeenCalledWith('message', expect.any(Function))
    expect(abortRemove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    [
      'wrong UUID',
      { requestId: '11111111-1111-4111-8111-111111111111' },
      undefined,
      undefined,
    ],
    ['wrong host', { host: 'www.leetcode.com' }, undefined, undefined],
    ['wrong slug', { slug: 'add-two-numbers' }, undefined, undefined],
    ['wrong origin', {}, 'https://example.com', undefined],
    ['wrong source', {}, undefined, {}],
    ['unknown envelope fields', { extra: 'ignored?' }, undefined, undefined],
    [
      'oversized code',
      { snapshot: { ...snapshot, code: 'x'.repeat(32_001) } },
      undefined,
      undefined,
    ],
    [
      'blank language',
      { snapshot: { ...snapshot, language: '  ' } },
      undefined,
      undefined,
    ],
  ])(
    'ignores %s without accepting untrusted data',
    async (_name, overrides, origin, source) => {
      const page = makePage()
      const result = readCompleteLeetCodeEditorSnapshot(
        location,
        new AbortController().signal,
        page,
      )
      const request = requestFrom(page)
      deliver(page, response(request, overrides), origin, source)
      deliver(page, response(request))
      await expect(result).resolves.toEqual(snapshot)
    },
  )

  it('rejects unavailable with only a controlled generic error', async () => {
    const page = makePage()
    const result = readCompleteLeetCodeEditorSnapshot(
      location,
      new AbortController().signal,
      page,
    )
    deliver(page, {
      ...requestFrom(page),
      type: 'snapshot-response',
      ok: false,
    })
    await expect(result).rejects.toThrow(
      'Complete editor snapshot unavailable. Please retry.',
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out within five seconds and removes all pending listeners/timers', async () => {
    const page = makePage()
    const remove = vi.spyOn(page, 'removeEventListener')
    const result = readCompleteLeetCodeEditorSnapshot(
      location,
      new AbortController().signal,
      page,
    )
    const rejected = expect(result).rejects.toThrow(
      'Complete editor snapshot unavailable',
    )
    await vi.advanceTimersByTimeAsync(5_000)
    await rejected
    expect(remove).toHaveBeenCalledWith('message', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up on cancellation and does not publish an already aborted request', async () => {
    const page = makePage()
    const controller = new AbortController()
    const result = readCompleteLeetCodeEditorSnapshot(
      location,
      controller.signal,
      page,
    )
    controller.abort()
    await expect(result).rejects.toThrow('Complete editor snapshot unavailable')
    expect(vi.getTimerCount()).toBe(0)
    page.postMessage.mockClear()
    await expect(
      readCompleteLeetCodeEditorSnapshot(location, controller.signal, page),
    ).rejects.toThrow()
    expect(page.postMessage).not.toHaveBeenCalled()
  })

  it('rejects SPA navigation even before a response and ignores late output', async () => {
    const page = makePage()
    const result = readCompleteLeetCodeEditorSnapshot(
      location,
      new AbortController().signal,
      page,
    )
    const rejected = expect(result).rejects.toThrow(
      'Complete editor snapshot unavailable',
    )
    page.location.href = 'https://leetcode.com/problems/add-two-numbers/'
    await vi.advanceTimersByTimeAsync(100)
    await rejected
    deliver(page, response(requestFrom(page)))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects mismatched caller identity and insecure pages without posting', async () => {
    const page = makePage()
    await expect(
      readCompleteLeetCodeEditorSnapshot(
        { ...location, slug: 'other' },
        new AbortController().signal,
        page,
      ),
    ).rejects.toThrow()
    await expect(
      readCompleteLeetCodeEditorSnapshot(
        location,
        new AbortController().signal,
        makePage('http://leetcode.com/problems/two-sum/'),
      ),
    ).rejects.toThrow()
    expect(page.postMessage).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('checks current navigation again before accepting a correlated response', async () => {
    const page = makePage()
    const result = readCompleteLeetCodeEditorSnapshot(
      location,
      new AbortController().signal,
      page,
    )
    page.location.href = 'https://leetcode.com/problems/add-two-numbers/'
    deliver(page, response(requestFrom(page)))
    await expect(result).rejects.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up and sanitizes errors if postMessage throws', async () => {
    const page = makePage()
    page.postMessage.mockImplementation(() => {
      throw new Error('page secret')
    })
    await expect(
      readCompleteLeetCodeEditorSnapshot(
        location,
        new AbortController().signal,
        page,
      ),
    ).rejects.toThrow('Complete editor snapshot unavailable. Please retry.')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('MAIN-world snapshot handler', () => {
  function mountModel(page: Window) {
    document.body.innerHTML =
      '<div id="editor"><div class="monaco-editor"></div></div>'
    Object.assign(page, {
      monaco: {
        editor: {
          getEditors: () => [
            {
              getDomNode: () => document.querySelector('.monaco-editor'),
              getModel: () => ({
                getValue: () => snapshot.code,
                getLanguageId: () => snapshot.language,
              }),
            },
          ],
        },
      },
    })
  }

  const request = {
    channel: 'cognipace:complete-editor:v1',
    type: 'snapshot-request',
    requestId: '11111111-1111-4111-8111-111111111111',
    host: 'leetcode.com',
    slug: 'two-sum',
  }

  it('serves only explicit valid same-page requests with bounded full snapshots', () => {
    const page = makePage()
    mountModel(page)
    const uninstall = installLeetCodeEditorSnapshotBridge(page)
    deliver(page, request)
    expect(page.postMessage).toHaveBeenCalledWith(
      {
        ...request,
        type: 'snapshot-response',
        ok: true,
        snapshot: { ...snapshot, capturedAt: Date.now() },
      },
      'https://leetcode.com',
    )
    uninstall()
    page.postMessage.mockClear()
    deliver(page, request)
    expect(page.postMessage).not.toHaveBeenCalled()
  })

  it.each([
    [{ ...request, slug: 'other' }, undefined, undefined],
    [{ ...request, host: 'www.leetcode.com' }, undefined, undefined],
    [{ ...request, requestId: 'not-a-uuid' }, undefined, undefined],
    [{ ...request, extra: 'authority' }, undefined, undefined],
    [{ ...request, type: 'runtime-command' }, undefined, undefined],
    [request, 'https://evil.com', undefined],
    [request, undefined, {}],
  ])('ignores invalid or unrelated messages', (data, origin, source) => {
    const page = makePage()
    const uninstall = installLeetCodeEditorSnapshotBridge(page)
    deliver(page, data, origin, source)
    expect(page.postMessage).not.toHaveBeenCalled()
    uninstall()
  })

  it('answers unavailable without leaking page exceptions, source or error details', () => {
    const page = makePage()
    const uninstall = installLeetCodeEditorSnapshotBridge(page)
    deliver(page, request)
    expect(page.postMessage).toHaveBeenCalledWith(
      { ...request, type: 'snapshot-response', ok: false },
      'https://leetcode.com',
    )
    uninstall()
  })

  it('does not publish a snapshot when capture navigates to another problem', () => {
    const page = makePage()
    mountModel(page)
    Object.assign(page, {
      monaco: {
        editor: {
          getEditors: () => [
            {
              getDomNode: () => document.querySelector('.monaco-editor'),
              getModel: () => ({
                getValue: () => {
                  page.location.href = 'https://leetcode.com/problems/other/'
                  return 'code'
                },
                getLanguageId: () => 'python',
              }),
            },
          ],
        },
      },
    })
    const uninstall = installLeetCodeEditorSnapshotBridge(page)
    deliver(page, request)
    expect(page.postMessage).not.toHaveBeenCalled()
    uninstall()
  })
})
