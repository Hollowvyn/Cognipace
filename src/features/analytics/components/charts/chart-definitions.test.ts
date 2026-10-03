import { describe, expect, it } from 'vitest'

import { analyticsChartDefinitions } from './chart-definitions'

describe('analytics chart definitions', () => {
  it('describes first outcomes as two rating-based rates in the same first-recorded cohort', () => {
    expect(analyticsChartDefinitions.firstAttemptOutcomes).toMatchObject({
      id: 'new-problem-success',
      title: 'New Problem Success',
      question: 'How are your first recorded outcomes changing?',
      series: [
        {
          key: 'firstAttemptSuccess',
          label: 'Hard + Good + Easy',
          mark: 'line',
          color: 'var(--cp-analytics-first-success)',
        },
        {
          key: 'firstAttemptGoodEasy',
          label: 'Good + Easy',
          mark: 'line',
          color: 'var(--cp-analytics-first-good-easy)',
        },
        {
          key: 'targetFirstAttemptSuccess',
          label: 'Target First-attempt Success',
          mark: 'reference-line',
          color: 'var(--cp-analytics-first-success)',
        },
        {
          key: 'targetFirstAttemptGoodEasy',
          label: 'Target Good + Easy',
          mark: 'reference-line',
          color: 'var(--cp-analytics-first-good-easy)',
        },
      ],
    })
    expect(
      analyticsChartDefinitions.firstAttemptOutcomes.metricMeaning,
    ).toContain('same valid first-recorded')
  })

  it('keeps the live chart series aligned with their serialized keys', () => {
    expect(analyticsChartDefinitions.recallQuality.series).toEqual([
      expect.objectContaining({
        key: 'observedRecall',
        label: 'Observed correctness',
        mark: 'line',
        color: 'var(--cp-analytics-observed)',
      }),
      expect.objectContaining({
        key: 'predictedRecall',
        label: 'Predicted recall',
        mark: 'line',
        color: 'var(--cp-analytics-predicted)',
      }),
      expect.objectContaining({
        key: 'targetRetention',
        label: 'Target retention',
        mark: 'reference-line',
        color: 'var(--cp-analytics-target)',
      }),
    ])

    expect(analyticsChartDefinitions.ratingsMix.series).toEqual([
      expect.objectContaining({
        key: 'again',
        color: 'var(--cp-analytics-again)',
      }),
      expect.objectContaining({
        key: 'hard',
        color: 'var(--cp-analytics-hard)',
      }),
      expect.objectContaining({
        key: 'good',
        color: 'var(--cp-analytics-good)',
      }),
      expect.objectContaining({
        key: 'easy',
        color: 'var(--cp-analytics-easy)',
      }),
    ])
  })

  it('contains one meaning, series list, and exact-value field list per live chart', () => {
    for (const definition of Object.values(analyticsChartDefinitions)) {
      expect(definition.metricMeaning).not.toHaveLength(0)
      expect(definition.tooltipFields.length).toBeGreaterThan(0)
      expect(definition.series.length).toBeGreaterThan(0)
    }
    expect(analyticsChartDefinitions.practiceRhythm.interpretationWarning).toBe(
      'Association, not causation.',
    )
  })
})
