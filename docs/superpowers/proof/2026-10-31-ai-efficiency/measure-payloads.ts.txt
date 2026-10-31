// @vitest-environment node
import { writeFile } from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { aiProviderIds } from '@/lib/ai/types'
import { analyzeCode } from '@/features/leetcode-review-assistant/server/code-analysis-service'
import { buildCodeAnalysisPrompt } from '@/features/leetcode-review-assistant/server/build-code-analysis-prompt'
import { codeAnalysisEvaluationFixtures } from '@/features/leetcode-review-assistant/testing/code-analysis-evaluation-fixtures'
import {
  makeAnalysisRequest,
  makeValidAnalysis,
} from '@/features/leetcode-review-assistant/testing/code-analysis-fixtures'
import {
  makeOpenAiSuccessResponse,
  makeAnthropicSuccessResponse,
  makeGeminiSuccessResponse,
  makeOpenRouterSuccessResponse,
} from '@/features/genai/testing/genai-fixtures'

const bytes = (value: unknown) =>
  Buffer.byteLength(
    typeof value === 'string' ? value : JSON.stringify(value),
    'utf8',
  )
function schemaBytes(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  return Math.max(
    0,
    ...Object.entries(value).map(([key, item]) =>
      [
        'schema',
        'responseJsonSchema',
        'responseSchema',
        'input_schema',
      ].includes(key) &&
      item &&
      typeof item === 'object'
        ? bytes(item)
        : schemaBytes(item),
    ),
  )
}
it('measures authored fixtures and actual SDK wire bodies without network calls', async () => {
  const report = makeValidAnalysis()
  const {
    suggestedImplementation,
    suggestedImplementationUnavailableReason,
    ...core
  } = report
  const responseFactories = {
    openai: makeOpenAiSuccessResponse,
    anthropic: makeAnthropicSuccessResponse,
    gemini: makeGeminiSuccessResponse,
    openrouter: makeOpenRouterSuccessResponse,
  }
  const wires = []
  for (const provider of aiProviderIds) {
    let body = ''
    const mock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_input, init) => {
        body = String(init?.body)
        return Promise.resolve(responseFactories[provider](report))
      })
    const models = {
      openai: 'gpt-4.1-mini',
      anthropic: 'claude-sonnet-4-5-20250929',
      gemini: 'gemini-3.5-flash-lite',
      openrouter: 'openrouter/free',
    }
    const result = await analyzeCode(
      makeAnalysisRequest(),
      { provider, model: models[provider], apiKey: 'fake-audit-key' },
      new AbortController().signal,
      60000,
    )
    expect(mock).toHaveBeenCalledTimes(1)
    wires.push({
      provider,
      mockEnvelopeStatus: result.status,
      requestBodyBytes: bytes(body),
      schemaBytes: schemaBytes(JSON.parse(body)),
    })
    mock.mockRestore()
  }
  const fixtures = codeAnalysisEvaluationFixtures.map((fixture) => {
    const prompt = buildCodeAnalysisPrompt(fixture.request)
    const {
      languageVersion,
      runtime,
      memory,
      passedTestCount,
      totalTestCount,
      diagnostics,
      omittedDiagnostics,
      ...submission
    } = fixture.request.submission
    const compact = {
      problem: fixture.request.problem,
      submission: {
        ...submission,
        ...Object.fromEntries(
          Object.entries({
            languageVersion,
            runtime,
            memory,
            passedTestCount,
            totalTestCount,
          }).filter(([, value]) => value !== null),
        ),
        diagnostics: Object.fromEntries(
          Object.entries(diagnostics).filter(([, value]) => value !== null),
        ),
        ...(omittedDiagnostics.length ? { omittedDiagnostics } : {}),
      },
    }
    return {
      id: fixture.id,
      systemBytes: bytes(prompt.system),
      userBytes: bytes(prompt.user),
      nullOmittedUserBytes: bytes(compact),
      submittedCodeBytes: bytes(fixture.request.submission.code),
    }
  })
  const hints = [1000, 32000].map((size) => {
    const code = 'x'.repeat(size)
    const snapshot = { code, language: 'javascript', capturedAt: 1 }
    const history = [
      {
        snapshot,
        hint: { text: 'First hint.', strength: 'light', progress: 'initial' },
      },
      {
        snapshot: { ...snapshot, capturedAt: 2 },
        hint: { text: 'Second hint.', strength: 'medium', progress: 'stuck' },
      },
    ]
    const problem = makeAnalysisRequest().problem
    return {
      codeBytes: size,
      currentHintThreeUserBytes: bytes({
        problem,
        snapshot: { ...snapshot, capturedAt: 3 },
        history,
      }),
      exactSnapshotInternedUserBytes: bytes({
        problem,
        snapshots: [{ code, language: snapshot.language }],
        currentSnapshot: 0,
        history: history.map((turn) => ({ snapshot: 0, hint: turn.hint })),
      }),
    }
  })
  const output = {
    kind: 'offline synthetic fixture measurement; no real model calls or latency/token claims',
    wires,
    fixtures,
    report: {
      fullBytes: bytes(report),
      coreOnlyBytes: bytes(core),
      implementationFieldBytes: bytes({
        suggestedImplementation,
        suggestedImplementationUnavailableReason,
      }),
    },
    hints,
  }
  await writeFile(
    '/private/tmp/cognipace-ai-efficiency-audit-2026-10-31.json',
    JSON.stringify(output, null, 2),
  )
})
