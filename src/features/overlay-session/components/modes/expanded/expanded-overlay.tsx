import { AlertCircle, Info } from 'lucide-react'

import { InlineStatus } from '@/components/ui/inline-status'
import { SurfaceRoot } from '@/components/ui/surface'
import type { OverlayAppShellData } from '@/features/app-shell'
import type { ThemeMode } from '@/features/settings'
import type { ReviewRating } from '@/lib/fsrs'

import type { CodeAnalysisState } from '../../../hooks/use-leetcode-code-analysis'

import {
  hasSubmittedSessionChanges,
  type OverlaySessionState,
} from '../../../domain'
import type { OverlayTimerStatus } from '../../../hooks/use-overlay-timer'
import { OverlayActions } from './overlay-actions'
import { OverlayCodeAnalysis } from './overlay-code-analysis'
import { OverlayAssessmentRail } from './overlay-assessment-rail'
import {
  OverlayContextStrip,
  OverlaySubmissionSummary,
} from './overlay-context-strip'
import { OverlayHeader } from './overlay-header'
import { OverlayHelpSection } from './overlay-help-section'
import { OverlayNextCard } from './overlay-next-card'
import { OverlayTimerCard } from './overlay-timer-card'

type ExpandedOverlayViewModel = {
  aiAnalysis: CodeAnalysisState
  context: OverlayAppShellData['overlay'] | null
  elapsedSeconds: number
  helpSearchQuery: string | null
  isOverTarget: boolean
  overlay: OverlaySessionState
  problemTitle: string
  syncFeedback: string | null
  syncStatus: string
  targetSeconds: number
  timerStatus: OverlayTimerStatus
}

type ExpandedOverlayCommands = {
  onCollapse: () => void
  onDock: () => void
  onFail: () => void
  onPauseTimer: () => void
  onResetTimer: () => void
  onRestart: () => void
  onRetryAiAnalysis: () => void
  onSelectRating: (rating: ReviewRating) => void
  onSettings: () => void
  onStartTimer: () => void
  onSubmit: () => void
  onUpdate: () => void
}

type ExpandedOverlayProps = {
  commands: ExpandedOverlayCommands
  themeMode: ThemeMode
  view: ExpandedOverlayViewModel
}

export function ExpandedOverlay({
  commands,
  themeMode,
  view,
}: ExpandedOverlayProps) {
  const {
    aiAnalysis,
    context,
    elapsedSeconds,
    helpSearchQuery,
    isOverTarget,
    overlay,
    problemTitle,
    syncFeedback,
    syncStatus,
    targetSeconds,
    timerStatus,
  } = view
  const {
    onCollapse,
    onDock,
    onFail,
    onPauseTimer,
    onResetTimer,
    onRestart,
    onRetryAiAnalysis,
    onSelectRating,
    onSettings,
    onStartTimer,
    onSubmit,
    onUpdate,
  } = commands
  const submitted = Boolean(overlay.submittedSession)
  const isMutating =
    overlay.reviewStatus === 'saving' || overlay.reviewStatus === 'updating'
  const showUntimedWarning =
    !submitted &&
    context?.timing.requireSolveTime === true &&
    elapsedSeconds === 0 &&
    timerStatus !== 'running'

  return (
    <SurfaceRoot
      asChild
      data-cp-overlay-mode="expanded"
      surface="overlay"
      theme={themeMode}
    >
      <aside aria-label="CogniPace review overlay">
        <OverlayHeader
          onCollapse={onCollapse}
          onDock={onDock}
          onSettings={onSettings}
          problem={context?.problem ?? null}
          title={problemTitle}
        />
        <OverlayContextStrip context={context} isSubmitted={submitted} />

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3">
          <div className="grid min-w-0 gap-4">
            {syncStatus === 'error' && syncFeedback ? (
              <InlineStatus tone="danger">
                <AlertCircle aria-hidden="true" />
                <span>{syncFeedback}</span>
              </InlineStatus>
            ) : null}

            <OverlaySubmissionSummary context={context} />

            <OverlayTimerCard
              elapsedSeconds={elapsedSeconds}
              isOverTarget={isOverTarget}
              onPause={onPauseTimer}
              onReset={onResetTimer}
              onStart={onStartTimer}
              targetSeconds={targetSeconds}
              timerStatus={timerStatus}
            />

            <OverlayAssessmentRail
              isDisabled={isMutating}
              lockReason={overlay.ratingLockReason}
              onSelectRating={onSelectRating}
              selectedRating={overlay.selectedRating}
            />

            <OverlayCodeAnalysis
              onRetry={onRetryAiAnalysis}
              onSettings={onSettings}
              state={aiAnalysis}
            />

            {showUntimedWarning ? (
              <InlineStatus tone="neutral">
                <Info aria-hidden="true" />
                <span>
                  No timer used; this review will save without solve time.
                </span>
              </InlineStatus>
            ) : null}

            <OverlayHelpSection searchQuery={helpSearchQuery} />
          </div>
        </div>

        <div className="grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)] gap-3 border-t border-border bg-card p-3">
          <OverlayActions
            feedback={overlay.feedback}
            hasSubmittedChanges={hasSubmittedSessionChanges(overlay)}
            isSubmitted={submitted}
            onFail={onFail}
            onRestart={onRestart}
            onSubmit={onSubmit}
            onUpdate={onUpdate}
            reviewStatus={overlay.reviewStatus}
          />
          <OverlayNextCard nextStep={overlay.nextStep} />
        </div>
      </aside>
    </SurfaceRoot>
  )
}
