import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { createLeetCodeProblemUrl } from '@/lib/leetcode'

import type {
  AnalyticsTimeFrame,
  AnalyticsViews,
} from '../../api/analytics-contracts'
import {
  AnalyticsCardControls,
  AnalyticsCardPager,
  clampAnalyticsPage,
} from '../analytics-card-controls'
import {
  AnalyticsChartPanel,
  type AnalyticsCardGeometry,
} from '../analytics-chart-panel'
import { AnalyticsExactTable } from '../analytics-exact-table'
import { formatCount, formatPercent } from '../charts/chart-shared'
import { retentionProblemFields } from '../current-state-views'
import {
  RetentionMapCanvas,
  useRetentionMapController,
} from '../retention-map-chart'
import {
  formatDuration,
  statusColor,
  statusLabel,
  zoomViewport,
  type RetentionRow,
} from '../retention-map-model'

export interface RetentionCardProps {
  view: AnalyticsViews['retentionMap']
  timeFrame: AnalyticsTimeFrame
}

type DetailSection = 'summary' | 'problems' | 'method'
type FieldGroup = 'recall' | 'schedule' | 'state'
const fieldGroups = [
  {
    key: 'recall',
    label: 'Recall',
    fieldKeys: ['status', 'recall', 'target', 'gap'],
  },
  {
    key: 'schedule',
    label: 'Schedule',
    fieldKeys: ['durability', 'review', 'due'],
  },
  {
    key: 'state',
    label: 'State',
    fieldKeys: ['difficulty', 'lapses', 'rank', 'region'],
  },
] as const

function problemPageSize(
  geometry: AnalyticsCardGeometry,
  rows: RetentionRow[],
  extra = 0,
) {
  // Full titles remain evidence. Reserve lines instead of clipping or scrolling.
  const charactersPerLine = Math.max(14, Math.floor((geometry.width - 24) / 7))
  const longestLines = Math.max(
    1,
    ...rows.map((row) => Math.ceil(row.title.length / charactersPerLine)),
  )
  return Math.max(
    1,
    Math.min(
      geometry.problemPageSize,
      Math.floor(
        (geometry.bodyHeight - (extra ? 48 : 100)) /
          (22 * longestLines + extra + 20),
      ),
    ),
  )
}

function RetentionPaginationGeometry({
  width,
  problemSize,
  candidateSize,
  onProblemChange,
  onCandidateChange,
}: {
  width: number
  problemSize: number
  candidateSize: number
  onProblemChange: () => void
  onCandidateChange: () => void
}) {
  const previous = useRef({ width, problemSize, candidateSize })
  useEffect(() => {
    if (
      previous.current.width !== width ||
      previous.current.problemSize !== problemSize
    )
      onProblemChange()
    if (
      previous.current.width !== width ||
      previous.current.candidateSize !== candidateSize
    )
      onCandidateChange()
    previous.current = { width, problemSize, candidateSize }
  }, [width, problemSize, candidateSize, onProblemChange, onCandidateChange])
  return null
}

function ProblemLink({ row }: { row: RetentionRow }) {
  return (
    <a
      className="cp-retention-problem-link"
      href={createLeetCodeProblemUrl(row.slug)}
      rel="noopener noreferrer"
      target="_blank"
    >
      {row.title}
    </a>
  )
}

