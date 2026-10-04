import {
  createLeetCodeReviewContext,
  type LeetCodeCaptureState,
  type LeetCodeProblemLocation,
  type LeetCodeRemoteClient,
  type LeetCodeReviewContext,
} from '@/lib/leetcode'

export type PreparedCodeAnalysisContext =
  | {
      status: 'ready'
      context: LeetCodeReviewContext
      submissionId: string
      attemptId: string
      capture: LeetCodeCaptureState
    }
  | {
      status: 'unavailable'
      message: string
      capture: LeetCodeCaptureState
    }

const captureTimeoutMs = 15_000
const unavailableMessage =
  'Submission capture could not finish. Retry this submission.'

/** Prepares one matching submission without generating or persisting analysis. */
export async function prepareLeetCodeAnalysisContext(
  capture: LeetCodeCaptureState,
  remote: LeetCodeRemoteClient,
  signal: AbortSignal,
  refresh = false,
): Promise<PreparedCodeAnalysisContext> {
  signal.throwIfAborted()

  const attempt = capture.submissionAttempt
  const location = capture.location
  if (
    !attempt?.attemptId.trim() ||
    !location ||
    !capture.metadata ||
    !hasMatchingCaptureLocations(capture, location)
  ) {
    return unavailable(capture)
  }

  const existingReady = readyContext(capture, location)
  if (existingReady && !refresh) {
    return existingReady
  }

  let pinnedSubmissionId = validSubmissionId(
    capture.submissionResult?.submissionId,
  )
    ? capture.submissionResult.submissionId
    : validSubmissionId(capture.submissionPollingDebug?.submissionId)
      ? capture.submissionPollingDebug.submissionId
      : null
  // Keep terminal diagnostics for Retry eligibility, but require fresh essentials.
  let preparedCapture: LeetCodeCaptureState = {
    ...capture,
    problemContent: null,
  }
  let active = true
  let submissionReadSucceeded = false
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(signal.reason)
  signal.addEventListener('abort', abortFromParent)
  const timeout = setTimeout(
    () => controller.abort(new Error(unavailableMessage)),
    captureTimeoutMs,
  )
  let rejectOnAbort: () => void = () => {}
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = () => {
      const reason: unknown = controller.signal.reason
      reject(reason instanceof Error ? reason : new Error(unavailableMessage))
    }
    controller.signal.addEventListener('abort', rejectOnAbort)
  })

  const readContent = async () => {
    try {
      const response = await remote.readProblemContent({
        location: attempt.location,
        refresh: true,
      })
      if (!active) return false
      if (
        !response.ok ||
        !matchesLocation(response.content.location, location)
      ) {
        return false
      }
      preparedCapture = { ...preparedCapture, problemContent: response.content }
      return true
    } catch {
      return false
    }
  }

  const readSubmission = async () => {
    try {
      const response = await remote.readSubmissionResult({
        location: attempt.location,
        attemptId: attempt.attemptId,
        click: {
          location: attempt.location,
          clickedAt: attempt.clickedAt,
          buttonText: attempt.submitButtonText,
        },
        submittedCodeSnapshot: attempt.submittedCodeSnapshot,
        refresh: true,
        ...(pinnedSubmissionId ? { submissionId: pinnedSubmissionId } : {}),
      })
      if (!active) return false
      const firstDiscovery = response.debugEvents.find((event) =>
        validSubmissionId(event.submissionId),
      )
      if (!pinnedSubmissionId && firstDiscovery) {
        pinnedSubmissionId = firstDiscovery.submissionId
        preparedCapture = {
          ...preparedCapture,
          submissionPollingDebug: firstDiscovery,
        }
      }
      if (
        response.result &&
        !matchesLocation(response.result.location, location)
      ) {
        return false
      }
      const resultPin = validSubmissionId(response.result?.submissionId)
        ? response.result.submissionId
        : null
      if (pinnedSubmissionId && resultPin && resultPin !== pinnedSubmissionId) {
        return false
      }
      pinnedSubmissionId ??= resultPin
      const matchingDebug = response.debugEvents.find(
        (event) =>
          event.submissionId === pinnedSubmissionId &&
          validSubmissionId(event.submissionId),
      )
      preparedCapture = {
        ...preparedCapture,
        submissionResult: resultPin
          ? response.result
          : (preparedCapture.submissionResult ?? response.result),
        submissionPollingDebug:
          matchingDebug ??
          (preparedCapture.submissionPollingDebug?.submissionId ===
          pinnedSubmissionId
            ? preparedCapture.submissionPollingDebug
            : null),
      }
      submissionReadSucceeded = resultPin !== null
      return submissionReadSucceeded
    } catch {
      return false
    }
  }

  try {
    // Each read settles separately so one failure cannot discard a discovered pin.
    const completed = await Promise.race([
      Promise.all([readContent(), readSubmission()]),
      aborted,
    ])
    signal.throwIfAborted()
    if (completed.every(Boolean)) {
      const ready = readyContext(preparedCapture, location)
      if (ready) return ready
    }
  } catch {
    signal.throwIfAborted()
  } finally {
    active = false
    clearTimeout(timeout)
    signal.removeEventListener('abort', abortFromParent)
    controller.signal.removeEventListener('abort', rejectOnAbort)
  }
  // Old verified code stays honest, but cannot form a ready context after failure.
  if (!submissionReadSucceeded) {
    preparedCapture = { ...preparedCapture, problemContent: null }
  }
  return unavailable(preparedCapture)
}

function readyContext(
  capture: LeetCodeCaptureState,
  location: LeetCodeProblemLocation,
): Extract<PreparedCodeAnalysisContext, { status: 'ready' }> | null {
  const attempt = capture.submissionAttempt
  const result = capture.submissionResult
  const content = capture.problemContent
  if (
    !attempt?.attemptId.trim() ||
    !result ||
    !validSubmissionId(result.submissionId) ||
    result.resultCodeSnapshot.completeness !== 'complete' ||
    !result.resultCodeSnapshot.code?.trim() ||
    !result.resultCodeSnapshot.language?.trim() ||
    content?.completeness !== 'complete' ||
    !content.statement.trim() ||
    !hasMatchingCaptureLocations(capture, location)
  ) {
    return null
  }
  const context = createLeetCodeReviewContext(capture)
  if (!context || !matchesLocation(context.location, location)) return null

  return {
    status: 'ready',
    context,
    submissionId: result.submissionId,
    attemptId: attempt.attemptId,
    capture,
  }
}

function hasMatchingCaptureLocations(
  capture: LeetCodeCaptureState,
  location: LeetCodeProblemLocation,
) {
  return [
    capture.location,
    capture.submissionAttempt?.location,
    capture.submissionResult?.location,
    capture.metadata?.location,
    capture.problemContent?.location,
  ].every((candidate) => !candidate || matchesLocation(candidate, location))
}

function matchesLocation(
  candidate: LeetCodeProblemLocation,
  expected: LeetCodeProblemLocation,
) {
  return candidate.host === expected.host && candidate.slug === expected.slug
}

function validSubmissionId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d+$/.test(value)
}

function unavailable(
  capture: LeetCodeCaptureState,
): PreparedCodeAnalysisContext {
  return { status: 'unavailable', message: unavailableMessage, capture }
}
