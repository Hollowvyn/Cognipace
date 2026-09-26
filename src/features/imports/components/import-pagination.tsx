import { useId, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'

interface ImportPaginationProps {
  currentPage: number
  label: string
  onGoToPage: (pageIndex: number) => void
  onNext: () => void
  onPrevious: () => void
  total: number
}

const pageSize = 25

export function ImportPagination({
  currentPage,
  label,
  onGoToPage,
  onNext,
  onPrevious,
  total,
}: ImportPaginationProps) {
  const pageInputId = useId()

  if (total === 0) return null

  const first = currentPage * pageSize + 1
  const last = Math.min(first + pageSize - 1, total)
  const pageCount = Math.ceil(total / pageSize)
  const titleLabel = label[0]?.toUpperCase() + label.slice(1)

  function handlePageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const page = Number(new FormData(event.currentTarget).get('page'))
    if (Number.isInteger(page) && page >= 1 && page <= pageCount) {
      onGoToPage(page - 1)
    }
  }

  return (
    <nav
      aria-label={`${titleLabel} pagination`}
      className="flex flex-wrap items-center justify-between gap-2"
    >
      <p
        aria-atomic="true"
        aria-live="polite"
        className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground tabular-nums"
        role="status"
        aria-label={`${titleLabel} results`}
      >
        {`Showing ${first}–${last} of ${total}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={currentPage === 0}
          onClick={onPrevious}
          size="sm"
          variant="outline"
        >
          {`Previous ${label} page`}
        </Button>
        <Button
          disabled={currentPage + 1 >= pageCount}
          onClick={onNext}
          size="sm"
          variant="outline"
        >
          {`Next ${label} page`}
        </Button>
        <form className="flex items-center gap-1" onSubmit={handlePageSubmit}>
          <label
            className="flex items-center gap-1 text-[length:var(--cp-copy-font-size)]"
            htmlFor={pageInputId}
          >
            {`${titleLabel} page number`}
          </label>
          <input
            className="h-[var(--cp-control-height-sm)] w-20 rounded-[var(--cp-control-radius)] border border-border bg-background px-2 text-[length:var(--cp-copy-font-size)] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue={currentPage + 1}
            id={pageInputId}
            key={currentPage}
            max={pageCount}
            min={1}
            name="page"
            required
            step={1}
            type="number"
          />
          <Button
            aria-label={`Go to ${label} page`}
            size="sm"
            type="submit"
            variant="outline"
          >
            Go
          </Button>
        </form>
      </div>
    </nav>
  )
}
