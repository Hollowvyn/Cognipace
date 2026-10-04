import { describe, expect, it, vi } from 'vitest'

import { createLeetCodeProblemContentFingerprint } from './content-fingerprint'
import {
  fetchLeetCodeProblemContent,
  readLeetCodeProblemContent,
  readLeetCodeProblemContentFromDom,
} from './problem-content-reader'

const location = {
  slug: 'two-sum',
  url: 'https://leetcode.com/problems/two-sum/',
  host: 'leetcode.com',
}

describe('fetchLeetCodeProblemContent', () => {
  it('maps LeetCode GraphQL content into statement examples constraints and hints', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
          data: {
            question: {
              content: `
                <p>Given an array of integers <code>nums</code> and an integer <code>target</code>, return indices of the two numbers.</p>
                <p>You may assume that each input would have exactly one solution.</p>
                <p><strong>Example 1:</strong></p>
                <pre>
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].
                </pre>
                <p><strong>Constraints:</strong></p>
                <ul>
                  <li><code>2 <= nums.length <= 10^4</code></li>
                  <li><code>-10^9 <= nums[i] <= 10^9</code></li>
                </ul>
              `,
              hints: ['Use a hash map.'],
            },
          },
        }),
      ),
    )

    await expect(
      fetchLeetCodeProblemContent(location, {
        fetch: fetcher,
        document,
        now: () => 1000,
      }),
    ).resolves.toMatchObject({
      ok: true,
      content: {
        location,
        statement:
          'Given an array of integers nums and an integer target, return indices of the two numbers. You may assume that each input would have exactly one solution.',
        examples: [
          {
            label: 'Example 1',
            input: 'nums = [2,7,11,15], target = 9',
            output: '[0,1]',
            explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].',
          },
        ],
        constraints: ['2 <= nums.length <= 10^4', '-10^9 <= nums[i] <= 10^9'],
        hints: ['Use a hash map.'],
        followUps: [],
        completeness: 'complete',
        source: 'graphql',
        confidence: 'high',
        capturedAt: 1000,
      },
    })
  })

  it('sanitizes malicious markup while extracting valid problem content', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
          data: {
            question: {
              content: `
                <p>Given an array <script>alert("xss")</script>of integers <code>nums</code>.</p>
                <p>You <img src="x" onerror="alert(1)">may assume that each input would have exactly one solution.</p>
                <p><a href="javascript:alert(1)"><strong>Example 1:</strong></a></p>
                <pre>
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
                </pre>
                <p><strong>Constraints:</strong></p>
                <ul>
                  <li><code>2 <= nums.length <= 10^4</code></li>
                </ul>
              `,
              hints: ['Use a hash map <script>alert(1)</script>.'],
            },
          },
        }),
      ),
    )

    await expect(
      fetchLeetCodeProblemContent(location, {
        fetch: fetcher,
        document,
        now: () => 1000,
      }),
    ).resolves.toMatchObject({
      ok: true,
      content: {
        location,
        statement:
          'Given an array of integers nums. You may assume that each input would have exactly one solution.',
        examples: [
          {
            label: 'Example 1',
            input: 'nums = [2,7,11,15], target = 9',
            output: '[0,1]',
          },
        ],
        constraints: ['2 <= nums.length <= 10^4'],
        hints: ['Use a hash map .'], // <script> tag is removed
        followUps: [],
        completeness: 'complete',
        source: 'graphql',
        confidence: 'high',
        capturedAt: 1000,
      },
    })
  })

  it('preserves chained comparison constraints from LeetCode markup', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
          data: {
            question: {
              content: `
                <p>You are given two non-empty linked lists.</p>
                <p><strong>Constraints:</strong></p>
                <ul>
                  <li>The number of nodes in each linked list is in the range <code>[1, 100]</code>.</li>
                  <li><code>0 <= Node.val <= 9</code></li>
                </ul>
              `,
              hints: [],
            },
          },
        }),
      ),
    )

    await expect(
      fetchLeetCodeProblemContent(location, {
        fetch: fetcher,
        document,
        now: () => 1100,
      }),
    ).resolves.toMatchObject({
      ok: true,
      content: {
        constraints: [
          'The number of nodes in each linked list is in the range [1, 100].',
          '0 <= Node.val <= 9',
        ],
      },
    })
  })
})

