import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  LeetCodeProblemContent,
  LeetCodeProblemContentResult,
  LeetCodeProblemLocation,
  LeetCodeSubmissionResultRemoteResponse,
} from '@/lib/leetcode'
import { createLeetCodeFetchRemoteClient } from '@/lib/leetcode/remote/leetcode-fetch-remote-client'
import {
  createLeetCodeSubmissionApiFixtureFetcher,
  leetcodeAcceptedSubmissionApiFixture,
} from '@/lib/leetcode/testing/submission-result-fixtures'

const remote = vi.hoisted(() => ({
  readProblemMetadata: vi.fn(),
  readProblemContent: vi.fn(),
  readSubmissionResult: vi.fn(),
}))
vi.mock('@/lib/leetcode', () => ({
  createLeetCodeFetchRemoteClient: () => remote,
}))

let service: typeof import('./leetcode-capture-service')
const location = createLocation('two-sum')
const request = {
  attemptId: 'attempt-1',
  location,
  click: { location, clickedAt: 5000, buttonText: 'Submit' },
  submittedCodeSnapshot: {
    code: 'fragment',
    language: 'Python3',
    source: 'monaco',
    completeness: 'partial',
    capturedAt: 5000,
  },
} as const

beforeEach(async () => {
  vi.resetModules()
  remote.readProblemMetadata.mockReset()
  remote.readProblemContent.mockReset()
  remote.readSubmissionResult.mockReset()
  service = await import('./leetcode-capture-service')
})

