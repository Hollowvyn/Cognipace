import { useCallback, useEffect, useRef, useState } from 'react'

import type { HintConnectionStatus } from '@/features/genai'
import {
  createLeetCodeCaptureRemoteClient,
  prepareLeetCodeHintContext,
  selectLeetCodeHintProblem,
} from '@/features/leetcode-capture'
import {
  cancelLeetCodeHintsViaRuntime,
  generateLeetCodeHintsViaRuntime,
  makeHintInputFingerprint,
  codeHintSchema,
  isCodeHintConsistent,
  type CodeHintTurn,
  type HintErrorCode,
} from '@/features/leetcode-review-assistant'
import { AiDeadlineError, withAiDeadline } from '@/lib/ai/operation'
import {
  completeCodeSnapshotSchema,
  readCompleteLeetCodeEditorSnapshot,
  type LeetCodeCaptureState,
} from '@/lib/leetcode'

export type OverlayHintState =
  | { status: 'idle'; isOpen: boolean }
  | {
      history: CodeHintTurn[]
      status: 'pending'
      isOpen: boolean
      requestId: string
      phase: 'preparation' | 'generation'
    }
  | {
      status: 'ready'
      isOpen: boolean
      history: CodeHintTurn[]
    }
  | {
      history: CodeHintTurn[]
      status: 'unavailable'
      isOpen: boolean
      message: string
      canRetry: boolean
      showSettings: boolean
    }
  | {
      history: CodeHintTurn[]
      status: 'error'
      isOpen: boolean
      code: HintErrorCode
      message: string
      canRetry: boolean
      showSettings: boolean
    }

export type UseLeetCodeCodeHintsOptions = {
  activeSlug: string | null
  capture: LeetCodeCaptureState
  connection: HintConnectionStatus | null
  connectionError: boolean
  readCapture: () => LeetCodeCaptureState
  readSyncToken: () => number
  publishCapture: (capture: LeetCodeCaptureState, syncToken: number) => boolean
  readConnection: () => HintConnectionStatus | null
  refreshConnection: () => Promise<HintConnectionStatus | null>
}

const idle: OverlayHintState = { status: 'idle', isOpen: false }
const settingsErrors: ReadonlySet<HintErrorCode> = new Set([
  'auth',
  'permission',
  'bad-request',
  'model-unavailable',
  'not-configured',
  'stale-configuration',
  'billing',
])
type Stored = {
  scope: string
  state: OverlayHintState
  refreshCaptureScope?: string
}
type Operation = {
  requestId: string
  scope: string
  captureScope: string
  revisingConnection: boolean
  controller: AbortController
  sent: boolean
}

// Exact public input identity, including incomplete inputs that may become complete later.
function selectedIdentity(capture: LeetCodeCaptureState): string {
  const problem = selectLeetCodeHintProblem(capture)
  if (problem) return makeHintInputFingerprint(problem)
  const { location, metadata, problemContent: content } = capture
  return JSON.stringify({
    location: location && [location.host, location.slug],
    metadata: metadata && [
      metadata.location.host,
      metadata.location.slug,
      metadata.title,
      metadata.source !== 'fallback',
    ],
    content: content && [
      content.location.host,
      content.location.slug,
      content.completeness,
      content.statement,
      content.examples.map((example) => example.rawText),
      content.constraints,
    ],
  })
}
function captureScope(
  activeSlug: string | null,
  capture: LeetCodeCaptureState,
): string {
  return JSON.stringify([
    activeSlug,
    capture.location && [capture.location.host, capture.location.slug],
    selectedIdentity(capture),
  ])
}
function operationScope(
  capture: string,
  connection: HintConnectionStatus | null,
): string {
  return JSON.stringify([capture, connection?.revision ?? null])
}

