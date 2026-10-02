export interface AnalyticsMetricDefinition {
  label: string
  question?: string
  explanation: string
  warning?: string
  unit: string
  lowSampleOrEmptyState: string
}

export const metricDefinitions = {
  observedCorrectness: {
    label: 'Observed correctness',
    explanation:
      'The share of persisted review assessments marked correct. The current history does not identify retries or hints.',
    unit: '% correct',
    lowSampleOrEmptyState:
      'Not enough assessed reviews yet. Reviews without a persisted correctness value do not count.',
  },
} satisfies Record<string, AnalyticsMetricDefinition>