export function RetentionCard({ view, timeFrame }: RetentionCardProps) {
  const headerActionRef = useRef<HTMLButtonElement>(null)
  const referencesRef = useRef<HTMLParagraphElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const [overviewCopy, setOverviewCopy] = useState({
    references: 18,
    preview: 56,
  })
  const [mode, setMode] = useState<'overview' | 'details'>('overview')
  const [belowTarget, setBelowTarget] = useState(false)
  const [section, setSection] = useState<DetailSection>('summary')
  const [fieldGroup, setFieldGroup] = useState<FieldGroup>('recall')
  const [methodPage, setMethodPage] = useState(0)
  const [summaryPage, setSummaryPage] = useState(0)
  const rows = belowTarget
    ? view.rows.filter((row) => row.retrievability < view.targetRetention)
    : view.rows
  const reportKey = JSON.stringify([
    timeFrame.asOf,
    timeFrame.timeZone,
    timeFrame.timeZoneFallback,
    timeFrame.requestedDays,
    timeFrame.periodStart,
    timeFrame.periodEnd,
    timeFrame.grouping,
    timeFrame.history,
    belowTarget,
    rows.map((row) => row.slug),
  ])
  const [problemPagination, setProblemPagination] = useState({
    key: reportKey,
    page: 0,
  })
  const [candidatePagination, setCandidatePagination] = useState({
    key: '',
    page: 0,
  })
  if (problemPagination.key !== reportKey)
    setProblemPagination({ key: reportKey, page: 0 })
  const problemPage =
    problemPagination.key === reportKey ? problemPagination.page : 0
  const setProblemPage = (page: number) =>
    setProblemPagination({ key: reportKey, page })
  const controller = useRetentionMapController({
    rows,
    view,
    deferPointerSelection: true,
    contextKey: reportKey,
    fallbackFocusRef: headerActionRef,
  })
  const {
    selection,
    selectionOpen,
    candidates,
    visibleCount,
    regionRef,
    preview,
    pinned,
    detailsId,
    closeRef,
    summaryId,
  } = controller
  const cardMode = selection && selectionOpen ? 'selection' : mode
  useEffect(() => {
    if (cardMode !== 'overview') return
    const measure = () => {
      const references =
        referencesRef.current?.getBoundingClientRect().height ?? 0
      const preview = previewRef.current?.getBoundingClientRect().height ?? 0
      if (references <= 0 || preview <= 0) return
      setOverviewCopy((current) =>
        current.references === references && current.preview === preview
          ? current
          : { references, preview },
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    if (referencesRef.current) observer.observe(referencesRef.current)
    if (previewRef.current) observer.observe(previewRef.current)
    return () => observer.disconnect()
  }, [cardMode])
  const candidateKey = `${reportKey}:${candidates.map((row) => row.slug).join('|')}`
  if (candidatePagination.key !== candidateKey)
    setCandidatePagination({ key: candidateKey, page: 0 })
  const candidatePage =
    candidatePagination.key === candidateKey ? candidatePagination.page : 0
  const setCandidatePage = (page: number) =>
    setCandidatePagination({ key: candidateKey, page })
  const fields = [
    ...retentionProblemFields(timeFrame.timeZone),
    {
      key: 'region',
      label: 'Region',
      value: (row: RetentionRow) => row.region,
    },
  ]
  const pinnedFields = fieldGroups
    .find((group) => group.key === fieldGroup)!
    .fieldKeys.filter((key) => key !== 'rank' && key !== 'region')
    .map((key) => fields.find((field) => field.key === key)!)
  const counts = [
    ['on-target', view.statusCounts.onTarget, '●'],
    ['watch', view.statusCounts.watch, '◆'],
    ['needs-attention', view.statusCounts.needsAttention, '▲'],
  ] as const
  const changeMode = () => {
    controller.returnToMap()
    setMode(
      mode === 'overview' && cardMode !== 'selection' ? 'details' : 'overview',
    )
  }
  const close = () => {
    setMode('overview')
    controller.dismiss()
  }
  const changeFilter = (value: 'all' | 'below') => {
    controller.returnToMap()
    setBelowTarget(value === 'below')
  }
  const filter = (
    <AnalyticsCardControls
      label="Retention Map filter"
      value={belowTarget ? 'below' : 'all'}
      options={[
        { value: 'all', label: 'All' },
        { value: 'below', label: 'Below target' },
      ]}
      onChange={changeFilter}
    />
  )
  const summaryPages = [
    <div key="scope" className="cp-retention-copy">
      <p>
        <strong>{formatCount(view.totalEligible)} eligible</strong> active,
        non-suspended, reviewed problems with current FSRS data.
      </p>
      <p>
        {formatCount(rows.length)} matching · {formatCount(visibleCount)} in
        view. Status totals and fitted domains always describe the full cohort.
      </p>
      <ul aria-label="Retention summary status counts">
        {counts.map(([status, count, shape]) => (
          <li key={status}>
            <span aria-hidden="true" style={{ color: statusColor(status) }}>
              {shape}
            </span>{' '}
            {formatCount(count)} {statusLabel(status)}
          </li>
        ))}
      </ul>
    </div>,
    <div key="context" className="cp-retention-copy">
      <p>
        <strong>Current state as of</strong> {timeFrame.asOf}
      </p>
      <p>
        <strong>Timezone</strong> {timeFrame.timeZone}
        {timeFrame.timeZoneFallback ? ' (fallback)' : ''}
      </p>
      <p>
        <strong>Selected report range</strong>{' '}
        {timeFrame.requestedDays === null
          ? 'All time'
          : `${timeFrame.requestedDays} days`}
        : {timeFrame.periodStart} through {timeFrame.periodEnd}.
      </p>
      <p>
        <strong>Grouping</strong>{' '}
        {timeFrame.grouping
          ? `${timeFrame.grouping.step} ${timeFrame.grouping.unit}`
          : 'Unavailable'}
        . Report context; current retention is independent of historical range.
      </p>
    </div>,
  ]
  const methodPages = [
    <div key="meaning" className="cp-retention-copy">
      <p>
        Estimated recall now is an FSRS model estimate, not observed recall.
        FSRS scheduling target: {formatPercent(view.targetRetention)};
        independent of personal chart goals.
      </p>
      <p>
        Memory durability is the <strong>total modeled interval</strong> from
        the latest review until recall crosses the scheduling target. It is not
        remaining time or time until due.
      </p>
    </div>,
    <div key="references" className="cp-retention-copy">
      <p>
        On target now means estimated recall at or above the FSRS target. Watch
        spans 10 percentage points below target; Needs attention is below that
        band.
      </p>
      <p>
        The vertical reference is 7 total modeled days. Full-cohort domains
        include these references. Region is the supplied recall/durability
        classification in Problems.
      </p>
      <p>
        Difficulty is numeric FSRS difficulty, independent of problem
        classification and weighted scores.
      </p>
    </div>,
    <div key="inputs" className="cp-retention-copy">
      <p>
        Every eligible question uses exact log-duration and linear-recall
        coordinates, including overlaps. No jitter, sampling or cap.
      </p>
      <p>
        Drag box to magnify; Shift-drag or touch pans. Wheel, pinch and +/−
        zoom. Double-click restores full view and previous pin.
      </p>
      <p>
        Arrows/Home/End reveal; Enter/Space pins. Escape cancels a gesture
        first, then closes. Close clears the pin; Return to map keeps it.
      </p>
    </div>,
  ]
  return (
    <div ref={regionRef} className="cp-retention-card-scope">
      <AnalyticsChartPanel
        compact
        className="cp-retention-map cp-retention-card"
        id="analytics-retention-map"
        title="Retention map"
        description="Current FSRS memory landscape"
        mode={cardMode}
        headerAction={
          <Button
            ref={headerActionRef}
            aria-label={
              cardMode === 'overview'
                ? 'Retention Map Details'
                : 'Retention Map Overview'
            }
            className="cp-analytics-card-control"
            onClick={changeMode}
            size="sm"
            variant="ghost"
          >
            {cardMode === 'overview' ? 'Details' : 'Overview'}
          </Button>
        }
        hero={
          <div className="cp-retention-hero">
            <strong>
              All {formatCount(view.totalEligible)} eligible reviewed problems
            </strong>
            <ul
              aria-label="Retention Map status counts"
              className="cp-retention-status-counts"
              role="list"
            >
              {counts.map(([status, count, shape]) => (
                <li key={status}>
                  <span
                    aria-hidden="true"
                    style={{ color: statusColor(status) }}
                  >
                    {shape}
                  </span>
                  <span>
                    {formatCount(count)} {statusLabel(status)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        }
        footer={(geometry) =>
          cardMode === 'overview' ? (
            <div className="cp-retention-overview-actions">
              {filter}
              <div className="cp-retention-zoom-actions">
                <Button
                  aria-label="Zoom in"
                  className="cp-analytics-card-control"
                  onClick={() =>
                    controller.updateViewport(
                      zoomViewport(controller.viewport, controller.full, 1.5),
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  +
                </Button>
                <Button
                  aria-label="Zoom out"
                  className="cp-analytics-card-control"
                  onClick={() =>
                    controller.updateViewport(
                      zoomViewport(
                        controller.viewport,
                        controller.full,
                        1 / 1.5,
                      ),
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  −
                </Button>
                <Button
                  className="cp-analytics-card-control"
                  onClick={() => controller.updateViewport(controller.full)}
                  size="sm"
                  variant="ghost"
                >
                  Reset view
                </Button>
              </div>
            </div>
          ) : cardMode === 'selection' ? (
            candidates.length > 1 ? (
              <AnalyticsCardPager
                label="Retention candidates"
                page={candidatePage}
                pageSize={problemPageSize(geometry, candidates, 38)}
                rowCount={candidates.length}
                onPageChange={setCandidatePage}
              />
            ) : (
              <Button
                className="cp-analytics-card-control"
                onClick={() => {
                  controller.returnToMap()
                  setMode('overview')
                }}
                size="sm"
                variant="ghost"
              >
                Return to map
              </Button>
            )
          ) : section === 'problems' ? (
            <AnalyticsCardPager
              label="Retention problems"
              page={problemPage}
              pageSize={problemPageSize(geometry, rows)}
              rowCount={rows.length}
              onPageChange={setProblemPage}
            />
          ) : (
            <AnalyticsCardPager
              label={`Retention ${section} pages`}
              page={section === 'method' ? methodPage : summaryPage}
              pageSize={1}
              rowCount={
                section === 'method' ? methodPages.length : summaryPages.length
              }
              onPageChange={
                section === 'method' ? setMethodPage : setSummaryPage
              }
            />
          )
        }
      >
        {(geometry) => {
          const candidateSize = problemPageSize(geometry, candidates, 38)
          const candidateStart =
            clampAnalyticsPage(
              candidatePage,
              candidates.length,
              candidateSize,
            ) * candidateSize
          return (
            <div className="cp-retention-card-content">
              <RetentionPaginationGeometry
                width={geometry.width}
                problemSize={problemPageSize(geometry, rows)}
                candidateSize={candidateSize}
                onProblemChange={() => setProblemPage(0)}
                onCandidateChange={() => setCandidatePage(0)}
              />
              {cardMode === 'overview' ? (
                <>
                  <p
                    className="cp-retention-card-references"
                    ref={referencesRef}
                  >
                    FSRS target {formatPercent(view.targetRetention)} · 7d
                    durability reference
                  </p>
                  <p className="sr-only" id={summaryId}>
                    Scope: all eligible current active, non-suspended reviewed
                    questions. Model-estimated recall, not observed. Durability
                    is the total modeled latest-review-to-target interval. Watch
                    spans 10 percentage points below target. Arrows, Home and
                    End reveal; Enter and Space pin. Drag box zoom; Shift-drag
                    pans; wheel/pinch zoom. Double-click restores full view and
                    previous pin. Escape cancels a gesture first, then closes.
                  </p>
                  {view.rows.length ? (
                    <RetentionMapCanvas
                      controller={controller}
                      rows={rows}
                      view={view}
                      height={Math.max(
                        60,
                        geometry.bodyHeight -
                          overviewCopy.references -
                          overviewCopy.preview -
                          58,
                      )}
                    />
                  ) : (
                    <p>
                      No active reviewed problems have enough current FSRS data
                      for the Retention Map.
                    </p>
                  )}
                  <div
                    className="cp-retention-card-preview"
                    ref={previewRef}
                    aria-live="polite"
                    role="status"
                  >
                    {preview ? (
                      <span>
                        <span className="sr-only">{preview.title}. </span>
                        <strong>Rank {preview.rank}</strong> ·{' '}
                        {statusLabel(preview.status)} ·{' '}
                        {formatPercent(preview.retrievability)} estimated recall
                        {' · '}
                        {formatDuration(preview.targetDurationDays)} total
                        durability.
                      </span>
                    ) : selection ? (
                      <Button
                        className="cp-analytics-card-control"
                        onClick={() => controller.setSelectionOpen(true)}
                        size="sm"
                        variant="ghost"
                      >
                        Open pinned memory
                      </Button>
                    ) : rows.length === 0 && view.rows.length > 0 ? (
                      <span>
                        No reviewed problems are below the FSRS scheduling
                        target.
                      </span>
                    ) : (
                      <span>
                        {formatCount(visibleCount)} in view ·{' '}
                        {formatCount(rows.length)} matching ·{' '}
                        {formatCount(view.totalEligible)} eligible. Drag box ·
                        Shift-drag pan.
                      </span>
                    )}
                  </div>
                </>
              ) : cardMode === 'selection' ? (
                <div
                  aria-label={
                    candidates.length > 1
                      ? 'Nearby memories'
                      : `${pinned?.title} memory details`
                  }
                  className="cp-retention-selection"
                  id={detailsId}
                  role="dialog"
                >
                  <div className="cp-retention-selection-heading">
                    <span>
                      {candidates.length > 1
                        ? `${candidates.length} nearby memories`
                        : `Rank ${pinned?.rank}`}
                    </span>
                    {candidates.length > 1 ? (
                      <Button
                        className="cp-analytics-card-control"
                        onClick={() => {
                          controller.returnToMap()
                          setMode('overview')
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        Return to map
                      </Button>
                    ) : null}
                    <Button
                      aria-label={
                        candidates.length > 1
                          ? 'Close nearby memories'
                          : `Close ${pinned?.title} memory details`
                      }
                      className="cp-analytics-card-control"
                      onClick={close}
                      ref={closeRef}
                      size="sm"
                      variant="ghost"
                    >
                      Close
                    </Button>
                  </div>
                  {candidates.length > 1 ? (
                    <ol className="cp-retention-candidate-page">
                      {candidates
                        .slice(candidateStart, candidateStart + candidateSize)
                        .map((row) => (
                          <li key={row.slug}>
                            <div>
                              Rank {row.rank} · <ProblemLink row={row} />
                            </div>
                            <span>
                              {statusLabel(row.status)} ·{' '}
                              {formatPercent(row.retrievability)}{' '}
                              model-estimated recall ·{' '}
                              {formatDuration(row.targetDurationDays)} total
                              durability
                            </span>
                            <Button
                              aria-label={`Choose ${row.title}`}
                              className="cp-analytics-card-control"
                              onClick={() => {
                                controller.choose(row.slug)
                                setFieldGroup('recall')
                              }}
                              size="sm"
                              variant="outline"
                            >
                              Choose
                            </Button>
                          </li>
                        ))}
                    </ol>
                  ) : pinned ? (
                    <>
                      <ProblemLink row={pinned} />
                      <AnalyticsCardControls
                        label="Pinned memory fields"
                        value={fieldGroup}
                        options={fieldGroups.map((group) => ({
                          value: group.key,
                          label: group.label,
                        }))}
                        onChange={setFieldGroup}
                      />
                      <dl className="cp-retention-pinned-values">
                        {pinnedFields.map((field) => (
                          <div key={field.key}>
                            <dt>
                              {field.key === 'difficulty'
                                ? 'FSRS difficulty'
                                : field.key === 'target'
                                  ? 'FSRS scheduling target'
                                  : field.label}
                            </dt>
                            <dd>{field.value(pinned)}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  ) : null}
                </div>
              ) : (
                <>
                  <select
                    aria-label="Retention Map detail section"
                    className="cp-analytics-adapter-select"
                    value={section}
                    onChange={(event) => {
                      setSection(event.target.value as DetailSection)
                      setMethodPage(0)
                      setSummaryPage(0)
                    }}
                  >
                    <option value="summary">Summary</option>
                    <option value="problems">Problems</option>
                    <option value="method">Method</option>
                  </select>
                  {section === 'problems' ? (
                    <AnalyticsExactTable
                      label="Retention Problems"
                      rows={rows}
                      rowKey={(row) => row.slug}
                      rowLabel={(row) => (
                        <span>
                          Rank {row.rank} · <ProblemLink row={row} />
                        </span>
                      )}
                      rowLabelHeading="Problem"
                      fields={fields}
                      groups={fieldGroups}
                      width={geometry.width}
                      page={problemPage}
                      pageSize={problemPageSize(geometry, rows)}
                      onPageChange={setProblemPage}
                      resetKey={reportKey}
                      emptyMessage={
                        view.rows.length
                          ? 'No reviewed problems are below the FSRS scheduling target.'
                          : 'No eligible current FSRS problems.'
                      }
                    />
                  ) : section === 'method' ? (
                    methodPages[methodPage]
                  ) : (
                    summaryPages[summaryPage]
                  )}
                </>
              )}
            </div>
          )
        }}
      </AnalyticsChartPanel>
    </div>
  )
}
