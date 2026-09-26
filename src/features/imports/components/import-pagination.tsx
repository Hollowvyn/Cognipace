import { Button } from '@/components/ui/button'

interface ImportPaginationProps {
  currentPage: number
  label: string
  onNext: () => void
  onPrevious: () => void
  total: number
}

const pageSize = 25

export function ImportPagination({
  currentPage,
  label,
  onNext,
  onPrevious,
  total,
}: ImportPaginationProps) {
  if (total === 0) return null

  const first = currentPage * pageSize + 1
  const last = Math.min(first + pageSize - 1, total)
  const pageCount = Math.ceil(total / pageSize)
  const titleLabel = label[0]?.toUpperCase() + label.slice(1)

  return (
    <nav
      aria-label={`${titleLabel} pagination`}
      className="flex flex-wrap items-center justify-between gap-2"
    >
      <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground tabular-nums">
        {`Showing ${first}–${last} of ${total}`}
      </p>
      <div className="flex gap-2">
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
      </div>
    </nav>
  )
}
