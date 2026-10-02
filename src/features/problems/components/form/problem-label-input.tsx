import { ChevronDown, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { Badge } from '@/components/ui/badge'
import { IconButton } from '@/components/ui/icon-button'
import { cn } from '@/utils/cn'

import {
  normalizeProblemLabel,
  normalizeProblemLabelList,
} from './use-problem-form'

export interface ProblemLabelOption {
  id: string
  label: string
}

export function ProblemLabelInput({
  itemName,
  label,
  labels,
  onChange,
  options,
}: {
  itemName: 'company' | 'topic'
  label: 'Companies' | 'Topics'
  labels: readonly string[]
  onChange: (labels: string[]) => void
  options: readonly ProblemLabelOption[]
}) {
  const inputId = useId()
  const labelId = `${inputId}-label`
  const listboxId = `${inputId}-listbox`
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const normalizedDraft = normalizeProblemLabel(draft)
  const selectedLabelKeys = new Set(
    labels.map((currentLabel) => currentLabel.toLowerCase()),
  )
  const visibleOptions = filterOptions(
    options.filter(
      (option) => !selectedLabelKeys.has(option.label.toLowerCase()),
    ),
    normalizedDraft.toLowerCase(),
  )
  const canAddDraft =
    normalizedDraft.length > 0 &&
    visibleOptions.length === 0 &&
    !selectedLabelKeys.has(readCanonicalLabel(draft, options).toLowerCase())
  const optionCount = visibleOptions.length + (canAddDraft ? 1 : 0)
  const activeOptionIndex =
    activeIndex === null || optionCount === 0
      ? null
      : Math.min(activeIndex, optionCount - 1)
  const activeOptionId =
    isOpen && activeOptionIndex !== null
      ? `${listboxId}-option-${activeOptionIndex}`
      : undefined

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  function addLabel(nextLabel: string) {
    const normalizedLabel = normalizeProblemLabel(nextLabel)

    if (!normalizedLabel) {
      return
    }

    onChange(normalizeProblemLabelList([...labels, normalizedLabel]))
    setDraft('')
    setIsOpen(false)
    inputRef.current?.focus()
  }

  function removeLabel(labelToRemove: string) {
    onChange(labels.filter((currentLabel) => currentLabel !== labelToRemove))
    inputRef.current?.focus()
  }

  function commitDraft() {
    if (isOpen && activeOptionIndex !== null) {
      selectOption(activeOptionIndex)
      return
    }

    const nextLabel =
      visibleOptions[0]?.label ??
      (canAddDraft ? readCanonicalLabel(draft, options) : '')

    if (nextLabel) {
      addLabel(nextLabel)
    }
  }

  function selectOption(index: number) {
    const option = visibleOptions[index]

    if (option) {
      addLabel(option.label)
      return
    }

    if (canAddDraft && index === visibleOptions.length) {
      commitCreatedLabel()
    }
  }

  function commitCreatedLabel() {
    const nextLabel = readCanonicalLabel(draft, options)

    if (nextLabel) {
      addLabel(nextLabel)
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
      return
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      event.stopPropagation()
      setIsOpen(false)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((current) =>
        optionCount === 0
          ? null
          : current === null
            ? 0
            : (current + 1) % optionCount,
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((current) =>
        optionCount === 0
          ? null
          : current === null
            ? optionCount - 1
            : (current - 1 + optionCount) % optionCount,
      )
      return
    }

    if (event.key === 'Backspace' && draft.length === 0) {
      const lastLabel = labels.at(-1)

      if (lastLabel) {
        removeLabel(lastLabel)
      }
    }
  }

  return (
    <div className="relative pt-2">
      <label
        className="absolute left-3 top-0 z-10 max-w-[calc(100%-1.5rem)] truncate bg-card px-1 text-[length:var(--cp-badge-font-size)] font-semibold leading-none text-muted-foreground"
        htmlFor={inputId}
        id={labelId}
      >
        {label}
      </label>
      <div className="relative" ref={rootRef}>
        <div
          className={cn(
            'flex min-h-[var(--cp-control-height-lg)] min-w-0 items-center gap-2 rounded-[var(--cp-control-radius)] border border-border bg-background px-2 py-1 text-[length:var(--cp-control-font-size)] text-foreground transition-[border-color,box-shadow]',
            'focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
          )}
          onClick={() => inputRef.current?.focus()}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {labels.map((currentLabel) => (
              <Badge
                className="min-h-7 gap-1 rounded-full pr-1"
                key={currentLabel}
                tone={itemName === 'company' ? 'warning' : 'info'}
                variant="outline"
              >
                <span className="max-w-44 truncate text-left leading-tight">
                  {currentLabel}
                </span>
                <IconButton
                  label={`Remove ${itemName} ${currentLabel}`}
                  className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-none bg-transparent hover:bg-transparent"
                  onClick={(event) => {
                    event.stopPropagation()
                    removeLabel(currentLabel)
                  }}
                  size="icon"
                  type="button"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </IconButton>
              </Badge>
            ))}
            <input
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              aria-controls={listboxId}
              aria-expanded={isOpen}
              aria-labelledby={labelId}
              autoComplete="off"
              className="min-h-8 min-w-32 flex-1 border-0 bg-transparent px-1 text-[length:var(--cp-control-font-size)] text-foreground outline-none placeholder:text-muted-foreground"
              id={inputId}
              name={
                itemName === 'topic' ? 'problem-topics' : 'problem-companies'
              }
              onChange={(event) => {
                setDraft(event.target.value)
                setIsOpen(true)
                setActiveIndex(null)
              }}
              onFocus={() => setIsOpen(true)}
              onClick={() => setIsOpen(true)}
              onKeyDown={handleInputKeyDown}
              placeholder={
                labels.length > 0 ? '' : `Choose ${label.toLowerCase()}...`
              }
              ref={inputRef}
              value={draft}
            />
          </div>
          {labels.length > 0 ? (
            <IconButton
              label={`Clear ${label.toLowerCase()}`}
              tooltip={`Clear ${label.toLowerCase()}`}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-none bg-transparent hover:bg-transparent"
              onClick={(event) => {
                event.stopPropagation()
                onChange([])
                inputRef.current?.focus()
              }}
              size="icon"
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </IconButton>
          ) : null}
          <IconButton
            label={`${isOpen ? 'Close' : 'Open'} ${label.toLowerCase()} options`}
            tooltip={`${isOpen ? 'Close' : 'Open'} ${label.toLowerCase()} options`}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-none bg-transparent hover:bg-transparent"
            onClick={(event) => {
              event.stopPropagation()
              setIsOpen((current) => !current)
              inputRef.current?.focus()
            }}
            size="icon"
            type="button"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-4 transition-transform',
                isOpen && 'rotate-180',
              )}
            />
          </IconButton>
        </div>

        {isOpen ? (
          <div
            aria-label={`${label} options`}
            className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-30 grid max-h-64 overflow-y-auto rounded-[var(--cp-control-radius)] border border-border bg-popover p-1 text-[length:var(--cp-control-font-size)] text-popover-foreground shadow-lg"
            id={listboxId}
            role="listbox"
          >
            {visibleOptions.map((option, index) => {
              const active = activeOptionIndex === index

              return (
                <button
                  aria-selected={false}
                  className={optionClassName(active)}
                  id={`${listboxId}-option-${index}`}
                  key={option.id}
                  onClick={() => addLabel(option.label)}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                  type="button"
                >
                  <OptionCheck />
                  <span className="min-w-0 truncate">{option.label}</span>
                </button>
              )
            })}
            {canAddDraft ? (
              <button
                aria-selected={false}
                className={optionClassName(
                  activeOptionIndex === visibleOptions.length,
                )}
                id={`${listboxId}-option-${visibleOptions.length}`}
                onClick={() => commitCreatedLabel()}
                onMouseEnter={() => setActiveIndex(visibleOptions.length)}
                role="option"
                type="button"
              >
                <OptionCheck />
                <span className="min-w-0 truncate">
                  Create "{normalizedDraft}"
                </span>
              </button>
            ) : null}
            {visibleOptions.length === 0 && !canAddDraft ? (
              <p className="m-0 px-2 py-2 text-muted-foreground">
                No matching labels.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function filterOptions(
  options: readonly ProblemLabelOption[],
  normalizedDraftKey: string,
) {
  if (!normalizedDraftKey) {
    return options
  }

  return options.filter((option) =>
    option.label.toLowerCase().includes(normalizedDraftKey),
  )
}

function optionClassName(active: boolean) {
  return cn(
    'flex min-h-9 w-full min-w-0 items-center gap-2 rounded-[calc(var(--cp-control-radius)-2px)] px-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active && 'bg-muted text-foreground',
  )
}

function OptionCheck() {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded border border-border text-primary',
        'opacity-60',
      )}
    />
  )
}

function readCanonicalLabel(
  draft: string,
  options: readonly ProblemLabelOption[],
) {
  const normalizedLabel = normalizeProblemLabel(draft)
  const existingOption = options.find(
    (option) => option.label.toLowerCase() === normalizedLabel.toLowerCase(),
  )

  return existingOption?.label ?? normalizedLabel
}
