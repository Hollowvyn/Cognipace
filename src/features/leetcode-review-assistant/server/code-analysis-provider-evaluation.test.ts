import { mkdir, writeFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { readEvaluationProviderConfig } from '@/features/genai/testing/evaluation-provider-config'

import { codeAnalysisEvaluationFixtures } from '../testing/code-analysis-evaluation-fixtures'
import { analyzeCode } from './code-analysis-service'

const config = readEvaluationProviderConfig()
const outputDirectory = '/private/tmp/cognipace-ai-evaluation'

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
            30000,
          )
          // Do not print configuration, raw provider bodies or private errors.
          expect(result.status).toBe('success')
          if (result.status !== 'success')
            throw new Error(
              'Provider evaluation did not return an analysis report.',
            )
          await mkdir(outputDirectory, { recursive: true })
          await writeFile(
            `${outputDirectory}/${fixture.id}.json`,
            JSON.stringify(
              {
                report: result.data,
                providerMetadata: result.providerMetadata,
                criterion: fixture.criterion,
                checkedAt: new Date().toISOString(),
              },
              null,
              2,
            ),
            'utf8',
          )
        },
        35000,
      )
    }
  },
)
