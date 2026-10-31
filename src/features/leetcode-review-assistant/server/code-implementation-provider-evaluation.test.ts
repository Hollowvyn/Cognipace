import { mkdir, writeFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { readEvaluationProviderConfig } from '@/features/genai/testing/evaluation-provider-config'

import { codeImplementationEvaluationFixtures } from '../testing/code-implementation-evaluation-fixtures'
import {
  projectImplementationEvaluationResult,
  summarizeEvaluationResults,
  type CodeAnalysisEvaluationResult,
} from '../testing/code-analysis-evaluation-results'
import { generateCodeImplementation } from './code-implementation-service'

const config =
  process.env.COGNIPACE_AI_IMPLEMENTATION_EVAL === '1'
    ? readEvaluationProviderConfig()
    : null
const outputDirectory = '/private/tmp/cognipace-ai-evaluation/implementation'
const currentResults: CodeAnalysisEvaluationResult[] = []

// Opt-in only: ordinary test runs neither read credentials nor call a provider.
describe.skipIf(config === null)(
  'explicit live implementation provider evaluation',
  () => {
    for (const fixture of codeImplementationEvaluationFixtures) {
      it(
        fixture.id,
        async () => {
          if (config === null) throw new Error('Evaluation is not enabled.')
          const result = await generateCodeImplementation(
            fixture.request,
            config,
            new AbortController().signal,
            60000,
          )
          // Persist both outcomes before assertions, using only allowlisted fields.
          const artifact = projectImplementationEvaluationResult(
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
