import type {
  AnalyticsChartSemanticColor,
  AnalyticsTooltipField,
} from './types'

type ChartSeriesDefinition = {
  key: string
  label: string
  mark: 'area' | 'bar' | 'line' | 'reference-line' | 'stacked-bar'
  color: AnalyticsChartSemanticColor
}

type LiveChartDefinition = {
  id: string
  title: string
  question?: string
  metricMeaning: string
  series: readonly ChartSeriesDefinition[]
  tooltipFields: readonly AnalyticsTooltipField[]
  interpretationWarning?: string
}

const observed = 'var(--cp-analytics-observed)' as const
const predicted = 'var(--cp-analytics-predicted)' as const
const target = 'var(--cp-analytics-target)' as const
const practiceVolume = 'var(--cp-analytics-practice-volume)' as const
const again = 'var(--cp-analytics-again)' as const
const hard = 'var(--cp-analytics-hard)' as const
const good = 'var(--cp-analytics-good)' as const
const easy = 'var(--cp-analytics-easy)' as const
const healthy = 'var(--cp-analytics-healthy)' as const
const attention = 'var(--cp-analytics-attention)' as const

export const analyticsChartDefinitions = {
  firstAttemptOutcomes: {
    id: 'new-problem-success',
    title: 'New Problem Success',
    question: 'How are your first recorded outcomes changing?',
    metricMeaning:
      'Hard + Good + Easy and Good + Easy outcomes divide by the same valid first-recorded rating population in retained history.',
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
    tooltipFields: [
      { key: 'firstAttemptSuccess', label: 'Hard + Good + Easy' },
      { key: 'firstAttemptGoodEasy', label: 'Good + Easy' },
      { key: 'validFirstAttempts', label: 'Valid first recorded outcomes' },
      { key: 'recordedFirstAttempts', label: 'Recorded first attempts' },
      { key: 'excludedInvalidRatings', label: 'Excluded invalid ratings' },
      {
        key: 'targetFirstAttemptSuccess',
        label: 'Target First-attempt Success',
      },
      { key: 'targetFirstAttemptGoodEasy', label: 'Target Good + Easy' },
    ],
    interpretationWarning:
      'Recorded assessment outcomes do not prove unassisted solving or first-ever exposure.',
  },
  recallQuality: {
    id: 'recall-quality',
    title: 'Recall quality',
    question: 'How is observed recall comparing with the FSRS prediction?',
    metricMeaning:
      'Observed correctness is the share of eligible reviews recorded as correct; predicted recall is FSRS retrievability immediately before review.',
    series: [
      {
        key: 'observedRecall',
        label: 'Observed correctness',
        mark: 'line',
        color: observed,
      },
      {
        key: 'predictedRecall',
        label: 'Predicted recall',
        mark: 'line',
        color: predicted,
      },
      {
        key: 'targetRetention',
        label: 'Target retention',
        mark: 'reference-line',
        color: target,
      },
    ],
    tooltipFields: [
      { key: 'observedRecall', label: 'Observed correctness' },
      { key: 'predictedRecall', label: 'Predicted recall (FSRS estimate)' },
      { key: 'eligibleSampleSize', label: 'Eligible reviews' },
      { key: 'reviewCount', label: 'All reviews' },
    ],
  },
  practiceRhythm: {
    id: 'practice-rhythm',
    title: 'Practice rhythm',
    metricMeaning:
      'Review volume and observed correctness are shown together by adaptive presentation bucket.',
    series: [
      {
        key: 'reviewCount',
        label: 'Review volume',
        mark: 'bar',
        color: practiceVolume,
      },
      {
        key: 'observedCorrectness',
        label: 'Observed correctness',
        mark: 'line',
        color: observed,
      },
    ],
    tooltipFields: [
      { key: 'reviewCount', label: 'Reviews' },
      { key: 'observedCorrectness', label: 'Observed correctness' },
      { key: 'sampleSize', label: 'Eligible reviews' },
    ],
    interpretationWarning: 'Association, not causation.',
  },
  ratingsMix: {
    id: 'ratings-mix',
    title: 'Ratings mix',
    metricMeaning:
      'The share of Again, Hard, Good, and Easy ratings in each adaptive presentation bucket.',
    series: [
      { key: 'again', label: 'Again', mark: 'stacked-bar', color: again },
      { key: 'hard', label: 'Hard', mark: 'stacked-bar', color: hard },
      { key: 'good', label: 'Good', mark: 'stacked-bar', color: good },
      { key: 'easy', label: 'Easy', mark: 'stacked-bar', color: easy },
    ],
    tooltipFields: [
      { key: 'again', label: 'Again ratings' },
      { key: 'hard', label: 'Hard ratings' },
      { key: 'good', label: 'Good ratings' },
      { key: 'easy', label: 'Easy ratings' },
      { key: 'hardAgainShare', label: 'Hard + Again share' },
    ],
  },
  weakestTopics: {
    id: 'weakest-topics',
    title: 'Where to focus',
    metricMeaning:
      'Topics are ranked by observed correctness so lower-performing areas are easier to focus on first.',
    series: [
      {
        key: 'recallQuality',
        label: 'Recall quality',
        mark: 'bar',
        color: attention,
      },
    ],
    tooltipFields: [
      { key: 'topic', label: 'Topic' },
      { key: 'recallQuality', label: 'Observed correctness' },
      { key: 'sampleSize', label: 'Eligible reviews' },
    ],
  },
  memoryStrength: {
    id: 'memory-strength',
    title: 'Memory strength',
    metricMeaning:
      'FSRS stability is the approximate number of days the model expects memory to remain durable.',
    series: [
      {
        key: 'medianStabilityDays',
        label: 'Median stability',
        mark: 'line',
        color: healthy,
      },
    ],
    tooltipFields: [
      { key: 'medianStabilityDays', label: 'Median stability' },
      { key: 'sampleSize', label: 'Valid FSRS samples' },
    ],
  },
} as const satisfies Record<string, LiveChartDefinition>
