import { useState } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  LabelList,
  XAxis,
  YAxis,
} from 'recharts'

import { ChartTable } from '@/components/ui/chart-table'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'

import type { AnalyticsViews } from '../api/analytics-contracts'
import { LineSegments } from './charts/line-segments'
import {
  formatBucketLabel,
  formatCount,
  formatDays,
  formatPercent,
} from './charts/chart-shared'

const chartDimension = { width: 640, height: 288 }

export function ObservedRecallVsFsrsView({
  view,
}: {
  view: AnalyticsViews['observedRecallVsFsrs']
}) {
  const hasValues = view.rows.some((row) => row.observedRecall !== null)
  return (
    <ChartTable
      chart={
        hasValues ? (
          <div className="grid gap-2">
            <ChartContainer
              accessibleDescription={`Paired review outcomes and reconstructed FSRS estimates. Scale: ${formatPercent(view.scale.domain[0])}–${formatPercent(view.scale.domain[1])}.`}
              accessibleName="Observed Recall vs FSRS Estimate chart"
              aria-label="Observed Recall vs FSRS Estimate chart"
              className="aspect-auto h-80 min-h-[20rem]"
              config={{
                observedRecall: 'var(--cp-analytics-observed)',
                fsrsEstimate: 'var(--cp-analytics-predicted)',
              }}
              initialDimension={chartDimension}
              role="img"
            >
              <ComposedChart
                accessibilityLayer
                data={view.rows}
                margin={{ bottom: 4, left: 0, right: 8, top: 8 }}
              >
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  axisLine={false}
                  allowDuplicatedCategory={false}
                  dataKey="bucketStart"
                  minTickGap={32}
                  tickFormatter={(value) =>
                    formatRowBucket(
                      view.rows.find((row) => row.bucketStart === value),
                    )
                  }
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  domain={view.scale.domain}
                  ticks={view.scale.ticks}
                  tickFormatter={formatPercent}
                  tickLine={false}
                  width={44}
                />
                <ChartTooltip content={<RecallTooltip />} />
                <ReferenceLine
                  label="Target retention"
                  stroke="var(--cp-analytics-target)"
                  strokeDasharray="5 5"
                  y={view.targetRetention}
                />
                <LineSegments
                  data={view.rows}
                  dataKey="observedRecall"
                  seriesKey="Observed recall"
                  showMeasuredDots
                  stroke="var(--cp-analytics-observed)"
                  testId="observed-recall"
                  type="linear"
                />
                <LineSegments
                  data={view.rows}
                  dataKey="fsrsEstimate"
                  seriesKey="FSRS estimate"
                  showMeasuredDots
                  stroke="var(--cp-analytics-predicted)"
                  strokeDasharray="6 3"
                  testId="fsrs-estimate"
                  type="linear"
                />
              </ComposedChart>
            </ChartContainer>
            <RecallLegend />
          </div>
        ) : (
          <Empty message="No reviews in this period have both a valid rating and an FSRS estimate." />
        )
      }
      table={
        <ObservedRecallTable
          rows={view.rows}
          resetKey={view.rows.map((row) => row.id).join('|')}
        />
      }
    />
  )
}

