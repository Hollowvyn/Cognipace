import { ChevronDown } from 'lucide-react'
import { useId, useLayoutEffect, useRef, type KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'

import type { TrackFormGroupState } from '../hooks/use-track-form'

export function TrackQuestionGroupMenu({
  destinations,
  isOpen,
  onMove,
  onOpenChange,
  title,
}: {
  destinations: readonly TrackFormGroupState[]
  isOpen: boolean
  onMove: (groupKey: string) => void
  onOpenChange: (open: boolean) => void
  title: string
}) {
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!isOpen) return
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return

    function positionMenu() {
      if (!trigger || !menu) return
      const triggerBounds = trigger.getBoundingClientRect()
      const dialogBounds = trigger
        .closest('[role="dialog"]')
        ?.getBoundingClientRect()
      const viewport = window.visualViewport
      const viewportLeft = viewport?.offsetLeft ?? 0
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportRight =
        viewportLeft + (viewport?.width ?? window.innerWidth)
      const viewportBottom =
        viewportTop + (viewport?.height ?? window.innerHeight)
      const leftBoundary =
        Math.max(viewportLeft, dialogBounds?.left ?? viewportLeft) + 8
      const rightBoundary =
        Math.min(viewportRight, dialogBounds?.right ?? viewportRight) - 8
      const topBoundary =
        Math.max(viewportTop, dialogBounds?.top ?? viewportTop) + 8
      const bottomBoundary =
        Math.min(viewportBottom, dialogBounds?.bottom ?? viewportBottom) - 8
      const width = Math.max(0, Math.min(288, rightBoundary - leftBoundary))
      menu.style.width = `${width}px`
      const naturalHeight = Math.min(320, menu.scrollHeight)
      const belowSpace = Math.max(0, bottomBoundary - triggerBounds.bottom - 6)
      const aboveSpace = Math.max(0, triggerBounds.top - topBoundary - 6)
      const placeAbove = belowSpace < naturalHeight && aboveSpace > belowSpace
      const maxHeight = Math.min(
        320,
        Math.max(0, bottomBoundary - topBoundary),
        placeAbove ? aboveSpace : belowSpace,
      )
      const height = Math.min(menu.scrollHeight, maxHeight)
      menu.style.maxHeight = `${maxHeight}px`
      menu.style.left = `${Math.max(leftBoundary, Math.min(triggerBounds.right - width, rightBoundary - width))}px`
      const desiredTop = placeAbove
        ? triggerBounds.top - height - 6
        : triggerBounds.bottom + 6
      menu.style.top = `${Math.max(topBoundary, Math.min(desiredTop, Math.max(topBoundary, bottomBoundary - height)))}px`
    }

    function dismissOutside(event: Event) {
      const target = event.target
      if (
        target instanceof Node &&
        !menu?.contains(target) &&
        !trigger?.contains(target)
      )
        onOpenChange(false)
    }

    positionMenu()
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    window.visualViewport?.addEventListener('resize', positionMenu)
    window.visualViewport?.addEventListener('scroll', positionMenu)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
      window.visualViewport?.removeEventListener('resize', positionMenu)
      window.visualViewport?.removeEventListener('scroll', positionMenu)
    }
  }, [isOpen, onOpenChange])

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onOpenChange(false)
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'Tab') {
      onOpenChange(false)
      triggerRef.current?.focus()
      return
    }
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ) ?? [],
    )
    const currentIndex = items.findIndex(
      (item) => item === document.activeElement,
    )
    let nextIndex: number
    switch (event.key) {
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % items.length
        break
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + items.length) % items.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = items.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    items[nextIndex]?.focus()
  }

  return (
    <>
      <Button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`Change group for ${title}`}
        onClick={() => onOpenChange(!isOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            onOpenChange(true)
          }
        }}
        ref={triggerRef}
        size="sm"
        type="button"
        variant="outline"
      >
        Change
        <ChevronDown aria-hidden="true" className="size-3" />
      </Button>
      {isOpen ? (
        <div
          aria-label={`Move ${title} to group`}
          className="fixed z-50 grid overflow-y-auto overscroll-contain rounded-[var(--cp-control-radius)] border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          id={menuId}
          onKeyDown={handleMenuKeyDown}
          ref={menuRef}
          role="menu"
        >
          {destinations.map((group) => (
            <button
              className="min-w-0 whitespace-normal break-words rounded-[var(--cp-control-radius)] px-3 py-2 text-left text-[length:var(--cp-control-font-size)] hover:bg-muted focus:bg-muted focus:outline-none"
              key={group.key}
              onClick={() => onMove(group.key)}
              role="menuitem"
              tabIndex={-1}
              type="button"
            >
              {group.title.trim() || 'Untitled group'}
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}
