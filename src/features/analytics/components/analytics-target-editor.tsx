import { useEffect, useId, useRef, useState } from 'react'

import {
  analyticsTargetsSchema,
  type AnalyticsTargets,
} from '@/features/settings/domain'
import { readErrorMessage } from '@/utils/errors'

import { formatPercent } from './charts/chart-shared'

type TargetMetric = 'recall' | 'reviewSuccess'

interface AnalyticsTargetEditorProps {
  targets: AnalyticsTargets
  metric: TargetMetric
  onSave: (patch: Partial<AnalyticsTargets>) => Promise<unknown>
}

const inputClassName =
  'h-[var(--cp-control-height)] w-full min-w-0 rounded-[var(--cp-control-radius)] border border-border bg-background px-3 text-sm tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
const buttonClassName =
  'rounded-[var(--cp-control-radius)] border border-border px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

export function AnalyticsTargetEditor({
  targets,
  metric,
  onSave,
}: AnalyticsTargetEditorProps) {
  const id = useId()
  const key = metric === 'recall' ? 'targetRecall' : 'targetReviewSuccess'
  const label = metric === 'recall' ? 'Target Recall' : 'Target Review Success'
  const value = targets[key]
  const hint =
    metric === 'recall'
      ? `Hard + Good + Easy · Up to Review Success ${formatPercent(targets.targetReviewSuccess)}.`
      : `Good + Easy · At least Recall ${formatPercent(targets.targetRecall)}.`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)
  const restoreFocusRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => percentageText(value))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const validation = validateDraft(draft, targets, key)
  const error = validation.error ?? saveError

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else if (restoreFocusRef.current) {
      restoreFocusRef.current = false
      triggerRef.current?.focus()
    }
  }, [open, metric])

  function close() {
    if (savingRef.current) return
    restoreFocusRef.current = true
    setOpen(false)
    setSaveError(null)
  }

  async function save() {
    if (savingRef.current || !validation.patch) return
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(validation.patch)
      restoreFocusRef.current = true
      setOpen(false)
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
    <div className="grid min-w-0 justify-items-end gap-2">
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
          style={{ borderColor: 'var(--cp-analytics-target)' }}
        />
        {label} {formatPercent(value)}
        <span aria-hidden="true" className="text-[10px]">
          ▾
        </span>
      </button>
      {open ? (
        <form
          aria-label={`${label} editor`}
          className="grid w-full max-w-72 min-w-0 gap-2 rounded-[var(--cp-control-radius)] border border-border bg-muted/30 p-2 text-left"
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
          <label className="sr-only" htmlFor={`${id}-value`}>
            {label} (%)
          </label>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <input
                aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
                aria-invalid={Boolean(validation.error)}
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
                value={draft}
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
            className="m-0 text-[11px] leading-relaxed text-muted-foreground"
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