export function MemoryStrengthView({
  view,
}: {
  view: AnalyticsViews['memoryStrength']
}) {
  const hasValues = view.rows.some((row) => row.medianStrengthDays !== null)
  const chartRows = view.rows.map((row) => ({
    ...row,
    iqrBase: row.q1,
    iqrRange: row.q1 === null || row.q3 === null ? null : row.q3 - row.q1,
  }))
  return (
    <ChartTable
      chart={
        hasValues ? (
          <ChartContainer
            accessibleDescription={`Median post-review FSRS stability. Scale: ${formatDays(view.scale.domain[0])}–${formatDays(view.scale.domain[1])}.`}
            accessibleName="Memory Strength chart"
            aria-label="Memory Strength chart"
            className="aspect-auto h-72 min-h-[18rem]"
            config={{
              medianStrengthDays: 'var(--cp-analytics-healthy)',
            }}
            initialDimension={chartDimension}
            role="img"
          >
            <ComposedChart
              accessibilityLayer
              data={chartRows}
              margin={{ bottom: 4, left: 0, right: 8, top: 8 }}
            >
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis
                axisLine={false}
                allowDuplicatedCategory={false}
                dataKey="bucketStart"
                minTickGap={32}
                tickFormatter={(value) =>
                  formatRowBucket(
                    chartRows.find((row) => row.bucketStart === value),
                  )
                }
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                domain={view.scale.domain}
                ticks={view.scale.ticks}
                tickFormatter={formatDays}
                tickLine={false}
                width={48}
              />
              <ChartTooltip content={<MemoryTooltip />} />
              <Area
                dataKey="iqrBase"
                fill="transparent"
                stackId="memory-strength-iqr"
                stroke="transparent"
              />
              <Area
                data-testid="memory-strength-iqr-band"
                dataKey="iqrRange"
                fill="var(--cp-analytics-healthy)"
                fillOpacity={0.18}
                stackId="memory-strength-iqr"
                stroke="none"
              />
              <LineSegments
                data={chartRows}
                dataKey="medianStrengthDays"
                seriesKey="Median strength"
                showMeasuredDots
                stroke="var(--cp-analytics-healthy)"
                testId="memory-strength"
                type="linear"
              />
            </ComposedChart>
          </ChartContainer>
        ) : (
          <Empty message="No valid post-review FSRS stability is available in this period." />
        )
      }
      table={
        <MemoryStrengthTable
          rows={view.rows}
          resetKey={view.rows.map((row) => row.id).join('|')}
        />
      }
    />
  )
}

export function PracticeRhythmView({
  view,
}: {
  view: AnalyticsViews['practiceRhythm']
}) {
  const hasReviews = view.rows.some((row) => row.completedReviews > 0)
  return (
    <div className="grid gap-2">
      <p className="m-0 text-sm font-medium text-foreground">
        Association, not causation.
      </p>
      <ChartTable
        chart={
          hasReviews ? (
            <ChartContainer
              accessibleDescription={`Completed reviews and Review Success. Review count scale: ${view.countScale.domain.join('–')}; Review Success scale: ${formatPercent(view.percentageScale.domain[0])}–${formatPercent(view.percentageScale.domain[1])}. Association, not causation.`}
              accessibleName="Practice Rhythm chart"
              aria-label="Practice Rhythm chart"
              className="aspect-auto h-72 min-h-[18rem]"
              config={{
                completedReviews: 'var(--cp-analytics-practice-volume)',
                reviewSuccess: 'var(--cp-analytics-observed)',
              }}
              initialDimension={chartDimension}
              role="img"
            >
              <ComposedChart
                accessibilityLayer
                data={view.rows}
                margin={{ bottom: 4, left: 0, right: 8, top: 8 }}
              >
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  axisLine={false}
                  allowDuplicatedCategory={false}
                  dataKey="bucketStart"
                  minTickGap={32}
                  tickFormatter={(value) =>
                    formatRowBucket(
                      view.rows.find((row) => row.bucketStart === value),
                    )
                  }
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  domain={view.countScale.domain}
                  ticks={view.countScale.ticks}
                  tickLine={false}
                  width={42}
                  yAxisId="count"
                />
                <YAxis
                  axisLine={false}
                  domain={view.percentageScale.domain}
                  orientation="right"
                  tickFormatter={formatPercent}
                  ticks={view.percentageScale.ticks}
                  tickLine={false}
                  width={44}
                  yAxisId="success"
                />
                <ChartTooltip content={<RhythmTooltip />} />
                <Bar
                  dataKey="completedReviews"
                  fill="var(--cp-analytics-practice-volume)"
                  isAnimationActive={false}
                  name="Completed reviews"
                  radius={[3, 3, 0, 0]}
                  yAxisId="count"
                />
                <LineSegments
                  data={view.rows}
                  dataKey="reviewSuccess"
                  seriesKey="Review Success"
                  stroke="var(--cp-analytics-observed)"
                  type="linear"
                  yAxisId="success"
                />
              </ComposedChart>
            </ChartContainer>
          ) : (
            <Empty message="No valid review ratings are available in this period." />
          )
        }
        table={
          <PracticeRhythmTable
            rows={view.rows}
            resetKey={view.rows.map((row) => row.id).join('|')}
          />
        }
      />
    </div>
  )
}

