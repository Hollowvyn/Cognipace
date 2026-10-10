import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import {
  analyticsTargetsSchema,
  type AnalyticsTargets,
} from '@/features/settings/domain'
import { readErrorMessage } from '@/utils/errors'

import { formatPercent } from './charts/chart-shared'
import { targetMetrics, type TargetMetric } from './analytics-target-metrics'

interface AnalyticsTargetEditorProps {
  targets: AnalyticsTargets
  metric: TargetMetric
  onSave: (patch: Partial<AnalyticsTargets>) => Promise<unknown>
  surface?: 'inline' | 'goals'
  /** Controlled visibility: hiding a mounted editor preserves draft and errors. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** The parent's destination control, focused after Save/Cancel commits. */
  returnFocusRef?: RefObject<HTMLButtonElement | null>
}

const inputClassName =
  'h-[var(--cp-control-height)] w-full min-w-0 rounded-[var(--cp-control-radius)] border border-border bg-background px-3 text-sm tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
const buttonClassName =
  'rounded-[var(--cp-control-radius)] border border-border px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

export function AnalyticsTargetEditor({
  targets,
  metric,
  onSave,
  surface = 'inline',
  open: controlledOpen,
  onOpenChange,
  returnFocusRef,
}: AnalyticsTargetEditorProps) {
  const id = useId()
  const { key, label, hint: readHint, color } = targetMetrics[metric]
  const value = targets[key]
  const hint = readHint(targets)
  const referenceColor =
    (metric === 'firstAttemptSuccess' || metric === 'firstAttemptGoodEasy') &&
    targets.targetFirstAttemptSuccess === targets.targetFirstAttemptGoodEasy
      ? 'var(--cp-analytics-first-shared-target)'
      : color
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)
  const restoreFocusRef = useRef(false)
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const lifecycleRef = useRef({ open, onOpenChange })
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const draftText = draft ?? percentageText(value)
  const validation = validateDraft(draftText, targets, key)
  const error = validation.error ?? saveError

  useLayoutEffect(() => {
    lifecycleRef.current = { open, onOpenChange }
  }, [open, onOpenChange])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else if (restoreFocusRef.current && !saving) {
      restoreFocusRef.current = false
      const focusTarget = returnFocusRef?.current ?? triggerRef.current
      focusTarget?.focus()
    }
  }, [open, metric, saving, returnFocusRef])

  function setOpen(nextOpen: boolean) {
    if (controlledOpen === undefined) setInternalOpen(nextOpen)
    lifecycleRef.current.onOpenChange?.(nextOpen)
  }

  function close() {
    if (savingRef.current) return
    restoreFocusRef.current = true
    setOpen(false)
    setDraft(null)
    setSaveError(null)
  }

  async function save() {
    if (savingRef.current || !validation.patch) return
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(validation.patch)
      // A mounted Goals controller can finish after the user opens another one.
      // Only the visible controller owns the parent's close and focus return.
      restoreFocusRef.current = lifecycleRef.current.open
      if (lifecycleRef.current.open) setOpen(false)
      setDraft(null)
    } catch (error) {
      setSaveError(
        readErrorMessage(error, 'Could not save targets. Please try again.'),
      )
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div
      className="grid min-w-0 justify-items-end gap-2"
      hidden={surface === 'goals' && !open}
    >
      {surface === 'inline' ? (
        <button
          aria-controls={`${id}-editor`}
          aria-expanded={open}
          className="inline-flex max-w-full items-center gap-2 rounded px-1 py-1 text-right text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          disabled={saving}
          onClick={() => {
            if (open) close()
            else {
              setDraft(percentageText(value))
              setSaveError(null)
              setOpen(true)
            }
          }}
          ref={triggerRef}
          type="button"
        >
          <span
            aria-hidden="true"
            className="w-5 shrink-0 border-t border-dashed"
            style={{ borderColor: referenceColor }}
          />
          {label} {formatPercent(value)}
          <span aria-hidden="true" className="text-[10px]">
            ▾
          </span>
        </button>
      ) : null}
      {open ? (
        <form
          aria-label={`${label} editor`}
          className={`grid w-full min-w-0 gap-2 rounded-[var(--cp-control-radius)] border border-border bg-muted/30 p-2 text-left ${surface === 'goals' ? 'max-w-full' : 'max-w-72'}`}
          id={`${id}-editor`}
          noValidate
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
            }
          }}
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
            <legend
              className={
                surface === 'goals' ? 'mb-2 text-sm font-semibold' : 'sr-only'
              }
            >
              {label}
            </legend>
            <label className="sr-only" htmlFor={`${id}-value`}>
              {label} (%)
            </label>
            <div
              className="flex min-w-0 flex-wrap items-center gap-2"
              data-testid="target-editor-controls"
            >
              <div className="flex min-w-0 flex-1 basis-28 items-center gap-1">
                <input
                  aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
                  aria-invalid={Boolean(error)}
                  autoComplete="off"
                  className={inputClassName}
                  disabled={saving}
                  id={`${id}-value`}
                  inputMode="numeric"
                  max={100}
                  min={0}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    setSaveError(null)
                  }}
                  ref={inputRef}
                  step={1}
                  type="number"
                  value={draftText}
                />
                <span
                  aria-hidden="true"
                  className="text-xs text-muted-foreground"
                >
                  %
                </span>
              </div>
              <button
                className={`${buttonClassName} bg-card text-foreground hover:bg-muted`}
                disabled={saving}
                onClick={close}
                type="button"
              >
                Cancel
              </button>
              <button
                className={`${buttonClassName} border-primary bg-primary text-primary-foreground`}
                disabled={saving || Boolean(validation.error)}
                type="submit"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            <p
              className={`m-0 leading-relaxed text-muted-foreground ${surface === 'goals' ? 'text-xs' : 'text-[11px]'}`}
              id={`${id}-hint`}
            >
              {hint}
            </p>
            {error ? (
              <p
                className="m-0 text-xs text-[color:var(--cp-tone-danger-fg)]"
                id={`${id}-error`}
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </fieldset>
        </form>
      ) : null}
    </div>
  )
}

function percentageText(value: number) {
  return String(Number((value * 100).toFixed(8)))
}

function validateDraft(
  draft: string,
  targets: AnalyticsTargets,
  key: keyof AnalyticsTargets,
): { patch: Partial<AnalyticsTargets> | null; error: string | null } {
  const value = Number(draft)
  if (
    draft.trim() === '' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 100
  ) {
    return { patch: null, error: 'Use whole percentages from 0 to 100.' }
  }
  const patch = { [key]: value / 100 }
  const result = analyticsTargetsSchema.safeParse({ ...targets, ...patch })
  return result.success
    ? { patch, error: null }
    : {
        patch: null,
        error: result.error.issues[0]?.message ?? 'Check your target.',
      }
}
