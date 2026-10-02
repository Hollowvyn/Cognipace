import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { useModalFocus } from '@/components/ui/use-modal-focus'

export function TrackConfirmationDialog({
  confirmLabel,
  description,
  error,
  onCancel,
  onConfirm,
  pending,
  title,
}: {
  confirmLabel: string
  description: string
  error?: ReactNode | undefined
  onCancel: () => void
  onConfirm: () => void
  pending: boolean
  title: string
}) {
  const { cancelButtonRef, dialogRef, handleKeyDown } = useModalFocus({
    onCancel,
    pending,
  })
  const titleId = `track-confirmation-${title.toLowerCase().replace(/\W+/g, '-')}`
  const descriptionId = `${titleId}-description`
  const errorId = `${titleId}-error`

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
        aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
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
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            disabled={pending}
            onClick={onCancel}
            ref={cancelButtonRef}
            size="sm"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={onConfirm}
            size="sm"
            variant="destructive"
          >
            {pending ? (
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
