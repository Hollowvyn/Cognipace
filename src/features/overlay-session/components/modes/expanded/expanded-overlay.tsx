import { AlertCircle, Info } from 'lucide-react'
import { useId, useLayoutEffect, useRef, type UIEvent } from 'react'

import { InlineStatus } from '@/components/ui/inline-status'
import { SurfaceRoot } from '@/components/ui/surface'
import type { OverlayAppShellData } from '@/features/app-shell'
import type { ThemeMode } from '@/features/settings'
import type { ReviewRating } from '@/lib/fsrs'

import type { OverlayHintState } from '../../../hooks/use-leetcode-code-hints'
import type { CodeAnalysisState } from '../../../hooks/use-leetcode-code-analysis'

import {
  hasSubmittedSessionChanges,
  type OverlayExpandedTab,
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
import { OverlayTabs } from './overlay-tabs'
import { OverlayTimerCard } from './overlay-timer-card'

type ExpandedOverlayViewModel = {
  aiAnalysis: CodeAnalysisState
  context: OverlayAppShellData['overlay'] | null
  elapsedSeconds: number
  helpSearchQuery: string | null
  hints: OverlayHintState
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
  onToggleHints: () => void
  onRevealNextHint: () => void
  onRetryHints: () => void
  onSelectExpandedTab: (tab: OverlayExpandedTab) => void
  onSelectRating: (rating: ReviewRating) => void
  onSettings: () => void
  onStartTimer: () => void
  onSubmit: () => void
  onUpdate: () => void
  onRetryReview: () => void
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
    hints,
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
    onToggleHints,
    onRevealNextHint,
    onRetryHints,
    onSelectExpandedTab,
    onSelectRating,
    onSettings,
    onStartTimer,
    onSubmit,
    onUpdate,
    onRetryReview,
  } = commands
  const tabId = useId()
  const scrollContainers = useRef<
    Record<OverlayExpandedTab, HTMLDivElement | null>
  >({ solve: null, ai: null, notes: null })
  const scrollPositions = useRef<Record<OverlayExpandedTab, number>>({
    solve: 0,
    ai: 0,
    notes: 0,
  })

  useLayoutEffect(() => {
    const container = scrollContainers.current[overlay.expandedTab]
    if (container) {
      container.scrollTop = scrollPositions.current[overlay.expandedTab]
    }
  }, [overlay.expandedTab])

  function rememberScroll(
    tab: OverlayExpandedTab,
    event: UIEvent<HTMLDivElement>,
  ) {
    if (overlay.expandedTab === tab) {
      scrollPositions.current[tab] = event.currentTarget.scrollTop
    }
  }

  const submitted = Boolean(overlay.submittedSession)
  const isMutating =
    Boolean(overlay.acceptedCommand) ||
    overlay.reviewStatus === 'saving' ||
    overlay.reviewStatus === 'updating'
  const aiStatus =
    aiAnalysis.status === 'ready'
      ? 'Ready'
      : aiAnalysis.status === 'pending'
        ? 'Working'
        : aiAnalysis.status === 'error'
          ? 'Error'
          : aiAnalysis.status === 'unavailable'
            ? 'Unavailable'
            : null
  const solveStatus = isMutating
    ? 'Saving'
    : overlay.feedback?.tone === 'danger' || syncStatus === 'error'
      ? 'Error'
      : null
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
        <OverlayTabs
          activeTab={overlay.expandedTab}
          aiStatus={aiStatus}
          idPrefix={tabId}
          onSelectTab={onSelectExpandedTab}
          solveStatus={solveStatus}
        />

        <section
          id={`${tabId}-solve-panel`}
          role="tabpanel"
          aria-labelledby={`${tabId}-solve-tab`}
          hidden={overlay.expandedTab !== 'solve'}
          style={{
            display: overlay.expandedTab === 'solve' ? undefined : 'none',
          }}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div
            ref={(element) => {
              scrollContainers.current.solve = element
            }}
            onScroll={(event) => rememberScroll('solve', event)}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3"
          >
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

              {showUntimedWarning ? (
                <InlineStatus tone="neutral">
                  <Info aria-hidden="true" />
                  <span>
                    No timer used; this review will save without solve time.
                  </span>
                </InlineStatus>
              ) : null}

              <OverlayHelpSection
                searchQuery={helpSearchQuery}
                hints={hints}
                onToggleHints={onToggleHints}
                onRevealNextHint={onRevealNextHint}
                onRetryHints={onRetryHints}
                onSettings={onSettings}
              />
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
              commandStatus={overlay.commandStatus}
              onRetry={onRetryReview}
            />
            <OverlayNextCard nextStep={overlay.nextStep} />
          </div>
        </section>

        <section
          id={`${tabId}-ai-panel`}
          role="tabpanel"
          aria-labelledby={`${tabId}-ai-tab`}
          hidden={overlay.expandedTab !== 'ai'}
          style={{ display: overlay.expandedTab === 'ai' ? undefined : 'none' }}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div
            ref={(element) => {
              scrollContainers.current.ai = element
            }}
            onScroll={(event) => rememberScroll('ai', event)}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3"
          >
            <OverlayCodeAnalysis
              onRetry={onRetryAiAnalysis}
              onSettings={onSettings}
              state={aiAnalysis}
            />
          </div>
        </section>

        <section
          id={`${tabId}-notes-panel`}
          role="tabpanel"
          aria-labelledby={`${tabId}-notes-tab`}
          hidden={overlay.expandedTab !== 'notes'}
          style={{
            display: overlay.expandedTab === 'notes' ? undefined : 'none',
          }}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div
            ref={(element) => {
              scrollContainers.current.notes = element
            }}
            onScroll={(event) => rememberScroll('notes', event)}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3"
          >
            <div className="grid min-h-full content-center gap-2 p-6 text-center">
              <h2 className="text-base font-semibold">Notes</h2>
              <p className="m-0 text-sm text-muted-foreground">
                A dedicated space for your problem notes, coming in a later
                phase.
              </p>
            </div>
          </div>
        </section>
      </aside>
    </SurfaceRoot>
  )
}
