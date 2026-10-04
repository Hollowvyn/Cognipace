import { describe, expect, it } from 'vitest'

import { readLeetCodeSubmissionAttempt } from './submission-attempt-reader'
import type { LeetCodeSubmissionClick } from '../domain/types'

const submissionClick = {
  location: {
    slug: 'two-sum',
    url: 'https://leetcode.com/problems/two-sum/',
    host: 'leetcode.com',
  },
  clickedAt: 5000,
  buttonText: 'Submit',
} satisfies LeetCodeSubmissionClick

describe('readLeetCodeSubmissionAttempt', () => {
  it('captures submitted Monaco code at the click timestamp', () => {
    document.body.innerHTML = `
      <button data-cy="lang-select">Python3</button>
      <div class="view-lines">
        <div class="view-line">class Solution:</div>
        <div class="view-line">    def twoSum(self, nums, target):</div>
        <div class="view-line"></div>
        <div class="view-line">        return []</div>
      </div>
    `

    expect(
      readLeetCodeSubmissionAttempt({
        attemptId: 'attempt-fixed',
        click: submissionClick,
        editorRoot: document,
      }),
    ).toEqual({
      attemptId: 'attempt-fixed',
      location: submissionClick.location,
      clickedAt: 5000,
      submitButtonText: 'Submit',
      submittedCodeSnapshot: {
        code: 'class Solution:\n    def twoSum(self, nums, target):\n\n        return []',
        language: 'Python3',
        source: 'monaco',
        completeness: 'partial',
        capturedAt: 5000,
      },
    })
  })

  it('records an empty code snapshot when the editor is unavailable', () => {
    document.body.innerHTML = '<main></main>'

    expect(
      readLeetCodeSubmissionAttempt({
        attemptId: 'attempt-fixed',
        click: submissionClick,
        editorRoot: document,
      }).submittedCodeSnapshot,
    ).toEqual({
      code: null,
      language: null,
      source: 'none',
      completeness: 'missing',
      capturedAt: 5000,
    })
  })
})
