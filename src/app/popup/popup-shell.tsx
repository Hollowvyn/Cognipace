import { Settings } from 'lucide-react'

import { IconButton } from '@/components/ui/icon-button'
import { SurfaceRoot } from '@/components/ui/surface'
import type { PopupAppShellController } from '@/features/app-shell'

import { MetricTiles } from './components/metric-tiles'
import { RecommendationCard } from './components/recommendation-card'
import { ScopedStatus } from './components/scoped-status'
import { StudyModeCard } from './components/study-mode-card'

export function PopupShell({
  controller,
}: {
  controller: PopupAppShellController
}) {
  const {
    actions,
    canShuffleRecommendation,
    canToggleStudyMode,
    data,
    extraPractice,
    isUpdatingStudyMode,
    status,
    view,
  } = controller
  const surfaceStatus = status?.scope === 'surface' ? status : null

  return (
    <SurfaceRoot
      className="flex flex-col gap-[var(--cp-surface-gap)] p-[var(--cp-surface-padding)]"
      surface="popup"
      theme={data.settings.appearance.themeMode}
    >
      <header className="flex items-center justify-between gap-3">
        <h1 aria-label="CogniPace" className="m-0 min-w-0">
          <button
            aria-label="Open Overview"
            className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-[var(--cp-control-radius)] border-0 bg-transparent p-0 text-left text-[length:var(--cp-title-font-size)] font-extrabold leading-tight text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={actions.openOverview}
            type="button"
          >
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-[var(--cp-radius-md)] bg-primary text-[0.8125rem] font-extrabold leading-none text-primary-foreground"
            >
              C
            </span>
            <span className="truncate">CogniPace</span>
          </button>
        </h1>
        <IconButton
          label="Open Settings"
          onClick={actions.openSettings}
          tooltip="Open Settings"
          variant="ghost"
        >
          <Settings aria-hidden="true" />
        </IconButton>
      </header>

      <ScopedStatus status={surfaceStatus} />

      <MetricTiles metrics={data.metrics} />

      <RecommendationCard
        canShuffle={canShuffleRecommendation}
        extraPractice={extraPractice}
        onOpenProblem={actions.openProblem}
        onRequestExtraPractice={actions.requestExtraPractice}
        onShuffle={actions.shuffleRecommendation}
        status={status?.scope === 'recommendation' ? status : null}
        view={view.recommendation}
      />

      <StudyModeCard
        isModeActionDisabled={!canToggleStudyMode || isUpdatingStudyMode}
        onOpenProblem={actions.openProblem}
        onOpenTracks={actions.openTracks}
        onToggleStudyMode={actions.toggleStudyMode}
        status={status?.scope === 'track' ? status : null}
        view={view.studyMode}
      />
    </SurfaceRoot>
  )
}
