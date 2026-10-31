import { describe, expect, it, vi } from 'vitest'

import * as leetcode from './index'

describe('LeetCode public API facade', () => {
  it('exports the stable feature-facing runtime facade', () => {
    expect(Object.keys(leetcode).sort()).toEqual(
      [
        'completeCodeSnapshotSchema',
        'createEmptyLeetCodeCaptureState',
        'createLeetCodeFetchRemoteClient',
        'createLeetCodePageWatcher',
        'createLeetCodeProblemMetadataFingerprint',
        'createLeetCodeProblemUrl',
        'createLeetCodeReviewContext',
        'isLeetCodeHost',
        'isLeetCodeProblemUrl',
        'normalizeLeetCodeLanguageLabel',
        'normalizeLeetCodeSlug',
        'parseLeetCodeProblemInput',
        'parseLeetCodeProblemLocation',
        'readCompleteLeetCodeEditorSnapshot',
        'readLeetCodeLanguageLabelFromText',
        'readLeetCodeRemoteAuthFromDocument',
        'reduceLeetCodeCaptureState',
        'titleFromLeetCodeSlug',
      ].sort(),
    )
  })

  it('captures complete problem follow-ups through the fetch adapter without a DOM document', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          question: {
            content:
              '<p>Return indices.</p><p>Example 1: Input: [2,7] Output: [0,1]</p><p>Follow up: Use expected linear time.</p><p>Example 2: Input: [1,2,3] Output: [1,2]</p><p>Hint 1: Try a map.</p>',
            hints: [],
          },
        },
      }),
    )
    vi.stubGlobal('document', undefined)
    try {
      const client = leetcode.createLeetCodeFetchRemoteClient({
        fetch: fetcher,
      })
      await expect(
        client.readProblemContent({
          location: {
            slug: 'two-sum',
            url: 'https://leetcode.com/problems/two-sum/',
            host: 'leetcode.com',
          },
        }),
      ).resolves.toMatchObject({
        ok: true,
        content: {
          completeness: 'complete',
          statement: 'Return indices.',
          examples: [{ output: '[0,1]' }],
          constraints: [],
          followUps: [
            'Use expected linear time. Example 2: Input: [1,2,3] Output: [1,2]',
          ],
        },
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not export raw LeetCode readers from the public barrel', () => {
    expect('readLeetCodeProblemContent' in leetcode).toBe(false)
    expect('fetchLeetCodeProblemMetadata' in leetcode).toBe(false)
    expect('readLeetCodeSubmissionResult' in leetcode).toBe(false)
    expect('readLeetCodeSubmissionResultFromApi' in leetcode).toBe(false)
    expect('readLeetCodeSubmissionAttempt' in leetcode).toBe(false)
  })
})
