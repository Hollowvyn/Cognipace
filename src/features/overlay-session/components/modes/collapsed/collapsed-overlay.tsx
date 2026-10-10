import {
  Check,
  ChevronsUp,
  PanelRightClose,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react'

import { SurfaceRoot } from '@/components/ui/surface'
import type { ThemeMode } from '@/features/settings'
import { cn } from '@/utils/cn'

import {
  formatOverlayDuration,
  type OverlaySessionState,
} from '../../../domain'
import type { OverlayTimerStatus } from '../../../hooks/use-overlay-timer'
import { OverlayControlButton } from '../../shared/overlay-control-button'

type CollapsedOverlayViewModel = {
  canUseProblem: boolean
  elapsedSeconds: number
  isOverTarget: boolean
  overlay: OverlaySessionState
  timerStatus: OverlayTimerStatus
}

type CollapsedOverlayCommands = {
  onDock: () => void
  onExpand: () => void
  onFail: () => void
  onPauseTimer: () => void
  onPrepareSubmit: () => void
  onResetTimer: () => void
  onRestartLocalSession: () => void
  onStartTimer: () => void
}

type CollapsedOverlayProps = {
  commands: CollapsedOverlayCommands
  themeMode: ThemeMode
  view: CollapsedOverlayViewModel
}

export function CollapsedOverlay({
  commands,
  themeMode,
  view,
}: CollapsedOverlayProps) {
  const { canUseProblem, elapsedSeconds, isOverTarget, overlay, timerStatus } =
    view
  const {
    onDock,
    onExpand,
    onFail,
    onPauseTimer,
    onPrepareSubmit,
    onResetTimer,
    onRestartLocalSession,
    onStartTimer,
  } = commands
  const isSubmitted = Boolean(overlay.submittedSession)
  const isMutating =
    overlay.reviewStatus === 'saving' || overlay.reviewStatus === 'updating'
  const canSubmit = canUseProblem && !isSubmitted && !isMutating
  const canReset = canUseProblem && (elapsedSeconds > 0 || isSubmitted)
  const timerTone = isOverTarget
    ? 'text-destructive'
    : timerStatus === 'running'
      ? 'text-primary'
      : 'text-muted-foreground'
  const isRunning = timerStatus === 'running'

  return (
    <SurfaceRoot
      asChild
      data-cp-overlay-mode="collapsed"
      surface="overlay"
      theme={themeMode}
    >
      <aside
        aria-label="CogniPace collapsed controls"
        className="cursor-pointer"
        onClick={onExpand}
      >
        <div className="flex h-full items-center gap-2 px-2">
          <OverlayControlButton label="Open Review" onClick={onExpand}>
            <ChevronsUp className="size-4" />
          </OverlayControlButton>

          <OverlayControlButton
            stopClickPropagation
            label="Dock Overlay"
            onClick={onDock}
          >
            <PanelRightClose className="size-4" />
          </OverlayControlButton>

          <OverlayDivider />

          <time
            aria-label="Elapsed solve time"
            className={cn(
              'w-[5.25rem] shrink-0 text-center font-mono text-[1.05rem] font-semibold leading-none tabular-nums',
              timerTone,
            )}
            dateTime={`PT${Math.max(0, Math.floor(elapsedSeconds))}S`}
          >
            {formatOverlayDuration(elapsedSeconds)}
          </time>

          <OverlayDivider />

          <OverlayControlButton
            disabled={!canUseProblem || isSubmitted}
            label={isRunning ? 'Pause Timer' : 'Start Timer'}
            onClick={isRunning ? onPauseTimer : onStartTimer}
            stopClickPropagation
            tone="primary"
          >
            {isRunning ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </OverlayControlButton>

          <OverlayControlButton
            disabled={!canReset || isMutating}
            label={isSubmitted ? 'Restart Attempt' : 'Reset Timer'}
            onClick={isSubmitted ? onRestartLocalSession : onResetTimer}
            stopClickPropagation
          >
            <RotateCcw className="size-4" />
          </OverlayControlButton>

          <OverlayDivider />

          <OverlayControlButton
            disabled={!canSubmit}
            label="Submit Review"
            onClick={onPrepareSubmit}
            stopClickPropagation
            tone="success"
          >
            <Check className="size-4" />
          </OverlayControlButton>

          <OverlayControlButton
            disabled={!canSubmit}
            label="Save Again"
            onClick={onFail}
            stopClickPropagation
            tone="danger"
          >
            <X className="size-4" />
          </OverlayControlButton>
        </div>
      </aside>
    </SurfaceRoot>
  )
}

function OverlayDivider() {
  return <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
}
