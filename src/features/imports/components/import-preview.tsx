import { useState } from 'react'

import type { ImportPreviewResponse } from '@/features/imports/api/import-runtime-contracts'

import { ImportDiagnostics } from './import-diagnostics'
import { ImportPagination } from './import-pagination'

const additionLabels = {
  problems: 'Problems added',
  topics: 'Topics added',
  companies: 'Companies added',
  problemTopics: 'Problem-topic links added',
  problemCompanies: 'Problem-company links added',
  tracks: 'Tracks added',
  groups: 'Track groups added',
  memberships: 'Track-question links added',
} as const

const itemKindLabels = {
  problems: 'Question',
  topics: 'Topic',
  companies: 'Company',
  problemTopics: 'Question-topic link',
  problemCompanies: 'Question-company link',
  tracks: 'Track',
  groups: 'Track group',
  memberships: 'Track-question link',
} as const

const pageSize = 25

interface ImportPreviewViewProps {
  preview: ImportPreviewResponse
}

export function ImportPreviewView({ preview }: ImportPreviewViewProps) {
  const [itemPageState, setItemPageState] = useState<{
    items: ImportPreviewResponse['items']
    page: number
  }>({ items: preview.items, page: 0 })
  const itemPage =
    itemPageState.items === preview.items ? itemPageState.page : 0
  const totalAdditions = Object.values(preview.additions).reduce(
    (total, count) => total + count,
    0,
  )
  const start = itemPage * pageSize
  const visibleItems = preview.items.slice(start, start + pageSize)

  return (
    <section
      aria-label="Import preview"
      className="grid min-w-0 gap-3 rounded-[var(--cp-radius-md)] border border-border bg-muted/40 p-3"
    >
      <h3 className="m-0 text-[length:var(--cp-copy-font-size)] font-bold">
        Import preview
      </h3>

      <div className="grid gap-2">
        <p className="m-0 font-semibold tabular-nums">
          {`${totalAdditions} ${totalAdditions === 1 ? 'addition' : 'additions'}`}
        </p>
        <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 text-[length:var(--cp-copy-font-size)] sm:grid-cols-2">
          {Object.entries(additionLabels).map(([key, label]) => (
            <div className="flex min-w-0 justify-between gap-3" key={key}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="m-0 shrink-0 font-semibold tabular-nums">
                {preview.additions[key as keyof typeof preview.additions]}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <details className="grid min-w-0 gap-2 border-t border-border pt-2">
        <summary className="cursor-pointer text-[length:var(--cp-copy-font-size)] font-semibold">
          {`Planned items (${preview.items.length})`}
        </summary>
        {preview.items.length > 0 ? (
          <>
            <ul className="m-0 grid list-none gap-2 p-0">
              {visibleItems.map((item, index) => (
                <li
                  className="grid min-w-0 gap-0.5 border-b border-border/70 pb-2 text-[length:var(--cp-copy-font-size)] last:border-b-0"
                  key={`${item.path}-${item.kind}-${item.identity}-${start + index}`}
                >
                  <span className="font-semibold">
                    <span>{itemKindLabels[item.kind]}:</span>{' '}
                    <span>{item.label}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {item.action === 'add' ? 'Addition' : 'Already present'}
                  </span>
                  <code className="break-all text-muted-foreground">
                    {item.identity}
                  </code>
                  <code className="break-all text-muted-foreground">
                    {item.path}
                  </code>
                </li>
              ))}
            </ul>
            <ImportPagination
              currentPage={itemPage}
              label="planned item"
              onGoToPage={(page) =>
                setItemPageState({ items: preview.items, page })
              }
              onNext={() =>
                setItemPageState({ items: preview.items, page: itemPage + 1 })
              }
              onPrevious={() =>
                setItemPageState({ items: preview.items, page: itemPage - 1 })
              }
              total={preview.items.length}
            />
          </>
        ) : (
          <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
            No planned items.
          </p>
        )}
      </details>

      <ImportDiagnostics diagnostics={preview.diagnostics} />
    </section>
  )
}
