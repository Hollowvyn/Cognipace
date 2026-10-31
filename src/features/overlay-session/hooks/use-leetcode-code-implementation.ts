import { useCallback, useEffect, useRef, useState } from 'react'
import { useGenAiConfigurationRevision } from '@/features/genai'
import {
  generateLeetCodeImplementationViaRuntime,
  cancelLeetCodeImplementationViaRuntime,
  generateLeetCodeImplementationRequestSchema,
  implementationIdentity,
  type SuggestedImplementation,
} from '@/features/leetcode-review-assistant'
import { AiDeadlineError, withAiDeadline } from '@/lib/ai/operation'
import type { CodeAnalysisState } from './use-leetcode-code-analysis'

export type CodeImplementationState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'ready'; implementation: SuggestedImplementation }
  | { status: 'unavailable' | 'error'; message: string }

/** Owns only explicit code work; the assessment's immutable pin is the sole input. */
export function useLeetCodeCodeImplementation(analysis: CodeAnalysisState) {
  const { revision, readRevision } = useGenAiConfigurationRevision()
  const assessment =
    analysis.status === 'ready' &&
    analysis.assessment.configurationRevision === revision
      ? analysis
      : null
  const scope = assessment?.requestId ?? null
  const [stored, setStored] = useState<{
    scope: string | null
    state: CodeImplementationState
  }>({ scope: null, state: { status: 'idle' } })
  if (stored.scope !== null && stored.scope !== scope)
    setStored({ scope: null, state: { status: 'idle' } })
  const completed = useRef<string | null>(null)
  const latest = useRef(assessment)
  const active = useRef<{
    requestId: string
    scope: string
    controller: AbortController
  } | null>(null)
  useEffect(() => {
    latest.current = assessment
  }, [assessment])
  const cancel = useCallback(() => {
    const operation = active.current
    if (!operation) return
    active.current = null
    operation.controller.abort()
    void cancelLeetCodeImplementationViaRuntime({
      surface: 'content-script',
      requestId: operation.requestId,
    }).catch(() => {})
  }, [])
  useEffect(() => {
    if (active.current?.scope !== scope) cancel()
    if (completed.current !== scope) completed.current = null
  }, [scope, cancel])
  useEffect(() => () => cancel(), [cancel])
  const generate = useCallback(() => {
    const owner = latest.current
    if (
      !owner ||
      active.current ||
      completed.current === owner.requestId ||
      (stored.scope === owner.requestId && stored.state.status === 'ready')
    )
      return
    if (readRevision() !== owner.assessment.configurationRevision) return
    const request = generateLeetCodeImplementationRequestSchema.parse({
      surface: 'content-script',
      requestId: crypto.randomUUID(),
      assessmentRequestId: owner.requestId,
      host: owner.host,
      assessment: owner.assessment,
      feedback: owner.report,
    })
    const operation = {
      requestId: request.requestId,
      scope: owner.requestId,
      controller: new AbortController(),
    }
    active.current = operation
    const current = () =>
      active.current === operation &&
      !operation.controller.signal.aborted &&
      latest.current?.requestId === operation.scope &&
      readRevision() === owner.assessment.configurationRevision
    const publish = (state: CodeImplementationState) => {
      if (current()) setStored({ scope: operation.scope, state })
    }
    publish({ status: 'pending' })
    void withAiDeadline(
      { timeoutMs: 80_000, signal: operation.controller.signal },
      async (signal) => {
        const response = await generateLeetCodeImplementationViaRuntime(request)
        if (signal.aborted || !current()) return
        const identity = implementationIdentity(request)
        if (
          Object.entries(identity).some(
            ([key, value]) => response[key as keyof typeof identity] !== value,
          )
        ) {
          publish({
            status: 'error',
            message:
              'AI returned code for a different assessment. Retry suggested code.',
          })
        } else if (response.status === 'ready') {
          if (response.report.status === 'ready')
            completed.current = owner.requestId
          publish(
            response.report.status === 'ready'
              ? {
                  status: 'ready',
                  implementation: response.report.implementation,
                }
              : { status: 'unavailable', message: response.report.reason },
          )
        } else publish({ status: response.status, message: response.message })
      },
    )
      .catch((error: unknown) => {
        if (!current()) return
        publish({
          status: 'error',
          message:
            error instanceof AiDeadlineError && error.code === 'timeout'
              ? 'Suggested code timed out. Retry suggested code.'
              : 'Suggested code could not be generated. Retry suggested code.',
        })
        cancel()
      })
      .finally(() => {
        if (active.current === operation) active.current = null
      })
  }, [cancel, readRevision, stored])
  return {
    state: stored.scope === scope ? stored.state : { status: 'idle' as const },
    generate,
  }
}
