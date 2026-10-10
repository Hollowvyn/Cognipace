import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createSerializedAnalyticsSummary } from '@/testing/analytics-fixtures'
import type { SerializedAnalyticsSummary } from '../api/analytics-contracts'
import { AnalyticsMetricRow } from './analytics-metric-row'

const activity: SerializedAnalyticsSummary['activity'] = {
  assessmentDays: 12,
  recordedAssessments: 60,
  knownCorrectnessAssessments: 40,
  successfulAssessments: 30,
  distinctSuccessfulProblems: 22,
  observedCorrectness: 0.75,
  timedSuccessfulAssessments: 24,
  untimedSuccessfulAssessments: 6,
  successfulRecordedSeconds: 5400,
}

function renderMetrics(overrides: Partial<SerializedAnalyticsSummary> = {}) {
  render(
    <AnalyticsMetricRow
      summary={createSerializedAnalyticsSummary({
        activity,
        reviewDays: 42,
        totalReviews: 381,
        observedRatingQuality: { value: 0.2, sampleSize: 60, lowSample: false },
        ...overrides,
      })}
    />,
  )
}

function metric(name: string) {
  return within(screen.getByLabelText(`${name} metric`))
}

describe('AnalyticsMetricRow', () => {
  it('uses only selected persisted activity for four ordered headlines', () => {
    renderMetrics({ lowSample: true })
    expect(
      screen.getAllByRole('heading').map((node) => node.textContent),
    ).toEqual([
      'Review days',
      'Questions solved',
      'Observed correctness',
      'Recorded solve time',
    ])
    expect(metric('Review Days').getByText('12')).toBeVisible()
    expect(metric('Questions solved').getByText('22')).toBeVisible()
    expect(metric('Observed correctness').getByText('75%')).toBeVisible()
    expect(
      metric('Observed correctness').getByText('30 of 40 assessed'),
    ).toBeVisible()
    expect(metric('Recorded solve time').getByText('1h 30m')).toBeVisible()
    expect(
      metric('Recorded solve time').getByText(
        /24 of 30 successful attempts timed/,
      ),
    ).toHaveTextContent('6 untimed')
    expect(
      screen.queryByText(/needs more data|all-time review attempts/i),
    ).not.toBeInTheDocument()
  })

  it.each([30, 90, 'all'] as const)(
    'keeps the activity values and literal range for %s',
    (range) => {
      renderMetrics({ range })
      expect(metric('Review Days').getByText('12')).toBeVisible()
      expect(metric('Questions solved').getByText('22')).toBeVisible()
      expect(screen.queryByText(/all-day|381|42/)).not.toBeInTheDocument()
    },
  )

  it('keeps positive sub-minute time distinct from measured zero', () => {
    renderMetrics({ activity: { ...activity, successfulRecordedSeconds: 35 } })
    expect(metric('Recorded solve time').getByText('35s')).toHaveAttribute(
      'title',
      '35 recorded seconds',
    )
  })

  it('does not imply successful results when every correctness flag is unknown', () => {
    renderMetrics({
      activity: {
        ...activity,
        knownCorrectnessAssessments: 0,
        successfulAssessments: 0,
        distinctSuccessfulProblems: null,
        observedCorrectness: null,
        timedSuccessfulAssessments: 0,
        untimedSuccessfulAssessments: 0,
        successfulRecordedSeconds: null,
      },
    })
    for (const name of [
      'Questions solved',
      'Observed correctness',
      'Recorded solve time',
    ])
      expect(metric(name).getByText('Unavailable')).toBeVisible()
  })

  it.each(['empty', 'known-failures'])(
    'retains measured zero for %s activity',
    (kind) => {
      const empty = createSerializedAnalyticsSummary().activity
      renderMetrics({
        activity:
          kind === 'empty'
            ? empty
            : {
                ...empty,
                assessmentDays: 1,
                recordedAssessments: 2,
                knownCorrectnessAssessments: 2,
                observedCorrectness: 0,
              },
      })
      expect(metric('Questions solved').getByText('0')).toBeVisible()
      expect(metric('Recorded solve time').getByText('0m')).toBeVisible()
      expect(
        metric('Observed correctness').getByText(
          kind === 'empty' ? 'Unavailable' : '0%',
        ),
      ).toBeVisible()
    },
  )

  it('keeps successful attempts with missing timing unavailable with exact coverage', () => {
    renderMetrics({
      activity: {
        ...activity,
        timedSuccessfulAssessments: 0,
        untimedSuccessfulAssessments: 30,
        successfulRecordedSeconds: null,
      },
    })
    expect(metric('Recorded solve time').getByText('Unavailable')).toBeVisible()
    expect(
      metric('Recorded solve time').getByText(
        /0 of 30 successful attempts timed/,
      ),
    ).toHaveTextContent('30 untimed')
  })
})
