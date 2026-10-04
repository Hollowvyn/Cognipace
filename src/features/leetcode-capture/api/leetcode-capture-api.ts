import {
  sendMessage,
  type LeetCodeProblemRemoteRuntimeRequest,
  type LeetCodeSubmissionResultRemoteRuntimeRequest,
} from '@/extension/messaging'
import type {
  LeetCodeMetadataResult,
  LeetCodeProblemContentResult,
} from '@/lib/leetcode'
import {
  readLeetCodeRemoteAuthFromDocument,
  type LeetCodeRemoteAuth,
  type LeetCodeRemoteClient,
} from '@/lib/leetcode'

import type {
  SerializedLeetCodeMetadataResult,
  SerializedLeetCodeProblemContentResult,
} from './leetcode-capture-contracts'

export function createLeetCodeCaptureRemoteClient(
  options: {
    getAuth?: (() => LeetCodeRemoteAuth) | undefined
  } = {},
): LeetCodeRemoteClient {
  const getAuth =
    options.getAuth ?? (() => readLeetCodeRemoteAuthFromDocument(document))

  return {
    readProblemMetadata: async (request) => {
      try {
        return deserializeLeetCodeMetadataResult(
          await sendMessage('leetcode.readProblemMetadata', {
            surface: 'content-script',
            location: request.location,
            refresh: request.refresh,
            auth: request.auth ?? getAuth(),
          } satisfies LeetCodeProblemRemoteRuntimeRequest),
        )
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error : new Error(String(error)),
        }
      }
    },
    readProblemContent: async (request) => {
      try {
        return deserializeLeetCodeProblemContentResult(
          await sendMessage('leetcode.readProblemContent', {
            surface: 'content-script',
            location: request.location,
            refresh: request.refresh,
            auth: request.auth ?? getAuth(),
          } satisfies LeetCodeProblemRemoteRuntimeRequest),
        )
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error : new Error(String(error)),
        }
      }
    },
    readSubmissionResult: async (request) => {
      try {
        return await sendMessage('leetcode.readSubmissionResult', {
          surface: 'content-script',
          location: request.location,
          attemptId: request.attemptId,
          submissionId: request.submissionId,
          refresh: request.refresh,
          click: request.click,
          submittedCodeSnapshot: request.submittedCodeSnapshot,
          auth: request.auth ?? getAuth(),
        } satisfies LeetCodeSubmissionResultRemoteRuntimeRequest)
      } catch {
        return {
          result: null,
          debugEvents: [],
        }
      }
    },
  }
}

function deserializeLeetCodeMetadataResult(
  result: SerializedLeetCodeMetadataResult,
): LeetCodeMetadataResult {
  return result.ok
    ? result
    : {
        ok: false,
        error: new Error(result.errorMessage),
      }
}

function deserializeLeetCodeProblemContentResult(
  result: SerializedLeetCodeProblemContentResult,
): LeetCodeProblemContentResult {
  return result.ok
    ? result
    : {
        ok: false,
        error: new Error(result.errorMessage),
      }
}
