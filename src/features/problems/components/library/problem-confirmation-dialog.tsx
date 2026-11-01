import { Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'

export function ProblemConfirmationDialog({
  confirmLabel,
  savingPending = false,
  error,
  description,
  onCancel,
  onConfirm,
  pending,
  title,
}: {
  confirmLabel: string
  savingPending?: boolean
  error?: string | null
  description: string
  onCancel: () => void
  onConfirm: () => void
  pending: boolean
  title: string
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = `problem-confirmation-${title.toLowerCase().replace(/\W+/g, '-')}`
  const descriptionId = `${titleId}-description`

  useEffect(() => {
    cancelButtonRef.current?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/75 p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !pending && !savingPending) {
          onCancel()
        }
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
          if (!pending && !savingPending) {
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
        className="grid w-full max-w-md gap-4 rounded-[var(--cp-panel-radius)] border border-border bg-card p-[var(--cp-panel-padding)] text-card-foreground shadow-surface"
        role="dialog"
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
        {savingPending ? (
          <p role="status">
            Saving is incomplete. Retry saving, or open Settings → Data
            Management to recover.
          </p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            disabled={pending || savingPending}
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
            {savingPending ? 'Retry saving' : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  )
}
