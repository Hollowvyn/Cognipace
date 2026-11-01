import type { BackupRestorePreview } from '@/features/backup/api/backup-contracts'
import { CloudDownload, CloudUpload, Loader2 } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

import { Button, type ButtonProps } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { readErrorMessage } from '@/utils/errors'

import type { SyncActionResult } from '../api/sync-contracts'

export type SyncDialogTone = 'danger' | 'neutral' | 'success' | 'warning'

export type SyncDialogState =
  | {
      message: string
      type: 'force-pull'
      preview?: BackupRestorePreview
    }
  | {
      message: string
      type: 'force-push'
    }
  | {
      message: string
      title: string
      tone: SyncDialogTone
      type: 'result'
    }

export function SyncActionDialog({
  confirmIcon,
  confirmLabel,
  confirmVariant = 'primary',
  description,
  onCancel,
  onConfirm,
  pending = false,
  title,
  tone = 'neutral',
}: {
  confirmIcon?: ReactNode | undefined
  confirmLabel?: string | undefined
  confirmVariant?: ButtonProps['variant'] | undefined
  description: string
  onCancel: () => void
  onConfirm?: (() => void) | undefined
  pending?: boolean | undefined
  title: string
  tone?: SyncDialogTone | undefined
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = `sync-action-${title.toLowerCase().replace(/\W+/g, '-')}`
  const descriptionId = `${titleId}-description`
  const hasConfirmAction = Boolean(onConfirm && confirmLabel)

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const dialog = dialogRef.current
    const initialFocusTarget =
      cancelButtonRef.current ??
      (dialog ? getFocusableElements(dialog)[0] : null)

    initialFocusTarget?.focus()

    return () => {
      previouslyFocused?.focus()
    }
  }, [])

  useEffect(() => {
    if (pending) {
      dialogRef.current?.focus()
    }
  }, [pending])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !pending) {
      event.preventDefault()
      onCancel()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    const dialog = dialogRef.current
    const focusableElements = dialog ? getFocusableElements(dialog) : []

    if (focusableElements.length === 0) {
      event.preventDefault()
      dialog?.focus()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (!firstElement || !lastElement) {
      return
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
      return
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/75 p-4"
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
          if (!pending) {
            onCancel()
          }
        }
      }}
    >
      <section
        aria-busy={pending || undefined}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="grid w-full max-w-md gap-4 rounded-[var(--cp-panel-radius)] border border-border bg-card p-[var(--cp-panel-padding)] text-card-foreground shadow-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="grid gap-2">
          <h2
            className="m-0 text-[length:var(--cp-title-font-size)] font-bold leading-tight"
            id={titleId}
          >
            {title}
          </h2>
          <InlineStatus
            id={descriptionId}
            role={tone === 'danger' ? 'alert' : 'status'}
            tone={tone}
          >
            {description}
          </InlineStatus>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            disabled={pending}
            onClick={onCancel}
            ref={cancelButtonRef}
            size="sm"
            variant="ghost"
          >
            {hasConfirmAction ? 'Cancel' : 'Close'}
          </Button>
          {hasConfirmAction ? (
            <Button
              disabled={pending}
              onClick={onConfirm}
              size="sm"
              variant={confirmVariant}
            >
              {pending ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                confirmIcon
              )}
              {confirmLabel}
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  )
}

export function SyncActionDialogForState({
  dialog,
  isPending,
  onClose,
  onForcePull,
  onForcePush,
}: {
  dialog: SyncDialogState
  isPending: boolean
  onClose: () => void
  onForcePull: (preview?: BackupRestorePreview) => void
  onForcePush: () => void
}) {
  if (dialog.type === 'force-pull') {
    return (
      <SyncActionDialog
        confirmIcon={<CloudDownload aria-hidden="true" />}
        confirmLabel="Force pull"
        confirmVariant="destructive"
        description={`${dialog.message} ${dialog.preview ? `Selected backup version ${dialog.preview.sourceSchemaVersion}: ${dialog.preview.counts.problems} problems, ${dialog.preview.counts.notes} problem notes, ${dialog.preview.counts.submissions} submissions, ${dialog.preview.counts.assessments} assessments, ${dialog.preview.counts.savedAiInclusions} saved AI notes. ${dialog.preview.archiveAbsent ? 'This older backup contains no Notes archive. Restoring removes all current problem notes, submission history, and saved AI notes. Export a full backup first to keep them.' : ''}` : ''} Force pull will replace this browser's local data with the Gist copy.`}
        onCancel={onClose}
        onConfirm={() => onForcePull(dialog.preview)}
        pending={isPending}
        title="Force pull from Gist"
        tone="warning"
      />
    )
  }

  if (dialog.type === 'force-push') {
    return (
      <SyncActionDialog
        confirmIcon={<CloudUpload aria-hidden="true" />}
        confirmLabel="Force push"
        confirmVariant="destructive"
        description={`${dialog.message} Force push will replace the Gist with this browser's local data.`}
        onCancel={onClose}
        onConfirm={onForcePush}
        pending={isPending}
        title="Force push to Gist"
        tone="warning"
      />
    )
  }

  return (
    <SyncActionDialog
      description={dialog.message}
      onCancel={onClose}
      pending={isPending}
      title={dialog.title}
      tone={dialog.tone}
    />
  )
}

export function createSyncActionDialogState(
  result: SyncActionResult | null | undefined | void,
  fallbackMessage: string,
): SyncDialogState {
  if (
    result?.action === 'pull-latest' &&
    result.outcome === 'confirmation-required' &&
    result.restorePreview
  ) {
    return {
      type: 'force-pull',
      message: result.message,
      preview: result.restorePreview,
    }
  }

  if (
    result?.action === 'pull-latest' &&
    result.outcome === 'blocked' &&
    result.reason === 'local-dirty'
  ) {
    return {
      type: 'force-pull',
      message: result.message,
    }
  }

  if (
    result?.action === 'push-local' &&
    result.outcome === 'confirmation-required' &&
    result.reason === 'remote-changed'
  ) {
    return {
      type: 'force-push',
      message: result.message,
    }
  }

  return {
    type: 'result',
    title: readDialogTitle(result),
    message: result?.message || fallbackMessage,
    tone: readDialogTone(result),
  }
}

export function createSyncErrorDialogState(
  error: unknown,
  fallbackMessage: string,
): SyncDialogState {
  return {
    type: 'result',
    title: 'Sync action failed',
    message: readErrorMessage(error, fallbackMessage),
    tone: 'danger',
  }
}

function readDialogTitle(
  result: SyncActionResult | null | undefined | void,
): string {
  if (result?.outcome === 'error') {
    return 'Sync action failed'
  }

  if (result?.outcome === 'blocked') {
    return 'Sync blocked'
  }

  if (result?.action === 'pull-latest') {
    return 'Pull complete'
  }

  if (result?.action === 'push-local') {
    return 'Push complete'
  }

  return 'GitHub sync updated'
}

function readDialogTone(
  result: SyncActionResult | null | undefined | void,
): SyncDialogTone {
  if (result?.outcome === 'error') {
    return 'danger'
  }

  if (
    result?.outcome === 'blocked' ||
    result?.outcome === 'confirmation-required'
  ) {
    return 'warning'
  }

  return 'success'
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((candidate) => !candidate.hasAttribute('disabled'))
    .filter((candidate) => candidate.getAttribute('aria-hidden') !== 'true')
    .filter((candidate) => candidate.tabIndex >= 0)
}
