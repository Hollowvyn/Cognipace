import { Link, useNavigate } from '@tanstack/react-router'
import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

import { Button } from '@/components/ui/button'
import { Surface } from '@/components/ui/surface'
import type { DashboardModalClosePath } from '@/app/dashboard/navigation/route-manifest'
import { cn } from '@/utils/cn'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function RouteModal({
  children,
  closeLabel = 'Close',
  closeTo,
  description,
  dismissDisabled = false,
  eyebrow,
  showCloseButton = true,
  variant = 'default',
  title,
}: {
  children?: ReactNode
  closeLabel?: string
  closeTo: DashboardModalClosePath
  description?: string | undefined
  dismissDisabled?: boolean
  eyebrow?: ReactNode
  showCloseButton?: boolean
  title: string
  variant?: 'default' | 'form'
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const titleId = `dashboard-modal-${title.toLowerCase().replace(/\s+/g, '-')}`
  const descriptionId = `${titleId}-description`
  const isFormVariant = variant === 'form'

  const closeModal = useCallback(() => {
    if (dismissDisabled) return
    void navigate({ to: closeTo, replace: true })
  }, [closeTo, dismissDisabled, navigate])

  useEffect(() => {
    function replaceModalRouteBeforeUnload() {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}#${closeTo}`,
      )
    }

    window.addEventListener('beforeunload', replaceModalRouteBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', replaceModalRouteBeforeUnload)
    }
  }, [closeTo])

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const dialog = dialogRef.current
    const firstFocusable = dialog ? getFocusableElements(dialog)[0] : undefined
    const initialFocusTarget = firstFocusable ?? dialog

    initialFocusTarget?.focus()

    return () => {
      previouslyFocused?.focus()
    }
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeModal()
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

  function handleBackdropPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return
    }

    closeModal()
  }

  return (
    <div
      className="fixed inset-0 z-[var(--cp-z-dialog)] flex items-start justify-center overflow-y-auto overscroll-contain bg-background/75 p-4 pt-16 backdrop-blur-sm sm:items-center sm:pt-4"
      onKeyDown={handleKeyDown}
      onPointerDown={handleBackdropPointerDown}
    >
      <Surface
        asChild
        className={cn(
          'w-full shadow-overlay',
          isFormVariant
            ? 'flex max-h-[calc(100vh-5rem)] max-w-[46rem] flex-col overflow-hidden p-0 sm:max-h-[calc(100vh-2rem)]'
            : 'max-w-lg',
        )}
      >
        <div
          aria-describedby={description ? descriptionId : undefined}
          aria-labelledby={titleId}
          className={cn(isFormVariant && 'flex min-h-0 flex-col')}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <div
            className={cn(
              'flex min-w-0 items-start justify-between gap-4',
              isFormVariant &&
                'border-b border-border px-[var(--cp-panel-padding)] py-5',
            )}
          >
            <div className="min-w-0">
              {eyebrow ? (
                <p className="m-0 text-[length:var(--cp-kicker-font-size)] font-bold uppercase leading-none text-muted-foreground">
                  {eyebrow}
                </p>
              ) : null}
              <h2
                className={cn(
                  'text-[length:var(--cp-title-font-size)] font-bold leading-tight text-foreground',
                  eyebrow && 'mt-1',
                )}
                id={titleId}
              >
                {title}
              </h2>
            </div>
            {showCloseButton ? (
              dismissDisabled ? (
                <Button disabled size="sm" variant="outline">
                  {closeLabel}
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link replace to={closeTo}>
                    {closeLabel}
                  </Link>
                </Button>
              )
            ) : null}
          </div>
          {description ? (
            <p
              className={cn(
                'text-[length:var(--cp-copy-font-size)] leading-relaxed text-muted-foreground',
                isFormVariant
                  ? 'm-0 px-[var(--cp-panel-padding)] pt-[var(--cp-panel-padding)]'
                  : 'mt-3',
              )}
              id={descriptionId}
            >
              {description}
            </p>
          ) : null}
          {children ? (
            <div
              aria-label={isFormVariant ? 'Modal content' : undefined}
              role={isFormVariant ? 'region' : undefined}
              className={cn(
                'text-[length:var(--cp-copy-font-size)] leading-relaxed text-muted-foreground',
                isFormVariant
                  ? 'min-h-0 overflow-y-auto px-[var(--cp-panel-padding)] pt-[var(--cp-panel-padding)]'
                  : 'mt-4',
              )}
            >
              {children}
            </div>
          ) : null}
        </div>
      </Surface>
    </div>
  )
}

function getFocusableElements(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((candidate) => !candidate.hasAttribute('disabled'))
    .filter((candidate) => candidate.getAttribute('aria-hidden') !== 'true')
    .filter((candidate) => candidate.tabIndex >= 0)
}
