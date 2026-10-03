import { ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'

import { useTrackForEdit } from '../api/tracks-api'

export function TrackCardPreview({
  onRetry,
  trackId,
}: {
  onRetry: () => void
  trackId: string
}) {
  const query = useTrackForEdit({ surface: 'dashboard', trackId })

  if (query.isPending) {
    return <InlineStatus role="status">Loading track preview…</InlineStatus>
  }

  if (query.isError || !query.data) {
    return (
      <div className="grid justify-items-start gap-3">
        <InlineStatus role="alert" tone="danger">
          Failed to load track preview.
        </InlineStatus>
        <Button
          onClick={() => {
            onRetry()
            void query.refetch()
          }}
          size="sm"
          variant="outline"
        >
          Retry preview
        </Button>
      </div>
    )
  }

  const groups = [...query.data.groups].sort((a, b) => a.position - b.position)
  const problemsBySlug = new Map(
    query.data.problemRows.map((row) => [row.problem.slug, row]),
  )

  if (groups.length === 0) {
    return <InlineStatus>No groups in this track.</InlineStatus>
  }

  return (
    <div className="grid max-h-80 min-w-0 gap-3 overflow-y-auto overscroll-contain p-1">
      {groups.map((group, groupIndex) => (
        <details
          aria-label={`${group.title} group`}
          className="group min-w-0 rounded-[var(--cp-control-radius)] border border-border bg-background/30"
          key={group.id ?? group.position}
          open={groupIndex === 0}
        >
          <summary className="flex min-w-0 cursor-pointer list-none items-start gap-2 rounded-[var(--cp-control-radius)] bg-muted/45 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronDown
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 -rotate-90 transition-transform group-open:rotate-0"
            />
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="min-w-0 break-words text-base font-bold text-foreground">
                {group.title}
              </span>
              <span className="text-[length:var(--cp-badge-font-size)] text-muted-foreground">
                {group.problemSlugs.length}{' '}
                {group.problemSlugs.length === 1 ? 'problem' : 'problems'}
              </span>
            </span>
          </summary>
          <div className="border-t border-border px-3">
            {group.problemSlugs.length === 0 ? (
              <InlineStatus className="py-3">
                No problems in this group.
              </InlineStatus>
            ) : (
              <ol
                aria-label={`${group.title} problems`}
                className="m-0 grid list-none divide-y divide-border p-0"
              >
                {group.problemSlugs.map((slug, index) => {
                  const row = problemsBySlug.get(slug)
                  return (
                    <li
                      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 py-3"
                      key={slug}
                    >
                      <span className="text-[length:var(--cp-badge-font-size)] text-muted-foreground tabular-nums">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="m-0 break-words text-[length:var(--cp-copy-font-size)] font-semibold text-foreground">
                          {row?.problem.title ?? slug}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[length:var(--cp-badge-font-size)] text-muted-foreground">
                          {row && row.problem.difficulty !== 'unknown' ? (
                            <span className="capitalize">
                              {row.problem.difficulty}
                            </span>
                          ) : null}
                          {row?.topics.map((topic) => (
                            <span
                              className="rounded-sm bg-muted px-1.5 py-0.5"
                              key={topic.id}
                            >
                              {topic.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </details>
      ))}
    </div>
  )
}
