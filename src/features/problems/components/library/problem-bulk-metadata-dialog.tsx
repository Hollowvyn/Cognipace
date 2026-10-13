import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  problemDifficulties,
  type ProblemDifficulty,
} from '@/features/problems/domain'

import type {
  ProblemLibraryOptions,
  ProblemsBulkUpdateProblemsRequest,
} from '../../api/problems-contracts'

import { ProblemLabelInput } from '../form/problem-label-input'
import { normalizeProblemLabelList } from '../form/use-problem-form'

type BulkMetadataSet = ProblemsBulkUpdateProblemsRequest['set']

interface EnabledFields {
  companies: boolean
  difficulty: boolean
  premium: boolean
  topics: boolean
}

const defaultEnabledFields = {
  companies: false,
  difficulty: false,
  premium: false,
  topics: false,
} as const satisfies EnabledFields

export function ProblemBulkMetadataDialog({
  onCancel,
  onSubmit,
  options,
  pending,
  selectedCount,
}: {
  onCancel: () => void
  onSubmit: (set: BulkMetadataSet) => void
  options: ProblemLibraryOptions
  pending: boolean
  selectedCount: number
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const [enabledFields, setEnabledFields] =
    useState<EnabledFields>(defaultEnabledFields)
  const [companyLabels, setCompanyLabels] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState<ProblemDifficulty>('unknown')
  const [isPremium, setIsPremium] = useState(false)
  const [topicLabels, setTopicLabels] = useState<string[]>([])
  const canSubmit = Object.values(enabledFields).some(Boolean)

  useEffect(() => {
    cancelButtonRef.current?.focus()
  }, [])

  function setEnabled(field: keyof EnabledFields, enabled: boolean) {
    setEnabledFields((current) => ({ ...current, [field]: enabled }))
  }

  function submit() {
    const set: BulkMetadataSet = {}

    if (enabledFields.difficulty) {
      set.difficulty = difficulty
    }

    if (enabledFields.premium) {
      set.isPremium = isPremium
    }

    if (enabledFields.topics) {
      set.topicLabels = normalizeProblemLabelList(topicLabels)
    }

    if (enabledFields.companies) {
      set.companyLabels = normalizeProblemLabelList(companyLabels)
    }

    onSubmit(set)
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/75 p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !pending) {
          onCancel()
        }
      }}
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
        aria-describedby="problem-bulk-metadata-description"
        aria-labelledby="problem-bulk-metadata-title"
        aria-modal="true"
        className="grid max-h-[min(42rem,calc(100vh-2rem))] w-full max-w-2xl gap-4 overflow-y-auto rounded-[var(--cp-panel-radius)] border border-border bg-card p-[var(--cp-panel-padding)] text-card-foreground shadow-surface"
        role="dialog"
      >
        <div className="grid gap-2">
          <h2
            className="m-0 text-[length:var(--cp-title-font-size)] font-bold leading-tight"
            id="problem-bulk-metadata-title"
          >
            Edit selected metadata
          </h2>
          <p
            className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground"
            id="problem-bulk-metadata-description"
          >
            Choose which fields to replace for {selectedCount} selected
            problems.
          </p>
        </div>

        <div className="grid gap-4">
          <BulkFieldToggle
            checked={enabledFields.difficulty}
            label="Set difficulty"
            onChange={(checked) => setEnabled('difficulty', checked)}
          />
          <label className="grid gap-1">
            <span className="text-[length:var(--cp-badge-font-size)] font-bold uppercase text-muted-foreground">
              Difficulty
            </span>
            <select
              className={bulkFieldClassName}
              disabled={!enabledFields.difficulty}
              onChange={(event) =>
                setDifficulty(event.target.value as ProblemDifficulty)
              }
              value={difficulty}
            >
              {problemDifficulties.map((option) => (
                <option key={option} value={option}>
                  {formatDifficulty(option)}
                </option>
              ))}
            </select>
          </label>

          <BulkFieldToggle
            checked={enabledFields.premium}
            label="Set premium"
            onChange={(checked) => setEnabled('premium', checked)}
          />
          <label className="grid gap-1">
            <span className="text-[length:var(--cp-badge-font-size)] font-bold uppercase text-muted-foreground">
              Premium
            </span>
            <select
              className={bulkFieldClassName}
              disabled={!enabledFields.premium}
              onChange={(event) => setIsPremium(event.target.value === 'true')}
              value={String(isPremium)}
            >
              <option value="false">Free</option>
              <option value="true">Premium</option>
            </select>
          </label>

          <BulkFieldToggle
            checked={enabledFields.topics}
            label="Replace topics"
            onChange={(checked) => setEnabled('topics', checked)}
          />
          {enabledFields.topics ? (
            <div className="grid gap-2">
              <ProblemLabelInput
                itemName="topic"
                label="Topics"
                labels={topicLabels}
                onChange={setTopicLabels}
                options={options.topics}
              />
              {topicLabels.length === 0 ? (
                <p className="m-0 text-[length:var(--cp-badge-font-size)] text-muted-foreground">
                  No topics selected; this will clear topics.
                </p>
              ) : null}
            </div>
          ) : null}

          <BulkFieldToggle
            checked={enabledFields.companies}
            label="Replace companies"
            onChange={(checked) => setEnabled('companies', checked)}
          />
          {enabledFields.companies ? (
            <div className="grid gap-2">
              <ProblemLabelInput
                itemName="company"
                label="Companies"
                labels={companyLabels}
                onChange={setCompanyLabels}
                options={options.companies}
              />
              {companyLabels.length === 0 ? (
                <p className="m-0 text-[length:var(--cp-badge-font-size)] text-muted-foreground">
                  No companies selected; this will clear companies.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

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
          <Button disabled={!canSubmit || pending} onClick={submit} size="sm">
            {pending ? (
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : null}
            Update Problems
          </Button>
        </div>
      </section>
    </div>
  )
}

function BulkFieldToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="inline-flex w-fit items-center gap-2 text-[length:var(--cp-control-font-size)] font-semibold text-foreground">
      <input
        checked={checked}
        className="size-4 rounded-[var(--cp-radius-sm)] border border-border bg-background accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      {label}
    </label>
  )
}

const bulkFieldClassName =
  'h-[var(--cp-control-height-lg)] rounded-[var(--cp-control-radius)] border border-border bg-background px-3 text-[length:var(--cp-control-font-size)] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60'

function formatDifficulty(difficulty: ProblemDifficulty) {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
}
