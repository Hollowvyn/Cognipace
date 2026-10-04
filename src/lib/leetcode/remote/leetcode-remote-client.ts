import type {
  LeetCodeMetadataResult,
  LeetCodeProblemContentResult,
  LeetCodeProblemLocation,
  LeetCodeSubmissionClick,
  LeetCodeSubmissionPollingDebug,
  LeetCodeSubmissionResult,
  LeetCodeSubmittedCodeSnapshot,
} from '../domain/types'

/** Auth values needed when a runtime calls LeetCode APIs outside the page. */
export interface LeetCodeRemoteAuth {
  csrfToken: string | null
}

/** Request for slug-scoped LeetCode problem metadata or content. */
export interface LeetCodeProblemRemoteRequest {
  refresh?: boolean | undefined
  location: LeetCodeProblemLocation
  auth?: LeetCodeRemoteAuth | undefined
}

/** Request for one submitted LeetCode attempt result poll. */
export interface LeetCodeSubmissionResultRemoteRequest {
  attemptId: string
  submissionId?: string | undefined
  refresh?: boolean | undefined
  location: LeetCodeProblemLocation
  click: LeetCodeSubmissionClick
  submittedCodeSnapshot: LeetCodeSubmittedCodeSnapshot
  auth?: LeetCodeRemoteAuth | undefined
}

/** Result of one submitted LeetCode attempt poll, including debug phases. */
export interface LeetCodeSubmissionResultRemoteResponse {
  result: LeetCodeSubmissionResult | null
  debugEvents: LeetCodeSubmissionPollingDebug[]
}

/** Runtime-agnostic port for LeetCode API reads. */
export interface LeetCodeRemoteClient {
  readProblemMetadata: (
    request: LeetCodeProblemRemoteRequest,
  ) => Promise<LeetCodeMetadataResult>
  readProblemContent: (
    request: LeetCodeProblemRemoteRequest,
  ) => Promise<LeetCodeProblemContentResult>
  readSubmissionResult: (
    request: LeetCodeSubmissionResultRemoteRequest,
  ) => Promise<LeetCodeSubmissionResultRemoteResponse>
}
