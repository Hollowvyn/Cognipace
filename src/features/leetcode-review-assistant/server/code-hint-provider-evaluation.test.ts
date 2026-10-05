import { mkdir, writeFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { readEvaluationProviderConfig } from '@/features/genai/testing/evaluation-provider-config'

import { hintBatchSchema } from '../api/code-hint-contracts'
import { codeHintEvaluationFixtures } from '../testing/code-hint-evaluation-fixtures'
import { generateCodeHints } from './code-hint-service'

const config = readEvaluationProviderConfig()
const outputDirectory = '/private/tmp/cognipace-hint-evaluation'

// Opt-in only: ordinary test runs neither read credentials nor call a provider.
describe.skipIf(config === null)('live progressive hint evaluation', () => {
  for (const fixture of codeHintEvaluationFixtures) {
    it(
      fixture.id,
      async () => {
        if (config === null) throw new Error('Evaluation is not enabled.')
        const result = await generateCodeHints(
          fixture.problem,
          config,
          new AbortController().signal,
        )
        // Do not print configuration, raw provider bodies or private errors.
        expect(result.status).toBe('success')
        if (result.status !== 'success')
          throw new Error('Provider evaluation did not return a hint batch.')
        const parsed = hintBatchSchema.safeParse(result.data)
        expect(parsed.success).toBe(true)
        if (!parsed.success)
          throw new Error('Provider evaluation did not return a hint batch.')
        await mkdir(outputDirectory, { recursive: true })
        await writeFile(
          `${outputDirectory}/${fixture.id}.json`,
          JSON.stringify(
            {
              batch: result.data,
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
})
