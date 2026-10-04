import { readLeetCodeProblemContent } from '../content/problem-content-reader'
import { readLeetCodeProblemMetadata } from '../metadata/metadata-reader'
import { readLeetCodeSubmissionResultFromApi } from '../submission/submission-result-api-source'

import { readLeetCodeRemoteAuthFromDocument } from './leetcode-remote-auth'
import type { LeetCodeSubmissionPollingDebug } from '../domain/types'
import type {
  LeetCodeProblemRemoteRequest,
  LeetCodeRemoteAuth,
  LeetCodeRemoteClient,
  LeetCodeSubmissionResultRemoteRequest,
} from './leetcode-remote-client'

/** Creates a fetch-backed LeetCode remote client for browser or test runtimes. */
export function createLeetCodeFetchRemoteClient(
  options: {
    fetch?: typeof fetch | undefined
    document?: Document | undefined
    auth?: LeetCodeRemoteAuth | undefined
    now?: (() => number) | undefined
  } = {},
): LeetCodeRemoteClient {
  return {
    readProblemMetadata: (request) =>
      readLeetCodeProblemMetadata(request.location, {
        document: options.document,
        fetch: options.fetch,
        csrfToken: readRequestCsrfToken(request, options),
        now: options.now,
      }),
    readProblemContent: (request) =>
      readLeetCodeProblemContent(request.location, {
        document: options.document,
        fetch: options.fetch,
        csrfToken: readRequestCsrfToken(request, options),
        now: options.now,
      }),
    readSubmissionResult: async (request) => {
      const debugEvents: LeetCodeSubmissionPollingDebug[] = []
      const result = await readLeetCodeSubmissionResultFromApi({
        submissionId: request.submissionId,
        location: request.location,
        click: request.click,
        submittedCodeSnapshot: request.submittedCodeSnapshot,
        document: options.document,
        fetch: options.fetch,
        csrfToken: readRequestCsrfToken(request, options),
        now: options.now,
        onDebug: (debug) => debugEvents.push(debug),
      })

      return { result, debugEvents }
    },
  }
}

function readRequestCsrfToken(
  request: LeetCodeProblemRemoteRequest | LeetCodeSubmissionResultRemoteRequest,
  options: {
    document?: Document | undefined
    auth?: LeetCodeRemoteAuth | undefined
  },
) {
  return (
    request.auth?.csrfToken ??
    options.auth?.csrfToken ??
    (options.document
      ? readLeetCodeRemoteAuthFromDocument(options.document).csrfToken
      : null)
  )
}
