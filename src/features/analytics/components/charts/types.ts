import type { SerializedAnalyticsSummary } from '../../api/analytics-contracts'

export type AnalyticsChartSemanticColor =
  | 'var(--cp-analytics-again)'
  | 'var(--cp-analytics-attention)'
  | 'var(--cp-analytics-easy)'
  | 'var(--cp-analytics-first-success)'
  | 'var(--cp-analytics-first-good-easy)'
  | 'var(--cp-analytics-good)'
  | 'var(--cp-analytics-hard)'
  | 'var(--cp-analytics-healthy)'
  | 'var(--cp-analytics-observed)'
  | 'var(--cp-analytics-practice-volume)'
  | 'var(--cp-analytics-predicted)'
  | 'var(--cp-analytics-risk)'
  | 'var(--cp-analytics-target)'

export interface AnalyticsLegendItem {
  color: AnalyticsChartSemanticColor
  label: string
  note?: string
}

export interface AnalyticsTooltipField {
  key: string
  label: string
}

export type RecallQualityPoint =
  SerializedAnalyticsSummary['recallQuality'][number]
export type PracticeRhythmPoint =
  SerializedAnalyticsSummary['practiceRhythm'][number]
export type RatingsMixPoint = SerializedAnalyticsSummary['ratingsMix'][number]
export type HardAgainSummary = SerializedAnalyticsSummary['hardAgain']
export type TopicPoint = SerializedAnalyticsSummary['topics'][number]
export type StabilityPoint = SerializedAnalyticsSummary['stability'][number]
