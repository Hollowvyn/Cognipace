import { useEffect, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import type {
  ProblemLibraryRow,
  SerializedProblem,
} from '@/features/problems/api/problems-contracts'
import { useSetPracticeSuspended } from '@/features/practice'

import { type ProblemDataConfirmation } from './use-problem-data-confirmation'

export type RenderProblemEditAction = (problem: SerializedProblem) => ReactNode

export function ProblemRowActionsBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>
}

export function ProblemRowPracticeActions({
  confirmation,
  disabled = false,
  afterEditAction,
  onPendingChange,
  renderEditProblemAction,
  row,
}: {
  confirmation: ProblemDataConfirmation
  disabled?: boolean | undefined
  afterEditAction?: ReactNode
  onPendingChange?: ((isPending: boolean) => void) | undefined
  renderEditProblemAction: RenderProblemEditAction
  row: ProblemLibraryRow
}) {
  const controller = confirmation
  const setSuspended = useSetPracticeSuspended()
  const [error, setError] = useState<string | null>(null)
  const isSuspended = row.state.isSuspended || row.status === 'suspended'
  const isPending = controller.pending || setSuspended.isPending
  const isDisabled = disabled || isPending

  useEffect(() => {
    onPendingChange?.(isPending)
  }, [isPending, onPendingChange])

  async function runAction(action: () => Promise<unknown>) {
    setError(null)

    try {
      await action()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Problem action failed.',
      )
    }
  }

  return (
    <>
      {error ? (
        <InlineStatus className="basis-full" role="alert" tone="danger">
          {error}
        </InlineStatus>
      ) : null}
      {renderEditProblemAction(row.problem)}
      {afterEditAction}
      <Button
        disabled={isDisabled}
        onClick={() => {
          void runAction(() =>
            setSuspended.mutateAsync({
              surface: 'dashboard',
              problemSlug: row.problem.slug,
              suspended: !isSuspended,
            }),
          )
        }}
        size="sm"
        variant="ghost"
      >
        {isSuspended ? 'Resume' : 'Suspend'}
      </Button>
      <Button
        disabled={isDisabled}
        onClick={() => {
          controller.begin({ kind: 'reset', problemSlugs: [row.problem.slug] })
        }}
        size="sm"
        variant="ghost"
      >
        Reset problem
      </Button>
    </>
  )
}

export function ProblemRowDeleteAction({
  confirmation,
  disabled = false,
  onPendingChange,
  row,
}: {
  confirmation: ProblemDataConfirmation
  disabled?: boolean | undefined
  onPendingChange?: ((isPending: boolean) => void) | undefined
  row: ProblemLibraryRow
}) {
  const controller = confirmation
  const isPending = controller.pending
  const isDisabled = disabled || isPending

  useEffect(() => {
    onPendingChange?.(isPending)
  }, [isPending, onPendingChange])

  return (
    <>
      <Button
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={isDisabled}
        onClick={() => {
          controller.begin({ kind: 'delete', problemSlugs: [row.problem.slug] })
        }}
        size="sm"
        variant="ghost"
      >
        Delete
      </Button>
    </>
  )
}
