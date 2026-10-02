import { ListMinus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'

import { useRemoveTrackProblem } from '../api/tracks-api'
import type { TrackProblemRow } from '../api/tracks-contracts'

export function TrackProblemRemoveAction({
  disabled,
  onPendingChange,
  row,
}: {
  disabled: boolean
  onPendingChange: (pending: boolean) => void
  row: TrackProblemRow
}) {
  const removeProblem = useRemoveTrackProblem()

  function remove() {
    onPendingChange(true)
    void removeProblem
      .mutateAsync({
        surface: 'dashboard',
        trackId: row.membership.trackId,
        problemSlug: row.problem.slug,
      })
      .catch(() => undefined)
      .finally(() => onPendingChange(false))
  }

  return (
    <>
      {removeProblem.error ? (
        <InlineStatus className="basis-full" role="alert" tone="danger">
          {removeProblem.error instanceof Error
            ? removeProblem.error.message
            : 'Could not remove problem from track.'}
        </InlineStatus>
      ) : null}
      <Button
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={disabled || removeProblem.isPending}
        onClick={() => {
          remove()
        }}
        size="sm"
        variant="ghost"
      >
        <ListMinus aria-hidden="true" />
        Remove from track
      </Button>
    </>
  )
}