describe('recoverable submission caches', () => {
  it('reaches transport after partial details, then reuses the complete result', async () => {
    const fixture = {
      ...leetcodeAcceptedSubmissionApiFixture,
      graphQlPayload: null,
    } as typeof leetcodeAcceptedSubmissionApiFixture
    const fetcher = createLeetCodeSubmissionApiFixtureFetcher(fixture)
    remote.readSubmissionResult.mockImplementation(
      createLeetCodeFetchRemoteClient({ fetch: fetcher, now: () => 7000 })
        .readSubmissionResult,
    )
    const first =
      await service.readLeetCodeSubmissionResultInBackground(request)
    expect(first.result?.resultCodeSnapshot.completeness).toBe('partial')
    fixture.graphQlPayload = leetcodeAcceptedSubmissionApiFixture.graphQlPayload
    const second = await service.readLeetCodeSubmissionResultInBackground({
      ...request,
      submissionId: '1234567890',
    })
    const third = await service.readLeetCodeSubmissionResultInBackground({
      ...request,
      submissionId: '1234567890',
    })
    expect(second.result?.resultCodeSnapshot).toMatchObject({
      completeness: 'complete',
      source: 'api',
    })
    expect(third).toEqual(second)
    expect(remote.readSubmissionResult).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenCalledTimes(5)
  })

  it('refreshes a complete pinned result and retains fresh details in both caches', async () => {
    const fixture = structuredClone(leetcodeAcceptedSubmissionApiFixture)
    const fetcher = createLeetCodeSubmissionApiFixtureFetcher(fixture)
    remote.readSubmissionResult.mockImplementation(
      createLeetCodeFetchRemoteClient({ fetch: fetcher, now: () => 7000 })
        .readSubmissionResult,
    )
    await service.readLeetCodeSubmissionResultInBackground(request)
    fixture.submissionListPayload = {
      submission_list: [{ id: '9999999999', timestamp: 6 }],
    }
    fixture.graphQlPayload = {
      data: {
        submissionDetails: {
          id: '1234567890',
          code: '  fresh full code\n',
          lang: { name: 'python3' },
        },
      },
    }
    const refreshed = await service.readLeetCodeSubmissionResultInBackground({
      ...request,
      submissionId: '1234567890',
      refresh: true,
    })
    const cached = await service.readLeetCodeSubmissionResultInBackground({
      ...request,
      submissionId: '1234567890',
    })
    const cachedAttempt =
      await service.readLeetCodeSubmissionResultInBackground(request)
    expect(refreshed.result?.resultCodeSnapshot.code).toBe(
      '  fresh full code\n',
    )
    expect(cached).toEqual(refreshed)
    expect(cachedAttempt).toEqual(refreshed)
    expect(remote.readSubmissionResult).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenCalledTimes(5)
  })

  it('reuses the ID cache before transport for another attempt pinned to that ID', async () => {
    const response = await completeResponse()
    remote.readSubmissionResult.mockResolvedValue(response)
    await service.readLeetCodeSubmissionResultInBackground(request)
    const cached = await service.readLeetCodeSubmissionResultInBackground({
      ...request,
      attemptId: 'attempt-2',
      submissionId: '1234567890',
    })
    expect(cached).toEqual(response)
    expect(remote.readSubmissionResult).toHaveBeenCalledTimes(1)
  })

  it('does not redirect a new pinned ID to an old attempt cache', async () => {
    const response = await completeResponse()
    remote.readSubmissionResult
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce({
        ...response,
        result: { ...response.result!, submissionId: '9999999999' },
      })
    await service.readLeetCodeSubmissionResultInBackground(request)
    const next = await service.readLeetCodeSubmissionResultInBackground({
      ...request,
      submissionId: '9999999999',
    })
    expect(next.result?.submissionId).toBe('9999999999')
    expect(remote.readSubmissionResult).toHaveBeenCalledTimes(2)
  })

  it('keeps different attempts with the same click time separate', async () => {
    const response = await completeResponse()
    remote.readSubmissionResult
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce({ result: null, debugEvents: [] })
    await service.readLeetCodeSubmissionResultInBackground(request)
    const next = await service.readLeetCodeSubmissionResultInBackground({
      ...request,
      attemptId: 'attempt-2',
    })
    expect(next.result).toBeNull()
    expect(remote.readSubmissionResult).toHaveBeenCalledTimes(2)
  })

  it.each(['slug', 'host', 'submissionId'] as const)(
    'does not store a response with the wrong %s',
    async (field) => {
      const response = await completeResponse()
      const wrong = {
        ...response,
        result: {
          ...response.result!,
          ...(field === 'submissionId'
            ? { submissionId: '9999999999' }
            : {
                location: {
                  ...location,
                  [field]: field === 'host' ? 'www.leetcode.com' : 'three-sum',
                },
              }),
        },
      }
      remote.readSubmissionResult
        .mockResolvedValueOnce(wrong)
        .mockResolvedValueOnce(response)
      const pinned = { ...request, submissionId: '1234567890' }
      await service.readLeetCodeSubmissionResultInBackground(pinned)
      const next =
        await service.readLeetCodeSubmissionResultInBackground(pinned)
      expect(next).toEqual(response)
      expect(remote.readSubmissionResult).toHaveBeenCalledTimes(2)
    },
  )

  it.each(['slug', 'host'] as const)(
    'does not reuse an ID cache for another %s',
    async (field) => {
      const response = await completeResponse()
      remote.readSubmissionResult
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce({ result: null, debugEvents: [] })
      await service.readLeetCodeSubmissionResultInBackground(request)
      const changedLocation =
        field === 'host'
          ? createLocation('two-sum', 'www.leetcode.com')
          : createLocation('three-sum')
      const next = await service.readLeetCodeSubmissionResultInBackground({
        ...request,
        location: changedLocation,
        attemptId: 'attempt-2',
        submissionId: '1234567890',
      })
      expect(next.result).toBeNull()
      expect(remote.readSubmissionResult).toHaveBeenCalledTimes(2)
    },
  )

  it.each(['partial', 'missing', 'empty-code', 'empty-language'] as const)(
    'does not cache %s submission context',
    async (kind) => {
      const response = await completeResponse()
      const snapshot = {
        ...response.result!.resultCodeSnapshot,
        ...(kind === 'empty-code'
          ? { code: '  ' }
          : kind === 'empty-language'
            ? { language: '  ' }
            : { completeness: kind }),
      }
      remote.readSubmissionResult
        .mockResolvedValueOnce({
          ...response,
          result: { ...response.result!, resultCodeSnapshot: snapshot },
        })
        .mockResolvedValueOnce(response)
      const pinned = { ...request, submissionId: '1234567890' }
      await service.readLeetCodeSubmissionResultInBackground(pinned)
      expect(
        await service.readLeetCodeSubmissionResultInBackground(pinned),
      ).toEqual(response)
      expect(remote.readSubmissionResult).toHaveBeenCalledTimes(2)
    },
  )

  it('returns an incomplete refresh instead of an older complete cached response', async () => {
    const response = await completeResponse()
    const partial = {
      ...response,
      result: {
        ...response.result!,
        resultCodeSnapshot: { ...request.submittedCodeSnapshot },
      },
    }
    remote.readSubmissionResult
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(partial)
    const pinned = { ...request, submissionId: '1234567890' }
    await service.readLeetCodeSubmissionResultInBackground(pinned)
    expect(
      await service.readLeetCodeSubmissionResultInBackground({
        ...pinned,
        refresh: true,
      }),
    ).toEqual(partial)
    expect(remote.readSubmissionResult).toHaveBeenCalledTimes(2)
  })
})

