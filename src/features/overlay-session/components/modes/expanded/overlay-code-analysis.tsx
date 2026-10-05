import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import type { CodeAnalysisReport } from '@/features/leetcode-review-assistant'
import { cn } from '@/utils/cn'

import type { CodeAnalysisState } from '../../../hooks/use-leetcode-code-analysis'

type OverlayCodeAnalysisProps = {
  state: CodeAnalysisState
  onRetry: () => void
  onSettings: () => void
}

const focus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const button =
  'rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted'
const text = 'min-w-0 break-words'

export function OverlayCodeAnalysis({
  state,
  onRetry,
  onSettings,
}: OverlayCodeAnalysisProps) {
  const headingId = useId()

  return (
    <section
      aria-busy={state.status === 'pending' || undefined}
      aria-labelledby={headingId}
      className="min-w-0 break-words border-y border-border py-3 text-[0.78rem] leading-snug"
    >
      <h3
        className="mb-2 min-w-0 break-words font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
        id={headingId}
      >
        AI assessment
      </h3>
      {state.status === 'disabled' ? (
        <div className="grid min-w-0 gap-2">
          <p className={cn(text, 'text-muted-foreground')}>
            Automatic AI assessment is off.
          </p>
          <div>
            <button
              className={cn(button, focus)}
              onClick={onSettings}
              type="button"
            >
              Settings
            </button>
          </div>
        </div>
      ) : null}
      {state.status === 'idle' ? (
        <p className={cn(text, 'text-muted-foreground')}>
          Submit on LeetCode to get an AI assessment.
        </p>
      ) : null}
      {state.status === 'pending' ? (
        <p className={cn(text, 'text-muted-foreground')} role="status">
          {state.phase === 'capture'
            ? 'Preparing full submission context…'
            : 'Analyzing submission…'}
        </p>
      ) : null}
      {state.status === 'ready' ? (
        <AnalysisReport key={state.requestId} report={state.report} />
      ) : null}
      {state.status === 'unavailable' || state.status === 'error' ? (
        <div className="grid min-w-0 gap-2 break-words">
          <p className={cn(text, 'text-muted-foreground')} role="status">
            {state.message}
          </p>
          {state.canRetry || state.showSettings ? (
            <div className="flex min-w-0 flex-wrap gap-2">
              {state.canRetry ? (
                <button
                  className={cn(button, focus)}
                  onClick={onRetry}
                  type="button"
                >
                  Retry
                </button>
              ) : null}
              {state.showSettings ? (
                <button
                  className={cn(button, focus)}
                  onClick={onSettings}
                  type="button"
                >
                  Settings
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function scoreLabel(score: number | null) {
  return score === null ? 'Unavailable' : `${score}/5`
}

function AnalysisReport({ report }: { report: CodeAnalysisReport }) {
  return (
    <div className="grid min-w-0 gap-3 break-words">
      <p className={cn(text, 'text-foreground')}>{report.summary}</p>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {(
          [
            ['Approach', report.approach.score],
            ['Efficiency', report.efficiency.score],
            ['Code Style', report.codeStyle.score],
          ] as const
        ).map(([label, score]) => (
          <span
            className="min-w-0 break-words rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold"
            key={label}
          >
            {label} {scoreLabel(score)}
          </span>
        ))}
      </div>
      <div className="grid min-w-0 gap-2 break-words">
        <Disclosure title="Approach">
          <ScoreRationale
            score={report.approach.score}
            rationale={report.approach.rationale}
          />
          <DetailRow label="Current">
            {report.approach.current.join(' / ')}
          </DetailRow>
          <DetailRow label="Suggested">
            {report.approach.suggested.join(' / ')}
          </DetailRow>
          <DetailRow label="Key idea">{report.approach.keyIdea}</DetailRow>
          {report.approach.consider !== null ? (
            <DetailRow label="Consider">{report.approach.consider}</DetailRow>
          ) : null}
        </Disclosure>
        <Disclosure title="Efficiency">
          <ScoreRationale
            score={report.efficiency.score}
            rationale={report.efficiency.rationale}
          />
          <ComplexitySection
            title="Current complexity"
            complexity={report.efficiency.current}
          />
          <ComplexitySection
            title="Suggested complexity"
            complexity={report.efficiency.suggested}
            timeComparison={report.efficiency.timeComparison}
            spaceComparison={report.efficiency.spaceComparison}
          />
          <DetailRow label="Suggestions">
            <Suggestions items={report.efficiency.suggestions} />
          </DetailRow>
        </Disclosure>
        <Disclosure title="Code Style">
          <ScoreRationale
            score={report.codeStyle.score}
            rationale={report.codeStyle.rationale}
          />
          <DetailRow label="Readability">
            {report.codeStyle.readability}
          </DetailRow>
          <DetailRow label="Structure">{report.codeStyle.structure}</DetailRow>
          <DetailRow label="Suggestions">
            <Suggestions items={report.codeStyle.suggestions} />
          </DetailRow>
        </Disclosure>
        <Disclosure title="Suggested implementation">
          {report.suggestedImplementation !== null ? (
            <SuggestedImplementation
              implementation={report.suggestedImplementation}
            />
          ) : (
            <p className={cn(text, 'text-muted-foreground')}>
              {report.suggestedImplementationUnavailableReason}
            </p>
          )}
        </Disclosure>
      </div>
    </div>
  )
}

function Disclosure({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <details className="min-w-0 break-words rounded-md border border-border">
      <summary
        className={cn(
          'min-w-0 cursor-pointer break-words rounded-md px-2 py-2 font-semibold text-foreground hover:bg-muted',
          focus,
        )}
        tabIndex={0}
      >
        {title}
      </summary>
      <div className="grid min-w-0 gap-2 break-words border-t border-border p-2">
        {children}
      </div>
    </details>
  )
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2 break-words">
      <div className={cn(text, 'text-muted-foreground')}>{label}</div>
      <div className={cn(text, 'text-foreground')}>{children}</div>
    </div>
  )
}

function ScoreRationale({
  score,
  rationale,
}: {
  score: number | null
  rationale: string
}) {
  return (
    <>
      <DetailRow label="Score">{scoreLabel(score)}</DetailRow>
      <p className={cn(text, 'text-foreground')}>{rationale}</p>
    </>
  )
}

function Suggestions({ items }: { items: readonly string[] }) {
  return items.length === 0 ? (
    <span className={text}>No suggestions provided</span>
  ) : (
    <TextList items={items} />
  )
}

function TextList({ items }: { items: readonly string[] }) {
  return (
    <ul className="grid min-w-0 gap-1 break-words">
      {items.map((item, index) => (
        <li className="min-w-0 list-inside list-disc break-words" key={index}>
          {item}
        </li>
      ))}
    </ul>
  )
}

type Comparison = CodeAnalysisReport['efficiency']['timeComparison']
function comparisonClass(comparison?: Comparison) {
  if (comparison === 'better') return 'text-[color:var(--cp-tone-success-fg)]'
  if (comparison === 'worse') return 'text-[color:var(--cp-tone-warning-fg)]'
  return comparison === 'unknown' ? 'text-muted-foreground' : 'text-foreground'
}

function ComplexitySection({
  title,
  complexity,
  timeComparison,
  spaceComparison,
}: {
  title: string
  complexity: CodeAnalysisReport['efficiency']['current']
  timeComparison?: Comparison
  spaceComparison?: Comparison
}) {
  return (
    <div className="grid min-w-0 gap-1.5 break-words">
      <h4 className={cn(text, 'font-semibold text-muted-foreground')}>
        {title}
      </h4>
      {complexity === null ? (
        <p className={cn(text, 'text-muted-foreground')}>Unavailable</p>
      ) : (
        <>
          <DetailRow label="Time">
            <span className={cn(text, comparisonClass(timeComparison))}>
              {complexity.time}
            </span>
          </DetailRow>
          <DetailRow label="Auxiliary space">
            <span className={cn(text, comparisonClass(spaceComparison))}>
              {complexity.space}
            </span>
          </DetailRow>
          {complexity.assumptions.length > 0 ? (
            <DetailRow label="Assumptions">
              <TextList items={complexity.assumptions} />
            </DetailRow>
          ) : null}
        </>
      )}
    </div>
  )
}

function SuggestedImplementation({
  implementation,
}: {
  implementation: NonNullable<CodeAnalysisReport['suggestedImplementation']>
}) {
  const mounted = useRef(true)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [isCopying, setIsCopying] = useState(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function copyCode() {
    setCopyFeedback(null)
    setIsCopying(true)
    try {
      await navigator.clipboard.writeText(implementation.code)
      if (mounted.current) setCopyFeedback('Copied')
    } catch {
      if (mounted.current)
        setCopyFeedback('Copy failed. Select the code and copy it.')
    } finally {
      if (mounted.current) setIsCopying(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-2 break-words">
      <p className={cn(text, 'text-muted-foreground')}>
        AI-generated · Untested
      </p>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className={cn(text, 'font-mono text-muted-foreground')}>
          {implementation.language}
        </span>
        <button
          className={cn(button, focus)}
          disabled={isCopying}
          onClick={() => void copyCode()}
          type="button"
        >
          Copy code
        </button>
      </div>
      {copyFeedback !== null ? (
        <p className={cn(text, 'text-muted-foreground')} role="status">
          {copyFeedback}
        </p>
      ) : null}
      <pre className="min-w-0 max-w-full overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs leading-relaxed">
        <code>{implementation.code}</code>
      </pre>
      <DetailRow label="Changes">
        <Suggestions items={implementation.changes} />
      </DetailRow>
      <ComplexitySection
        title="Complexity"
        complexity={implementation.complexity}
      />
      {implementation.assumptions.length > 0 ? (
        <DetailRow label="Assumptions">
          <TextList items={implementation.assumptions} />
        </DetailRow>
      ) : null}
    </div>
  )
}
