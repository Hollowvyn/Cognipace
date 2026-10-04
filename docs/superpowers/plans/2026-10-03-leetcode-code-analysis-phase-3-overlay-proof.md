# LeetCode Code Analysis Phase 3 — Overlay and Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the approved Option A report automatically after a matching submission, keep review saves immediate, and prove the feature's wiring and model limits.

**Architecture:** Use one session-local overlay hook and native independent disclosures. The hook combines bounded capture preparation with the runtime report call, pins Retry, cancels stale work, and never changes ratings. Remove every obsolete recommendation consumer/endpoint once the new flow is connected.

**Tech Stack:** React 19, native details/summary and clipboard API, Testing Library/user-event, Vitest, existing runtime and GenAI revision hooks.

---

Prerequisites: [capture](2026-10-03-leetcode-code-analysis-phase-1-capture.md) and [report/runtime](2026-10-03-leetcode-code-analysis-phase-2-report-runtime.md) checks pass. Follow the [approved design](../specs/2026-10-03-leetcode-code-analysis-design.md) and the [master validation map](2026-10-03-leetcode-code-analysis.md).

## Task 1: One retryable analysis controller

**Files:**

- Create `src/features/overlay-session/hooks/use-leetcode-code-analysis.ts` and `.test.tsx`.
- Modify `hooks/use-leetcode-page-sync.ts`, `hooks/use-leetcode-overlay-session.ts`, `src/features/overlay-session/index.ts`.
- Modify `src/features/app-shell/api/app-shell-contracts.ts`, `server/app-shell-service.ts`, `server/app-shell-service.test.ts` and typed overlay fixtures.

- [ ] Expose `capture: captureState` from page sync; reuse its existing watcher. Add safe `aiAssessmentEnabled: z.boolean()` beside availability in the overlay app-shell schema. In `getOverlayAppShellData`, return `aiAssessmentEnabled: settings.aiAssessment.enabled`. Test disabled = false/false, enabled but missing key = true/false, configured = true/true for enabled/available. Availability alone cannot distinguish disabled AI from missing configuration.

- [ ] Build requests from prepared context without truncating essentials. Place this exported helper in the new hook file and test it directly:

```ts
export function buildCodeAnalysisRequest(
  prepared: Extract<PreparedCodeAnalysisContext, { status: 'ready' }>,
  requestId: string,
  configurationRevision: number,
) {
  const { context } = prepared
  const result = context.submissionResult!
  const code = context.submittedCode!
  const omittedDiagnostics: string[] = []
  const diagnostic = (name: string, value: string | null) => {
    if (value !== null && value.length > 2000) {
      omittedDiagnostics.push(name)
      return null
    }
    return value
  }
  return analyzeLeetCodeSubmissionRequestSchema.safeParse({
    surface: 'content-script',
    requestId,
    configurationRevision,
    attemptId: prepared.attemptId,
    submissionId: prepared.submissionId,
    problemSlug: context.location.slug,
    problem: {
      slug: context.location.slug,
      title: context.problem.title,
      difficulty: context.problem.difficulty,
      topics: context.problem.topics.map((topic) => topic.name),
      statement: context.content.statement,
      examples: context.content.examples.map((example) => example.rawText),
      constraints: context.content.constraints,
      followUps: context.content.followUps,
    },
    submission: {
      status: result.status,
      code: code.code,
      language: code.language,
      languageVersion: null,
      runtime: result.runtime,
      memory: result.memory,
      passedTestCount: result.passedTestCount,
      totalTestCount: result.totalTestCount,
      diagnostics: {
        errorMessage: diagnostic('errorMessage', result.errorMessage),
        compileError: diagnostic('compileError', result.compileError),
        runtimeError: diagnostic('runtimeError', result.runtimeError),
        failingTestcase: diagnostic('failingTestcase', result.failingTestcase),
        lastTestcase: diagnostic('lastTestcase', result.lastTestcase),
        codeOutput: diagnostic('codeOutput', result.codeOutput),
        expectedOutput: diagnostic('expectedOutput', result.expectedOutput),
        stdOutput: diagnostic('stdOutput', result.stdOutput),
      },
      omittedDiagnostics,
    },
  })
}
```

Imports: `PreparedCodeAnalysisContext`/`prepareLeetCodeAnalysisContext`/`createLeetCodeCaptureRemoteClient` from `@/features/leetcode-capture`, request schema/runtime functions/report types from `@/features/leetcode-review-assistant`, capture types from `@/lib/leetcode`. A failed parse yields an unavailable input-limit/capture message without a provider call. The language version remains explicitly unknown until capture actually supplies it.

- [ ] Define the local view state and hook. Import React hooks, `useGenAiConfigurationRevision` from `@/features/genai`, and deadline types directly from `@/lib/ai/operation` so the UI does not import SDK adapters:

