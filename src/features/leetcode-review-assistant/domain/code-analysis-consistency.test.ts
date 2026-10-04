import { describe, expect, it } from 'vitest'

import { makeValidAnalysis } from '../testing/code-analysis-fixtures'
import { isCodeAnalysisConsistent } from './code-analysis-consistency'
import { codeAnalysisSchema } from './code-analysis-schema'

describe('isCodeAnalysisConsistent', () => {
  it('accepts a concrete report with better time and worse space', () => {
    const report = codeAnalysisSchema.parse(makeValidAnalysis())

    expect(report.efficiency.timeComparison).toBe('better')
    expect(report.efficiency.spaceComparison).toBe('worse')
    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
  })

  it.each(['js', 'javascript', ' JavaScript '])(
    'accepts the captured language alias %s',
    (language) => {
      expect(isCodeAnalysisConsistent(makeValidAnalysis(), language)).toBe(true)
    },
  )

  it('normalizes the suggested implementation language too', () => {
    const report = makeValidAnalysis()
    report.suggestedImplementation!.language = 'js'

    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
  })

  it('rejects a suggested implementation in another language', () => {
    expect(isCodeAnalysisConsistent(makeValidAnalysis(), 'TypeScript')).toBe(
      false,
    )
  })

  it('rejects blank captured language when an implementation is present', () => {
    expect(isCodeAnalysisConsistent(makeValidAnalysis(), ' \n\t ')).toBe(false)
  })

  it('rejects whitespace-only generated code without modifying it', () => {
    const report = makeValidAnalysis()
    report.suggestedImplementation!.code = ' \n\t '

    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(false)
    expect(report.suggestedImplementation!.code).toBe(' \n\t ')
  })

  it('accepts generated code without enforcing a signature pattern', () => {
    const report = makeValidAnalysis()
    report.suggestedImplementation!.code = 'const solve = (values) => values;'

    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
  })

  it('rejects a present implementation with an unavailable reason', () => {
    const report = makeValidAnalysis({
      suggestedImplementationUnavailableReason: 'The signature is unavailable.',
    })

    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(false)
  })

  it('accepts an absent implementation with an explicit reason', () => {
    const report = makeValidAnalysis({
      suggestedImplementation: null,
      suggestedImplementationUnavailableReason:
        'The required signature was not captured.',
    })

    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
  })

  it.each([null, '', ' \n\t '])(
    'rejects an absent implementation with reason %j',
    (reason) => {
      const report = makeValidAnalysis({
        suggestedImplementation: null,
        suggestedImplementationUnavailableReason: reason,
      })

      expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(false)
    },
  )

  it('accepts an unavailable approach with a null score', () => {
    const report = makeValidAnalysis()
    report.approach.score = null
    report.approach.strategyAssessment = 'unavailable'

    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
  })

  it('rejects a numeric score for an unavailable approach', () => {
    const report = makeValidAnalysis()
    report.approach.strategyAssessment = 'unavailable'

    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(false)
  })

  it.each([
    'appropriate',
    'minor-refinement',
    'material-improvement',
    'incorrect',
  ] as const)('rejects a null approach score for %s', (assessment) => {
    const report = makeValidAnalysis()
    report.approach.score = null
    report.approach.strategyAssessment = assessment

    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(false)
  })

  it.each(['material-improvement', 'incorrect'] as const)(
    'rejects Approach 5 with %s',
    (assessment) => {
      const report = makeValidAnalysis()
      report.approach.score = 5
      report.approach.strategyAssessment = assessment

      expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(false)
    },
  )

  it.each(['appropriate', 'minor-refinement'] as const)(
    'accepts Approach 5 with %s',
    (assessment) => {
      const report = makeValidAnalysis()
      report.approach.score = 5
      report.approach.strategyAssessment = assessment

      expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
    },
  )

  it.each(['current', 'suggested', 'both'] as const)(
    'accepts missing %s complexity with unknown comparisons',
    (missing) => {
      const report = makeValidAnalysis()
      if (missing === 'current' || missing === 'both')
        report.efficiency.current = null
      if (missing === 'suggested' || missing === 'both')
        report.efficiency.suggested = null
      report.efficiency.timeComparison = 'unknown'
      report.efficiency.spaceComparison = 'unknown'

      expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
    },
  )

  it.each(['current', 'suggested'] as const)(
    'rejects resource comparisons with missing %s complexity',
    (missing) => {
      for (const comparison of ['timeComparison', 'spaceComparison'] as const) {
        const report = makeValidAnalysis()
        report.efficiency[missing] = null
        report.efficiency.timeComparison = 'unknown'
        report.efficiency.spaceComparison = 'unknown'
        report.efficiency[comparison] = 'equivalent'

        expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(false)
      }
    },
  )

  it('accepts a null efficiency score only with unknown comparisons', () => {
    const report = makeValidAnalysis()
    report.efficiency.score = null
    report.efficiency.timeComparison = 'unknown'
    report.efficiency.spaceComparison = 'unknown'

    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
  })

  it.each(['timeComparison', 'spaceComparison'] as const)(
    'rejects a known %s with a null efficiency score',
    (comparison) => {
      const report = makeValidAnalysis()
      report.efficiency.score = null
      report.efficiency.timeComparison = 'unknown'
      report.efficiency.spaceComparison = 'unknown'
      report.efficiency[comparison] = 'better'

      expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(false)
    },
  )

  it('does not rank or parse complexity strings', () => {
    const report = makeValidAnalysis()
    report.efficiency.current!.time =
      'Depends on the number of distinct values.'
    report.efficiency.suggested!.time = 'Depends on hash collisions.'
    report.efficiency.timeComparison = 'unknown'

    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
  })

  it('accepts a null style score when both qualities are unavailable', () => {
    const report = makeValidAnalysis()
    report.codeStyle.score = null
    report.codeStyle.readability = 'Unavailable'
    report.codeStyle.structure = 'Unavailable'

    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
  })

  it.each(['readability', 'structure'] as const)(
    'rejects a null style score with available %s',
    (quality) => {
      const report = makeValidAnalysis()
      report.codeStyle.score = null
      report.codeStyle.readability = 'Unavailable'
      report.codeStyle.structure = 'Unavailable'
      report.codeStyle[quality] = 'Good'

      expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(false)
    },
  )

  it.each(['readability', 'structure'] as const)(
    'rejects a numeric style score with unavailable %s',
    (quality) => {
      const report = makeValidAnalysis()
      report.codeStyle[quality] = 'Unavailable'

      expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(false)
    },
  )

  it('keeps a rejected report unchanged rather than clamping scores', () => {
    const report = makeValidAnalysis()
    report.approach.score = 5
    const original = structuredClone(report)

    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(false)
    expect(report).toEqual(original)
  })
})
