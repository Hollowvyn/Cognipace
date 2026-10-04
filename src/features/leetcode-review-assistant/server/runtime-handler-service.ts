import type { GenAiProviderConfig } from '@/features/genai'
import { loadActiveProviderConfig } from '@/features/genai/server/genai-settings-service'
import type { Db } from '@/platform/db'

import type {
  RecommendLeetCodeAssessmentErrorCode,
  RecommendLeetCodeAssessmentRequest,
  RecommendLeetCodeAssessmentResponse,
} from '../api/runtime-contracts'
import type { RecommendAssessmentInput } from '../domain/recommendation-types'
import { recommendAssessment } from './recommendation-service'

const UNAVAILABLE_MESSAGE =
  'AI is not configured. Add a provider in settings to get recommendations.'

const ERROR_MESSAGE_BY_CODE: Record<
  RecommendLeetCodeAssessmentErrorCode,
  string
> = {
  auth: 'AI authentication failed. Check the API key in settings.',
  permission:
    'The API key cannot access this model. Check provider permissions.',
  'bad-request': 'AI rejected the request. Check the model in settings.',
  'model-unavailable':
    'The selected model is unavailable. Check it in settings.',
  'rate-limit': 'AI is rate-limited. Try again in a moment.',
  network: 'AI request could not reach the provider.',
  timeout: 'AI request timed out.',
  cancelled: 'AI request was cancelled.',
  refused: 'AI could not provide a recommendation for this submission.',
  'invalid-output': 'AI returned an unexpected response.',
  unknown: 'AI request failed.',
}

export async function recommendLeetCodeAssessmentInBackground(
  db: Db,
  request: RecommendLeetCodeAssessmentRequest,
): Promise<RecommendLeetCodeAssessmentResponse> {
  assertConsistentProblemSlug(request)

  const providerConfig = await loadActiveProviderConfig(db)
  if (providerConfig === null) {
    return {
      status: 'unavailable',
      message: UNAVAILABLE_MESSAGE,
      submissionFingerprint: request.submissionFingerprint,
    }
  }

  const result = await recommendAssessment(
    buildOrchestratorInput(request, providerConfig),
  )

  if (result.status === 'ai') {
    return {
      status: 'ready',
      recommendation: result.recommendation,
      providerMetadata: result.providerMetadata,
      submissionFingerprint: request.submissionFingerprint,
    }
  }

  const errorCode = result.error.code
  if (errorCode === 'not-configured') {
    return {
      status: 'unavailable',
      message: UNAVAILABLE_MESSAGE,
      submissionFingerprint: request.submissionFingerprint,
    }
  }

  return {
    status: 'error',
    code: errorCode,
    message: ERROR_MESSAGE_BY_CODE[errorCode],
    submissionFingerprint: request.submissionFingerprint,
  }
}

function buildOrchestratorInput(
  request: RecommendLeetCodeAssessmentRequest,
  providerConfig: GenAiProviderConfig,
): RecommendAssessmentInput {
  // Wire schemas use z.string().optional() (yields `string | undefined`) and
  // z.string() for nested enum fields like reason.code. The domain types use
  // `string?` (exactOptionalPropertyTypes: true) and concrete enums. These
  // casts are validated by Zod at the runtime boundary above.
  return {
    problem: request.problem as RecommendAssessmentInput['problem'],
    submission: request.submission as RecommendAssessmentInput['submission'],
    timing: request.timing,
    deterministicDecision:
      request.deterministicDecision as RecommendAssessmentInput['deterministicDecision'],
    sessionContext: request.sessionContext,
    providerConfig,
  }
}

function assertConsistentProblemSlug(
  request: RecommendLeetCodeAssessmentRequest,
): void {
  if (request.problemSlug !== request.problem.slug) {
    throw new Error(
      `Inconsistent problem slug: request.problemSlug="${request.problemSlug}" but request.problem.slug="${request.problem.slug}".`,
    )
  }
}
