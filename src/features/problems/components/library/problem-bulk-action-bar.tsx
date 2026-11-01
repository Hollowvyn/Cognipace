import type { ProblemDataConfirmation } from '../problem-row/use-problem-data-confirmation'
import { useMemo, useState, type ReactNode } from 'react'
import {
  CirclePause,
  CirclePlay,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'

import { IconButton } from '@/components/ui/icon-button'
import { InlineStatus } from '@/components/ui/inline-status'
import { useSetPracticeSuspended } from '@/features/practice'

import { useBulkUpdateProblems } from '../../api/problems-api'
import type {
  ProblemLibraryOptions,
  ProblemLibraryRow,
  ProblemsBulkUpdateProblemsRequest,
} from '../../api/problems-contracts'
import { ProblemBulkMetadataDialog } from './problem-bulk-metadata-dialog'

interface RenderSelectedRowsActionContext {
  disabled: boolean
}

export type RenderSelectedRowsAction = (
  selectedRows: readonly ProblemLibraryRow[],
  context: RenderSelectedRowsActionContext,
) => ReactNode

export function ProblemBulkActionBar({
  confirmation: externalConfirmation,
  onClearSelection,
  options,
  renderSelectedRowsAction,
  selectedRows,
}: {
  confirmation: ProblemDataConfirmation
  onClearSelection: () => void
  options: ProblemLibraryOptions
  renderSelectedRowsAction?: RenderSelectedRowsAction | undefined
  selectedRows: readonly ProblemLibraryRow[]
}) {
  const bulkUpdate = useBulkUpdateProblems()
  const setSuspended = useSetPracticeSuspended()
  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedProblemSlugs = useMemo(
    () => selectedRows.map((row) => row.problem.slug),
    [selectedRows],
  )
  const isPending =
    externalConfirmation.pending ||
    bulkUpdate.isPending ||
    setSuspended.isPending

  if (selectedRows.length === 0 && !message && !error) {
    return null
  }

  async function runAction(action: () => Promise<unknown>) {
    setError(null)
    setMessage(null)

    try {
      await action()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Bulk action failed.',
      )
    }
  }

  function setSelectedSuspended(suspended: boolean) {
    void runAction(async () => {
      await Promise.all(
        selectedProblemSlugs.map((problemSlug) =>
          setSuspended.mutateAsync({
            surface: 'dashboard',
            problemSlug,
            suspended,
          }),
        ),
      )
    })
  }

  async function updateMetadata(set: ProblemsBulkUpdateProblemsRequest['set']) {
    await runAction(async () => {
      await bulkUpdate.mutateAsync({
        surface: 'dashboard',
        problemSlugs: selectedProblemSlugs,
        set,
      })

      setIsMetadataDialogOpen(false)
      onClearSelection()
      setMessage('Updated selected problems.')
    })
  }

  return (
    <section
      aria-label="Bulk actions"
      className="flex min-w-0 flex-wrap items-center gap-2"
    >
      {error ? (
        <InlineStatus role="alert" tone="danger">
          {error}
        </InlineStatus>
      ) : null}
      {message ? <InlineStatus>{message}</InlineStatus> : null}
      {selectedRows.length > 0 ? (
        <>
          <span className="whitespace-nowrap font-semibold text-foreground">
            {selectedRows.length} selected
          </span>
          {renderSelectedRowsAction
            ? renderSelectedRowsAction(selectedRows, { disabled: isPending })
            : null}
          <div className="inline-flex items-center gap-1">
            <IconButton
              disabled={isPending}
              label="Suspend"
              onClick={() => setSelectedSuspended(true)}
              tooltip="Suspend selected"
              variant="ghost"
            >
              <CirclePause aria-hidden="true" />
            </IconButton>
            <IconButton
              disabled={isPending}
              label="Resume"
              onClick={() => setSelectedSuspended(false)}
              tooltip="Resume selected"
              variant="ghost"
            >
              <CirclePlay aria-hidden="true" />
            </IconButton>
            <IconButton
              disabled={isPending}
              label="Reset problem"
              onClick={() => {
                externalConfirmation.begin({
                  kind: 'reset',
                  bulk: true,
                  problemSlugs: selectedProblemSlugs,
                  onDurable: onClearSelection,
                })
              }}
              tooltip="Reset selected problems"
              variant="ghost"
            >
              <RotateCcw aria-hidden="true" />
            </IconButton>
            <IconButton
              disabled={isPending}
              label="Edit Metadata"
              onClick={() => setIsMetadataDialogOpen(true)}
              tooltip="Edit selected metadata"
              variant="ghost"
            >
              <Pencil aria-hidden="true" />
            </IconButton>
            <IconButton
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={isPending}
              label="Delete Problems"
              onClick={() => {
                externalConfirmation.begin({
                  kind: 'delete',
                  bulk: true,
                  problemSlugs: selectedProblemSlugs,
                  onDurable: () => {
                    onClearSelection()
                    setMessage('Deleted selected problems.')
                  },
                })
              }}
              tooltip="Delete selected problems"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
            </IconButton>
            <IconButton
              className="text-muted-foreground hover:text-foreground"
              disabled={isPending}
              label="Clear selection"
              onClick={onClearSelection}
              tooltip="Clear selection"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </IconButton>
          </div>
        </>
      ) : null}

      {isMetadataDialogOpen ? (
        <ProblemBulkMetadataDialog
          onCancel={() => setIsMetadataDialogOpen(false)}
          onSubmit={(set) => {
            void updateMetadata(set)
          }}
          options={options}
          pending={isPending}
          selectedCount={selectedRows.length}
        />
      ) : null}
    </section>
  )
}
