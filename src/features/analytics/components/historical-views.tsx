import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'

import { ChartTable } from '@/components/ui/chart-table'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import type { AnalyticsViews } from '../api/analytics-contracts'
import { formatCount, formatPercent } from './charts/chart-shared'

export {
  ObservedRecallVsFsrsView,
  RatingsMixView,
} from './recall-ratings-views'
export { MemoryStrengthView, PracticeRhythmView } from './memory-practice-views'
export { PracticeRatingsView } from './practice-ratings-view'
export { NewProblemSuccessView } from './new-problem-success-view'

const chartDimension = { width: 640, height: 288 }

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
                reviewSuccess: {
                  label: 'Review Success',
                  color: 'var(--cp-analytics-attention)',
                },
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
