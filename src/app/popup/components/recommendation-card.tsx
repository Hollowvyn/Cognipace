import { ExternalLink, Shuffle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Surface } from '@/components/ui/surface'
import type {
  AppShellProblemSummary,
  PopupAppShellController,
  PopupControllerStatus,
  PopupRecommendationView,
} from '@/features/app-shell'
import { ProblemDifficultyBadge } from '@/features/problems'

import { ScopedStatus } from './scoped-status'

type RecommendationCardProps = {
  canShuffle: boolean
  extraPractice: PopupAppShellController['extraPractice']
  onOpenProblem: (
    problem: AppShellProblemSummary,
    scope: 'recommendation' | 'track',
  ) => void
  onShuffle: () => void
  onRequestExtraPractice: () => void
  status: Exclude<PopupControllerStatus, null> | null
  view: PopupRecommendationView
}

export function RecommendationCard({
  canShuffle,
  extraPractice,
  onOpenProblem,
  onRequestExtraPractice,
  onShuffle,
  status,
  view,
}: RecommendationCardProps) {
  const problem = view.problem

  return (
    <Surface aria-labelledby="popup-recommendation-title">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0 pr-1">
          <p className="m-0 text-[length:var(--cp-kicker-font-size)] font-bold uppercase leading-none text-muted-foreground">
            Recommended Now
          </p>
          <h2
            className="mt-1 line-clamp-2 text-[length:var(--cp-title-font-size)] font-bold leading-tight text-foreground"
            id="popup-recommendation-title"
          >
            {view.title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canShuffle ? (
            <IconButton
              label="Shuffle recommendation"
              onClick={onShuffle}
              size="sm"
              tooltip="Shuffle recommendation"
              variant="ghost"
            >
              <Shuffle aria-hidden="true" />
            </IconButton>
          ) : null}
        </div>
      </div>

      {problem ? (
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          {view.reason ? (
            <Badge className="shrink-0" tone={view.reason.tone}>
              {view.reason.label}
            </Badge>
          ) : null}
          {view.difficulty ? (
            <ProblemDifficultyBadge
              className="shrink-0"
              difficulty={view.difficulty}
            />
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[length:var(--cp-copy-font-size)] leading-relaxed text-muted-foreground">
          {view.emptyCopy}
        </p>
      )}

      <div className="mt-4">
        <Button
          className="w-full"
          disabled={!problem}
          onClick={() => {
            if (problem) {
              onOpenProblem(problem, 'recommendation')
            }
          }}
          variant="primary"
        >
          <ExternalLink aria-hidden="true" data-icon="inline-start" />
          Open Problem
        </Button>
      </div>

      <ScopedStatus status={status} />

      <div className="mt-4 grid gap-2 border-t border-border pt-4">
        <Button
          disabled={extraPractice.isLoading}
          onClick={onRequestExtraPractice}
          variant="outline"
        >
          Extra Practice
        </Button>
        {extraPractice.isLoading ? (
          <p role="status">Finding extra practice...</p>
        ) : extraPractice.error ? (
          <p role="alert">{extraPractice.error}</p>
        ) : extraPractice.item ? (
          <div className="grid gap-2">
            <p className="m-0 font-semibold">{extraPractice.item.title}</p>
            <Button
              onClick={() =>
                onOpenProblem(
                  {
                    problemSlug: extraPractice.item!.problemSlug,
                    title: extraPractice.item!.title,
                    difficulty: extraPractice.item!.difficulty,
                    isPremium: extraPractice.item!.isPremium,
                  },
                  'recommendation',
                )
              }
              variant="outline"
            >
              Open Extra Practice
            </Button>
          </div>
        ) : extraPractice.hasRequested ? (
          <p role="status">
            No future review cards available for extra practice.
          </p>
        ) : null}
      </div>
    </Surface>
  )
}
