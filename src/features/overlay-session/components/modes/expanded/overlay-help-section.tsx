import { Lightbulb } from 'lucide-react'

import { IconButton } from '@/components/ui/icon-button'

import type { OverlayHintState } from '../../../hooks/use-leetcode-code-hints'
import { OverlayHintBlock } from './overlay-hint-block'

import { createYouTubeSearchUrl } from '../../../domain'

export type OverlayHelpSectionProps = {
  searchQuery: string | null
  hints?: OverlayHintState
  onToggleHints?: () => void
  onRevealNextHint?: () => void
  onRetryHints?: () => void
  onSettings?: () => void
}

const HELP_ACTION_LABEL = 'Search YouTube for this problem'
const HELP_UNAVAILABLE_DESCRIPTION_ID = 'overlay-help-unavailable-description'

function YouTubeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
    </svg>
  )
}

export function OverlayHelpSection({
  searchQuery,
  hints = { status: 'idle', isOpen: false },
  onToggleHints,
  onRevealNextHint,
  onRetryHints,
  onSettings,
}: OverlayHelpSectionProps) {
  const hintActionLabel =
    hints.status === 'idle' ? 'Request AI hints' : 'Show AI hints'
  const searchUrl = searchQuery ? createYouTubeSearchUrl(searchQuery) : null

  return (
    <section aria-labelledby="overlay-help-heading">
      <h2
        className="mb-3 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
        id="overlay-help-heading"
      >
        Help
      </h2>

      <div className="flex items-center gap-1">
        {searchUrl ? (
          <IconButton
            asChild
            label={HELP_ACTION_LABEL}
            tooltip={HELP_ACTION_LABEL}
            variant="ghost"
          >
            <a href={searchUrl} rel="noopener noreferrer" target="_blank">
              <YouTubeIcon />
            </a>
          </IconButton>
        ) : (
          <IconButton
            disabled
            aria-describedby={HELP_UNAVAILABLE_DESCRIPTION_ID}
            label={HELP_ACTION_LABEL}
            tooltip="Problem details are still loading"
            variant="ghost"
          >
            <YouTubeIcon />
          </IconButton>
        )}
        {!searchUrl ? (
          <span className="sr-only" id={HELP_UNAVAILABLE_DESCRIPTION_ID}>
            Problem details are still loading
          </span>
        ) : null}
        <IconButton
          variant="ghost"
          label={hintActionLabel}
          tooltip={hintActionLabel}
          disabled={hints.status === 'pending' || !onToggleHints}
          aria-expanded={hints.isOpen}
          aria-controls="overlay-ai-hint-block"
          onClick={onToggleHints}
        >
          <Lightbulb aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
      <div id="overlay-ai-hint-block">
        <OverlayHintBlock
          state={hints}
          onRevealNext={onRevealNextHint}
          onRetry={onRetryHints}
          onSettings={onSettings}
        />
      </div>
    </section>
  )
}
