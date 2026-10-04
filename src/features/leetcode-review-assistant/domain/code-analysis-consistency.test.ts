import { describe, expect, it } from 'vitest'

import { makeValidAnalysis } from '../testing/code-analysis-fixtures'
import { isCodeAnalysisConsistent } from './code-analysis-consistency'

describe('isCodeAnalysisConsistent', () => {
  it('accepts a concrete report with better time and worse space', () => {
    const report = makeValidAnalysis()
    expect(report.efficiency.timeComparison).toBe('better')
    expect(report.efficiency.spaceComparison).toBe('worse')
    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
  })

  it.each([
    ['js', 'JavaScript', true],
    ['javascript', 'JavaScript', true],
    [' JavaScript ', 'JavaScript', true],
    ['JavaScript', 'js', true],
    ['TypeScript', 'JavaScript', false],
    [' \n\t ', 'JavaScript', false],
  ] as const)(
    'captured %j and suggested %j language consistency is %s',
    (captured, suggested, valid) => {
      const report = makeValidAnalysis()
      report.suggestedImplementation!.language = suggested
      expect(isCodeAnalysisConsistent(report, captured)).toBe(valid)
    },
  )

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

  it.each([
    ['The required signature was not captured.', true],
    [null, false],
    ['', false],
    [' \n\t ', false],
  ] as const)(
    'absent implementation with reason %j has consistency %s',
    (reason, valid) => {
      const report = makeValidAnalysis({
        suggestedImplementation: null,
        suggestedImplementationUnavailableReason: reason,
      })
      expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(valid)
    },
  )

  it.each([
    ['unavailable', null, true],
    ['unavailable', 3, false],
    ['appropriate', null, false],
    ['minor-refinement', null, false],
    ['material-improvement', null, false],
    ['incorrect', null, false],
    ['material-improvement', 5, false],
    ['incorrect', 5, false],
    ['appropriate', 5, true],
    ['minor-refinement', 5, true],
  ] as const)(
    'Approach %s with score %j has consistency %s',
    (assessment, score, valid) => {
      const report = makeValidAnalysis()
      report.approach.score = score
      report.approach.strategyAssessment = assessment
      expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(valid)
    },
  )

  it.each(['current', 'suggested', 'both', 'score'] as const)(
    'accepts missing %s with unknown resource comparisons',
    (missing) => {
      const report = makeValidAnalysis()
      if (missing === 'both') {
        report.efficiency.current = null
        report.efficiency.suggested = null
      } else report.efficiency[missing] = null
      report.efficiency.timeComparison = 'unknown'
      report.efficiency.spaceComparison = 'unknown'
      expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
    },
  )

  it.each([
    ['current', 'timeComparison'],
    ['current', 'spaceComparison'],
    ['suggested', 'timeComparison'],
    ['suggested', 'spaceComparison'],
    ['score', 'timeComparison'],
    ['score', 'spaceComparison'],
  ] as const)('rejects missing %s with known %s', (missing, comparison) => {
    const report = makeValidAnalysis()
    report.efficiency[missing] = null
    report.efficiency.timeComparison = 'unknown'
    report.efficiency.spaceComparison = 'unknown'
    report.efficiency[comparison] =
      missing === 'score' ? 'better' : 'equivalent'
    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(false)
  })

  it('does not rank or parse complexity strings', () => {
    const report = makeValidAnalysis()
    report.efficiency.current!.time =
      'Depends on the number of distinct values.'
    report.efficiency.suggested!.time = 'Depends on hash collisions.'
    report.efficiency.timeComparison = 'unknown'
    expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(true)
  })

  it.each([
    [null, 'Unavailable', 'Unavailable', true],
    [null, 'Good', 'Unavailable', false],
    [null, 'Unavailable', 'Good', false],
    [4, 'Unavailable', 'Excellent', false],
    [4, 'Good', 'Unavailable', false],
  ] as const)(
    'Style score %j, readability %s, structure %s has consistency %s',
    (score, readability, structure, valid) => {
      const report = makeValidAnalysis()
      Object.assign(report.codeStyle, { score, readability, structure })
      expect(isCodeAnalysisConsistent(report, 'JavaScript')).toBe(valid)
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
