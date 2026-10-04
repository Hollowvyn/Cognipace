export { OverlayShell } from './components/overlay-shell'
export { useLeetCodeOverlaySession } from './hooks/use-leetcode-overlay-session'
export type { LeetCodeOverlaySession } from './hooks/use-leetcode-overlay-session'
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
