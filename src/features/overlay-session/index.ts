export { OverlayShell } from './components/overlay-shell'
export { useLeetCodeOverlaySession } from './hooks/use-leetcode-overlay-session'
export type { LeetCodeOverlaySession } from './hooks/use-leetcode-overlay-session'
export {
  useLeetCodeAssessmentRecommendation,
  type AssessmentRecommendationState,
  type UseLeetCodeAssessmentRecommendationOptions,
  type UseLeetCodeAssessmentRecommendationResult,
} from './hooks/use-leetcode-assessment-recommendation'
export {
  deriveOverlayAssessmentSessionContext,
  toAssessmentPracticeContext,
  type DeriveOverlayAssessmentSessionContextInput,
  type OverlayAssessmentContext,
  type OverlayAssessmentLatestAttempt,
  type OverlayAssessmentSessionContext,
  type OverlaySubmissionSource,
} from './domain'

export {
  useLeetCodeCodeAnalysis,
  type CodeAnalysisState,
  type UseLeetCodeCodeAnalysisOptions,
  type UseLeetCodeCodeAnalysisResult,
} from './hooks/use-leetcode-code-analysis'
