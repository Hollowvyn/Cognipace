import { useCallback, useEffect, useRef, useState } from 'react'

import { useGenAiConfigurationRevision } from '@/features/genai'
import {
  createLeetCodeCaptureRemoteClient,
  prepareLeetCodeAnalysisContext,
  type PreparedCodeAnalysisContext,
} from '@/features/leetcode-capture'
import {
  analyzeLeetCodeSubmissionRequestSchema,
  analyzeLeetCodeSubmissionViaRuntime,
  cancelLeetCodeAnalysisViaRuntime,
  type AnalyzeLeetCodeSubmissionRequest,
  type CodeAnalysisErrorCode,
  type CodeAnalysisReport,
} from '@/features/leetcode-review-assistant'
import { AiDeadlineError, withAiDeadline } from '@/lib/ai/operation'
import type { LeetCodeCaptureState } from '@/lib/leetcode'

export type CodeAnalysisState =
  | { status: 'disabled' | 'idle' }
  | { status: 'pending'; phase: 'capture' | 'analysis'; requestId: string }
  | { status: 'ready'; requestId: string; report: CodeAnalysisReport }
  | {
      status: 'unavailable'
      message: string
      canRetry: boolean
      showSettings: boolean
    }
  | {
      status: 'error'
      code: CodeAnalysisErrorCode
      message: string
      canRetry: boolean
      showSettings: boolean
    }

export type UseLeetCodeCodeAnalysisOptions = {
  activeSlug: string | null
  capture: LeetCodeCaptureState
  enabled: boolean
  available: boolean
}
export type UseLeetCodeCodeAnalysisResult = {
  state: CodeAnalysisState
  retry: () => void
  reset: () => void
}

type ReadyContext = Extract<PreparedCodeAnalysisContext, { status: 'ready' }>
const diagnosticFields = [
  'errorMessage',
  'compileError',
  'runtimeError',
  'failingTestcase',
  'lastTestcase',
  'codeOutput',
  'expectedOutput',
  'stdOutput',
] as const

/** Preserve essentials verbatim; only oversized optional diagnostics may be omitted. */
export function buildCodeAnalysisRequest(
  prepared: ReadyContext,
  requestId: string,
  configurationRevision: number,
): AnalyzeLeetCodeSubmissionRequest | null {
  const { location, problem, content, submittedCode, submissionResult } =
    prepared.context
  if (
    !submissionResult ||
    submittedCode?.completeness !== 'complete' ||
    content.completeness !== 'complete'
  )
    return null
  const omittedDiagnostics: string[] = []
  const diagnostics = Object.fromEntries(
    diagnosticFields.map((field) => {
      const value = submissionResult[field] ?? null
      if (value !== null && value.length > 2000) {
        omittedDiagnostics.push(field)
        return [field, null]
      }
      return [field, value]
    }),
  )
  const parsed = analyzeLeetCodeSubmissionRequestSchema.safeParse({
    surface: 'content-script',
    requestId,
    attemptId: prepared.attemptId,
    submissionId: prepared.submissionId,
    problemSlug: location.slug,
    configurationRevision,
    problem: {
      slug: location.slug,
      title: problem.title,
      difficulty: problem.difficulty,
      topics: problem.topics.map((topic) => topic.name),
      statement: content.statement,
      examples: content.examples.map((example) => example.rawText),
      constraints: content.constraints,
      followUps: content.followUps,
    },
    submission: {
      status: submissionResult.status,
      code: submittedCode.code,
      language: submittedCode.language,
      languageVersion: null,
      runtime: submissionResult.runtime,
      memory: submissionResult.memory,
      passedTestCount: submissionResult.passedTestCount,
      totalTestCount: submissionResult.totalTestCount,
      diagnostics,
      omittedDiagnostics,
    },
  })
  return parsed.success ? parsed.data : null
}

const idle: CodeAnalysisState = { status: 'idle' }
const settingsMessage =
  'Configure AI assessment in Settings, then Retry this submission.'
const settingsErrors: ReadonlySet<CodeAnalysisErrorCode> = new Set([
  'auth',
  'permission',
  'bad-request',
  'model-unavailable',
  'billing',
  'not-configured',
  'stale-configuration',
])

type Operation = {
  requestId: string
  scope: string
  revision: number
  controller: AbortController
}