export function RatingsMixView({
  view,
}: {
  view: AnalyticsViews['ratingsMix']
}) {
  const hasRatings = view.rows.some((row) => row.validRatings > 0)
  const challengingShare =
    view.selectedValidRatings === 0
      ? null
      : view.selectedHardAgain / view.selectedValidRatings

  return (
    <div className="grid gap-2">
      <ChartTable
        chart={
          hasRatings ? (
            <div className="grid gap-2">
              <ChartContainer
                accessibleDescription={`Again, Hard, Good, and Easy shares for valid ratings in each selected-period bucket. Scale: 0%–100%. ${formatCount(view.selectedValidRatings)} valid ratings in the selected period.`}
                accessibleName="Ratings Mix chart"
                aria-label="Ratings Mix chart"
                aria-roledescription="100% stacked column chart"
                className="aspect-auto h-72 min-h-[18rem]"
                config={{
                  againShare: 'var(--cp-analytics-again)',
                  hardShare: 'var(--cp-analytics-hard)',
                  goodShare: 'var(--cp-analytics-good)',
                  easyShare: 'var(--cp-analytics-easy)',
                }}
                initialDimension={chartDimension}
                role="img"
              >
                <BarChart
                  accessibilityLayer
                  data={view.rows}
                  data-testid="ratings-mix-keyboard-chart"
                  margin={{ bottom: 4, left: 0, right: 8, top: 8 }}
                >
                  <CartesianGrid
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    axisLine={false}
                    allowDuplicatedCategory={false}
                    dataKey="bucketStart"
                    minTickGap={32}
                    tickFormatter={(value) =>
                      formatRowBucket(
                        view.rows.find((row) => row.bucketStart === value),
                      )
                    }
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    domain={[0, 1]}
                    tickFormatter={formatPercent}
                    ticks={[0, 0.25, 0.5, 0.75, 1]}
                    tickLine={false}
                    width={44}
                  />
                  <ChartTooltip content={<RatingsMixTooltip />} />
                  <Bar
                    dataKey="againShare"
                    fill="var(--cp-analytics-again)"
                    isAnimationActive={false}
                    name="Again"
                    stackId="ratings"
                  />
                  <Bar
                    dataKey="hardShare"
                    fill="var(--cp-analytics-hard)"
                    isAnimationActive={false}
                    name="Hard"
                    stackId="ratings"
                  />
                  <Bar
                    dataKey="goodShare"
                    fill="var(--cp-analytics-good)"
                    isAnimationActive={false}
                    name="Good"
                    stackId="ratings"
                  />
                  <Bar
                    dataKey="easyShare"
                    fill="var(--cp-analytics-easy)"
                    isAnimationActive={false}
                    name="Easy"
                    stackId="ratings"
                  />
                </BarChart>
              </ChartContainer>
              <RatingsMixLegend />
            </div>
          ) : (
            <Empty message="No valid review ratings are available in this period." />
          )
        }
        table={
          <RatingsMixTable
            rows={view.rows}
            resetKey={view.rows.map((row) => row.id).join('|')}
          />
        }
      />
      <p className="m-0 text-sm text-muted-foreground">
        This period&apos;s rating mix is based on{' '}
        {formatCount(view.selectedValidRatings)} valid ratings. Hard + Again:{' '}
        {formatCount(view.selectedHardAgain)} of{' '}
        {formatCount(view.selectedValidRatings)} (
        {formatPercent(challengingShare)}).
      </p>
      {view.comparison.direction !== null &&
      view.comparison.difference !== null &&
      view.comparison.previousHardAgainShare !== null ? (
        <p className="m-0 text-sm text-muted-foreground">
          Hard + Again is {view.comparison.direction}{' '}
          {formatDifferencePoints(view.comparison.difference)} from the
          equivalent prior period (
          {formatPercent(view.comparison.previousHardAgainShare)};{' '}
          {formatCount(view.comparison.previousValidRatings)} valid ratings).
        </p>
      ) : null}
    </div>
  )
}

