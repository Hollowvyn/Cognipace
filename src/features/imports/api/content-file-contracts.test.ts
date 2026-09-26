import { describe, expect, it } from 'vitest'
import { contentFileSchema } from './content-file-contracts'

describe('content file authoring contract', () => {
  it('allows sparse questions and optional null metadata', () => {
    expect(
      contentFileSchema.safeParse({
        format: 'cognipace-content',
        version: 1,
        problems: [
          'two-sum',
          {
            url: 'https://leetcode.com/problems/valid-anagram/',
            difficulty: null,
          },
        ],
        companies: null,
      }).success,
    ).toBe(true)
  })

  it('catches misspelled fields and objects without identity', () => {
    for (const problem of [
      { title: 'Two Sum' },
      { slug: 'two-sum', difficulity: 'easy' },
    ]) {
      expect(
        contentFileSchema.safeParse({
          format: 'cognipace-content',
          version: 1,
          problems: [problem],
        }).success,
      ).toBe(false)
    }
  })
})
