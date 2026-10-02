import { describe, expect, it, vi } from 'vitest'

import { fetchLeetCodeProblemMetadata } from './graphql-metadata-source'
import { createLeetCodeProblemMetadataFingerprint } from './metadata-fingerprint'
import { readLeetCodeProblemMetadata } from './metadata-reader'
import type { LeetCodeProblemMetadata } from '../domain/types'

const location = {
  slug: 'two-sum',
  url: 'https://leetcode.com/problems/two-sum/',
  host: 'leetcode.com',
}

describe('fetchLeetCodeProblemMetadata', () => {
  it('maps LeetCode GraphQL question metadata', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
          data: {
            question: {
              title: 'Two Sum',
              questionFrontendId: '1',
              difficulty: 'Easy',
              isPaidOnly: false,
              topicTags: [
                { name: 'Array', slug: 'array' },
                { name: 'Hash Table', slug: 'hash-table' },
              ],
            },
          },
        }),
      ),
    )

    await expect(
      fetchLeetCodeProblemMetadata(location, {
        fetch: fetcher,
        now: () => 300,
      }),
    ).resolves.toEqual({
      ok: true,
      metadata: {
        location,
        title: 'Two Sum',
        frontendId: '1',
        difficulty: 'Easy',
        isPremium: false,
        topics: [
          { name: 'Array', slug: 'array' },
          { name: 'Hash Table', slug: 'hash-table' },
        ],
        source: 'graphql',
        confidence: 'high',
        capturedAt: 300,
      },
    })
  })

  it('uses GraphQL titleSlug as canonical location when LeetCode returns a redirected slug', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
          data: {
            question: {
              title: 'Two Sum',
              titleSlug: 'two-sum',
              questionFrontendId: '1',
              difficulty: 'Easy',
              isPaidOnly: false,
              topicTags: [],
            },
          },
        }),
      ),
    )

    await expect(
      fetchLeetCodeProblemMetadata(
        {
          slug: 'old-two-sum',
          url: 'https://leetcode.com/problems/old-two-sum/',
          host: 'leetcode.com',
        },
        { fetch: fetcher },
      ),
    ).resolves.toMatchObject({
      ok: true,
      metadata: {
        location: {
          slug: 'two-sum',
          url: 'https://leetcode.com/problems/two-sum/',
        },
      },
    })
  })

  it.each([
    {},
    { title: 'Two Sum' },
    { title: '   ', difficulty: 'Easy' },
    { title: 'Two Sum', difficulty: 'Unknown' },
  ])('rejects incomplete remote question metadata %j', async (question) => {
    const fetcher = vi.fn(() =>
      Promise.resolve(Response.json({ data: { question } })),
    )

    await expect(
      fetchLeetCodeProblemMetadata(location, { fetch: fetcher }),
    ).resolves.toMatchObject({ ok: false })
  })

  it('accepts core metadata without optional remote fields', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
          data: { question: { title: 'Two Sum', difficulty: 'Easy' } },
        }),
      ),
    )

    await expect(
      fetchLeetCodeProblemMetadata(location, { fetch: fetcher }),
    ).resolves.toMatchObject({
      ok: true,
      metadata: {
        title: 'Two Sum',
        difficulty: 'Easy',
        frontendId: null,
        isPremium: null,
        topics: [],
        source: 'graphql',
      },
    })
  })
})

describe('readLeetCodeProblemMetadata', () => {
  it('falls back to DOM metadata when GraphQL fails', async () => {
    document.body.innerHTML = `
      <main>
        <h1>1. Two Sum</h1>
        <span>Medium</span>
      </main>
    `
    const fetcher = vi.fn(() =>
      Promise.resolve(new Response('', { status: 500 })),
    )

    await expect(
      readLeetCodeProblemMetadata(location, {
        root: document,
        document,
        fetch: fetcher,
        now: () => 400,
      }),
    ).resolves.toMatchObject({
      ok: true,
      metadata: {
        title: 'Two Sum',
        frontendId: '1',
        difficulty: 'Medium',
        source: 'dom',
        capturedAt: 400,
      },
    })
  })

  it('preserves DOM fallback for incomplete remote metadata', async () => {
    document.body.innerHTML =
      '<main><h1>1. Two Sum</h1><span>Medium</span></main>'
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({
          data: { question: { title: 'Partial remote title' } },
        }),
      ),
    )

    await expect(
      readLeetCodeProblemMetadata(location, {
        root: document,
        document,
        fetch: fetcher,
      }),
    ).resolves.toMatchObject({
      ok: true,
      metadata: { title: 'Two Sum', difficulty: 'Medium', source: 'dom' },
    })
  })
})

describe('createLeetCodeProblemMetadataFingerprint', () => {
  it('dedupes metadata without using source, confidence, capturedAt, or topic order', () => {
    const baseMetadata: LeetCodeProblemMetadata = {
      location,
      title: 'Two Sum',
      frontendId: '1',
      difficulty: 'Easy',
      isPremium: false,
      topics: [
        { name: 'Hash Table', slug: 'hash-table' },
        { name: 'Array', slug: 'array' },
      ],
      source: 'graphql',
      confidence: 'high',
      capturedAt: 300,
    }

    expect(createLeetCodeProblemMetadataFingerprint(baseMetadata)).toBe(
      createLeetCodeProblemMetadataFingerprint({
        ...baseMetadata,
        topics: [...baseMetadata.topics].reverse(),
        source: 'dom',
        confidence: 'medium',
        capturedAt: 999,
      }),
    )
  })
})