describe('problem caches', () => {
  it.each(['failed', 'partial', 'missing', 'empty-statement'] as const)(
    'retries %s content until complete and then reuses it',
    async (kind) => {
      const complete = completeContent(location)
      const unusable: LeetCodeProblemContentResult =
        kind === 'failed'
          ? { ok: false, error: new Error('temporarily unavailable') }
          : {
              ok: true,
              content: {
                ...complete.content,
                ...(kind === 'empty-statement'
                  ? { statement: '  ' }
                  : { completeness: kind }),
              },
            }
      remote.readProblemContent
        .mockResolvedValueOnce(unusable)
        .mockResolvedValueOnce(complete)
      await service.readLeetCodeProblemContentInBackground({ location })
      const second = await service.readLeetCodeProblemContentInBackground({
        location,
      })
      expect(second).toEqual(complete)
      expect(
        await service.readLeetCodeProblemContentInBackground({ location }),
      ).toEqual(second)
      expect(remote.readProblemContent).toHaveBeenCalledTimes(2)
    },
  )

  it('refreshes complete content and deletes its cache after an unusable refresh', async () => {
    const original = completeContent(location)
    const fresh = {
      ok: true,
      content: {
        ...original.content,
        statement: 'Fresh context',
        followUps: ['Use linear time.'],
      },
    } as const
    remote.readProblemContent
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(fresh)
      .mockResolvedValueOnce({ ok: false, error: new Error('temporary') })
      .mockResolvedValueOnce(original)
    await service.readLeetCodeProblemContentInBackground({ location })
    expect(
      await service.readLeetCodeProblemContentInBackground({
        location,
        refresh: true,
      }),
    ).toEqual(fresh)
    expect(
      await service.readLeetCodeProblemContentInBackground({ location }),
    ).toEqual(fresh)
    await service.readLeetCodeProblemContentInBackground({
      location,
      refresh: true,
    })
    expect(
      await service.readLeetCodeProblemContentInBackground({ location }),
    ).toEqual(original)
    expect(remote.readProblemContent).toHaveBeenCalledTimes(4)
  })

  it('isolates content by supported host alias', async () => {
    const wwwLocation = createLocation('two-sum', 'www.leetcode.com')
    remote.readProblemContent
      .mockResolvedValueOnce(completeContent(location))
      .mockResolvedValueOnce(completeContent(wwwLocation))
    await service.readLeetCodeProblemContentInBackground({ location })
    const wwwResult = await service.readLeetCodeProblemContentInBackground({
      location: wwwLocation,
    })
    expect(wwwResult.ok && wwwResult.content.location.host).toBe(
      'www.leetcode.com',
    )
    expect(remote.readProblemContent).toHaveBeenCalledTimes(2)
  })

  it('isolates metadata by supported host alias without changing metadata reuse', async () => {
    const wwwLocation = createLocation('two-sum', 'www.leetcode.com')
    const metadata = {
      location,
      title: 'Two Sum',
      frontendId: '1',
      difficulty: 'Easy',
      isPremium: false,
      topics: [],
      source: 'graphql',
      confidence: 'high',
      capturedAt: 7000,
    }
    remote.readProblemMetadata
      .mockResolvedValueOnce({ ok: true, metadata })
      .mockResolvedValueOnce({
        ok: true,
        metadata: { ...metadata, location: wwwLocation },
      })
    await service.readLeetCodeProblemMetadataInBackground({ location })
    const wwwResult = await service.readLeetCodeProblemMetadataInBackground({
      location: wwwLocation,
    })
    expect(wwwResult.ok && wwwResult.metadata.location.host).toBe(
      'www.leetcode.com',
    )
    expect(
      await service.readLeetCodeProblemMetadataInBackground({
        location: wwwLocation,
      }),
    ).toEqual(wwwResult)
    expect(remote.readProblemMetadata).toHaveBeenCalledTimes(2)
  })
})

function completeResponse(): Promise<LeetCodeSubmissionResultRemoteResponse> {
  return createLeetCodeFetchRemoteClient({
    fetch: createLeetCodeSubmissionApiFixtureFetcher(
      leetcodeAcceptedSubmissionApiFixture,
    ),
    now: () => 7000,
  }).readSubmissionResult(request)
}

function completeContent(location: LeetCodeProblemLocation) {
  const content: LeetCodeProblemContent = {
    location,
    statement: 'Return indices.',
    examples: [],
    constraints: [],
    followUps: [],
    completeness: 'complete',
    hints: [],
    source: 'graphql',
    confidence: 'high',
    capturedAt: 7000,
    contentFingerprint: 'complete-context',
  }
  return { ok: true, content } as const
}

function createLocation(
  slug: string,
  host = 'leetcode.com',
): LeetCodeProblemLocation {
  return { slug, host, url: `https://${host}/problems/${slug}/` }
}
