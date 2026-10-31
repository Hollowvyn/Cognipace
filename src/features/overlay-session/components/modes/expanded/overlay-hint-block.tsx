import { Button } from '@/components/ui/button'

import type { OverlayHintState } from '../../../hooks/use-leetcode-code-hints'

type OverlayHintBlockProps = {
  state: OverlayHintState
  onRevealNext?: (() => void) | undefined
  onRetry?: (() => void) | undefined
  onSettings?: (() => void) | undefined
}

export function OverlayHintBlock({
  state,
  onRevealNext,
  onRetry,
  onSettings,
}: OverlayHintBlockProps) {
  if (!state.isOpen || state.status === 'idle') return null

  return (
    <section
      aria-label="AI hints"
      aria-busy={state.status === 'pending'}
      className="mt-3 grid gap-3 rounded-lg border border-border p-3"
    >
      <h3 id="overlay-ai-hints-heading" className="text-sm font-semibold">
        {`Hints · ${state.history.length} of 3`}
      </h3>
      <p className="text-xs text-muted-foreground">
        Based on code when requested
      </p>
      {state.history.length ? (
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {state.history.map(({ hint }, index) => (
            <li key={index} className="break-words whitespace-pre-wrap">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {hint.strength[0]!.toUpperCase() + hint.strength.slice(1)}
              </span>
              {hint.text}
            </li>
          ))}
        </ol>
      ) : null}
      {state.status === 'pending' ? (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {state.phase === 'preparation'
              ? 'Reading code and problem details…'
              : 'Generating hint…'}
          </p>
          {state.history.length ? (
            <Button variant="outline" size="sm" disabled>
              Get next hint
            </Button>
          ) : null}
        </>
      ) : state.status === 'ready' ? (
        state.history.length < 3 ? (
          <Button variant="outline" size="sm" onClick={onRevealNext}>
            Get next hint
          </Button>
        ) : (
          <p role="status" className="text-xs text-muted-foreground">
            All 3 hints requested
          </p>
        )
      ) : (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {state.message}
          </p>
          <div className="flex flex-wrap gap-2">
            {state.canRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Retry hints
              </Button>
            ) : null}
            {state.showSettings ? (
              <Button variant="ghost" size="sm" onClick={onSettings}>
                AI settings
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}
