import { describe, expect, it } from 'vitest'

import { codeHintInputSchema } from '../api/code-hint-contracts'
import { codeHintEvaluationFixtures } from './code-hint-evaluation-fixtures'

describe('authored adaptive hint evaluation inputs', () => {
  it('strictly validates bounded multi-turn inputs without sending evaluation metadata', () => {
    expect(
      new Set(codeHintEvaluationFixtures.map((fixture) => fixture.id)).size,
    ).toBe(codeHintEvaluationFixtures.length)
    for (const fixture of codeHintEvaluationFixtures) {
      const parsed = codeHintInputSchema.parse(fixture.input)
      expect(parsed).toEqual(fixture.input)
      expect(JSON.stringify(parsed)).not.toContain(fixture.id)
      expect(JSON.stringify(parsed)).not.toContain(fixture.criterion)
      expect(parsed.history.length).toBeLessThanOrEqual(2)
    }
  })
  it('covers stagnant escalation, real progress, cosmetic edits, regression and near-complete alternatives', () => {
    expect(codeHintEvaluationFixtures.map((fixture) => fixture.id)).toEqual(
      expect.arrayContaining([
        'unchanged-medium',
        'unchanged-heavy',
        'real-progress',
        'cosmetic-comment',
        'regression',
        'near-complete',
        'valid-alternative-progress',
      ]),
    )
    const unchanged = codeHintEvaluationFixtures.find(
      (fixture) => fixture.id === 'unchanged-heavy',
    )!.input
    expect(
      unchanged.history.every(
        (turn) => turn.snapshot.code === unchanged.snapshot.code,
      ),
    ).toBe(true)
  })
})
