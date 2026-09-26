import { useState } from 'react'

import type { ImportPreviewResponse } from '@/features/imports/api/import-runtime-contracts'

import { ImportPagination } from './import-pagination'

const pageSize = 25

interface ImportDiagnosticsProps {
  diagnostics: ImportPreviewResponse['diagnostics']
}

export function ImportDiagnostics({ diagnostics }: ImportDiagnosticsProps) {
  const [pageState, setPageState] = useState<{
    diagnostics: ImportPreviewResponse['diagnostics']
    page: number
  }>({ diagnostics, page: 0 })
  const page = pageState.diagnostics === diagnostics ? pageState.page : 0
  const start = page * pageSize
  const visibleDiagnostics = diagnostics.slice(start, start + pageSize)

  return (
    <details className="grid min-w-0 gap-2 border-t border-border pt-2">
      <summary className="cursor-pointer text-[length:var(--cp-copy-font-size)] font-semibold">
        {`Diagnostics (${diagnostics.length})`}
      </summary>
      {diagnostics.length > 0 ? (
        <>
          <ul className="m-0 grid list-none gap-2 p-0">
            {visibleDiagnostics.map((diagnostic, index) => (
              <li
                className="grid min-w-0 gap-0.5 border-b border-border/70 pb-2 text-[length:var(--cp-copy-font-size)] last:border-b-0"
                key={`${diagnostic.path}-${diagnostic.code}-${start + index}`}
              >
                <span className="font-semibold capitalize">
                  {diagnostic.severity}
                </span>
                <code className="break-all text-muted-foreground">
                  {diagnostic.path}
                </code>
                <span className="break-words">{diagnostic.message}</span>
              </li>
            ))}
          </ul>
          <ImportPagination
            currentPage={page}
            label="diagnostic"
            onNext={() => setPageState({ diagnostics, page: page + 1 })}
            onPrevious={() => setPageState({ diagnostics, page: page - 1 })}
            total={diagnostics.length}
          />
        </>
      ) : (
        <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
          No diagnostics.
        </p>
      )}
    </details>
  )
}
