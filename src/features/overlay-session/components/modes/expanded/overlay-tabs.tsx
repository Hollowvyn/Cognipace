import { useRef, type KeyboardEvent } from 'react'

import { cn } from '@/utils/cn'

import type { OverlayExpandedTab } from '../../../domain'

type OverlayTabsProps = {
  activeTab: OverlayExpandedTab
  idPrefix: string
  onSelectTab: (tab: OverlayExpandedTab) => void
  aiStatus: string | null
  solveStatus: string | null
}

const tabs = [
  { id: 'solve', label: 'Solve' },
  { id: 'ai', label: 'AI' },
  { id: 'notes', label: 'Notes' },
] as const

export function OverlayTabs({
  activeTab,
  idPrefix,
  onSelectTab,
  aiStatus,
  solveStatus,
}: OverlayTabsProps) {
  const refs = useRef<Record<OverlayExpandedTab, HTMLButtonElement | null>>({
    solve: null,
    ai: null,
    notes: null,
  })

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number

    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % tabs.length
        break
      case 'ArrowLeft':
        next = (index + tabs.length - 1) % tabs.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = tabs.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    const id = tabs[next]!.id
    onSelectTab(id)
    refs.current[id]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Overlay sections"
      className="grid shrink-0 grid-cols-3 border-b border-border"
    >
      {tabs.map(({ id, label }, index) => {
        const selected = activeTab === id
        const status =
          id === 'solve' ? solveStatus : id === 'ai' ? aiStatus : null

        return (
          <button
            key={id}
            type="button"
            role="tab"
            ref={(element) => {
              refs.current[id] = element
            }}
            id={`${idPrefix}-${id}-tab`}
            aria-controls={`${idPrefix}-${id}-panel`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelectTab(id)}
            onKeyDown={(event) => moveFocus(event, index)}
            className={cn(
              'min-w-0 border-b-2 px-2 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              selected
                ? 'border-primary bg-primary/5 font-semibold text-primary'
                : 'border-transparent text-muted-foreground hover:bg-muted',
            )}
          >
            <span>{label}</span>
            {status ? (
              <span className="ml-1 text-[0.62rem]">{status}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