```ts
export type CodeAnalysisState =
  | { status: 'disabled' | 'idle' }
  | { status: 'pending'; phase: 'capture' | 'analysis' }
  | { status: 'ready'; requestId: string; report: CodeAnalysisReport }
  | {
      status: 'unavailable' | 'error'
      message: string
      canRetry: boolean
      showSettings: boolean
    }
type AnalysisOptions = {
  activeProblemSlug: string | null
  capture: LeetCodeCaptureState
  aiAssessmentEnabled: boolean
  aiAssessmentAvailable: boolean
}

export function useLeetCodeCodeAnalysis(options: AnalysisOptions) {
  const { revision, readRevision } = useGenAiConfigurationRevision()
  const attemptId = options.capture.submissionAttempt?.attemptId ?? null
  const scope = JSON.stringify([options.activeProblemSlug, attemptId, revision])
  const [stored, setStored] = useState<{
    scope: string
    state: CodeAnalysisState
  }>({ scope, state: { status: 'idle' } })
  const active = useRef<{
    requestId: string
    controller: AbortController
    scope: string
  } | null>(null)
  const automaticAttempt = useRef<string | null>(null)
  const pinned = useRef<LeetCodeCaptureState | null>(null)
  const mounted = useRef(true)

  const cancel = useCallback(() => {
    const operation = active.current
    active.current = null
    if (!operation) return
    operation.controller.abort()
    void cancelLeetCodeAnalysisViaRuntime({
      surface: 'content-script',
      requestId: operation.requestId,
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      cancel()
    }
  }, [cancel])
  useEffect(() => {
    cancel()
    const state: CodeAnalysisState =
      options.aiAssessmentEnabled &&
      attemptId !== null &&
      automaticAttempt.current === attemptId
        ? {
            status: 'unavailable',
            message:
              'Analysis was cleared. Retry this submission with the saved AI connection.',
            canRetry: true,
            showSettings: false,
          }
        : { status: 'idle' }
    setStored({ scope, state })
  }, [scope, options.aiAssessmentEnabled, attemptId, cancel])

  const run = useCallback(
    (capture: LeetCodeCaptureState, refresh: boolean) => {
      if (
        !options.aiAssessmentEnabled ||
        !capture.submissionAttempt ||
        !capture.submissionResult ||
        capture.submissionAttempt.location.slug !== options.activeProblemSlug ||
        capture.submissionResult.location.slug !== options.activeProblemSlug
      )
        return
      cancel()
      const operation = {
        requestId: crypto.randomUUID(),
        controller: new AbortController(),
        scope,
      }
      active.current = operation
      pinned.current = capture
      const applies = () =>
        mounted.current &&
        active.current === operation &&
        readRevision() === revision
      const publish = (state: CodeAnalysisState) => {
        if (applies()) setStored({ scope, state })
      }
      publish({ status: 'pending', phase: 'capture' })
      void withAiDeadline(
        { timeoutMs: 50_000, signal: operation.controller.signal },
        async (signal) => {
          const prepared = await prepareLeetCodeAnalysisContext(
            capture,
            createLeetCodeCaptureRemoteClient(),
            signal,
            refresh,
          )
          signal.throwIfAborted()
          if (!applies()) return
          if (prepared.status !== 'ready') {
            publish({
              status: 'unavailable',
              message: prepared.message,
              canRetry: true,
              showSettings: false,
            })
            return
          }
          pinned.current = {
            ...capture,
            problemContent: prepared.context.content,
            submissionResult: prepared.context.submissionResult,
          }
          const parsed = buildCodeAnalysisRequest(
            prepared,
            operation.requestId,
            revision,
          )
          if (!parsed.success) {
            publish({
              status: 'unavailable',
              message:
                'The captured input is incomplete or exceeds analysis limits. Full code is required; it was not truncated.',
              canRetry: true,
              showSettings: false,
            })
            return
          }
          publish({ status: 'pending', phase: 'analysis' })
          const request = parsed.data
          const response = await analyzeLeetCodeSubmissionViaRuntime(request)
          signal.throwIfAborted()
          if (!applies()) return
          if (
            response.requestId !== request.requestId ||
            response.attemptId !== request.attemptId ||
            response.submissionId !== request.submissionId ||
            response.problemSlug !== request.problemSlug ||
            response.configurationRevision !== request.configurationRevision
          ) {
            publish({
              status: 'error',
              message:
                'AI returned analysis for a different request. Retry this submission.',
              canRetry: true,
              showSettings: false,
            })
            return
          }
          if (response.status === 'ready')
            publish({
              status: 'ready',
              requestId: response.requestId,
              report: response.report,
            })
          else
            publish({
              status: response.status,
              message: response.message,
              canRetry: true,
              showSettings:
                response.status === 'unavailable'
                  ? response.reason === 'configuration'
                  : [
                      'not-configured',
                      'auth',
                      'permission',
                      'bad-request',
                      'model-unavailable',
                      'stale-configuration',
                    ].includes(response.code),
            })
        },
      )
        .catch((error: unknown) => {
          if (!applies() || operation.controller.signal.aborted) return
          publish({
            status: 'error',
            message:
              error instanceof AiDeadlineError
                ? error.message
                : 'AI analysis could not finish. Retry this submission.',
            canRetry: true,
            showSettings: false,
          })
          void cancelLeetCodeAnalysisViaRuntime({
            surface: 'content-script',
            requestId: operation.requestId,
          }).catch(() => undefined)
        })
        .finally(() => {
          if (active.current === operation) active.current = null
        })
    },
    [
      cancel,
      options.aiAssessmentEnabled,
      options.activeProblemSlug,
      readRevision,
      revision,
      scope,
    ],
  )

  useEffect(() => {
    if (
      !options.aiAssessmentEnabled ||
      !attemptId ||
      !options.capture.submissionResult
    )
      return
    if (!options.aiAssessmentAvailable) {
      setStored({
        scope,
        state: {
          status: 'unavailable',
          message:
            'Save a provider, model, and key in Settings to analyze this submission.',
          canRetry: true,
          showSettings: true,
        },
      })
      return
    }
    if (!options.capture.metadata) {
      setStored({
        scope,
        state: {
          status: 'unavailable',
          message:
            'Problem metadata is not available yet. Retry after the page loads.',
          canRetry: true,
          showSettings: false,
        },
      })
      return
    }
    if (automaticAttempt.current === attemptId) return
    automaticAttempt.current = attemptId
    run(options.capture, false)
  }, [
    attemptId,
    options.aiAssessmentEnabled,
    options.aiAssessmentAvailable,
    options.capture,
    run,
    scope,
  ])

  const retry = useCallback(() => {
    const previous = pinned.current
    const target =
      previous && previous.submissionAttempt?.attemptId === attemptId
        ? previous
        : options.capture
    automaticAttempt.current = attemptId
    run(target, true)
  }, [attemptId, options.capture, run])
  const reset = useCallback(() => {
    cancel()
    automaticAttempt.current = attemptId
    pinned.current = null
    setStored({ scope, state: { status: 'idle' } })
  }, [attemptId, cancel, scope])
  const state: CodeAnalysisState = !options.aiAssessmentEnabled
    ? { status: 'disabled' }
    : stored.scope === scope
      ? stored.state
      : automaticAttempt.current === attemptId && attemptId !== null
        ? {
            status: 'unavailable',
            message:
              'The analysis was cleared after the AI connection changed. Retry this submission.',
            canRetry: true,
            showSettings: false,
          }
        : { status: 'idle' }
  return { state, retry, reset }
}
```

