import { describe, expect, it } from 'vitest'

import { readLeetCodeCodeSnapshot } from '../editor/code-snapshot-reader'
import { readLeetCodePageSnapshot } from './page-snapshot-reader'

const twoSumLocation = {
  slug: 'two-sum',
  url: 'https://leetcode.com/problems/two-sum/',
  host: 'leetcode.com',
}

describe('readLeetCodePageSnapshot', () => {
  it('reads page metadata from LeetCode-like DOM', () => {
    document.body.innerHTML = `
      <main>
        <h1>1. Two Sum</h1>
        <span>Easy</span>
        <span aria-label="Premium">Premium</span>
        <a href="/tag/array/">Array</a>
        <a href="/tag/hash-table/">Hash Table</a>
      </main>
    `

    expect(
      readLeetCodePageSnapshot(document, {
        location: twoSumLocation,
        now: () => 100,
      }),
    ).toMatchObject({
      location: twoSumLocation,
      title: 'Two Sum',
      frontendId: '1',
      difficulty: 'Easy',
      isPremium: true,
      topics: [
        { name: 'Array', slug: 'array' },
        { name: 'Hash Table', slug: 'hash-table' },
      ],
      isReady: true,
      capturedAt: 100,
    })
  })

  it('scopes fallback difficulty to the problem metadata container', () => {
    document.body.innerHTML = `
      <aside>
        <span>Hard</span>
      </aside>
      <section data-track-load="description_content">
        <h1>1. Two Sum</h1>
        <span>Easy</span>
      </section>
    `

    expect(
      readLeetCodePageSnapshot(document, {
        location: twoSumLocation,
        now: () => 120,
      }).difficulty,
    ).toBe('Easy')
  })

  it('falls back to slug title when title is missing', () => {
    document.body.innerHTML = '<main></main>'

    expect(
      readLeetCodePageSnapshot(document, { location: twoSumLocation }).title,
    ).toBe('Two Sum')
  })
})

describe('readLeetCodeCodeSnapshot', () => {
  it('reads Monaco visible lines before textarea fallback', () => {
    document.body.innerHTML = `
      <button data-cy="lang-select">TypeScript</button>
      <div class="view-lines">
        <div class="view-line">function twoSum(nums: number[]) {</div>
        <div class="view-line"></div>
        <div class="view-line">  return nums</div>
        <div class="view-line">}</div>
      </div>
      <textarea>fallback</textarea>
    `

    expect(readLeetCodeCodeSnapshot(document, () => 200)).toEqual({
      code: 'function twoSum(nums: number[]) {\n\n  return nums\n}',
      language: 'TypeScript',
      source: 'monaco',
      completeness: 'partial',
      capturedAt: 200,
    })
  })

  it('preserves textarea code whitespace when Monaco lines are unavailable', () => {
    document.body.innerHTML = `
      <button data-cy="lang-select">Python3</button>
      <textarea>def two_sum(nums):\n\n    return nums\n</textarea>
    `

    expect(readLeetCodeCodeSnapshot(document, () => 220)).toEqual({
      code: 'def two_sum(nums):\n\n    return nums\n',
      language: 'Python3',
      source: 'textarea',
      completeness: 'partial',
      capturedAt: 220,
    })
  })

  it('reads language from the compact editor toolbar text', () => {
    document.body.innerHTML = `
      <div>
        <button aria-haspopup="listbox">
          <span>Python3</span>
          <span>Auto</span>
        </button>
      </div>
      <div class="view-lines">
        <div class="view-line">class Solution:</div>
        <div class="view-line">    pass</div>
      </div>
    `

    expect(readLeetCodeCodeSnapshot(document, () => 240)).toMatchObject({
      code: 'class Solution:\n    pass',
      language: 'Python3',
      source: 'monaco',
      completeness: 'partial',
    })
  })

  it('reads language from the submitted code heading', () => {
    document.body.innerHTML = `
      <section>
        <h3>Code | Python3</h3>
        <div class="view-lines">
          <div class="view-line">class Solution:</div>
          <div class="view-line">    pass</div>
        </div>
      </section>
    `

    expect(readLeetCodeCodeSnapshot(document, () => 260)).toMatchObject({
      code: 'class Solution:\n    pass',
      language: 'Python3',
      source: 'monaco',
      completeness: 'partial',
    })
  })

  it.each([
    '<div class="view-lines"><div class="view-line">   </div></div>',
    '<textarea>  </textarea>',
  ])('marks whitespace-only editor content missing: %s', (html) => {
    document.body.innerHTML = html
    expect(readLeetCodeCodeSnapshot(document)).toMatchObject({
      code: null,
      source: 'none',
      completeness: 'missing',
    })
  })

  it('returns an empty source when no editor is present', () => {
    document.body.innerHTML = '<main></main>'

    expect(readLeetCodeCodeSnapshot(document)).toMatchObject({
      source: 'none',
      completeness: 'missing',
    })
  })
})
