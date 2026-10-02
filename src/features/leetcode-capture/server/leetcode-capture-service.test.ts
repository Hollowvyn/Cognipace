import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LeetCodeProblemLocation } from '@/lib/leetcode'
import {
  createLeetCodeSubmissionApiFixtureFetcher,
  leetcodeAcceptedSubmissionApiFixture,
} from '@/lib/leetcode/testing/submission-result-fixtures'

import {
  readLeetCodeProblemContentInBackground,
  readLeetCodeProblemMetadataInBackground,
  readLeetCodeSubmissionResultInBackground,
} from './leetcode-capture-service'

describe('leetcode-capture-service', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('caches problem metadata by slug in the background service', async () => {
    const location = createLocation('cache-metadata-problem')
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
          data: {
            question: {
              title: 'Cache Metadata Problem',
              questionFrontendId: '101',
              difficulty: 'Easy',
              isPaidOnly: false,
              topicTags: [],
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetcher)

    const firstResult = await readLeetCodeProblemMetadataInBackground({
      location,
      auth: { csrfToken: null },
    })
    const secondResult = await readLeetCodeProblemMetadataInBackground({
      location,
      auth: { csrfToken: null },
    })

    expect(firstResult).toEqual(secondResult)
    expect(firstResult).toMatchObject({
      ok: true,
      metadata: { title: 'Cache Metadata Problem' },
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('caches problem content by slug in the background service', async () => {
    const location = createLocation('cache-content-problem')
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
          data: {
            question: {
              content:
                '<p>Return indices.</p><p><strong>Example 1:</strong></p><pre>Input: nums = [2,7]\nOutput: [0,1]</pre>',
              hints: ['Use a hash map.'],
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetcher)

    const firstResult = await readLeetCodeProblemContentInBackground({
      location,
      auth: { csrfToken: null },
    })
    const secondResult = await readLeetCodeProblemContentInBackground({
      location,
      auth: { csrfToken: null },
    })

    expect(firstResult).toEqual(secondResult)
    expect(firstResult).toMatchObject({
      ok: true,
      content: {
        statement: 'Return indices.',
        hints: ['Use a hash map.'],
      },
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([
    'http-error',
    'network-error',
    'empty-question',
    'partial-question',
  ])(
    'retries fallback metadata after a %s and caches the recovered result',
    async (failure) => {
      const location = createLocation(`recover-metadata-${failure}`)
      const fetcher = vi.fn<typeof fetch>()
      if (failure === 'network-error') {
        fetcher.mockRejectedValueOnce(new Error('Offline'))
      } else if (failure === 'http-error') {
        fetcher.mockResolvedValueOnce(new Response('', { status: 503 }))
      } else {
        fetcher.mockResolvedValueOnce(
          Response.json({
            data: {
              question:
                failure === 'empty-question'
                  ? {}
                  : { title: 'Partial Metadata' },
            },
          }),
        )
      }
      fetcher.mockImplementation(() =>
        Promise.resolve(
          Response.json({
            data: {
              question: {
                title: 'Recovered Metadata',
                questionFrontendId: '102',
                difficulty: 'Medium',
                topicTags: [],
              },
            },
          }),
        ),
      )
      vi.stubGlobal('fetch', fetcher)
      const request = { location, auth: { csrfToken: null } }

      expect(
        await readLeetCodeProblemMetadataInBackground(request),
      ).toMatchObject({
        ok: true,
        metadata: { source: 'fallback' },
      })
      const recovered = await readLeetCodeProblemMetadataInBackground(request)

      expect(recovered).toMatchObject({
        ok: true,
        metadata: { source: 'graphql', title: 'Recovered Metadata' },
      })
      expect(await readLeetCodeProblemMetadataInBackground(request)).toEqual(
        recovered,
      )
      expect(fetcher).toHaveBeenCalledTimes(2)
    },
  )

  it.each(['http-error', 'network-error', 'empty-content'])(
    'retries incomplete content after %s and caches the recovered result',
    async (failure) => {
      const location = createLocation(`recover-content-${failure}`)
      const fetcher = vi.fn<typeof fetch>()
      if (failure === 'network-error') {
        fetcher.mockRejectedValueOnce(new Error('Offline'))
      } else if (failure === 'http-error') {
        fetcher.mockResolvedValueOnce(new Response('', { status: 503 }))
      } else {
        fetcher.mockResolvedValueOnce(
          Response.json({
            data: { question: { content: '<p></p>', hints: [] } },
          }),
        )
      }
      fetcher.mockImplementation(() =>
        Promise.resolve(
          Response.json({
            data: {
              question: { content: '<p>Recovered statement.</p>', hints: [] },
            },
          }),
        ),
      )
      vi.stubGlobal('fetch', fetcher)
      const request = { location, auth: { csrfToken: null } }

      expect(
        await readLeetCodeProblemContentInBackground(request),
      ).toMatchObject({
        ok: true,
        content: { statement: '', examples: [], constraints: [], hints: [] },
      })
      const recovered = await readLeetCodeProblemContentInBackground(request)

      expect(recovered).toMatchObject({
        ok: true,
        content: { source: 'graphql', statement: 'Recovered statement.' },
      })
      expect(await readLeetCodeProblemContentInBackground(request)).toEqual(
        recovered,
      )
      expect(fetcher).toHaveBeenCalledTimes(2)
    },
  )

  it('does not cache serialized unsuccessful remote reads', async () => {
    const location = createLocation('recover-unsuccessful-reads')
    const readMetadata = vi.fn().mockResolvedValueOnce({
      ok: false,
      error: new Error('Metadata unavailable'),
    })
    const readContent = vi.fn().mockResolvedValueOnce({
      ok: false,
      error: new Error('Content unavailable'),
    })
    vi.resetModules()
    vi.doMock('@/lib/leetcode', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/leetcode')>()
      const remoteClient = actual.createLeetCodeFetchRemoteClient()
      readMetadata.mockImplementation(remoteClient.readProblemMetadata)
      readContent.mockImplementation(remoteClient.readProblemContent)
      return {
        ...actual,
        createLeetCodeFetchRemoteClient: () => ({
          ...remoteClient,
          readProblemMetadata: readMetadata,
          readProblemContent: readContent,
        }),
      }
    })
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        Response.json({
          data: {
            question: {
              title: 'Recovered Metadata',
              questionFrontendId: '103',
              difficulty: 'Easy',
              content: '<p>Recovered statement.</p>',
              hints: [],
            },
          },
        }),
      ),
    )

    try {
      const service = await import('./leetcode-capture-service')
      const request = { location, auth: { csrfToken: null } }

      expect(
        await service.readLeetCodeProblemMetadataInBackground(request),
      ).toEqual({
        ok: false,
        errorMessage: 'Metadata unavailable',
      })
      expect(
        await service.readLeetCodeProblemContentInBackground(request),
      ).toEqual({
        ok: false,
        errorMessage: 'Content unavailable',
      })
      expect(
        await service.readLeetCodeProblemMetadataInBackground(request),
      ).toMatchObject({
        ok: true,
        metadata: { source: 'graphql' },
      })
      expect(
        await service.readLeetCodeProblemContentInBackground(request),
      ).toMatchObject({
        ok: true,
        content: { source: 'graphql', statement: 'Recovered statement.' },
      })
      await service.readLeetCodeProblemMetadataInBackground(request)
      await service.readLeetCodeProblemContentInBackground(request)
      expect(readMetadata).toHaveBeenCalledTimes(2)
      expect(readContent).toHaveBeenCalledTimes(2)
    } finally {
      vi.doUnmock('@/lib/leetcode')
    }
  })

  it('does not retain useful DOM fallback content when remote content recovers', async () => {
    document.body.innerHTML =
      '<main data-track-load="description_content"><p>Local statement.</p></main>'
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({
            data: {
              question: { content: '<p>Remote statement.</p>', hints: [] },
            },
          }),
        ),
      )
    vi.stubGlobal('fetch', fetcher)
    const request = {
      location: createLocation('recover-dom-content'),
      auth: { csrfToken: null },
    }

    expect(await readLeetCodeProblemContentInBackground(request)).toMatchObject(
      {
        ok: true,
        content: { source: 'dom', statement: 'Local statement.' },
      },
    )
    const recovered = await readLeetCodeProblemContentInBackground(request)

    expect(recovered).toMatchObject({
      ok: true,
      content: { source: 'graphql', statement: 'Remote statement.' },
    })
    expect(await readLeetCodeProblemContentInBackground(request)).toEqual(
      recovered,
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('caches terminal submission results for the same submit attempt', async () => {
    const fetcher = createLeetCodeSubmissionApiFixtureFetcher(
      leetcodeAcceptedSubmissionApiFixture,
    )
    vi.stubGlobal('fetch', fetcher)

    const request = {
      location: createLocation('two-sum'),
      click: {
        location: createLocation('two-sum'),
        clickedAt: 4000,
        buttonText: 'Submit',
      },
      submittedCodeSnapshot: {
        code: 'class Solution:\n    pass',
        language: 'Python3',
        source: 'monaco',
        capturedAt: 4000,
      },
      auth: { csrfToken: null },
    } as const

    const firstResult = await readLeetCodeSubmissionResultInBackground(request)
    const secondResult = await readLeetCodeSubmissionResultInBackground(request)

    expect(firstResult).toEqual(secondResult)
    expect(firstResult).toMatchObject({
      result: {
        submissionId: '1234567890',
        status: 'accepted',
      },
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})

function createLocation(slug: string): LeetCodeProblemLocation {
  return {
    slug,
    url: `https://leetcode.com/problems/${slug}/`,
    host: 'leetcode.com',
  }
}