Keep automatic generation keyed by immutable attempt ID, not code/diagnostics fingerprints or visual mode. The scope projection hides old scores immediately on navigation/attempt/config changes. Reset suppresses the retained attempt; a new submit token becomes eligible. Explicit Retry can refresh the same pinned submission under current configuration. No report goes into QueryCache/MutationCache or persistence.

- [ ] Replace the old hook wiring in `use-leetcode-overlay-session.ts` with:

```ts
const analysis = useLeetCodeCodeAnalysis({
  activeProblemSlug: overlay.activeProblemSlug,
  capture: pageSync.capture,
  aiAssessmentEnabled: pageSync.context?.aiAssessmentEnabled ?? false,
  aiAssessmentAvailable: pageSync.context?.aiAssessmentAvailable ?? false,
})
useEffect(() => {
  recommendationResetRef.current = analysis.reset
}, [analysis.reset])
```

Rename the reset ref to `analysisResetRef` at every use. Expose `aiAnalysis: analysis.state` and `retryAiAnalysis: analysis.retry`; do not depend on selected/submitted ratings or timer ticks. Keep `createSubmissionResultKey` for deterministic autosave; its mutable fingerprint is not the analysis identity.

- [ ] Adapt the existing deferred hook tests to this API. Required concrete scenarios: emit one complete terminal attempt, enrich its code/diagnostics and assert one runtime generation; reject a response with any mismatched identity field; Retry after incomplete capture uses the same returned submission ID and a new request ID; advance fake timers 50,000 ms while messaging never resolves and assert error/Retry; navigate/restart/disable/change key during generation and assert cancellation plus no late report. Hold metadata absent then supply it and verify recoverable capture handling. Test each terminal failure kind. Use `createQueryTestHarness` for the configuration revision hook.

Example same-attempt/no-repeat assertion using the new hook test's capture fixture:

```ts
const capture = makeCompleteCapture()
const harness = createQueryTestHarness()
vi.mocked(analyzeLeetCodeSubmissionViaRuntime).mockImplementation(
  async (request) => ({
    status: 'ready',
    ...analysisIdentity(request),
    report: makeValidAnalysis(),
    providerMetadata: {
      provider: 'gemini',
      model: 'fixture-model',
      durationMs: 1,
    },
  }),
)
const { result, rerender } = renderHook(
  (capture) =>
    useLeetCodeCodeAnalysis({
      activeProblemSlug: 'two-sum',
      capture,
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
    }),
  { initialProps: capture, wrapper: harness.wrapper },
)
await waitFor(() =>
  expect(analyzeLeetCodeSubmissionViaRuntime).toHaveBeenCalledTimes(1),
)
rerender({
  ...capture,
  submissionResult: { ...capture.submissionResult!, runtime: '35 ms' },
})
expect(analyzeLeetCodeSubmissionViaRuntime).toHaveBeenCalledTimes(1)
act(() => result.current.reset())
rerender({ ...capture })
expect(analyzeLeetCodeSubmissionViaRuntime).toHaveBeenCalledTimes(1)
```

Import `makeCompleteCapture` from `@/features/leetcode-capture/testing/code-analysis-capture-fixtures`, `createQueryTestHarness` from `@/testing/query-test-harness`, and the runtime/fixture functions from their phase-two files. Mock the direct analysis/cancellation API functions with `vi.mock` and `vi.mocked`; the complete capture requires no remote calls. For tests that change a revision while a response resolves before React effects, use the existing query invalidation harness and assert immediate stale hiding. Add disable → enable coverage: a previous report cannot reappear; explicit Retry is required for an already analyzed attempt.

- [ ] Run `rtk npm run test -- src/features/overlay-session/hooks/use-leetcode-code-analysis.test.tsx src/features/app-shell/server/app-shell-service.test.ts`, then `rtk npm run typecheck`. Commit `feat(overlay): control retryable submission analysis` after typed fixtures are updated.

## Task 2: Option A disclosures and explicit Copy

**Files:** Create `src/features/overlay-session/components/modes/expanded/overlay-code-analysis.tsx` and `.test.tsx`. Modify `expanded-overlay.tsx`, `expanded-overlay.test.tsx`, `src/features/overlay-session/components/overlay-shell.tsx`, `overlay-shell.test.tsx`, and `src/features/overlay-session/index.ts`.

- [ ] Implement the report component with plain-text model output and existing Terra Compact classes:

