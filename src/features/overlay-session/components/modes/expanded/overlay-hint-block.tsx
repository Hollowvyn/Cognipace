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
        {state.status === 'ready'
          ? `Hints · ${state.revealedCount} of ${state.batch.hints.length}`
          : 'AI hints'}
      </h3>
      {state.status === 'pending' ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.phase === 'preparation'
            ? 'Reading problem details…'
            : 'Generating hints…'}
        </p>
      ) : state.status === 'ready' ? (
        <>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {state.batch.hints
              .slice(0, state.revealedCount)
              .map((hint, index) => (
                <li key={index} className="break-words whitespace-pre-wrap">
                  {hint}
                </li>
              ))}
          </ol>
          {state.revealedCount < state.batch.hints.length ? (
            <Button variant="outline" size="sm" onClick={onRevealNext}>
              Reveal next hint
            </Button>
          ) : (
            <p role="status" className="text-xs text-muted-foreground">
              All {state.batch.hints.length} hints revealed
            </p>
          )}
        </>
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
