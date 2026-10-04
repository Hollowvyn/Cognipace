// @vitest-environment node
import { expect, it, vi } from 'vitest'

const location = {
  slug: 'two-sum',
  url: 'https://leetcode.com/problems/two-sum/',
  host: 'leetcode.com',
}

it('captures complete GraphQL content with safe hints in a cold worker environment', async () => {
  expect(typeof window).toBe('undefined')
  expect(typeof document).toBe('undefined')
  const { fetchLeetCodeProblemContent } =
    await import('./problem-content-reader')
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      data: {
        question: {
          content: '<p>Return two distinct indices.</p>',
          hints: [
            'Use a <strong>hash map</strong> <script>alert(1)</script><style>body { display: none; }</style><img src="x" onerror="alert(1)">.',
            '<a href="javascript:alert(1)">Compare complements &amp; indices.</a>',
          ],
        },
      },
    }),
  )

  await expect(
    fetchLeetCodeProblemContent(location, { fetch: fetcher, now: () => 1000 }),
  ).resolves.toMatchObject({
    ok: true,
    content: {
      statement: 'Return two distinct indices.',
      examples: [],
      constraints: [],
      followUps: [],
      hints: ['Use a hash map .', 'Compare complements & indices.'],
      completeness: 'complete',
      source: 'graphql',
      confidence: 'high',
      capturedAt: 1000,
    },
  })
})

it('preserves mathematical notation across full GraphQL content without a DOM', async () => {
  const { fetchLeetCodeProblemContent } =
    await import('./problem-content-reader')
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      data: {
        question: {
          content: `
            <p>For <code>a<sub><i>i</i></sub></code>, compute <code>n<sup><em>2</em></sup></code> pairs.</p>
            <p><strong>Example 1:</strong></p>
            <pre>Input: x = 10<sup>4</sup>, a<sub>i</sub> = [1,
    2]
Output: -10<sup><strong>9</strong></sup>
Explanation: Compare a<sub>i + 1</sub> with n<sup><i>k</i> + 1</sup>.</pre>
            <p>Constraints:</p>
            <ul>
              <li>2 &lt;= <code>n</code><sup><span>2</span></sup> &lt;= 10<sup>4</sup></li>
              <li>-10<sup>9</sup> &lt;= a<sub>i</sub> &lt;= 10<sup>9</sup></li>
            </ul>
            <p>Follow-up:</p>
            <p>Can you improve O(<i>n</i><sup>2</sup>) time using x<sub>i + 1</sub>?</p>
          `,
          hints: [],
        },
      },
    }),
  )

  await expect(
    fetchLeetCodeProblemContent(location, { fetch: fetcher }),
  ).resolves.toMatchObject({
    ok: true,
    content: {
      statement: 'For a_(i), compute n^(2) pairs.',
      examples: [
        {
          input: 'x = 10^(4), a_(i) = [1,\n    2]',
          output: '-10^(9)',
          explanation: 'Compare a_(i + 1) with n^(k + 1).',
        },
      ],
      constraints: ['2 <= n^(2) <= 10^(4)', '-10^(9) <= a_(i) <= 10^(9)'],
      followUps: ['Can you improve O(n^(2)) time using x_(i + 1)?'],
      completeness: 'complete',
      source: 'graphql',
      confidence: 'high',
    },
  })
})
