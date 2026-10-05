import {
  createLeetCodeFetchRemoteClient,
  type LeetCodeMetadataResult,
  type LeetCodeProblemContentResult,
  type LeetCodeRemoteClient,
  type LeetCodeSubmissionResultRemoteResponse,
} from '@/lib/leetcode'

import type {
  SerializedLeetCodeMetadataResult,
  SerializedLeetCodeProblemContentResult,
} from '../api/leetcode-capture-contracts'
import {
  leetcodeSubmissionResultRemoteResponseSchema,
  serializedLeetCodeMetadataResultSchema,
  serializedLeetCodeProblemContentResultSchema,
} from '../api/leetcode-capture-contracts'

type LeetCodeProblemRemoteRequest = Parameters<
  LeetCodeRemoteClient['readProblemMetadata']
>[0]
type LeetCodeSubmissionResultRemoteRequest = Parameters<
  LeetCodeRemoteClient['readSubmissionResult']
>[0]

const leetCodeRemoteClient = createLeetCodeFetchRemoteClient()
const metadataCache = new Map<string, SerializedLeetCodeMetadataResult>()
const contentCache = new Map<string, SerializedLeetCodeProblemContentResult>()
const submissionResultCache = new Map<
  string,
  LeetCodeSubmissionResultRemoteResponse
>()
const submissionAttemptResultCache = new Map<
  string,
  LeetCodeSubmissionResultRemoteResponse
>()

export async function readLeetCodeProblemMetadataInBackground(
  request: LeetCodeProblemRemoteRequest,
) {
  const cacheKey = createProblemCacheKey(request)
  const cachedResult = metadataCache.get(cacheKey)

  if (cachedResult && !request.refresh) {
    return cachedResult
  }

  const result = serializeLeetCodeMetadataResult(
    await leetCodeRemoteClient.readProblemMetadata(request),
  )
  metadataCache.set(cacheKey, result)

  return result
}

export async function readLeetCodeProblemContentInBackground(
  request: LeetCodeProblemRemoteRequest,
) {
  const cacheKey = createProblemCacheKey(request)
  const cachedResult = contentCache.get(cacheKey)

  if (
    !request.refresh &&
    cachedResult &&
    isCompleteProblemContent(cachedResult)
  ) {
    return cachedResult
  }

  const result = serializeLeetCodeProblemContentResult(
    await leetCodeRemoteClient.readProblemContent(request),
  )
  if (isCompleteProblemContent(result)) {
    contentCache.set(cacheKey, result)
  } else {
    contentCache.delete(cacheKey)
  }

  return result
}

export async function readLeetCodeSubmissionResultInBackground(
  request: LeetCodeSubmissionResultRemoteRequest,
) {
  const attemptCacheKey = createSubmissionAttemptCacheKey(request)

  if (!request.refresh) {
    if (request.submissionId) {
      const cachedResponse = submissionResultCache.get(
        createSubmissionIdCacheKey(request.location.host, request.submissionId),
      )

      if (
        cachedResponse &&
        isCompleteMatchingSubmission(cachedResponse, request)
      ) {
        submissionAttemptResultCache.set(attemptCacheKey, cachedResponse)
        return cachedResponse
      }
    }

    const cachedAttemptResponse =
      submissionAttemptResultCache.get(attemptCacheKey)

    if (
      cachedAttemptResponse &&
      isCompleteMatchingSubmission(cachedAttemptResponse, request)
    ) {
      return cachedAttemptResponse
    }
  }

  const response = leetcodeSubmissionResultRemoteResponseSchema.parse(
    await leetCodeRemoteClient.readSubmissionResult(request),
  )

  const submissionId = response.result?.submissionId

  if (submissionId && isCompleteMatchingSubmission(response, request)) {
    submissionResultCache.set(
      createSubmissionIdCacheKey(request.location.host, submissionId),
      response,
    )
    submissionAttemptResultCache.set(attemptCacheKey, response)
  }

  return response
}

function createProblemCacheKey(request: LeetCodeProblemRemoteRequest) {
  return JSON.stringify([request.location.host, request.location.slug])
}

function isCompleteProblemContent(
  result: SerializedLeetCodeProblemContentResult,
) {
  return (
    result.ok &&
    result.content.completeness === 'complete' &&
    Boolean(result.content.statement.trim())
  )
}

function createSubmissionIdCacheKey(host: string, submissionId: string) {
  return JSON.stringify([host, submissionId])
}

function isCompleteMatchingSubmission(
  response: LeetCodeSubmissionResultRemoteResponse,
  request: LeetCodeSubmissionResultRemoteRequest,
) {
  const result = response.result
  return Boolean(
    result?.submissionId &&
    (!request.submissionId || result.submissionId === request.submissionId) &&
    result.location.host === request.location.host &&
    result.location.slug === request.location.slug &&
    result.resultCodeSnapshot.completeness === 'complete' &&
    result.resultCodeSnapshot.code?.trim() &&
    result.resultCodeSnapshot.language?.trim(),
  )
}

function serializeLeetCodeMetadataResult(
  result: LeetCodeMetadataResult,
): SerializedLeetCodeMetadataResult {
  return serializedLeetCodeMetadataResultSchema.parse(
    result.ok
      ? result
      : {
          ok: false,
          errorMessage: result.error.message,
        },
  )
}

function createSubmissionAttemptCacheKey(
  request: LeetCodeSubmissionResultRemoteRequest,
) {
  return JSON.stringify([
    request.location.host,
    request.location.slug,
    request.attemptId,
  ])
}

function serializeLeetCodeProblemContentResult(
  result: LeetCodeProblemContentResult,
): SerializedLeetCodeProblemContentResult {
  return serializedLeetCodeProblemContentResultSchema.parse(
    result.ok
      ? result
      : {
          ok: false,
          errorMessage: result.error.message,
        },
  )
}
