import { projectAiMetrics, type AiGenerationMetrics } from '@/lib/ai/metrics'
import type {
  AiErrorCode,
  AiGenerateJsonResult,
  AiProviderId,
} from '@/lib/ai/types'

import {
  codeAnalysisSchema,
  type CodeAnalysisReport,
} from '../domain/code-analysis-schema'

type EvaluationContext = {
  fixtureId: string
  checkedAt: string
  provider: AiProviderId
  model: string
}
type EvaluationBase = EvaluationContext & {
  durationMs: number
  metrics?: AiGenerationMetrics
}
export type CodeAnalysisEvaluationResult = EvaluationBase &
  (
    | { status: 'success'; report: CodeAnalysisReport; resolvedModel?: string }
    | { status: 'error'; code: AiErrorCode }
  )

/** Intentionally project fields individually; provider errors are never serialized. */
export function projectEvaluationResult(
  context: EvaluationContext,
  result: AiGenerateJsonResult<CodeAnalysisReport>,
): CodeAnalysisEvaluationResult {
  const metrics = projectAiMetrics(result.providerMetadata.metrics)
  const base = {
    fixtureId: context.fixtureId,
    checkedAt: context.checkedAt,
    provider: context.provider,
    model: context.model,
    durationMs: result.providerMetadata.durationMs,
    ...(Object.keys(metrics).length ? { metrics } : {}),
  }
  if (result.status === 'error')
    return { ...base, status: 'error', code: result.code }
  const report = codeAnalysisSchema.safeParse(result.data)
  if (!report.success)
    return { ...base, status: 'error', code: 'invalid-output' }
  const resolved = result.providerMetadata.resolvedModel
  return {
    ...base,
    status: 'success',
    report: report.data,
    ...(typeof resolved === 'string' &&
    resolved.trim() &&
    resolved.length <= 120
      ? { resolvedModel: resolved }
      : {}),
  }
}

export function summarizeEvaluationResults(
  results: CodeAnalysisEvaluationResult[],
) {
  const errorCounts: Partial<Record<AiErrorCode, number>> = {}
  const metricSamples: Partial<Record<keyof AiGenerationMetrics, number[]>> = {}
  let successCount = 0
  for (const result of results) {
    for (const [key, value] of Object.entries(
      projectAiMetrics(result.metrics),
    )) {
      if (value === undefined) continue
      const name = key as keyof AiGenerationMetrics
      ;(metricSamples[name] ??= []).push(value)
    }
    if (result.status === 'success') successCount++
    else errorCounts[result.code] = (errorCounts[result.code] ?? 0) + 1
  }
  const durationsMs = results.map((result) => result.durationMs)
  return {
    ...(Object.keys(metricSamples).length ? { metricSamples } : {}),
    total: results.length,
    successCount,
    failureCount: results.length - successCount,
    errorCounts,
    durationsMs,
    totalDurationMs: durationsMs.reduce((sum, duration) => sum + duration, 0),
  }
}
