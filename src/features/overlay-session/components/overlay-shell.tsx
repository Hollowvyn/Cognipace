import { useEffect, useRef } from 'react'

import type { ThemeMode } from '@/features/settings'
import { markOverlayStartup } from '@/lib/performance/overlay-startup-timing'

import { selectOverlayHelpSearchQuery } from '../domain'
import type { LeetCodeOverlaySession } from '../hooks/use-leetcode-overlay-session'
import { CollapsedOverlay } from './modes/collapsed/collapsed-overlay'
import { DockedOverlay } from './modes/docked/docked-overlay'
import { ExpandedOverlay } from './modes/expanded/expanded-overlay'

type OverlayShellProps = LeetCodeOverlaySession

export function OverlayShell({
  actions,
  aiAnalysis,
  context,
  feedback,
  hints,
  location,
  metadata,
  overlay,
  preview,
  retryAiAnalysis,
  status,
  timer,
}: OverlayShellProps) {
  const problemTitle =
    metadata?.title ??
    context?.problem?.title ??
    location?.slug ??
    'Reading page'
  const helpSearchQuery = selectOverlayHelpSearchQuery({
    metadataTitle: metadata?.source !== 'fallback' ? metadata?.title : null,
    problemTitle: context?.problem?.title,
    problemSlug: location?.slug,
  })
  const canUseProblem = Boolean(context?.problem) && status === 'ready'
  const timerControlEnabled =
    canUseProblem &&
    timer.status !== 'locked' &&
    !overlay.submittedSession &&
    (overlay.visualMode === 'collapsed' ||
      (overlay.visualMode === 'expanded' && overlay.expandedTab === 'solve'))
  const themeMode: ThemeMode = context?.appearance.themeMode ?? 'system'
  const timerReadySlugRef = useRef<string | null>(null)

  useEffect(() => {
    if (!location?.slug) {
      timerReadySlugRef.current = null
      return
    }
    if (timerControlEnabled && timerReadySlugRef.current !== location.slug) {
      timerReadySlugRef.current = location.slug
      markOverlayStartup('timer-ready')
    }
  }, [location?.slug, timerControlEnabled])

  if (overlay.visualMode === 'docked') {
    return <DockedOverlay onRestore={actions.restore} themeMode={themeMode} />
  }

  if (overlay.visualMode === 'expanded') {
    return (
      <ExpandedOverlay
        commands={{
          onCollapse: actions.collapse,
          onDock: actions.dock,
          onFail: () => void actions.failReview(),
          onPauseTimer: actions.pauseTimer,
          onResetTimer: actions.resetTimer,
          onRestart: actions.restartLocalSession,
          onRetryAiAnalysis: retryAiAnalysis,
          onToggleHints: actions.toggleHints,
          onRevealNextHint: actions.revealNextHint,
          onRetryHints: actions.retryHints,
          onSelectExpandedTab: actions.selectExpandedTab,
          onSelectRating: actions.selectRating,
          onSettings: actions.openSettings,
          onStartTimer: actions.startTimer,
          onSubmit: () => void actions.submitReview(),
          onUpdate: () => void actions.updateReview(),
          onRetryReview: () => void actions.retryReview(),
        }}
        view={{
          aiAnalysis,
          context,
          elapsedSeconds: timer.elapsedSeconds,
          helpSearchQuery,
          hints,
          isOverTarget: timer.isOverTarget,
          overlay,
          preview,
          problemTitle,
          syncFeedback: feedback,
          syncStatus: status,
          targetSeconds: timer.targetSeconds,
          timerStatus: timer.status,
        }}
        themeMode={themeMode}
      />
    )
  }

  return (
    <CollapsedOverlay
      commands={{
        onDock: actions.dock,
        onExpand: actions.expand,
        onFail: () => void actions.failReview(),
        onPauseTimer: actions.pauseTimer,
        onPrepareSubmit: () => void actions.prepareQuickSubmit(),
        onResetTimer: actions.resetTimer,
        onRestartLocalSession: actions.restartLocalSession,
        onStartTimer: actions.startTimer,
      }}
      view={{
        canUseProblem,
        elapsedSeconds: timer.elapsedSeconds,
        isOverTarget: timer.isOverTarget,
        overlay,
        timerStatus: timer.status,
      }}
      themeMode={themeMode}
    />
  )
}
