import type { CSSProperties } from 'react'

import type { AssessmentLockReason } from '@/features/assessment'
import type { ReviewRating } from '@/lib/fsrs'
import { cn } from '@/utils/cn'
import type { OverlayReviewPreviewState } from '../../../hooks/use-overlay-review-preview'

type AssessmentOption = {
  label: string
  meaning: string
  rating: ReviewRating
  token: string
}

const assessmentOptions = [
  {
    label: 'Easy',
    meaning: 'Fast',
    rating: 'easy',
    token: 'easy',
  },
  {
    label: 'Good',
    meaning: 'Stable',
    rating: 'good',
    token: 'good',
  },
  {
    label: 'Hard',
    meaning: 'Lagging',
    rating: 'hard',
    token: 'hard',
  },
  {
    label: 'Again',
    meaning: 'Failed',
    rating: 'again',
    token: 'again',
  },
] as const satisfies readonly AssessmentOption[]

type OverlayAssessmentRailProps = {
  isDisabled?: boolean
  lockReason: AssessmentLockReason | null
  selectedRating: ReviewRating
  preview: OverlayReviewPreviewState
  onSelectRating: (rating: ReviewRating) => void
}

export function OverlayAssessmentRail({
  isDisabled,
  lockReason,
  selectedRating,
  preview,
  onSelectRating,
}: OverlayAssessmentRailProps) {
  const selectedOption = assessmentOptions.find(
    (option) => option.rating === selectedRating,
  )

  return (
    <section aria-labelledby="overlay-assessment-heading">
      <div
        className="mb-2 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
        id="overlay-assessment-heading"
      >
        Assessment
      </div>
      <div
        aria-label="Review assessment"
        className="grid grid-cols-4 overflow-hidden border border-border"
        role="group"
      >
        {assessmentOptions.map((option) => {
          const selected = option.rating === selectedRating
          const isOptionDisabled =
            isDisabled || (Boolean(lockReason) && !selected)
          const estimate = formatRatingEstimate(preview, option.rating)

          return (
            <button
              aria-label={`${option.label}, ${option.meaning}. ${estimate.accessible}`}
              aria-pressed={selected}
              className={cn(
                'min-w-0 border-r border-border bg-card px-2 py-3 text-center transition-colors last:border-r-0',
                'focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-35',
                selected
                  ? 'bg-[color:var(--overlay-rating-bg)] text-[color:var(--overlay-rating-fg)] ring-1 ring-inset ring-[color:var(--overlay-rating-fg)]'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              disabled={isOptionDisabled}
              key={option.rating}
              onClick={() => onSelectRating(option.rating)}
              style={ratingStyle(option.token)}
              type="button"
            >
              <span className="block truncate font-semibold">
                {option.label}
              </span>
              <span className="mt-1 block truncate font-mono text-[0.72rem] uppercase tracking-[0.12em] opacity-80">
                {option.meaning}
              </span>
              <span className="mt-1 block text-[0.68rem] leading-tight opacity-85">
                {estimate.short}
              </span>
            </button>
          )
        })}
      </div>
      {preview.status === 'unavailable' ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {preview.reason}
        </p>
      ) : preview.status === 'error' ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          Estimates could not load. Review saving is still available.
        </p>
      ) : preview.status === 'ready' &&
        preview.result.evidence === 'legacy-derived' ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Compatibility estimate from verified legacy evidence.
        </p>
      ) : null}
      <p
        className="mt-3 border-l-2 border-[color:var(--overlay-rating-fg)] pl-2 text-[0.78rem] leading-snug text-foreground"
        style={ratingStyle(selectedOption?.token ?? 'good')}
      >
        {formatAssessmentHelper(selectedRating, lockReason)}
      </p>
    </section>
  )
}

function formatRatingEstimate(
  preview: OverlayReviewPreviewState,
  rating: ReviewRating,
): { short: string; accessible: string } {
  if (preview.status === 'loading') {
    return { short: 'Estimating…', accessible: 'Estimate loading.' }
  }
  if (preview.status === 'error') {
    return { short: 'No estimate', accessible: 'Estimate failed.' }
  }
  if (preview.status === 'unavailable') {
    return { short: 'Unavailable', accessible: preview.reason }
  }
  const result = preview.result.ratings[rating]
  const date = new Date(`${result.eligibleOn}T12:00:00`)
  const shortDate = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
  const fullDate = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
  const today = new Date()
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
  const past = result.eligibleOn < todayKey
  const update = preview.result.identity.mode === 'update'
  const days = `${result.studyDays} ${result.studyDays === 1 ? 'day' : 'days'}`
  return {
    short:
      past && update
        ? `Past ${shortDate} · ${result.studyDays}d`
        : `${shortDate} · ${result.studyDays}d`,
    accessible: `Estimated next study date ${fullDate}, ${days} after ${update ? 'the original review' : 'this preview'}.${past && update ? ' Past study date.' : ''}`,
  }
}

function ratingStyle(token: string): CSSProperties {
  return {
    '--overlay-rating-bg': `var(--cp-tone-review-${token}-bg)`,
    '--overlay-rating-fg': `var(--cp-tone-review-${token}-fg)`,
  } as CSSProperties
}

function formatAssessmentHelper(
  rating: ReviewRating,
  lockReason: AssessmentLockReason | null,
) {
  if (lockReason === 'hard-mode-overtime') {
    return 'Strict timing: overtime forces Again for this attempt.'
  }

  if (lockReason === 'failed') {
    return 'Failed attempt saved as Again.'
  }

  switch (rating) {
    case 'easy':
      return 'Easy/Fast: You solved it quickly with clear recall.'
    case 'good':
      return 'Good/Stable: Concept is clear, implementation was steady.'
    case 'hard':
      return 'Hard/Lagging: You finished, but recall or implementation was slow.'
    case 'again':
      return 'Again/Failed: Save this when you could not finish confidently.'
    default:
      return assertNever(rating)
  }
}

function assertNever(value: never): never {
  void value
  throw new Error('Unhandled assessment rating')
}