export function TopicPerformanceView({
  selectedPeriod,
  view,
}: {
  selectedPeriod: string
  view: AnalyticsViews['topicPerformance']
}) {
  const hasTopics = view.rows.length > 0
  return (
    <div className="grid gap-2">
      <ChartTable
        chart={
          hasTopics ? (
            <ChartContainer
              accessibleDescription={`Ranked Topic Review Success for the selected period. Scale: 0%–100%. ${formatCount(view.rows.length)} of ${formatCount(qualifyingTopicCount(view))} qualifying topics shown.`}
              accessibleName="Topic Performance chart"
              aria-label="Topic Performance chart"
              aria-roledescription="ranked horizontal bar chart"
              className="aspect-auto h-72 min-h-[18rem]"
              config={{
                reviewSuccess: 'var(--cp-analytics-attention)',
              }}
              initialDimension={chartDimension}
              role="img"
            >
              <BarChart
                accessibilityLayer
                data={view.rows}
                data-testid="topic-performance-keyboard-chart"
                layout="vertical"
                margin={{ bottom: 4, left: 8, right: 36, top: 8 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="var(--color-border)"
                />
                <XAxis
                  axisLine={false}
                  domain={[0, 1]}
                  tickFormatter={formatPercent}
                  tickLine={false}
                  type="number"
                />
                <YAxis
                  axisLine={false}
                  dataKey="topic"
                  tickLine={false}
                  type="category"
                  width={108}
                />
                <ChartTooltip
                  content={
                    <TopicPerformanceTooltip selectedPeriod={selectedPeriod} />
                  }
                />
                <Bar
                  dataKey="reviewSuccess"
                  fill="var(--cp-analytics-attention)"
                  isAnimationActive={false}
                  name="Review Success"
                  radius={[0, 3, 3, 0]}
                >
                  <LabelList
                    dataKey="reviewSuccess"
                    formatter={(value) =>
                      formatPercent(typeof value === 'number' ? value : null)
                    }
                    position="right"
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <Empty message="No topic has at least 10 valid ratings across 3 reviewed problems in this period." />
          )
        }
        table={<TopicPerformanceTable rows={view.rows} />}
      />
      <p className="m-0 text-sm text-muted-foreground">
        Showing the qualifying topics with the lowest Review Success in this
        period.
        {view.strongerQualifyingTopics > 0
          ? ` ${formatCount(view.strongerQualifyingTopics)} stronger qualifying topic${view.strongerQualifyingTopics === 1 ? '' : 's'} omitted.`
          : ''}
      </p>
      <p className="m-0 text-sm text-muted-foreground" role="status">
        {formatTopicPerformanceStatus(view)}
      </p>
      {view.lowEvidenceTopics.length > 0 ? (
        <details className="text-sm text-muted-foreground">
          <summary>Calculation details</summary>
          <p>
            Low-evidence topics:{' '}
            {view.lowEvidenceTopics
              .map(
                (topic) =>
                  `${topic.topic} (${formatCount(topic.validRatings)} valid ratings across ${formatCount(topic.distinctProblems)} problems)`,
              )
              .join(', ')}
            .
            {view.additionalLowEvidenceTopics > 0
              ? ` ${formatCount(view.additionalLowEvidenceTopics)} more low-evidence topic${view.additionalLowEvidenceTopics === 1 ? '' : 's'} not listed.`
              : ''}
          </p>
        </details>
      ) : null}
    </div>
  )
}

function qualifyingTopicCount(view: AnalyticsViews['topicPerformance']) {
  return view.rows.length + view.strongerQualifyingTopics
}

function formatTopicPerformanceStatus(
  view: AnalyticsViews['topicPerformance'],
) {
  const qualifying = qualifyingTopicCount(view)
  return qualifying === 0
    ? 'No topic meets the 10 valid-rating and 3 reviewed-problem gates in this period.'
    : `${formatCount(qualifying)} qualifying topic${qualifying === 1 ? '' : 's'} ${qualifying === 1 ? 'meets' : 'meet'} the 10 valid-rating and 3 reviewed-problem gates.`
}

function RatingsMixLegend() {
  const categories = [
    ['Again', 'var(--cp-analytics-again)'],
    ['Hard', 'var(--cp-analytics-hard)'],
    ['Good', 'var(--cp-analytics-good)'],
    ['Easy', 'var(--cp-analytics-easy)'],
  ] as const

  return (
    <ul
      aria-label="Ratings Mix categories"
      className="m-0 flex flex-wrap justify-center gap-x-4 gap-y-1 p-0 text-xs"
      role="list"
    >
      {categories.map(([label, color]) => (
        <li className="flex items-center gap-1" key={label}>
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: color }}
          />
          {label}
        </li>
      ))}
    </ul>
  )
}

