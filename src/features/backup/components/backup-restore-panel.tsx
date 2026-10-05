import { Check, Download, Loader2, Upload } from 'lucide-react'
import {
  useEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { Surface } from '@/components/ui/surface'
import type { Tone } from '@/components/ui/types'
import { formatDateTime } from '@/utils/date-format'

import type { BackupSummary } from '../api/backup-contracts'

interface BackupRestorePanelProps {
  backup: unknown
  error: string | null
  isExporting: boolean
  isRestoring: boolean
  isReplacementPending: boolean
  isValidating: boolean
  onExport: () => void
  onFileSelect: (file: File) => void
  onOpenRestoreDialog: () => void
  selectedFileName: string | null
  summary: BackupSummary | null
}

export function BackupRestorePanel({
  backup,
  error,
  isExporting,
  isRestoring,
  isReplacementPending,
  isValidating,
  onExport,
  onFileSelect,
  onOpenRestoreDialog,
  selectedFileName,
  summary,
}: BackupRestorePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileStatusId = 'backup-import-file-status'

  return (
    <Surface aria-labelledby="backup-restore-title" className="grid gap-4">
      <header className="grid gap-1">
        <h2
          className="m-0 text-[length:var(--cp-title-font-size)] font-bold leading-tight"
          id="backup-restore-title"
        >
          Export backup
        </h2>
        <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
          Save or restore a complete local CogniPace backup.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={isExporting || isReplacementPending}
          onClick={onExport}
          size="sm"
        >
          {isExporting ? (
            <Loader2
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Download aria-hidden="true" />
          )}
          Export backup
        </Button>
      </div>

      <div className="grid gap-2">
        <h3 className="m-0 text-[length:var(--cp-copy-font-size)] font-bold">
          Import full backup
        </h3>
        <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-[var(--cp-control-radius)] border border-border bg-background px-3 py-2">
          <input
            accept="application/json,.json"
            aria-describedby={fileStatusId}
            aria-label="Backup file"
            className="sr-only"
            disabled={isValidating || isRestoring || isReplacementPending}
            id="backup-import-file"
            onChange={handleFileChange(onFileSelect)}
            ref={fileInputRef}
            type="file"
          />
          <Button
            disabled={isValidating || isRestoring || isReplacementPending}
            onClick={() => {
              fileInputRef.current?.click()
            }}
            size="sm"
            variant="outline"
          >
            {isValidating ? (
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Upload aria-hidden="true" />
            )}
            Choose backup file
          </Button>
          <p
            className="m-0 min-w-0 flex-1 truncate text-[length:var(--cp-copy-font-size)] text-muted-foreground"
            id={fileStatusId}
          >
            {selectedFileName ?? 'No backup file selected'}
          </p>
        </div>
      </div>

      {error ? (
        <InlineStatus role="alert" tone="danger">
          {error}
        </InlineStatus>
      ) : null}
      {isValidating ? <InlineStatus>Validating backup…</InlineStatus> : null}
      {summary ? <BackupSummaryList summary={summary} /> : null}

      {summary ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={
              !backup || isRestoring || isValidating || isReplacementPending
            }
            onClick={onOpenRestoreDialog}
            size="sm"
            variant="outline"
          >
            {isRestoring ? (
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Upload aria-hidden="true" />
            )}
            Restore full backup
          </Button>
        </div>
      ) : null}
    </Surface>
  )
}