```tsx
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { CodeAnalysisReport } from '@/features/leetcode-review-assistant'
import type { CodeAnalysisState } from '../../../hooks/use-leetcode-code-analysis'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}
function Notes({ items }: { items: string[] }) {
  return items.length ? (
    <ul className="grid gap-1">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  ) : (
    <span>No meaningful change needed.</span>
  )
}
const comparisonClass = {
  better: 'text-[color:var(--cp-tone-success-fg)]',
  worse: 'text-[color:var(--cp-tone-warning-fg)]',
  equivalent: '',
  unknown: 'text-muted-foreground',
}
function Complexity({
  value,
  timeComparison = 'equivalent',
  spaceComparison = 'equivalent',
}: {
  value: CodeAnalysisReport['efficiency']['current']
  timeComparison?: keyof typeof comparisonClass
  spaceComparison?: keyof typeof comparisonClass
}) {
  if (!value) return <span>Unavailable</span>
  return (
    <span>
      <span className={comparisonClass[timeComparison]}>
        Time: {value.time}
      </span>
      <br />
      <span className={comparisonClass[spaceComparison]}>
        Auxiliary space: {value.space}
      </span>
      {value.assumptions.length ? (
        <span className="block text-muted-foreground">
          {value.assumptions.join(' ')}
        </span>
      ) : null}
    </span>
  )
}
function Report({ report }: { report: CodeAnalysisReport }) {
  const [copyFeedback, setCopyFeedback] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const score = (value: number | null) =>
    value === null ? 'Unavailable' : `${value}/5`
  return (
    <div className="grid min-w-0 gap-2 text-[0.78rem] leading-snug">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['Approach', report.approach.score],
            ['Efficiency', report.efficiency.score],
            ['Code Style', report.codeStyle.score],
          ] as const
        ).map(([label, value]) => (
          <span className="rounded border border-border px-2 py-1" key={label}>
            {label} {score(value)}
          </span>
        ))}
      </div>
      <p>{report.summary}</p>
      <details className="rounded border border-border p-2">
        <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Approach {score(report.approach.score)}
        </summary>
        <p className="mt-2 text-muted-foreground">
          {report.approach.rationale}
        </p>
        <dl className="mt-2 grid gap-2">
          <Row label="Current">{report.approach.current.join(' / ')}</Row>
          <Row label="Suggested">{report.approach.suggested.join(' / ')}</Row>
          <Row label="Key idea">{report.approach.keyIdea}</Row>
          {report.approach.consider ? (
            <Row label="Consider">{report.approach.consider}</Row>
          ) : null}
        </dl>
      </details>
      <details className="rounded border border-border p-2">
        <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Efficiency {score(report.efficiency.score)}
        </summary>
        <p className="mt-2 text-muted-foreground">
          {report.efficiency.rationale}
        </p>
        <dl className="mt-2 grid gap-2">
          <Row label="Current complexity">
            <Complexity value={report.efficiency.current} />
          </Row>
          <Row label="Suggested complexity">
            <Complexity
              value={report.efficiency.suggested}
              timeComparison={report.efficiency.timeComparison}
              spaceComparison={report.efficiency.spaceComparison}
            />
          </Row>
          <Row label="Suggestions">
            <Notes items={report.efficiency.suggestions} />
          </Row>
        </dl>
      </details>
      <details className="rounded border border-border p-2">
        <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Code Style {score(report.codeStyle.score)}
        </summary>
        <p className="mt-2 text-muted-foreground">
          {report.codeStyle.rationale}
        </p>
        <dl className="mt-2 grid gap-2">
          <Row label="Readability">{report.codeStyle.readability}</Row>
          <Row label="Structure">{report.codeStyle.structure}</Row>
          <Row label="Suggestions">
            <Notes items={report.codeStyle.suggestions} />
          </Row>
        </dl>
      </details>
      <details className="min-w-0 rounded border border-border p-2">
        <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Suggested implementation
        </summary>
        {report.suggestedImplementation ? (
          <div className="mt-2 grid min-w-0 gap-2">
            <p className="text-muted-foreground">
              AI-generated · Untested ·{' '}
              {report.suggestedImplementation.language}
            </p>
            <Notes items={report.suggestedImplementation.changes} />
            <Complexity value={report.suggestedImplementation.complexity} />
            <>
              {report.suggestedImplementation.assumptions.length ? (
                <Notes items={report.suggestedImplementation.assumptions} />
              ) : null}
            </>
            <pre className="max-w-full overflow-x-auto rounded bg-muted p-2">
              <code>{report.suggestedImplementation.code}</code>
            </pre>
            <button
              className="w-fit rounded border border-border px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    if (!navigator.clipboard?.writeText)
                      throw new Error('Clipboard unavailable')
                    await navigator.clipboard.writeText(
                      report.suggestedImplementation!.code,
                    )
                    if (mounted.current) setCopyFeedback('Copied')
                  } catch {
                    if (mounted.current)
                      setCopyFeedback(
                        'Copy failed. Select the code and copy it.',
                      )
                  }
                })()
              }}
            >
              Copy code
            </button>
            <span role="status">{copyFeedback}</span>
          </div>
        ) : (
          <p className="mt-2">
            {report.suggestedImplementationUnavailableReason}
          </p>
        )}
      </details>
    </div>
  )
}
export function OverlayCodeAnalysis({
  state,
  onRetry,
  onSettings,
}: {
  state: CodeAnalysisState
  onRetry: () => void
  onSettings: () => void
}) {
  const headingId = useId()
  if (state.status === 'disabled') return null
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={state.status === 'pending' || undefined}
      className="min-w-0 border-y border-border py-3"
    >
      <h3
        className="mb-2 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
        id={headingId}
      >
        AI assessment
      </h3>
      {state.status === 'idle' ? (
        <p className="text-[0.78rem] text-muted-foreground">
          Submit a solution on LeetCode to see its analysis here.
        </p>
      ) : null}
      {state.status === 'pending' ? (
        <p role="status">
          {state.phase === 'capture'
            ? 'Preparing full submission context…'
            : 'Analyzing your submission…'}
        </p>
      ) : null}
      {state.status === 'ready' ? (
        <Report key={state.requestId} report={state.report} />
      ) : null}
      {state.status === 'unavailable' || state.status === 'error' ? (
        <div className="grid gap-2">
          <p role="status">{state.message}</p>
          <div className="flex gap-2">
            {state.canRetry ? (
              <button
                className="rounded border border-border px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
                onClick={onRetry}
              >
                Retry analysis
              </button>
            ) : null}
            {state.showSettings ? (
              <button
                className="rounded border border-border px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
                onClick={onSettings}
              >
                Open Settings
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
```

