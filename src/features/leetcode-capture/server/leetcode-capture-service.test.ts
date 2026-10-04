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

  it('caches terminal submission results for the same submit attempt', async () => {
    const fetcher = createLeetCodeSubmissionApiFixtureFetcher(
      leetcodeAcceptedSubmissionApiFixture,
    )
    vi.stubGlobal('fetch', fetcher)

    const request = {
      attemptId: 'attempt-fixed',
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
        completeness: 'partial',
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