/** Session-local controller. Review saving and provider credentials never enter this hook. */
export function useLeetCodeCodeAnalysis(
  options: UseLeetCodeCodeAnalysisOptions,
): UseLeetCodeCodeAnalysisResult {
  const { activeSlug, capture, enabled, available } = options
  const { revision, readRevision } = useGenAiConfigurationRevision()
  const attemptId = capture.submissionAttempt?.attemptId ?? null
  const attemptKey = attemptId ? JSON.stringify([activeSlug, attemptId]) : null
  const scope = JSON.stringify([activeSlug, attemptId, revision])
  const matchingAttempt = Boolean(
    activeSlug &&
    attemptId &&
    capture.location?.slug === activeSlug &&
    capture.submissionAttempt?.location.slug === activeSlug,
  )
  const terminal =
    matchingAttempt && capture.submissionResult?.location.slug === activeSlug
  const visibilityKey = JSON.stringify([scope, enabled, available])
  const [stored, setStored] = useState<{
    scope: string | null
    state: CodeAnalysisState
    visibilityKey: string
    resetAttemptKey: string | null
  }>({ scope: null, state: idle, visibilityKey, resetAttemptKey: null })
  if (stored.visibilityKey !== visibilityKey) {
    const preserve = enabled && available && stored.scope === scope
    setStored({
      scope: preserve ? stored.scope : null,
      state: preserve ? stored.state : idle,
      visibilityKey,
      resetAttemptKey:
        stored.resetAttemptKey === attemptKey ? stored.resetAttemptKey : null,
    })
  }
  const [handledAttempts, setHandledAttempts] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const currentOperation = useRef<Operation | null>(null)
  const retainedCapture = useRef<{
    attemptKey: string
    capture: LeetCodeCaptureState
  } | null>(null)
  const latest = useRef({
    options,
    scope,
    attemptKey,
    matchingAttempt,
    terminal,
  })

  useEffect(() => {
    latest.current = { options, scope, attemptKey, matchingAttempt, terminal }
    if (retainedCapture.current?.attemptKey !== attemptKey)
      retainedCapture.current = null
  }, [options, scope, attemptKey, matchingAttempt, terminal])

  const cancel = useCallback(() => {
    const operation = currentOperation.current
    if (!operation) return
    currentOperation.current = null
    operation.controller.abort()
    void cancelLeetCodeAnalysisViaRuntime({
      surface: 'content-script',
      requestId: operation.requestId,
    }).catch(() => {})
  }, [])

  // This runs before automatic work. Capture enrichment does not cancel its operation.
  useEffect(() => {
    if (!enabled || !available || currentOperation.current?.scope !== scope)
      cancel()
  }, [scope, enabled, available, cancel])
  useEffect(() => () => cancel(), [cancel])

  const run = useCallback(
    (refresh: boolean) => {
      const snapshot = latest.current
      if (
        !snapshot.options.enabled ||
        !snapshot.options.available ||
        !snapshot.terminal ||
        !snapshot.attemptKey
      )
        return
      cancel()
      const configurationRevision = readRevision()
      const operation: Operation = {
        requestId: crypto.randomUUID(),
        scope: JSON.stringify([
          snapshot.options.activeSlug,
          snapshot.options.capture.submissionAttempt?.attemptId,
          configurationRevision,
        ]),
        revision: configurationRevision,
        controller: new AbortController(),
      }
      currentOperation.current = operation
      const key = snapshot.attemptKey
      const operationVisibilityKey = JSON.stringify([
        operation.scope,
        true,
        true,
      ])
      setStored({
        scope: operation.scope,
        visibilityKey: operationVisibilityKey,
        resetAttemptKey: null,
        state: {
          status: 'pending',
          phase: 'capture',
          requestId: operation.requestId,
        },
      })
      const retained =
        retainedCapture.current?.attemptKey === key
          ? retainedCapture.current.capture
          : null
      const freshMetadata = snapshot.options.capture.metadata
      // Late metadata may repair the same attempt; newer result/code/debug must not replace its pin.
      const selectedCapture = retained
        ? {
            ...retained,
            metadata:
              freshMetadata &&
              freshMetadata.location.slug === retained.location?.slug &&
              freshMetadata.location.host === retained.location.host
                ? freshMetadata
                : retained.metadata,
          }
        : snapshot.options.capture
      if (selectedCapture.metadata)
        setHandledAttempts((previous) => new Set(previous).add(key))
      const isCurrent = () =>
        currentOperation.current === operation &&
        !operation.controller.signal.aborted &&
        readRevision() === operation.revision &&
        latest.current.scope === operation.scope &&
        latest.current.options.enabled &&
        latest.current.options.available
      const publish = (state: CodeAnalysisState) => {
        if (isCurrent())
          setStored({
            scope: operation.scope,
            state,
            visibilityKey: operationVisibilityKey,
            resetAttemptKey: null,
          })
      }

      void withAiDeadline(
        { timeoutMs: 50_000, signal: operation.controller.signal },
        async (signal) => {
          const prepared = await prepareLeetCodeAnalysisContext(
            selectedCapture,
            createLeetCodeCaptureRemoteClient(),
            signal,
            refresh,
          )
          if (signal.aborted || !isCurrent()) return
          // Even an unavailable preparation may discover the immutable submission pin.
          retainedCapture.current = {
            attemptKey: key,
            capture: prepared.capture,
          }
          if (prepared.status === 'unavailable') {
            publish({
              status: 'unavailable',
              message: prepared.message,
              canRetry: true,
              showSettings: false,
            })
            return
          }
          const request = buildCodeAnalysisRequest(
            prepared,
            operation.requestId,
            operation.revision,
          )
          if (!request) {
            publish({
              status: 'unavailable',
              message:
                'Complete submission context exceeds analysis limits or is invalid. Retry after capturing the full submission.',
              canRetry: true,
              showSettings: false,
            })
            return
          }
          publish({
            status: 'pending',
            phase: 'analysis',
            requestId: operation.requestId,
          })
          const response = await analyzeLeetCodeSubmissionViaRuntime(request)
          if (signal.aborted || !isCurrent()) return
          if (
            response.requestId !== request.requestId ||
            response.attemptId !== request.attemptId ||
            response.submissionId !== request.submissionId ||
            response.problemSlug !== request.problemSlug ||
            response.configurationRevision !== request.configurationRevision
          ) {
            publish({
              status: 'error',
              code: 'invalid-output',
              message:
                'AI returned a response for a different submission. Retry this submission.',
              canRetry: true,
              showSettings: false,
            })
          } else if (response.status === 'ready') {
            publish({
              status: 'ready',
              requestId: response.requestId,
              report: response.report,
            })
          } else if (response.status === 'unavailable') {
            publish({
              status: 'unavailable',
              message: response.message,
              canRetry: true,
              showSettings:
                response.reason === 'configuration' ||
                response.reason === 'configuration-changed',
            })
          } else {
            publish({
              status: 'error',
              code: response.code,
              message: response.message,
              canRetry: true,
              showSettings: settingsErrors.has(response.code),
            })
          }
        },
      )
        .catch((error: unknown) => {
          if (!isCurrent()) return
          const timeout =
            error instanceof AiDeadlineError && error.code === 'timeout'
          publish({
            status: 'error',
            code: timeout ? 'timeout' : 'unknown',
            message: timeout
              ? 'AI analysis timed out. Retry this submission.'
              : 'AI analysis could not finish. Retry this submission.',
            canRetry: true,
            showSettings: false,
          })
          cancel()
        })
        .finally(() => {
          // Superseded work may settle after the next operation has already started.
          if (currentOperation.current === operation)
            currentOperation.current = null
        })
    },
    [cancel, readRevision],
  )

  useEffect(() => {
    if (
      !enabled ||
      !available ||
      !terminal ||
      !attemptKey ||
      handledAttempts.has(attemptKey)
    )
      return
    if (!capture.metadata || capture.metadata.location.slug !== activeSlug)
      return
    run(false)
  }, [
    activeSlug,
    capture,
    enabled,
    available,
    terminal,
    attemptKey,
    scope,
    handledAttempts,
    run,
  ])

  const retry = useCallback(() => run(true), [run])
  const reset = useCallback(() => {
    cancel()
    const snapshot = latest.current
    if (snapshot.attemptKey) {
      const key = snapshot.attemptKey
      setHandledAttempts((previous) => new Set(previous).add(key))
    }
    setStored({
      scope: snapshot.scope,
      state: idle,
      resetAttemptKey: snapshot.attemptKey,
      visibilityKey: JSON.stringify([
        snapshot.scope,
        snapshot.options.enabled,
        snapshot.options.available,
      ]),
    })
  }, [cancel])

  // Render derives visibility from current props/state, never from mutable refs.
  const state: CodeAnalysisState = !enabled
    ? { status: 'disabled' }
    : !available
      ? {
          status: 'unavailable',
          message: settingsMessage,
          canRetry: Boolean(terminal),
          showSettings: true,
        }
      : !matchingAttempt
        ? idle
        : attemptKey && stored.resetAttemptKey === attemptKey
          ? idle
          : stored.scope === scope
            ? stored.state
            : terminal &&
                (!capture.metadata ||
                  capture.metadata.location.slug !== activeSlug)
              ? {
                  status: 'unavailable',
                  message:
                    'Problem metadata is missing. Retry this submission.',
                  canRetry: true,
                  showSettings: false,
                }
              : attemptKey && handledAttempts.has(attemptKey)
                ? {
                    status: 'unavailable',
                    message: 'Analysis was cleared. Retry this submission.',
                    canRetry: Boolean(terminal),
                    showSettings: false,
                  }
                : idle
  return { state, retry, reset }
}
