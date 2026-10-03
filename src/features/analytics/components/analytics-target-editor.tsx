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
  onSave: (targets: AnalyticsTargets) => Promise<unknown>
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const recallRef = useRef<HTMLInputElement>(null)
  const successRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)
  const restoreFocusRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => percentageDraft(targets))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const validation = validateDraft(draft)
  const error = validation.error ?? saveError
  const label = metric === 'recall' ? 'Target Recall' : 'Target Review Success'
  const value =
    metric === 'recall' ? targets.targetRecall : targets.targetReviewSuccess

  useEffect(() => {
    if (open) (metric === 'recall' ? recallRef : successRef).current?.focus()
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
    if (savingRef.current || !validation.targets) return
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(validation.targets)
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
            setDraft(percentageDraft(targets))
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
          aria-label="Chart targets"
          className="grid w-full max-w-sm min-w-0 gap-3 rounded-[var(--cp-control-radius)] border border-border bg-muted/30 p-3 text-left"
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
          <div className="grid min-w-0 grid-cols-2 gap-3">
            {(
              [
                [
                  'targetRecall',
                  'Target Recall (%)',
                  'Hard + Good + Easy',
                  recallRef,
                ],
                [
                  'targetReviewSuccess',
                  'Target Review Success (%)',
                  'Good + Easy',
                  successRef,
                ],
              ] as const
            ).map(([key, fieldLabel, hint, ref]) => (
              <div className="grid min-w-0 content-start gap-1.5" key={key}>
                <label
                  className="min-h-8 text-xs font-semibold text-foreground"
                  htmlFor={`${id}-${key}`}
                >
                  {fieldLabel}
                </label>
                <input
                  aria-describedby={`${id}-${key}-hint${error ? ` ${id}-error` : ''}`}
                  aria-invalid={Boolean(validation.error)}
                  autoComplete="off"
                  className={inputClassName}
                  disabled={saving}
                  id={`${id}-${key}`}
                  inputMode="numeric"
                  max={100}
                  min={0}
                  onChange={(event) => {
                    setDraft({ ...draft, [key]: event.target.value })
                    setSaveError(null)
                  }}
                  ref={ref}
                  step={1}
                  type="number"
                  value={draft[key]}
                />
                <span
                  className="text-[11px] leading-relaxed text-muted-foreground"
                  id={`${id}-${key}-hint`}
                >
                  {hint}
                </span>
              </div>
            ))}
          </div>
          {error ? (
            <p
              className="m-0 text-xs text-[color:var(--cp-tone-danger-fg)]"
              id={`${id}-error`}
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
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
        </form>
      ) : null}
    </div>
  )
}

function percentageDraft(targets: AnalyticsTargets) {
  return {
    targetRecall: String(Number((targets.targetRecall * 100).toFixed(8))),
    targetReviewSuccess: String(
      Number((targets.targetReviewSuccess * 100).toFixed(8)),
    ),
  }
}

function validateDraft(draft: ReturnType<typeof percentageDraft>): {
  targets: AnalyticsTargets | null
  error: string | null
} {
  const values = Object.values(draft)
  if (
    values.some(
      (text) =>
        text.trim() === '' ||
        !Number.isInteger(Number(text)) ||
        Number(text) < 0 ||
        Number(text) > 100,
    )
  ) {
    return { targets: null, error: 'Use whole percentages from 0 to 100.' }
  }
  const result = analyticsTargetsSchema.safeParse({
    targetRecall: Number(draft.targetRecall) / 100,
    targetReviewSuccess: Number(draft.targetReviewSuccess) / 100,
  })
  return result.success
    ? { targets: result.data, error: null }
    : {
        targets: null,
        error: result.error.issues[0]?.message ?? 'Check your targets.',
      }
}
