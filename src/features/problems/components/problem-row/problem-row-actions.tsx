import { useEffect, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { useDeleteProblem } from '@/features/problems/api/problems-api'
import type {
  ProblemLibraryRow,
  SerializedProblem,
} from '@/features/problems/api/problems-contracts'
import {
  useResetPracticeSchedule,
  useSetPracticeSuspended,
} from '@/features/practice'

import { ProblemConfirmationDialog } from '../library/problem-confirmation-dialog'

export type RenderProblemEditAction = (problem: SerializedProblem) => ReactNode

export function ProblemRowActionsBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>
}

export function ProblemRowPracticeActions({
  disabled = false,
  afterEditAction,
  onPendingChange,
  renderEditProblemAction,
  row,
}: {
  disabled?: boolean | undefined
  afterEditAction?: ReactNode
  onPendingChange?: ((isPending: boolean) => void) | undefined
  renderEditProblemAction: RenderProblemEditAction
  row: ProblemLibraryRow
}) {
  const resetSchedule = useResetPracticeSchedule()
  const setSuspended = useSetPracticeSuspended()
  const [isResetConfirmationOpen, setIsResetConfirmationOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSuspended = row.state.isSuspended || row.status === 'suspended'
  const isPending = resetSchedule.isPending || setSuspended.isPending
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

  async function confirmReset() {
    await runAction(async () => {
      await resetSchedule.mutateAsync({
        surface: 'dashboard',
        problemSlug: row.problem.slug,
      })
      setIsResetConfirmationOpen(false)
    })
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
        onClick={() => setIsResetConfirmationOpen(true)}
        size="sm"
        variant="ghost"
      >
        Reset Schedule
      </Button>

      {isResetConfirmationOpen ? (
        <ProblemConfirmationDialog
          confirmLabel="Reset Schedule"
          description="This clears the FSRS schedule and review history for this problem."
          onCancel={() => setIsResetConfirmationOpen(false)}
          onConfirm={() => {
            void confirmReset()
          }}
          pending={isDisabled}
          title="Reset schedule?"
        />
      ) : null}
    </>
  )
}

export function ProblemRowDeleteAction({
  disabled = false,
  onPendingChange,
  row,
}: {
  disabled?: boolean | undefined
  onPendingChange?: ((isPending: boolean) => void) | undefined
  row: ProblemLibraryRow
}) {
  const deleteProblem = useDeleteProblem()
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] =
    useState(false)
  const [error, setError] = useState<string | null>(null)
  const isPending = deleteProblem.isPending
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

  async function confirmDelete() {
    await runAction(async () => {
      await deleteProblem.mutateAsync({
        surface: 'dashboard',
        problemSlug: row.problem.slug,
      })
      setIsDeleteConfirmationOpen(false)
    })
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
        disabled={isDisabled}
        onClick={() => setIsDeleteConfirmationOpen(true)}
        size="sm"
        variant="ghost"
      >
        Delete
      </Button>

      {isDeleteConfirmationOpen ? (
        <ProblemConfirmationDialog
          confirmLabel="Delete Problem"
          description="This permanently deletes this problem and its practice data."
          onCancel={() => setIsDeleteConfirmationOpen(false)}
          onConfirm={() => {
            void confirmDelete()
          }}
          pending={isDisabled}
          title="Delete problem?"
        />
      ) : null}
    </>
  )
}
