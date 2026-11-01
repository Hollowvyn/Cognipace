import { useRef, useState } from 'react'

import {
  useBulkDeleteProblems,
  useDeleteProblem,
  useResetProblemData,
} from '../../api/problems-api'
import { ProblemConfirmationDialog } from '../library/problem-confirmation-dialog'

type Intent = {
  kind: 'reset' | 'delete'
  problemSlugs: string[]
  bulk?: boolean
  onDurable?: () => void
}

// Owned by the screen: publication broadcasts may remove the originating row.
export function useProblemDataConfirmation() {
  const reset = useResetProblemData()
  const remove = useDeleteProblem()
  const bulkRemove = useBulkDeleteProblems()
  const [intent, setIntent] = useState<Intent | null>(null)
  const commandId = useRef<string | null>(null)
  const [savingPending, setSavingPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = reset.isPending || remove.isPending || bulkRemove.isPending
  async function confirm() {
    if (!intent) return
    commandId.current ??= crypto.randomUUID()
    setError(null)
    try {
      const request = {
        surface: 'dashboard' as const,
        commandId: commandId.current,
        problemSlugs: intent.problemSlugs,
      }
      const result =
        intent.kind === 'reset'
          ? await reset.mutateAsync(request)
          : intent.bulk
            ? await bulkRemove.mutateAsync(request)
            : await remove.mutateAsync({
                surface: request.surface,
                commandId: request.commandId,
                problemSlug: intent.problemSlugs[0]!,
              })
      if (result.status !== 'durable' || result.syncMetadataPending) {
        setSavingPending(true)
        return
      }
      setSavingPending(false)
      setIntent(null)
      intent.onDurable?.()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Problem action failed.',
      )
    }
  }
  const count = intent?.problemSlugs.length ?? 0
  const resetIntent = intent?.kind === 'reset'
  return {
    pending: pending || savingPending,
    begin(next: Intent) {
      if (intent) return
      commandId.current = null
      setError(null)
      setSavingPending(false)
      setIntent({ ...next, problemSlugs: [...next.problemSlugs] })
    },
    dialog: intent ? (
      <ProblemConfirmationDialog
        confirmLabel={
          resetIntent
            ? 'Reset problem'
            : intent.bulk
              ? 'Delete Problems'
              : 'Delete Problem'
        }
        title={
          intent.bulk
            ? resetIntent
              ? 'Reset selected problems?'
              : 'Delete selected problems?'
            : resetIntent
              ? 'Reset problem?'
              : 'Delete problem?'
        }
        description={
          resetIntent
            ? intent.bulk
              ? `This clears notes, submission history, saved AI, practice history, and schedules for ${count} selected ${count === 1 ? 'problem' : 'problems'}.`
              : 'This clears notes, submission history, saved AI, practice history, and the schedule for this problem. The problem and its track placements are kept.'
            : intent.bulk
              ? `This permanently deletes ${count} selected problems, their track placements, notes, submission history, saved AI, practice history, and schedules.`
              : 'This permanently deletes this problem, its track placements, notes, submission history, saved AI, practice history, and schedule.'
        }
        onCancel={() => setIntent(null)}
        onConfirm={() => {
          void confirm()
        }}
        error={error}
        savingPending={savingPending}
        pending={pending}
      />
    ) : null,
  }
}
export type ProblemDataConfirmation = ReturnType<
  typeof useProblemDataConfirmation
>
