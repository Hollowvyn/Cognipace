import { mkdir, writeFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { readEvaluationProviderConfig } from '@/features/genai/testing/evaluation-provider-config'

import { codeAnalysisEvaluationFixtures } from '../testing/code-analysis-evaluation-fixtures'
import {
  projectEvaluationResult,
  summarizeEvaluationResults,
  type CodeAnalysisEvaluationResult,
} from '../testing/code-analysis-evaluation-results'
import { analyzeCode } from './code-analysis-service'

const config = readEvaluationProviderConfig()
const outputDirectory = '/private/tmp/cognipace-ai-evaluation'
const currentResults: CodeAnalysisEvaluationResult[] = []

// Opt-in only: ordinary test runs neither read credentials nor call a provider.
describe.skipIf(config === null)(
  'live code analysis provider evaluation',
  () => {
    for (const fixture of codeAnalysisEvaluationFixtures) {
      it(
        fixture.id,
        async () => {
          if (config === null) throw new Error('Evaluation is not enabled.')
          const result = await analyzeCode(
            fixture.request,
            config,
            new AbortController().signal,
            60000,
          )
          // Persist both outcomes before assertions, using only allowlisted fields.
          const artifact = projectEvaluationResult(
            {
              fixtureId: fixture.id,
              checkedAt: new Date().toISOString(),
              provider: config.provider,
              model: config.model,
            },
            result,
          )
          currentResults.push(artifact)
          await mkdir(outputDirectory, { recursive: true })
          await writeFile(
            `${outputDirectory}/${fixture.id}.json`,
            JSON.stringify(artifact, null, 2),
            'utf8',
          )
          await writeFile(
            `${outputDirectory}/summary.json`,
            JSON.stringify(summarizeEvaluationResults(currentResults), null, 2),
            'utf8',
          )
          expect(artifact.status).toBe('success')
        },
        65000,
      )
    }
  },
)