export function BackupSummaryList({ summary }: { summary: BackupSummary }) {
  const metadataItems: Array<[string, string]> = [
    ['Schema version', String(summary.schemaVersion)],
    ['Exported', formatDateTime(summary.exportedAt)],
  ]
  if (summary.source.appVersion) {
    metadataItems.push(['App version', summary.source.appVersion])
  }
  if (summary.source.extensionVersion) {
    metadataItems.push(['Extension version', summary.source.extensionVersion])
  }
  const items: Array<[string, number]> = [
    ['Problems', summary.counts.problems],
    ['Topics', summary.counts.topics],
    ['Companies', summary.counts.companies],
    ['Tracks', summary.counts.tracks],
    ['Track groups', summary.counts.trackGroups],
    ['Practice rows', summary.counts.problemPractice],
    ['FSRS cards', summary.counts.fsrsCards],
    ['Review attempts', summary.counts.reviewAttempts],
    ['Settings', summary.counts.settings],
  ]

  return (
    <div className="grid gap-3">
      <dl className="grid grid-cols-1 gap-2 text-[length:var(--cp-copy-font-size)] sm:grid-cols-2 lg:grid-cols-3">
        {metadataItems.map(([label, value]) => (
          <div
            className="rounded-[var(--cp-radius-md)] border border-border bg-background px-3 py-2"
            key={label}
          >
            <dt className="sr-only">{label}</dt>
            <dd className="m-0 font-semibold tabular-nums">
              {label}: {value}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="grid grid-cols-1 gap-2 text-[length:var(--cp-copy-font-size)] sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([label, value]) => (
          <div
            className="rounded-[var(--cp-radius-md)] border border-border bg-muted px-3 py-2"
            key={label}
          >
            <dt className="sr-only">{label}</dt>
            <dd className="m-0 font-semibold tabular-nums">
              {label}: {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function handleFileChange(onFileSelect: (file: File) => void) {
  return (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''

    if (file) {
      onFileSelect(file)
    }
  }
}

export function BackupConfirmationDialog({
  confirmLabel,
  description,
  error,
  isPending,
  onSecondaryAction,
  onCancel,
  onConfirm,
  secondaryActionLabel,
  secondaryActionPending = false,
  secondaryActionTone,
  status,
  title,
}: {
  confirmLabel: string
  description: string
  error?: ReactNode | undefined
  isPending: boolean
  onSecondaryAction?: (() => void) | undefined
  onCancel: () => void
  onConfirm: () => void
  secondaryActionLabel?: string | undefined
  secondaryActionPending?: boolean | undefined
  secondaryActionTone?: Extract<Tone, 'success'> | undefined
  status?: ReactNode | undefined
  title: string
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = `backup-confirmation-${title.toLowerCase().replace(/\W+/g, '-')}`
  const descriptionId = `${titleId}-description`
  const errorId = `${titleId}-error`
  const statusId = `${titleId}-status`
  const isDialogPending = isPending || secondaryActionPending
  const describedBy = [
    descriptionId,
    status ? statusId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(' ')

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
    if (isDialogPending) {
      dialogRef.current?.focus()
    }
  }, [isDialogPending])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !isDialogPending) {
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
          if (!isDialogPending) {
            onCancel()
          }
        }
      }}
    >
      <section
        aria-busy={isDialogPending || undefined}
        aria-describedby={describedBy}
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
          <p
            className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground"
            id={descriptionId}
          >
            {description}
          </p>
        </div>
        {error ? (
          <InlineStatus id={errorId} role="alert" tone="danger">
            {error}
          </InlineStatus>
        ) : null}
        {status ? <InlineStatus id={statusId}>{status}</InlineStatus> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            disabled={isDialogPending}
            onClick={onCancel}
            ref={cancelButtonRef}
            size="sm"
            variant="ghost"
          >
            Cancel
          </Button>
          {onSecondaryAction && secondaryActionLabel ? (
            <Button
              className={
                secondaryActionTone
                  ? 'border-[color:var(--cp-tone-border)] bg-[var(--cp-tone-bg)] text-[color:var(--cp-tone-fg)] hover:bg-[color:var(--cp-tone-bg)] hover:text-[color:var(--cp-tone-fg)]'
                  : undefined
              }
              data-cp-tone={secondaryActionTone}
              disabled={isDialogPending}
              onClick={onSecondaryAction}
              size="sm"
              variant="outline"
            >
              {secondaryActionPending ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : secondaryActionTone === 'success' ? (
                <Check aria-hidden="true" />
              ) : (
                <Download aria-hidden="true" />
              )}
              {secondaryActionLabel}
            </Button>
          ) : null}
          <Button
            disabled={isDialogPending}
            onClick={onConfirm}
            size="sm"
            variant="destructive"
          >
            {isPending ? (
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  )
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
