import { Check, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'

import type { OverlayFeedback, OverlayReviewStatus } from '../../../domain'

type OverlayActionsProps = {
  feedback: OverlayFeedback | null
  hasSubmittedChanges: boolean
  isSubmitted: boolean
  reviewStatus: OverlayReviewStatus
  commandStatus: 'in-flight' | 'persistence-pending' | 'error' | null
  onRetry: () => void
  onFail: () => void
  onRestart: () => void
  onSubmit: () => void
  onUpdate: () => void
}

export function OverlayActions({
  feedback,
  hasSubmittedChanges,
  isSubmitted,
  reviewStatus,
  onFail,
  onRestart,
  onSubmit,
  onUpdate,
  commandStatus,
  onRetry,
}: OverlayActionsProps) {
  const isSaving = reviewStatus === 'saving'
  const isUpdating = reviewStatus === 'updating'
  const isMutating = isSaving || isUpdating
  const canRetry =
    commandStatus === 'error' || commandStatus === 'persistence-pending'

  return (
    <section className="grid gap-2" aria-label="Review actions">
      {isSubmitted ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={isMutating}
            onClick={onRestart}
            type="button"
            variant="outline"
          >
            <RotateCcw aria-hidden="true" />
            Restart
          </Button>
          <Button
            disabled={!hasSubmittedChanges || isMutating}
            onClick={onUpdate}
            type="button"
            variant="primary"
          >
            <Check aria-hidden="true" />
            {isUpdating ? 'Updating...' : 'Update'}
          </Button>
        </div>
      ) : (
        <>
          <Button
            disabled={isMutating}
            onClick={onSubmit}
            type="button"
            variant="primary"
          >
            <Check aria-hidden="true" />
            {isSaving ? 'Submitting...' : 'Submit'}
          </Button>
          <Button
            disabled={isMutating}
            onClick={onFail}
            type="button"
            variant="outline"
          >
            I Couldn't Finish
          </Button>
        </>
      )}

      {canRetry ? (
        <Button onClick={onRetry} type="button" variant="primary">
          Retry review
        </Button>
      ) : null}

      {feedback ? (
        <InlineStatus tone={feedback.tone}>{feedback.message}</InlineStatus>
      ) : null}
    </section>
  )
}