function ObservedRecallTable({
  rows,
  resetKey,
}: {
  rows: AnalyticsViews['observedRecallVsFsrs']['rows']
  resetKey: string
}) {
  return (
    <PagedTable
      caption="Observed Recall vs FSRS Estimate exact values"
      headers={[
        'Bucket',
        'Recalled',
        'Paired reviews',
        'Observed recall',
        'FSRS estimate',
        'Difference',
        'Provenance',
        'Evidence',
      ]}
      resetKey={resetKey}
      rows={rows}
      cells={(row) => [
        bucketText(row),
        row.recalledCount,
        row.pairedReviews,
        formatPercent(row.observedRecall),
        formatPercent(row.fsrsEstimate),
        formatDifference(row.difference),
        'Reconstructed',
        evidenceText(row.evidence),
      ]}
    />
  )
}

function MemoryStrengthTable({
  rows,
  resetKey,
}: {
  rows: AnalyticsViews['memoryStrength']['rows']
  resetKey: string
}) {
  return (
    <PagedTable
      caption="Memory Strength exact values"
      headers={[
        'Bucket',
        'Median strength',
        'Middle 50%',
        'Eligible reviews',
        'Median change',
        'Provenance',
        'Evidence',
      ]}
      resetKey={resetKey}
      rows={rows}
      cells={(row) => [
        bucketText(row),
        formatDays(row.medianStrengthDays),
        row.q1 === null || row.q3 === null
          ? 'Not measured'
          : `${formatDays(row.q1)}–${formatDays(row.q3)}`,
        row.eligibleReviews,
        formatSignedDays(row.medianChangeDays),
        'Reconstructed',
        evidenceText(row.evidence),
      ]}
    />
  )
}

function PracticeRhythmTable({
  rows,
  resetKey,
}: {
  rows: AnalyticsViews['practiceRhythm']['rows']
  resetKey: string
}) {
  return (
    <PagedTable
      caption="Practice Rhythm exact values"
      headers={[
        'Bucket',
        'Completed reviews',
        'Good + Easy',
        'Review Success',
        'Evidence',
      ]}
      resetKey={resetKey}
      rows={rows}
      cells={(row) => [
        bucketText(row),
        row.completedReviews,
        `${row.goodEasy} of ${row.validRatings}`,
        formatPercent(row.reviewSuccess),
        evidenceText(row.evidence),
      ]}
    />
  )
}

function RatingsMixTable({
  rows,
  resetKey,
}: {
  rows: AnalyticsViews['ratingsMix']['rows']
  resetKey: string
}) {
  return (
    <PagedTable
      caption="Ratings Mix exact values"
      headers={[
        'Bucket',
        'Again',
        'Hard',
        'Good',
        'Easy',
        'Valid ratings',
        'Challenging reviews',
        'Evidence',
      ]}
      resetKey={resetKey}
      rows={rows}
      cells={(row) => [
        bucketText(row),
        formatRatingCell(row.again, row.againShare),
        formatRatingCell(row.hard, row.hardShare),
        formatRatingCell(row.good, row.goodShare),
        formatRatingCell(row.easy, row.easyShare),
        formatCount(row.validRatings),
        formatCount(row.challengingReviews),
        `${evidenceText(row.evidence)}${row.isPartial ? ' · In progress' : ''}`,
      ]}
    />
  )
}