`--cp-tone-warning-fg` is an existing token in `src/styles/tokens.css`; use it only for the resource that worsens. Disclosure summaries and recovery buttons use the explicit focus classes shown below. Rendered suggestions remain text, including `<script>` or markdown from the model. No links/HTML execution are inferred from model text. Copy feedback belongs to the report keyed by request ID and checks its mounted flag before publication.

- [ ] Wire `aiAnalysis`/`retryAiAnalysis` through shell and expanded view/commands; replace the recommendation component with `<OverlayCodeAnalysis state={aiAnalysis} onRetry={onRetryAiAnalysis} onSettings={onSettings} />`. Remove selectedRating, lock/mutation flags and recommendation-use props from this AI section. Review controls remain in their existing owners.

- [ ] Replace old component tests with these concrete assertions, using `makeValidAnalysis()` and user-event:

```tsx
const user = userEvent.setup()
render(
  <OverlayCodeAnalysis
    state={{
      status: 'ready',
      requestId: 'request-1',
      report: makeValidAnalysis(),
    }}
    onRetry={vi.fn()}
    onSettings={vi.fn()}
  />,
)
const disclosures = Array.from(document.querySelectorAll('details'))
expect(disclosures).toHaveLength(4)
expect(disclosures.every((details) => !details.open)).toBe(true)
await user.click(screen.getByText('Efficiency 3/5', { selector: 'summary' }))
expect(disclosures[1]?.open).toBe(true)
expect(disclosures[0]?.open).toBe(false)
expect(screen.getByText('Auxiliary space: O(n)')).toHaveClass(
  'text-[color:var(--cp-tone-warning-fg)]',
)
expect(screen.queryByText('Evidence')).not.toBeInTheDocument()
expect(screen.queryByText('Use recommendation')).not.toBeInTheDocument()
```

Test native disclosure Enter/Space keyboard behavior, exact rows, nullable scores, no unnecessary Consider, closed suggested code, explicit Copy success and failure, malicious text rendered inert, report replacement resetting disclosure/Copy state, idle/config/error recovery. Assert opening code makes no runtime/provider call. Inspect 392px and 320px widths with long labels/code: content should wrap and the `<pre>` should scroll horizontally without widening the overlay.

- [ ] Run `rtk npm run test -- src/features/overlay-session/components`, `rtk npm run typecheck`, focused Prettier, and `rtk git diff --check`. Commit `feat(overlay): show scored submission analysis`.

## Task 3: Immediate review saving and retirement of recommendations

**Files:**

- Modify `src/features/overlay-session/hooks/use-overlay-review-actions.ts`, `domain/overlay-session-state.ts`, `domain/overlay-session-state.test.ts`, `hooks/use-leetcode-overlay-session.test.tsx`, public barrels.
- Delete `src/features/overlay-session/hooks/use-leetcode-assessment-recommendation.ts` and `.test.tsx`; delete `components/modes/expanded/overlay-assessment-recommendation.tsx` and `.test.tsx`.
- Delete `src/features/leetcode-review-assistant/domain/recommendation-types.ts`, `recommendation-schema.ts` and `.test.ts`; `api/recommendation-api.ts`, `api/runtime-contracts.ts` and `.test.ts`; `server/build-assessment-prompt.ts` and `.test.ts`, its snapshot, `recommendation-normalizer.ts` and `.test.ts`, `recommendation-service.ts` and `.test.ts`, `runtime-handler-service.ts` and `.test.ts`; `testing/recommendation-fixtures.ts`. Keep the new phase-two code-analysis files and update existing barrels.
- Remove the old protocol signature/method-name, policy entry and handler from `src/extension/messaging.ts`, `background/runtime-policy.ts`, `background/register-handlers.ts`; update their tests.

- [ ] Add the immediate-save regression before removal. In the existing overlay session integration harness, return a deferred analysis response, emit complete matching watcher events, choose/save/update a review, and inspect persisted payload before resolving analysis:

```ts
const analysis = createDeferred<AnalyzeLeetCodeSubmissionResponse>()
vi.mocked(analyzeLeetCodeSubmissionViaRuntime).mockReturnValue(analysis.promise)
vi.mocked(getOverlayAppShellDataViaRuntime).mockResolvedValue(
  createOverlayData({
    overlay: {
      aiAssessmentEnabled: true,
      aiAssessmentAvailable: true,
      automation: { autoDetectSolved: false },
    },
  }),
)
const { result } = renderOverlaySession()
emitPageReady()
await waitFor(() => expect(result.current.status).toBe('ready'))
const capture = makeCompleteCapture()
act(() => {
  leetcodeMockState.onEvent?.({
    type: 'problem-content-updated',
    location: problemLocation,
    content: capture.problemContent!,
  })
  leetcodeMockState.onEvent?.({
    type: 'submission-started',
    attempt: capture.submissionAttempt!,
  })
})
emitSubmissionResult(capture.submissionResult!)
await waitFor(() =>
  expect(analyzeLeetCodeSubmissionViaRuntime).toHaveBeenCalledTimes(1),
)
act(() => result.current.actions.selectRating('good'))
await act(async () => {
  await result.current.actions.submitReview()
})
expect(saveReviewResultViaRuntime).toHaveBeenCalledWith(
  expect.objectContaining({ rating: 'good', reviewMode: 'leetcode' }),
)
const callsBeforeReport = vi.mocked(saveReviewResultViaRuntime).mock.calls
  .length
const request = vi.mocked(analyzeLeetCodeSubmissionViaRuntime).mock
  .calls[0]?.[0]
if (!request) throw new Error('Expected one analysis request.')
analysis.resolve({
  status: 'ready',
  ...analysisIdentity(request),
  report: makeValidAnalysis(),
  providerMetadata: {
    provider: 'gemini',
    model: 'fixture-model',
    durationMs: 10,
  },
})
await waitFor(() => expect(result.current.aiAnalysis.status).toBe('ready'))
expect(vi.mocked(saveReviewResultViaRuntime).mock.calls).toHaveLength(
  callsBeforeReport,
)
expect(result.current.overlay.selectedRating).toBe('good')
```

