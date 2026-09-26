import { describe, expect, it } from 'vitest'

import {
  readImportSlug,
  readProblemIdentity,
  readProblemUrlIdentity,
} from './import-identity'

describe('import identities', () => {
  it.each([
    [' TWO-SUM ', 'two-sum'],
    [
      'https://leetcode.com/problems/two-sum/description/?x=1#answer',
      'two-sum',
    ],
    ['https://example.com/problems/two-sum/', null],
    ['https://leetcode.com.evil.test/problems/two-sum/', null],
    ['https://user@leetcode.com/problems/two-sum/', null],
    ['https://@leetcode.com/problems/two-sum/', null],
    ['https://leetcode.com:8080/problems/two-sum/', null],
    ['http://leetcode.com/problems/two-sum/', null],
    ['Two Sum', null],
    ['', null],
    ['https://leetcode.com\\@example.com/problems/two-sum/', null],
    ['https://leetcode.com/problems\\\\two-sum/', null],
    ['https://leetcode.com:443/problems/two-sum/', 'two-sum'],
    ['https://www.leetcode.com/problems/two-sum/', 'two-sum'],
    ['https://leetcode.com/problems/a/b', 'a'],
    ['https://leetcode.com/problems/ignored/../two-sum', null],
  ])('normalizes %s to %s', (input, expected) => {
    expect(readProblemIdentity(input)).toBe(expected)
  })

  it('requires object url fields to contain an actual URL', () => {
    expect(readProblemUrlIdentity('two-sum')).toBeNull()
    expect(
      readProblemUrlIdentity('https://leetcode.com/problems/two-sum/'),
    ).toBe('two-sum')
  })

  it('normalizes canonical slugs and rejects malformed or non-string input', () => {
    expect(readImportSlug('  TWO-SUM  ')).toBe('two-sum')
    expect(readImportSlug('x'.repeat(200))).toBe('x'.repeat(200))
    expect(readImportSlug('x'.repeat(201))).toBeNull()
    expect(readImportSlug('two sum')).toBeNull()
    expect(readImportSlug(null)).toBeNull()
    expect(readImportSlug({})).toBeNull()
  })
})
