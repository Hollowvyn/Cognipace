import { useEffect, useRef, type KeyboardEvent } from 'react'

export function useModalFocus({
  onCancel,
  pending,
}: {
  onCancel: () => void
  pending: boolean
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    cancelButtonRef.current?.focus()

    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  useEffect(() => {
    if (pending) dialogRef.current?.focus()
  }, [pending])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !pending) {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    const focusableElements = dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
          .filter((candidate) => !candidate.matches(':disabled'))
          .filter(
            (candidate) => candidate.getAttribute('aria-hidden') !== 'true',
          )
          .filter((candidate) => candidate.tabIndex >= 0)
      : []
    const firstElement = focusableElements[0]
    const lastElement = focusableElements.at(-1)

    if (!firstElement || !lastElement) {
      event.preventDefault()
      dialog?.focus()
      return
    }

    if (document.activeElement === dialog) {
      event.preventDefault()
      const target = event.shiftKey ? lastElement : firstElement
      target.focus()
    } else if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return { cancelButtonRef, dialogRef, handleKeyDown }
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')