Use existing `renderOverlaySession`, `createOverlayData`, `emitPageReady`, `emitSubmissionResult`, `createDeferred` and `leetcodeMockState` from this test file. Import `makeCompleteCapture` and the phase-two API/fixtures. Update its capture mock with a partial `importOriginal` so `prepareLeetCodeAnalysisContext` remains real; keep its remote-client mock because complete capture needs no remote reads. Before the RED run, make the still-existing save-time recommendation mock return an unresolved promise:

```ts
vi.mocked(recommendLeetCodeAssessmentViaRuntime).mockImplementation(
  () => new Promise(() => {}),
)
```

Run the targeted immediate-save test and expect timeout before removal. Delete that old mock/import with the retired path. Match response identity to the request observed by the mocked runtime. Reuse this harness for failed/locked/untimed/manual submissions and update flow. These tests must fail if a save awaits the unresolved AI promise or if analysis changes correctness/rating.

- [ ] Change `saveAcceptedReview` to take `decision: AcceptedAssessmentDecision` directly. Keep its existing guards, save-started, persistence, timer snapshot and next-step handling; replace its awaited recommendation with the already evaluated decision:

```ts
const details = await saveReviewResultViaRuntime({
  surface: 'content-script',
  problemSlug: problem.problemSlug,
  rating: decision.rating,
  reviewMode: 'leetcode',
  elapsedSeconds: decision.elapsedSeconds,
  isCorrect: decision.isCorrect,
})
```

Each existing caller now passes `saveAcceptedReview(decision)`. Remove `SaveAssessmentInput`, `maybeApplyAiRecommendation`, `toAssessmentSubmission`, `createSubmissionFingerprint`, old recommendation imports and AI-only submission arguments. Preserve deterministic/session evaluation, manual rating choices, locks, solve-time behavior, FSRS/progress and next-step refresh.

- [ ] Remove the `ai-preselect-rating` reducer action/case and unused `userTouchedRating` field/setters/tests; keep ordinary `select-rating` behavior and submitted-change derivation. Delete the mapped recommendation files, exports and endpoint; do not create old-name forwarding functions. Keep the deterministic automation's mutable result key.

- [ ] Verify removal:

```sh
rtk rg -n 'recommendLeetCodeAssessment|RecommendLeetCodeAssessment|AssessmentRecommendation|recommendedRating|shouldUpdateRating|ai-preselect-rating|maybeApplyAiRecommendation|useLeetCodeAssessmentRecommendation|OverlayAssessmentRecommendation|userTouchedRating|leetcode-assessment-v1' src
```

Expected: no matches (exit 1). Historical documentation may retain accurate implementation history. Run `rtk npm run test -- src/features/overlay-session src/features/leetcode-review-assistant src/extension/background/runtime-policy.test.ts src/extension/background/register-handlers.test.ts src/testing/architecture-boundaries.test.ts`, then `rtk npm run typecheck` and commit `refactor(assessment): retire AI recall rating overrides`.

## Task 4: Six real evaluation inputs and honest proof

**Files:** Create `src/features/leetcode-review-assistant/testing/code-analysis-evaluation-fixtures.ts`, `src/features/genai/testing/evaluation-provider-config.ts`, `src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts`. Modify `docs/product.md`, `docs/architecture.md`, `docs/testing.md`, `design.md`, `src/features/settings/components/sections/ai-assessment-section.tsx` and `.test.tsx`. Create `docs/superpowers/handoffs/2026-10-03-leetcode-code-analysis.md`.

- [ ] Create six fixtures by cloning `makeAnalysisRequest()` with these complete code/constraint changes. Each fixture contains an `id`, `request`, and human-review criterion; import request types and the fixture helper:

