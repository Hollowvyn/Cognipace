import type { AnalyticsTargets } from '@/features/settings/domain'

import { formatPercent } from './charts/chart-shared'

export const targetMetrics = {
  recall: {
    key: 'targetRecall',
    label: 'Target Recall',
    color: 'var(--cp-analytics-target)',
    hint: (targets: AnalyticsTargets) =>
      `Hard + Good + Easy · Up to Review Success ${formatPercent(targets.targetReviewSuccess)}.`,
  },
  reviewSuccess: {
    key: 'targetReviewSuccess',
    label: 'Target Review Success',
    color: 'var(--cp-analytics-target)',
    hint: (targets: AnalyticsTargets) =>
      `Good + Easy · At least Recall ${formatPercent(targets.targetRecall)}.`,
  },
  firstAttemptSuccess: {
    key: 'targetFirstAttemptSuccess',
    label: 'Target First-attempt Success',
    color: 'var(--cp-analytics-first-success)',
    hint: () =>
      'Hard + Good + Easy · Valid first recorded outcomes. Independent goal.',
  },
  firstAttemptGoodEasy: {
    key: 'targetFirstAttemptGoodEasy',
    label: 'Target Good + Easy',
    color: 'var(--cp-analytics-first-good-easy)',
    hint: () =>
      'Good + Easy · Valid first recorded outcomes. Independent goal.',
  },
} as const

export type TargetMetric = keyof typeof targetMetrics