describe('readLeetCodeProblemContentFromDom', () => {
  it('reads scoped problem content from LeetCode description DOM', () => {
    document.body.innerHTML = `
      <main>
        <section data-track-load="description_content">
          <p>Given an array of integers nums and an integer target, return indices.</p>
          <p><strong>Example 1:</strong></p>
          <pre>
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
          </pre>
          <p><strong>Constraints:</strong></p>
          <ul>
            <li>2 <= nums.length <= 10^4</li>
          </ul>
          <details class="hint"><summary>Hint 1</summary>Try complements.</details>
        </section>
      </main>
    `

    expect(
      readLeetCodeProblemContentFromDom(document, {
        location,
        now: () => 2000,
      }),
    ).toMatchObject({
      statement:
        'Given an array of integers nums and an integer target, return indices.',
      examples: [
        {
          label: 'Example 1',
          input: 'nums = [2,7,11,15], target = 9',
          output: '[0,1]',
        },
      ],
      constraints: ['2 <= nums.length <= 10^4'],
      hints: ['Try complements.'],
      completeness: 'partial',
      source: 'dom',
      confidence: 'medium',
      capturedAt: 2000,
    })
  })

  it('does not treat follow-up examples as main problem examples', () => {
    document.body.innerHTML = `<section data-track-load="description_content"><p>Return indices.</p><p>Example 1:</p><pre>Input: [2,7]
Output: [0,1]</pre><p>Follow-up:</p><p>Consider larger input.</p><pre>Input: [1,2,3]
Output: [1,2]</pre></section>`
    const content = readLeetCodeProblemContentFromDom(document, { location })
    expect(content?.examples).toHaveLength(1)
    expect(content?.examples[0]?.input).toBe('[2,7]')
  })

  it('stops main text examples and constraints before the follow-up section', () => {
    document.body.innerHTML = `<section data-track-load="description_content"><p>Return indices.</p><p>Example 1: Input: [2,7] Output: [0,1]</p><p>Follow-up:</p><p>Example 2: Input: [1,2,3] Output: [1,2]</p><p>Constraints:</p><ul><li>Use constant extra space.</li></ul></section>`
    const content = readLeetCodeProblemContentFromDom(document, { location })
    expect(content?.examples).toHaveLength(1)
    expect(content?.constraints).toEqual([])
  })

  it('reads constraints when the heading text is inside a strong element', () => {
    document.body.innerHTML = `
      <main>
        <section data-track-load="description_content">
          <p>You are given two non-empty linked lists.</p>
          <p><strong>Constraints:</strong></p>
          <ul>
            <li>The number of nodes in each linked list is in the range <code>[1, 100]</code>.</li>
            <li><code>0 <= Node.val <= 9</code></li>
          </ul>
        </section>
      </main>
    `

    expect(
      readLeetCodeProblemContentFromDom(document, {
        location,
        now: () => 2100,
      }),
    ).toMatchObject({
      constraints: [
        'The number of nodes in each linked list is in the range [1, 100].',
        '0 <= Node.val <= 9',
      ],
    })
  })

  it('preserves chained comparison constraints from paragraph fallback text', () => {
    document.body.innerHTML = `
      <main>
        <section data-track-load="description_content">
          <p>You are given two non-empty linked lists.</p>
          <p><strong>Constraints:</strong></p>
          <p>The number of nodes in each linked list is in the range <code>[1, 100]</code>.</p>
          <p><code>0 <= Node.val <= 9</code></p>
        </section>
      </main>
    `

    expect(
      readLeetCodeProblemContentFromDom(document, {
        location,
        now: () => 2200,
      }),
    ).toMatchObject({
      constraints: [
        'The number of nodes in each linked list is in the range [1, 100].',
        '0 <= Node.val <= 9',
      ],
    })
  })
})

