import { ListMinus } from 'lucide-react'
import { useState } from 'react'

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
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setError(null)
    onPendingChange(true)
    try {
      await removeProblem.mutateAsync({
        surface: 'dashboard',
        trackId: row.membership.trackId,
        problemSlug: row.problem.slug,
      })
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not remove problem from track.',
      )
    } finally {
      onPendingChange(false)
    }
  }

  return (
    <>
      {error ? (
        <InlineStatus className="basis-full" role="alert" tone="danger">
          {error}
        </InlineStatus>
      ) : null}
      <Button
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={disabled || removeProblem.isPending}
        onClick={() => {
          void remove()
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