```ts
export const codeAnalysisEvaluationCases = [
  {
    id: 'brute-force-linear-goal',
    code: makeAnalysisRequest().submission.code,
    language: 'JavaScript',
    constraints: ['2 <= n <= 10000', 'Extra memory is allowed.'],
    followUps: ['Target expected O(n) time.'],
    status: 'accepted' as const,
    criterion:
      'Approach is below 5; hash map improves expected time and worsens auxiliary space.',
  },
  {
    id: 'small-constant-space',
    code: makeAnalysisRequest().submission.code,
    language: 'JavaScript',
    constraints: [
      '2 <= n <= 20',
      'Do not modify nums.',
      'Use O(1) auxiliary space.',
    ],
    followUps: [],
    status: 'accepted' as const,
    criterion:
      'Do not prescribe a hash map as satisfying the memory requirement; brute force may be appropriate.',
  },
  {
    id: 'sorted-one-based',
    code: 'function twoSum(numbers, target) { const seen = new Map(); for (let i = 0; i < numbers.length; i++) { const other = seen.get(target - numbers[i]); if (other !== undefined) return [other + 1, i + 1]; seen.set(numbers[i], i); } return []; }',
    language: 'JavaScript',
    constraints: [
      'numbers is sorted ascending.',
      'Return one-based indices.',
      'Use O(1) auxiliary space.',
    ],
    followUps: [],
    status: 'accepted' as const,
    criterion:
      'Suggest two pointers, preserve sorted input and one-based indices, explain O(n) time and O(1) auxiliary space.',
  },
  {
    id: 'insert-before-lookup',
    code: 'function twoSum(nums, target) { const seen = new Map(); for (let i = 0; i < nums.length; i++) { seen.set(nums[i], i); if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i]; } return []; }',
    language: 'JavaScript',
    constraints: ['Return two distinct indices.'],
    followUps: [],
    status: 'wrong-answer' as const,
    criterion:
      'For [3,2,4], target 6, reject [0,0]; valid indices are [1,2]. Do not praise the incorrect early exit.',
  },
  {
    id: 'kotlin-inferred-int',
    code: 'class Solution { fun searchInsert(nums: IntArray, target: Int): Int { var low: Int = 0; var high: Int = nums.size; while (low < high) { val middle: Int = low + (high - low) / 2; if (nums[middle] < target) low = middle + 1 else high = middle }; return low } }',
    language: 'Kotlin',
    constraints: [
      'nums is sorted ascending with distinct values.',
      'Return insertion index; target may be absent.',
    ],
    followUps: ['Use O(log n) time.'],
    status: 'accepted' as const,
    criterion:
      'Inference advice is optional style polish; preserve IntArray/Int parameter and return types and the lower-bound invariant.',
  },
  {
    id: 'kotlin-long-and-generic',
    code: 'class Solution { fun runningSum(nums: IntArray): LongArray { var total: Long = 0; val values: MutableList<Long> = mutableListOf(); for (value in nums) { total += value; values.add(total) }; return values.toLongArray() } }',
    language: 'Kotlin',
    constraints: [
      'Running sums may exceed Int range.',
      'Return LongArray without modifying nums.',
    ],
    followUps: [],
    status: 'accepted' as const,
    criterion:
      'Keep Long semantics (0L if inferring); keep generic type on annotation or initializer. Discuss justified allocation changes without changing output.',
  },
].map((fixture) => {
  const request = makeAnalysisRequest()
  const kotlin = fixture.id.startsWith('kotlin')
  request.problem = {
    ...request.problem,
    title: fixture.id,
    statement: kotlin
      ? fixture.id === 'kotlin-inferred-int'
        ? 'Find the insertion position of target in sorted distinct nums. Preserve class Solution.searchInsert.'
        : 'Return a LongArray containing prefix sums of nums. Preserve class Solution.runningSum.'
      : fixture.id === 'sorted-one-based'
        ? 'Return the one-based indices of two distinct entries of sorted numbers that sum to target. Exactly one pair exists.'
        : request.problem.statement,
    constraints: fixture.constraints,
    followUps: fixture.followUps,
    examples:
      fixture.id === 'insert-before-lookup'
        ? ['nums=[3,2,4], target=6; output=[1,2]']
        : kotlin
          ? []
          : request.problem.examples,
    topics: kotlin ? ['Array'] : request.problem.topics,
  }
  request.submission = {
    ...request.submission,
    code: fixture.code,
    language: fixture.language,
    status: fixture.status,
    runtime: null,
    memory: null,
    passedTestCount: null,
    totalTestCount: null,
  }
  if (fixture.id === 'insert-before-lookup')
    request.submission.diagnostics = {
      ...request.submission.diagnostics,
      failingTestcase: '[3,2,4], target=6',
      codeOutput: '[0,0]',
      expectedOutput: '[1,2]',
    }
  const slug =
    fixture.id === 'kotlin-inferred-int'
      ? 'search-insert-position'
      : fixture.id === 'kotlin-long-and-generic'
        ? 'running-sum-long'
        : fixture.id === 'sorted-one-based'
          ? 'two-sum-ii'
          : 'two-sum'
  request.problemSlug = slug
  request.problem.slug = slug
  return { id: fixture.id, request, criterion: fixture.criterion }
})
```

Give the Kotlin fixtures their own slug (`search-insert-position` / `running-sum-long`) and sorted fixture `two-sum-ii` in both `problemSlug` and `problem.slug`; identity must agree. Do not leave inherited contradictory examples or topics. Unit-test fixture request parsing before live calls.

- [ ] Implement the opt-in configuration helper inside GenAI testing; no environment key enters reports or fixtures:

```ts
import { z } from 'zod'
export function readEvaluationProviderConfig() {
  if (process.env.COGNIPACE_AI_EVAL !== '1') return null
  const parsed = z
    .object({
      provider: z.enum(['openai', 'anthropic', 'gemini']),
      model: z.string().trim().min(1),
      apiKey: z.string().trim().min(1),
    })
    .safeParse({
      provider: process.env.COGNIPACE_AI_EVAL_PROVIDER,
      model: process.env.COGNIPACE_AI_EVAL_MODEL,
      apiKey: process.env.COGNIPACE_AI_EVAL_KEY,
    })
  if (!parsed.success)
    throw new Error(
      'Configure COGNIPACE_AI_EVAL_PROVIDER, COGNIPACE_AI_EVAL_MODEL and COGNIPACE_AI_EVAL_KEY privately before evaluation.',
    )
  return parsed.data
}
```

Never print a failed config parse with the input attached. Environment credentials are an explicit offline evaluation option, not another application secret store. Prefer the user's working Gemini provider for the first manual run; do not silently add another paid provider.