describe('readLeetCodeProblemContent', () => {
  it('preserves follow-up requirements separately from the statement', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: {
          question: {
            content:
              '<p>Find two distinct indices.</p><p>Constraints:</p><ul><li>2 &lt;= n &lt;= 10000</li></ul><p>Follow-up:</p><p>Can you achieve expected linear time?</p>',
            hints: [],
          },
        },
      }),
    )
    await expect(
      readLeetCodeProblemContent(location, { fetch: fetcher, document }),
    ).resolves.toMatchObject({
      ok: true,
      content: {
        completeness: 'complete',
        statement: 'Find two distinct indices.',
        constraints: ['2 <= n <= 10000'],
        followUps: ['Can you achieve expected linear time?'],
      },
    })
  })

  it('marks absent optional GraphQL sections as known empty', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: {
          question: {
            content: '<p>Return the only answer.</p>',
            hints: [],
          },
        },
      }),
    )
    await expect(
      readLeetCodeProblemContent(location, { fetch: fetcher, document }),
    ).resolves.toMatchObject({
      ok: true,
      content: {
        completeness: 'complete',
        statement: 'Return the only answer.',
        constraints: [],
        followUps: [],
      },
    })
  })

  it.each(['Follow-up', 'Follow up', 'Followup'])(
    'stops DOM example and constraint fields at %s',
    (heading) => {
      document.body.innerHTML = `<section data-track-load="description_content"><p>Return indices.</p><p>Example 1: Input: [2,7] Output: [0,1]</p><p>Constraints: 2 &lt;= n</p><p>${heading}: Use expected linear time.</p><p>Hint 1: Try a map.</p></section>`
      expect(
        readLeetCodeProblemContentFromDom(document, { location }),
      ).toMatchObject({
        completeness: 'partial',
        statement: 'Return indices.',
        examples: [{ output: '[0,1]' }],
        constraints: ['2 <= n'],
        followUps: ['Use expected linear time.'],
      })
    },
  )

  it('includes follow-ups and completeness in the content fingerprint', () => {
    const content = {
      location,
      statement: 'Return indices.',
      examples: [],
      constraints: [],
      hints: [],
      followUps: [],
      completeness: 'partial' as const,
    }
    const fingerprint = createLeetCodeProblemContentFingerprint(content)
    expect(
      createLeetCodeProblemContentFingerprint({
        ...content,
        completeness: 'complete',
      }),
    ).not.toBe(fingerprint)
    expect(
      createLeetCodeProblemContentFingerprint({
        ...content,
        followUps: ['Use expected linear time.'],
      }),
    ).not.toBe(fingerprint)
  })

  it('falls back to DOM content when GraphQL content is unavailable', async () => {
    document.body.innerHTML = `
      <section data-track-load="description_content">
        <p>Return the only answer.</p>
      </section>
    `
    const fetcher = vi.fn(() =>
      Promise.resolve(new Response('', { status: 500 })),
    )

    await expect(
      readLeetCodeProblemContent(location, {
        root: document,
        fetch: fetcher,
        now: () => 3000,
      }),
    ).resolves.toMatchObject({
      ok: true,
      content: {
        statement: 'Return the only answer.',
        completeness: 'partial',
        source: 'dom',
        confidence: 'medium',
        capturedAt: 3000,
      },
    })
  })

  it('marks empty GraphQL markup as missing when no DOM content is available', async () => {
    document.body.innerHTML = '<main></main>'
    const fetcher = vi.fn(async () =>
      Response.json({ data: { question: { content: '<p> </p>', hints: [] } } }),
    )
    await expect(
      readLeetCodeProblemContent(location, { fetch: fetcher, document }),
    ).resolves.toMatchObject({
      ok: true,
      content: { completeness: 'missing', statement: '', followUps: [] },
    })
  })

  it('returns a low confidence fallback when no content can be read', async () => {
    document.body.innerHTML = '<main></main>'
    const fetcher = vi.fn(() =>
      Promise.resolve(new Response('', { status: 500 })),
    )

    await expect(
      readLeetCodeProblemContent(location, {
        root: document,
        fetch: fetcher,
        now: () => 4000,
      }),
    ).resolves.toMatchObject({
      ok: true,
      content: {
        statement: '',
        examples: [],
        constraints: [],
        hints: [],
        followUps: [],
        completeness: 'missing',
        source: 'fallback',
        confidence: 'low',
        capturedAt: 4000,
      },
    })
  })

  it('creates a stable fingerprint from semantic content only', () => {
    const contentFingerprint = createLeetCodeProblemContentFingerprint({
      location,
      statement: 'Return indices.',
      examples: [
        {
          label: 'Example 1',
          input: 'nums = [2,7]',
          output: '[0,1]',
          explanation: null,
          rawText: 'Input: nums = [2,7]\nOutput: [0,1]',
        },
      ],
      constraints: ['2 <= nums.length'],
      hints: ['Use a map.'],
      followUps: [],
      completeness: 'complete',
    })

    expect(contentFingerprint).toMatch(/^lc-content-[a-f0-9]+$/)
    expect(
      createLeetCodeProblemContentFingerprint({
        location,
        statement: 'Return   indices.',
        examples: [
          {
            label: 'Example 1',
            input: 'nums = [2,7]',
            output: '[0,1]',
            explanation: null,
            rawText: 'Input: nums = [2,7]\nOutput: [0,1]',
          },
        ],
        constraints: ['2 <= nums.length'],
        hints: ['Use a map.'],
        followUps: [],
        completeness: 'complete',
      }),
    ).toBe(contentFingerprint)
  })
})
