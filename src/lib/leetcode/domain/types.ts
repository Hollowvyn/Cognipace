export const leetcodeDifficulties = [
  'Easy',
  'Medium',
  'Hard',
  'Unknown',
] as const

/** LeetCode difficulty label normalized from GraphQL or page DOM. */
export type LeetCodeDifficulty = (typeof leetcodeDifficulties)[number]

/** Source that produced problem metadata. */
export type LeetCodeMetadataSource = 'graphql' | 'dom' | 'fallback'

/** Confidence level for captured problem metadata. */
export type LeetCodeMetadataConfidence = 'high' | 'medium' | 'low'

/** Source that produced problem statement/content data. */
export type LeetCodeProblemContentSource = 'graphql' | 'dom' | 'fallback'

/** Confidence level for captured problem content data. */
export type LeetCodeProblemContentConfidence = 'high' | 'medium' | 'low'

/** Whether captured content is verified whole, visible-only, or unavailable. */
export type LeetCodeCaptureCompleteness = 'complete' | 'partial' | 'missing'

/** Source that produced an editor or submitted-code snapshot. */
export type LeetCodeCodeSnapshotSource =
  | 'api'
  | 'monaco'
  | 'textarea'
  | 'code-block'
  | 'none'

/** Source that produced the submission result. */
export type LeetCodeSubmissionResultSource = 'api' | 'dom'

/** Debug phase emitted while polling LeetCode submission result APIs. */
export type LeetCodeSubmissionPollingPhase =
  | 'finding-submission'
  | 'submission-found'
  | 'submission-not-found'
  | 'checking-result'
  | 'api-result-found'
  | 'graphql-details-found'
  | 'graphql-details-missing'
  | 'dom-fallback-used'
  | 'timed-out'

/** Normalized terminal status for a LeetCode submission result. */
export type LeetCodeSubmissionStatus =
  | 'accepted'
  | 'wrong-answer'
  | 'runtime-error'
  | 'compile-error'
  | 'time-limit-exceeded'
  | 'memory-limit-exceeded'
  | 'output-limit-exceeded'
  | 'unknown'

/** Canonical identity for a LeetCode problem page. */
export interface LeetCodeProblemLocation {
  slug: string
  url: string
  host: string
}

/** LeetCode topic tag attached to a problem. */
export interface LeetCodeTopic {
  name: string
  slug: string | null
}

/** Parsed example block from the LeetCode problem statement. */
export interface LeetCodeExample {
  label: string
  input: string | null
  output: string | null
  explanation: string | null
  rawText: string
}

/** Synchronous page snapshot from currently visible LeetCode DOM. */
export interface LeetCodePageSnapshot {
  location: LeetCodeProblemLocation
  title: string | null
  frontendId: string | null
  difficulty: LeetCodeDifficulty
  isPremium: boolean | null
  topics: LeetCodeTopic[]
  isReady: boolean
  capturedAt: number
}

/** Problem metadata normalized from LeetCode GraphQL or DOM fallback. */
export interface LeetCodeProblemMetadata {
  location: LeetCodeProblemLocation
  title: string
  frontendId: string | null
  difficulty: LeetCodeDifficulty
  isPremium: boolean | null
  topics: LeetCodeTopic[]
  source: LeetCodeMetadataSource
  confidence: LeetCodeMetadataConfidence
  capturedAt: number
}

/** Problem statement, examples, constraints, follow-ups, and hints captured from LeetCode. */
export interface LeetCodeProblemContent {
  location: LeetCodeProblemLocation
  statement: string
  examples: LeetCodeExample[]
  constraints: string[]
  followUps: string[]
  completeness: LeetCodeCaptureCompleteness
  hints: string[]
  source: LeetCodeProblemContentSource
  confidence: LeetCodeProblemContentConfidence
  capturedAt: number
  contentFingerprint: string
}

/** Snapshot of editor or submitted solution code. */
export interface LeetCodeCodeSnapshot {
  code: string | null
  language: string | null
  source: LeetCodeCodeSnapshotSource
  completeness: LeetCodeCaptureCompleteness
  capturedAt: number
}

/** User submit-click event captured from the LeetCode page. */
export interface LeetCodeSubmissionClick {
  location: LeetCodeProblemLocation
  clickedAt: number
  buttonText: string
}

/** Code snapshot associated with a submitted LeetCode attempt. */
export type LeetCodeSubmittedCodeSnapshot = LeetCodeCodeSnapshot

/** Captured submission attempt before the final LeetCode result is known. */
export interface LeetCodeSubmissionAttempt {
  attemptId: string
  location: LeetCodeProblemLocation
  clickedAt: number
  submitButtonText: string
  submittedCodeSnapshot: LeetCodeSubmittedCodeSnapshot
}

/** Final LeetCode submission result with error/output fields when available. */
export interface LeetCodeSubmissionResult {
  location: LeetCodeProblemLocation
  submissionId: string | null
  source: LeetCodeSubmissionResultSource
  status: LeetCodeSubmissionStatus
  statusText: string
  checkedAt: number
  runtime: string | null
  memory: string | null
  passedTestCount: number | null
  totalTestCount: number | null
  failingTestcase: string | null
  errorMessage: string | null
  compileError: string | null
  runtimeError: string | null
  lastTestcase: string | null
  codeOutput: string | null
  expectedOutput: string | null
  stdOutput: string | null
  resultCodeSnapshot: LeetCodeSubmittedCodeSnapshot
}

/** Lightweight diagnostics for the active submission polling cycle. */
export interface LeetCodeSubmissionPollingDebug {
  phase: LeetCodeSubmissionPollingPhase
  submissionId: string | null
  checkState: string | null
  statusText: string | null
  checkedAt: number
}

/** Event stream emitted by createLeetCodePageWatcher. */
export type LeetCodePageEvent =
  | {
      type: 'page-changed'
      location: LeetCodeProblemLocation
      previousLocation: LeetCodeProblemLocation | null
      changedAt: number
    }
  | {
      type: 'page-ready'
      location: LeetCodeProblemLocation
      snapshot: LeetCodePageSnapshot
      metadata: LeetCodeProblemMetadata
      pageReadyAt: number
    }
  | {
      type: 'metadata-updated'
      location: LeetCodeProblemLocation
      metadata: LeetCodeProblemMetadata
    }
  | {
      type: 'problem-content-updated'
      location: LeetCodeProblemLocation
      content: LeetCodeProblemContent
    }
  | {
      type: 'submit-clicked'
      click: LeetCodeSubmissionClick
    }
  | {
      type: 'submission-started'
      attempt: LeetCodeSubmissionAttempt
    }
  | {
      type: 'submission-polling-updated'
      location: LeetCodeProblemLocation
      debug: LeetCodeSubmissionPollingDebug
    }
  | {
      type: 'submission-result-updated'
      result: LeetCodeSubmissionResult
    }
  | {
      type: 'watcher-error'
      location: LeetCodeProblemLocation | null
      error: Error
      occurredAt: number
    }

/** Result returned by LeetCode metadata remote clients and readers. */
export type LeetCodeMetadataResult =
  | {
      ok: true
      metadata: LeetCodeProblemMetadata
    }
  | {
      ok: false
      error: Error
    }

/** Result returned by LeetCode content remote clients and readers. */
export type LeetCodeProblemContentResult =
  | {
      ok: true
      content: LeetCodeProblemContent
    }
  | {
      ok: false
      error: Error
    }