function TopicPerformanceTable({
  rows,
}: {
  rows: AnalyticsViews['topicPerformance']['rows']
}) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Topic Performance exact values</caption>
      <thead>
        <tr>
          {[
            'Topic',
            'Review Success',
            'Good + Easy',
            'Valid ratings',
            'Distinct problems',
            'Evidence',
          ].map((header) => (
            <th
              className="px-2 py-2 text-left font-semibold"
              key={header}
              scope="col"
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr className="border-t border-border" key={row.id}>
            <th className="px-2 py-2 text-left font-medium" scope="row">
              {row.topic}
            </th>
            <td className="px-2 py-2 text-right tabular-nums">
              {formatPercent(row.reviewSuccess)}
            </td>
            <td className="px-2 py-2 text-right tabular-nums">
              {formatCount(row.goodEasy)}
            </td>
            <td className="px-2 py-2 text-right tabular-nums">
              {formatCount(row.validRatings)}
            </td>
            <td className="px-2 py-2 text-right tabular-nums">
              {formatCount(row.distinctProblems)}
            </td>
            <td className="px-2 py-2 text-right">{row.evidence}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PagedTable<Row extends { id: string }>({
  caption,
  headers,
  rows,
  cells,
  resetKey,
}: {
  caption: string
  headers: string[]
  rows: Row[]
  cells: (row: Row) => Array<string | number>
  resetKey: string
}) {
  const [pagination, setPagination] = useState({ key: resetKey, page: 0 })
  const page = pagination.key === resetKey ? pagination.page : 0
  const pageSize = 7
  const visible = rows.slice(page * pageSize, (page + 1) * pageSize)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  return (
    <div className="grid gap-3">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                className="px-2 py-2 text-left font-semibold"
                key={header}
                scope="col"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr className="border-t border-border" key={row.id}>
              {cells(row).map((cell, index) =>
                index === 0 ? (
                  <th
                    className="px-2 py-2 text-left font-medium"
                    key={`${row.id}-${headers[index]}`}
                    scope="row"
                  >
                    {cell}
                  </th>
                ) : (
                  <td
                    className="px-2 py-2 text-right tabular-nums"
                    key={`${row.id}-${headers[index]}`}
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > pageSize ? (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {pages}
          </span>
          <button
            className="rounded border px-2 py-1 text-sm disabled:opacity-50"
            disabled={page === 0}
            onClick={() =>
              setPagination({ key: resetKey, page: Math.max(0, page - 1) })
            }
            type="button"
          >
            Previous
          </button>
          <button
            className="rounded border px-2 py-1 text-sm disabled:opacity-50"
            disabled={page >= pages - 1}
            onClick={() =>
              setPagination({
                key: resetKey,
                page: Math.min(pages - 1, page + 1),
              })
            }
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}

function RecallTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{
    payload: AnalyticsViews['observedRecallVsFsrs']['rows'][number]
  }>
}) {
  const row = payload?.[0]?.payload
  return active && row ? (
    <TooltipBox
      title={bucketText(row)}
      values={[
        `Recalled: ${row.recalledCount} of ${row.pairedReviews}`,
        `Observed recall: ${formatPercent(row.observedRecall)}`,
        `FSRS estimate: ${formatPercent(row.fsrsEstimate)}`,
        `Difference: ${formatDifference(row.difference)}`,
        'Provenance: Reconstructed',
        `Evidence: ${evidenceText(row.evidence)}`,
      ]}
    />
  ) : null
}
function MemoryTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: AnalyticsViews['memoryStrength']['rows'][number] }>
}) {
  const row = payload?.[0]?.payload
  return active && row ? (
    <TooltipBox
      title={bucketText(row)}
      values={[
        `Median strength: ${formatDays(row.medianStrengthDays)}`,
        `Middle 50%: ${row.q1 === null || row.q3 === null ? 'Not measured' : `${formatDays(row.q1)}–${formatDays(row.q3)}`}`,
        `Eligible reviews: ${row.eligibleReviews}`,
        `Median change: ${formatSignedDays(row.medianChangeDays)}`,
        'Provenance: Reconstructed',
        `Evidence: ${evidenceText(row.evidence)}`,
      ]}
    />
  ) : null
}
function RhythmTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: AnalyticsViews['practiceRhythm']['rows'][number] }>
}) {
  const row = payload?.[0]?.payload
  return active && row ? (
    <TooltipBox
      title={bucketText(row)}
      values={[
        `Completed reviews: ${row.completedReviews}`,
        `Review Success: ${formatPercent(row.reviewSuccess)}`,
        `Good + Easy: ${row.goodEasy} of ${row.validRatings}`,
        `Evidence: ${evidenceText(row.evidence)}`,
      ]}
    />
  ) : null
}
function RatingsMixTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: AnalyticsViews['ratingsMix']['rows'][number] }>
}) {
  const row = payload?.[0]?.payload
  return active && row ? (
    <TooltipBox
      title={bucketText(row)}
      values={[
        `Again: ${formatRatingCell(row.again, row.againShare)}`,
        `Hard: ${formatRatingCell(row.hard, row.hardShare)}`,
        `Good: ${formatRatingCell(row.good, row.goodShare)}`,
        `Easy: ${formatRatingCell(row.easy, row.easyShare)}`,
        `Valid ratings: ${formatCount(row.validRatings)}`,
        `Partial state: ${row.isPartial ? 'In progress' : 'Complete'}`,
      ]}
    />
  ) : null
}
function TopicPerformanceTooltip({
  active,
  payload,
  selectedPeriod,
}: {
  active?: boolean
  payload?: Array<{
    payload: AnalyticsViews['topicPerformance']['rows'][number]
  }>
  selectedPeriod: string
}) {
  const row = payload?.[0]?.payload
  return active && row ? (
    <TooltipBox
      title={row.topic}
      values={[
        `Topic: ${row.topic}`,
        `Review Success: ${formatPercent(row.reviewSuccess)}`,
        `Good + Easy: ${formatCount(row.goodEasy)}`,
        `Valid ratings: ${formatCount(row.validRatings)}`,
        `Distinct reviewed problems: ${formatCount(row.distinctProblems)}`,
        `Selected period: ${selectedPeriod}`,
        `Evidence: ${row.evidence}`,
      ]}
    />
  ) : null
}
function TooltipBox({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded border border-border bg-popover p-2 text-xs shadow">
      <p className="m-0 font-semibold">{title}</p>
      {values.map((value) => (
        <p className="m-0" key={value}>
          {value}
        </p>
      ))}
    </div>
  )
}
function Empty({ message }: { message: string }) {
  return (
    <p className="m-0 grid min-h-48 place-items-center text-sm text-muted-foreground">
      {message}
    </p>
  )
}
function formatRowBucket(
  row: { bucketStart: string; bucketEnd: string } | undefined,
) {
  return row ? formatBucketLabel(row.bucketStart, row.bucketEnd) : ''
}
function bucketText(row: {
  bucketStart: string
  bucketEnd: string
  isPartial: boolean
}) {
  return `${formatTableBucket(row.bucketStart, row.bucketEnd)}${row.isPartial ? ' (in progress)' : ''}`
}
function evidenceText(value: 'measured' | 'not-measured') {
  return value === 'measured' ? 'Measured' : 'Not measured'
}
function formatDifference(value: number | null) {
  return value === null
    ? 'Not measured'
    : `${value >= 0 ? '+' : '−'}${Math.round(Math.abs(value) * 100)} pp`
}
function formatRatingCell(count: number, share: number | null) {
  return share === null
    ? `${formatCount(count)} (Not measured)`
    : `${formatCount(count)} (${formatPercent(share)})`
}
function formatDifferencePoints(value: number) {
  return `${Math.round(Math.abs(value) * 100)} pp`
}
function formatSignedDays(value: number | null) {
  return value === null
    ? 'Not measured'
    : `${value >= 0 ? '+' : '−'}${formatDays(Math.abs(value))}`
}

