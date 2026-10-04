import { describe, expect, it } from 'vitest'

import { readEvaluationProviderConfig } from './evaluation-provider-config'

const configurationMessage =
  'Configure COGNIPACE_AI_EVAL_PROVIDER, COGNIPACE_AI_EVAL_MODEL and COGNIPACE_AI_EVAL_KEY privately before evaluation.'

const configured = {
  COGNIPACE_AI_EVAL: '1',
  COGNIPACE_AI_EVAL_PROVIDER: 'gemini',
  COGNIPACE_AI_EVAL_MODEL: ' private-model ',
  COGNIPACE_AI_EVAL_KEY: ' private-key ',
}

describe('readEvaluationProviderConfig', () => {
  it.each([undefined, '', '0', 'true', ' 1 '])(
    'skips without reading configuration unless the opt-in is exactly 1 (%s)',
    (optIn) => {
      const environment = new Proxy<NodeJS.ProcessEnv>(
        { COGNIPACE_AI_EVAL: optIn },
        {
          get(target, property) {
            if (property !== 'COGNIPACE_AI_EVAL')
              throw new Error('Configuration must stay unread when skipped.')
            return target.COGNIPACE_AI_EVAL
          },
        },
      )
      expect(readEvaluationProviderConfig(environment)).toBeNull()
    },
  )

  it.each(['openai', 'anthropic', 'gemini'])(
    'accepts an opted-in %s configuration and trims private values',
    (provider) => {
      expect(
        readEvaluationProviderConfig({
          ...configured,
          COGNIPACE_AI_EVAL_PROVIDER: provider,
        }),
      ).toEqual({ provider, model: 'private-model', apiKey: 'private-key' })
    },
  )

  it.each([
    { COGNIPACE_AI_EVAL_PROVIDER: undefined },
    { COGNIPACE_AI_EVAL_PROVIDER: 'private-invalid-provider' },
    { COGNIPACE_AI_EVAL_MODEL: undefined },
    { COGNIPACE_AI_EVAL_MODEL: '   ' },
    { COGNIPACE_AI_EVAL_KEY: undefined },
    { COGNIPACE_AI_EVAL_KEY: '   ' },
  ])(
    'rejects incomplete or invalid private configuration with a fixed safe error',
    (override) => {
      expect(() =>
        readEvaluationProviderConfig({ ...configured, ...override }),
      ).toThrow(configurationMessage)
      try {
        readEvaluationProviderConfig({ ...configured, ...override })
        throw new Error('Expected invalid evaluation configuration to fail.')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        if (!(error instanceof Error)) throw error
        expect(error.message).toBe(configurationMessage)
        expect(error.stack).not.toContain('private-key')
        expect(error.stack).not.toContain('private-model')
        expect(error.stack).not.toContain('private-invalid-provider')
        expect(error.cause).toBeUndefined()
      }
    },
  )
})
