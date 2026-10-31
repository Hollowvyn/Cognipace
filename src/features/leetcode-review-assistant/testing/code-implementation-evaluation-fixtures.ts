import type { GenerateLeetCodeImplementationRequest } from '../api/code-implementation-contracts'
import {
  makeAnalysisRequest,
  makeValidFeedback,
  makeValidAnalysis,
} from './code-analysis-fixtures'
const improving: GenerateLeetCodeImplementationRequest = {
  surface: 'content-script',
  requestId: 'implementation-eval-1',
  assessmentRequestId: 'request-1',
  host: 'leetcode.com',
  assessment: makeAnalysisRequest(),
  feedback: makeValidFeedback(),
}
const appropriate = structuredClone(improving)
appropriate.assessment.submission.code =
  makeValidAnalysis().suggestedImplementation!.code
appropriate.feedback.approach = {
  ...appropriate.feedback.approach,
  score: 5,
  strategyAssessment: 'appropriate',
  current: ['Hash map', 'Array'],
  suggested: ['Hash map', 'Array'],
  rationale:
    'The submitted hash-map solution meets the expected linear-time follow-up.',
  consider: null,
}
appropriate.feedback.efficiency = {
  ...appropriate.feedback.efficiency,
  score: 5,
  current: appropriate.feedback.efficiency.suggested,
  timeComparison: 'equivalent',
  spaceComparison: 'equivalent',
  rationale:
    'Expected linear time with linear auxiliary space meets the stated requirements.',
  suggestions: [],
}
const almostComplete = structuredClone(improving)
almostComplete.assessment.submission.status = 'compile-error'
almostComplete.assessment.submission.code =
  'function twoSum(nums, target) {\n const seen = new Map();\n for (let i = 0; i < nums.length; i++) {\n const complement = target - nums[i];\n if (seen.has(complement)) return [seen.get(complement), i];\n seen.set(nums[i], i);\n }'
almostComplete.assessment.submission.diagnostics.compileError =
  'Unexpected end of input'
almostComplete.feedback.approach = {
  ...appropriate.feedback.approach,
  score: 4,
  strategyAssessment: 'minor-refinement',
  rationale:
    'The intended complement lookup is appropriate; the function requires its closing brace.',
  consider: 'Preserve distinct indices by looking up before insertion.',
}
/** Authored feedback and pins: explicit code probes do not require a live feedback call. */
export const codeImplementationEvaluationFixtures = [
  {
    id: 'implementation-improvement',
    request: improving,
    criterion:
      'Complete same-language code preserving signature and distinct zero-based indices.',
  },
  {
    id: 'implementation-already-appropriate',
    request: appropriate,
    criterion:
      'Preserve an already valid hash-map approach; avoid invented material criticism.',
  },
  {
    id: 'implementation-almost-complete',
    request: almostComplete,
    criterion:
      'Return a complete function with a closing brace, never an abbreviated patch.',
  },
]