function RecallLegend() {
  return (
    <div
      className="flex flex-wrap gap-4 text-xs text-muted-foreground"
      role="list"
    >
      <LegendLine
        label="Observed recall"
        stroke="var(--cp-analytics-observed)"
      />
      <LegendLine
        dashed
        label="FSRS estimate"
        stroke="var(--cp-analytics-predicted)"
      />
      <LegendLine
        dashed
        label="Target retention"
        stroke="var(--cp-analytics-target)"
      />
    </div>
  )
}

function LegendLine({
  dashed = false,
  label,
  stroke,
}: {
  dashed?: boolean
  label: string
  stroke: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5" role="listitem">
      <span
        aria-hidden="true"
        className="w-5 border-t-2"
        style={{
          borderColor: stroke,
          borderTopStyle: dashed ? 'dashed' : 'solid',
        }}
      />
      {label}
    </span>
  )
}

const tableDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
  year: '2-digit',
})

function formatTableDate(dateKey: string) {
  return tableDateFormatter.format(new Date(`${dateKey}T00:00:00.000Z`))
}

function formatTableBucket(bucketStart: string, bucketEnd: string) {
  return bucketStart === bucketEnd
    ? formatTableDate(bucketStart)
    : `${formatTableDate(bucketStart)}–${formatTableDate(bucketEnd)}`
}