- [ ] Add an opt-in live evaluation test that is skipped in ordinary tests and writes only schema-shaped reports to `/private/tmp/cognipace-ai-evaluation`:

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { readEvaluationProviderConfig } from '@/features/genai/testing/evaluation-provider-config'
import { codeAnalysisEvaluationCases } from '../testing/code-analysis-evaluation-fixtures'
import { analyzeCode } from './code-analysis-service'
const config = readEvaluationProviderConfig()
describe.skipIf(config === null)(
  'live code analysis for human rubric review',
  () => {
    for (const fixture of codeAnalysisEvaluationCases) {
      it(
        fixture.id,
        async () => {
          if (!config) throw new Error('Evaluation provider is not configured.')
          const result = await analyzeCode(
            fixture.request,
            config,
            new AbortController().signal,
            30_000,
          )
          expect(result.status).toBe('success')
          if (result.status !== 'success') throw new Error(result.message)
          await mkdir('/private/tmp/cognipace-ai-evaluation', {
            recursive: true,
          })
          await writeFile(
            `/private/tmp/cognipace-ai-evaluation/${fixture.id}.json`,
            JSON.stringify(
              {
                checkedAt: new Date().toISOString(),
                criterion: fixture.criterion,
                providerMetadata: result.providerMetadata,
                report: result.data,
              },
              null,
              2,
            ),
          )
        },
        35_000,
      )
    }
  },
)
```

Run after the human supplies environment variables privately in their terminal (never paste the key into chat or command history). Exact command, with Node/npm already pinned and the environment configured:

```sh
rtk npm run test -- src/features/leetcode-review-assistant/server/code-analysis-provider-evaluation.test.ts --maxWorkers=1
```

Default runs skip these six tests. An opt-in pass proves generation/schema/encoded consistency, not the human-review criteria. Review each saved report against its criterion; inspect summary, scores, strategy, both comparisons, and full suggested code together. Record failures and adjust the rubric within the approved design before rerunning failed cases. Do not keep rerunning already-accepted cases without a changed prompt/model or unresolved concern.

- [ ] Before claiming generated code compiles or passes, inspect it and save the relevant generated implementations as `/private/tmp/cognipace-ai-evaluation/two-sum.js` and `/private/tmp/cognipace-ai-evaluation/kotlin-types.kt`. Run:

```sh
rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node --check /private/tmp/cognipace-ai-evaluation/two-sum.js
rtk proxy zsh -c 'command -v kotlinc'
rtk proxy kotlinc /private/tmp/cognipace-ai-evaluation/kotlin-types.kt -d /private/tmp/cognipace-ai-evaluation/kotlin-types.jar
```

If Kotlin tooling is absent, record the skipped compile command/reason; do not install tooling or claim compilation based on the model. Syntax checks are not behavioral tests. For reviewed JavaScript Two Sum code, append this actual harness to the generated function and run the saved file with Node:

```js
for (const [nums, target] of [
  [[2, 7, 11, 15], 9],
  [[3, 2, 4], 6],
  [[3, 3], 6],
  [[-1, -2, -3, -4, -5], -8],
]) {
  const result = twoSum([...nums], target)
  if (
    !Array.isArray(result) ||
    result.length !== 2 ||
    result[0] === result[1] ||
    nums[result[0]] + nums[result[1]] !== target
  )
    throw new Error('Two Sum fixture failed')
}
```

Run `rtk proxy /Users/tobiolutimehin/.nvm/versions/node/v24.20.0/bin/node /private/tmp/cognipace-ai-evaluation/two-sum.js` only after inspecting the generated code. Do not add execution/submission to the product UI. Sorted/Kotlin output needs its corresponding index/type/boundary checks before any behavioral claim.

- [ ] Replace the Settings toggle hint with `When on, CogniPace analyzes completed LeetCode submissions for approach, efficiency, and code style.` Keep its storage/provider connection behavior. Update product/architecture/testing/design authority sections to describe the actual new behavior, ownership, session-only data, complete-input limits, rating independence, Retry/cancellation and generated-code disclaimer. Explain provider keys remain in trusted storage, outside report payloads/caches/logs/exports/sync; the existing key-save transport and provider authentication still require the key.

- [ ] Run the master plan's focused/full validation commands and explicit formatting check. Prepare the human installed-extension checklist below in `docs/testing.md`, the final handoff and eventual PR. Record exact commands run/skipped with results, live provider/model/date and report criteria, generated-code checks, and remaining proof. Commit `test(assessment): document analysis evaluation and smoke proof`.

## Required human smoke before PR review or merge

- [ ] With the confirmed Gemini connection, enable AI assessment, refresh LeetCode, open review, and see the idle instruction. Submit accepted and each useful failed-status example; inspect all three scores/rows and the collapsed generated implementation.
- [ ] Submit long/scrolled code and a follow-up-constrained problem; verify the report reflects full code and the follow-up. Inspect a memory tradeoff: O(1) to O(n) space must display as increased memory, independently of improved time.
- [ ] Check Kotlin Int inference, Long accumulator, generic empty collection and required signatures against actual suggested code.
- [ ] Cause incomplete capture, then Retry; verify the original submission ID stays pinned even after a newer submission appears. Test rapid consecutive submissions and ambiguous capture; no report may silently attach to another attempt.
- [ ] Exercise configuration/auth/quota/network/timeout/invalid-output messages and Settings/Retry recovery. Replace the key or model during generation; old output disappears and cannot return.
- [ ] Navigate, restart/clear, disable AI, collapse and dock during generation. Verify cancellation/stale hiding; expanding/docking/disclosures do not cause a duplicate generation. Reset with retained capture stays idle until a new submission or explicit allowed retry.
- [ ] Save/update reviews while analysis is pending and after it completes; inspect unchanged manual/deterministic ratings, correctness, locks, timing, scheduling and track progress.
- [ ] Use keyboard disclosures and Copy success/failure; verify generated code is marked AI-generated/untested and is never inserted, run or submitted. Inspect 392px/320px layouts.
- [ ] Attach screenshot or recording proof and record the human's happy-path/edge-case results. Prototype screenshots and mocked tests do not satisfy installed-extension proof.

Turning AI assessment off is the recovery control. No report migration, new sync behavior or Chrome permission is introduced. Final completion and PR readiness require the proof recorded above; pending proof must be stated plainly.