/** Transient, explicit snapshot-bound hints owned by the overlay session. */
export function useLeetCodeCodeHints(options: UseLeetCodeCodeHintsOptions) {
  const renderedCaptureScope = captureScope(options.activeSlug, options.capture)
  const scope = operationScope(renderedCaptureScope, options.connection)
  const [stored, setStored] = useState<Stored>({ scope, state: idle })
  const latest = useRef(options)
  const storedRef = useRef(stored)
  const operationRef = useRef<Operation | null>(null)
  useEffect(() => {
    latest.current = options
    storedRef.current = stored
  }, [options, stored])

  const readScope = useCallback(() => {
    const current = latest.current
    const capture = captureScope(current.activeSlug, current.readCapture())
    return { capture, scope: operationScope(capture, current.readConnection()) }
  }, [])
  const store = useCallback((next: Stored) => {
    storedRef.current = next
    setStored(next)
  }, [])
  const cancelSent = useCallback((operation: Operation) => {
    if (!operation.sent) return
    void cancelLeetCodeHintsViaRuntime({
      surface: 'content-script',
      requestId: operation.requestId,
    }).catch(() => {})
  }, [])
  const stop = useCallback(() => {
    const operation = operationRef.current
    if (!operation) return
    operationRef.current = null
    operation.controller.abort()
    cancelSent(operation)
  }, [cancelSent])

  useEffect(() => {
    const operation = operationRef.current
    const live = readScope()
    if (
      operation &&
      operation.scope !== live.scope &&
      !(operation.revisingConnection && operation.captureScope === live.capture)
    )
      stop()
    const current = storedRef.current
    if (
      current.scope !== live.scope &&
      operation?.revisingConnection &&
      current.refreshCaptureScope === live.capture &&
      current.state.status !== 'idle'
    ) {
      store({
        ...current,
        scope: live.scope,
        state: { ...current.state, history: [] },
      })
      return
    }
    if (
      current.scope !== live.scope &&
      !(
        operation?.revisingConnection &&
        current.refreshCaptureScope === live.capture
      )
    )
      store({ scope: live.scope, state: idle })
  }, [scope, readScope, stop, store])
  useEffect(() => () => stop(), [stop])

  const run = useCallback(
    (refreshCapture: boolean, refreshConnection = false) => {
      // A synchronous guard owns even two clicks before React commits pending state.
      if (operationRef.current) return
      const current = latest.current
      const initialCapture = current.readCapture()
      const token = current.readSyncToken()
      const live = readScope()
      let connection = current.readConnection()
      let history: CodeHintTurn[] =
        storedRef.current.scope === live.scope &&
        storedRef.current.state.status !== 'idle'
          ? storedRef.current.state.history
          : []
      if (history.length >= 3) return
      const unavailable = (
        message: string,
        showSettings: boolean,
        canRetry = true,
      ) =>
        store({
          scope: readScope().scope,
          state: {
            history,
            status: 'unavailable',
            isOpen: true,
            message,
            canRetry,
            showSettings,
          },
        })
      if (
        !current.activeSlug ||
        initialCapture.location?.slug !== current.activeSlug
      ) {
        unavailable(
          'Wait for the current LeetCode problem to load, then Retry.',
          false,
        )
        return
      }
      if (!connection?.available && !refreshConnection) {
        unavailable(
          connection
            ? 'Configure an AI connection in Settings to request hints.'
            : current.connectionError
              ? 'Could not load the AI connection. Retry.'
              : 'Loading the AI connection. Retry after it loads.',
          Boolean(connection),
          !connection,
        )
        if (!connection) void current.refreshConnection().catch(() => {})
        return
      }
      const operation: Operation = {
        requestId: crypto.randomUUID(),
        scope: live.scope,
        captureScope: live.capture,
        revisingConnection: refreshConnection,
        controller: new AbortController(),
        sent: false,
      }
      operationRef.current = operation
      const isCurrent = () => {
        const now = readScope()
        return (
          operationRef.current === operation &&
          !operation.controller.signal.aborted &&
          (operation.scope === now.scope ||
            (operation.revisingConnection &&
              operation.captureScope === now.capture))
        )
      }
      const publish = (state: OverlayHintState) => {
        if (!isCurrent()) return
        if (
          operation.revisingConnection &&
          connection?.revision !== current.readConnection()?.revision &&
          state.status !== 'idle'
        ) {
          history = []
          state = { ...state, history }
        }
        store({
          scope: readScope().scope,
          state,
          ...(operation.revisingConnection && state.status === 'pending'
            ? { refreshCaptureScope: operation.captureScope }
            : {}),
        })
      }
      publish({
        history,
        status: 'pending',
        isOpen: true,
        requestId: operation.requestId,
        phase: 'preparation',
      })
      void withAiDeadline(
        { timeoutMs: 50_000, signal: operation.controller.signal },
        async (signal) => {
          // Capture at activation, before a metadata refresh can wait on background work.
          const snapshotRead = withAiDeadline(
            { timeoutMs: 15_000, signal },
            (captureSignal) =>
              readCompleteLeetCodeEditorSnapshot(
                initialCapture.location!,
                captureSignal,
              ),
          )
            .then((value) => completeCodeSnapshotSchema.safeParse(value))
            .catch(() => null)
          if (refreshConnection) {
            await current.refreshConnection()
            signal.throwIfAborted()
            if (!isCurrent()) return
            const previousRevision = connection?.revision
            connection = current.readConnection()
            if (previousRevision !== connection?.revision) history = []
            operation.revisingConnection = false
            operation.scope = readScope().scope
            if (!connection?.available) {
              publish({
                history,
                status: 'unavailable',
                isOpen: true,
                message:
                  'Configure an AI connection in Settings to request hints.',
                canRetry: false,
                showSettings: true,
              })
              return
            }
            publish({
              history,
              status: 'pending',
              isOpen: true,
              requestId: operation.requestId,
              phase: 'preparation',
            })
          }
          const [prepared, snapshotResult] = await withAiDeadline(
            { timeoutMs: 15_000, signal },
            async (preparationSignal) =>
              Promise.all([
                prepareLeetCodeHintContext(
                  initialCapture,
                  createLeetCodeCaptureRemoteClient(),
                  preparationSignal,
                  refreshCapture,
                ),
                snapshotRead,
              ]),
          )
          if (!snapshotResult?.success) {
            publish({
              history,
              status: 'unavailable',
              isOpen: true,
              message:
                'Could not read the complete editor code and language. Retry.',
              canRetry: true,
              showSettings: false,
            })
            return
          }
          const snapshot = snapshotResult.data
          if (signal.aborted || !isCurrent()) return
          if (prepared.status === 'unavailable') {
            publish({
              history,
              status: 'unavailable',
              isOpen: true,
              message: prepared.message,
              canRetry: true,
              showSettings: false,
            })
            return
          }
          if (
            selectedIdentity(current.readCapture()) !==
            selectedIdentity(initialCapture)
          )
            return
          if (!current.publishCapture(prepared.capture, token)) return
          if (
            selectedIdentity(prepared.capture) !==
            selectedIdentity(initialCapture)
          )
            history = []
          // Adopt our accepted publication synchronously before a React effect sees fresh public input.
          const published = readScope()
          operation.captureScope = published.capture
          operation.scope = published.scope
          if (
            !connection?.available ||
            current.readConnection()?.revision !== connection.revision ||
            !isCurrent()
          )
            return
          const request = {
            surface: 'content-script' as const,
            requestId: operation.requestId,
            connectionRevision: connection.revision,
            connectionProvider: connection.provider,
            problem: prepared.problem,
            snapshot,
            history,
          }
          publish({
            history,
            status: 'pending',
            isOpen: true,
            requestId: operation.requestId,
            phase: 'generation',
          })
          signal.throwIfAborted()
          operation.sent = true
          const response = await generateLeetCodeHintsViaRuntime(request)
          if (signal.aborted || !isCurrent()) return
          if (response.requestId !== operation.requestId)
            throw new Error('Hint response identity mismatch.')
          if (response.status === 'ready') {
            const hint = codeHintSchema.parse(response.hint)
            if (!isCodeHintConsistent(request, hint))
              throw new Error('Inconsistent hint response.')
            publish({
              status: 'ready',
              isOpen: true,
              history: [...history, { snapshot, hint }],
            })
          } else
            publish({
              history,
              status: 'error',
              isOpen: true,
              code: response.code,
              message: response.message,
              canRetry: true,
              showSettings: settingsErrors.has(response.code),
            })
        },
      )
        .catch((error: unknown) => {
          if (!isCurrent()) return
          const code = error instanceof AiDeadlineError ? error.code : 'unknown'
          publish({
            history,
            status: 'error',
            isOpen: true,
            code,
            message:
              code === 'timeout'
                ? 'Hint request timed out. Try again.'
                : 'Could not generate hints. Try again.',
            canRetry: true,
            showSettings: false,
          })
          cancelSent(operation)
        })
        .finally(() => {
          if (operationRef.current !== operation) return
          operationRef.current = null
          setStored((previous) => {
            if (
              previous.state.status !== 'pending' ||
              previous.state.requestId !== operation.requestId
            )
              return previous
            const next = { scope: readScope().scope, state: idle }
            storedRef.current = next
            return next
          })
        })
    },
    [cancelSent, readScope, store],
  )

  const toggle = useCallback(() => {
    const current = storedRef.current
    if (operationRef.current) return
    if (
      current.scope !== readScope().scope ||
      current.state.status === 'idle'
    ) {
      run(false)
      return
    }
    if (current.state.status === 'pending') return
    store({
      ...current,
      state: { ...current.state, isOpen: !current.state.isOpen },
    })
  }, [readScope, run, store])
  const revealNext = useCallback(() => {
    const current = storedRef.current
    if (
      current.scope !== readScope().scope ||
      current.state.status !== 'ready' ||
      current.state.history.length >= 3
    )
      return
    run(false)
  }, [readScope, run])
  const retry = useCallback(() => {
    const current = storedRef.current.state
    if (
      (current.status !== 'error' && current.status !== 'unavailable') ||
      !current.canRetry
    )
      return
    run(
      true,
      !latest.current.readConnection() ||
        (current.status === 'error' &&
          (current.code === 'stale-configuration' ||
            current.code === 'not-configured')),
    )
  }, [run])
  const reset = useCallback(() => {
    stop()
    store({ scope: readScope().scope, state: idle })
  }, [readScope, stop, store])
  const state =
    stored.scope === scope ||
    stored.refreshCaptureScope === renderedCaptureScope
      ? stored.state
      : idle
  return { state, toggle, revealNext, retry, reset }
}
