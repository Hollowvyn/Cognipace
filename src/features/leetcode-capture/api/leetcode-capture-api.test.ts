import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendMessage } from '@/extension/messaging'
import { createLeetCodeCaptureRemoteClient } from './leetcode-capture-api'
vi.mock('@/extension/messaging', () => ({ sendMessage: vi.fn() }))
const location = {
  slug: 'two-sum',
  url: 'https://leetcode.com/problems/two-sum/',
  host: 'leetcode.com',
}
describe('LeetCode capture remote adapter', () => {
  afterEach(() => vi.clearAllMocks())
  it('forwards identity, pinned submission and refresh fields through runtime messages', async () => {
    vi.mocked(sendMessage).mockResolvedValue({ result: null, debugEvents: [] })
    const client = createLeetCodeCaptureRemoteClient({
      getAuth: () => ({ csrfToken: null }),
    })
    const request = {
      location,
      attemptId: 'attempt-fixed',
      click: { location, clickedAt: 5000, buttonText: 'Submit' },
      submittedCodeSnapshot: {
        code: 'return []',
        language: 'Python3',
        source: 'monaco' as const,
        completeness: 'partial' as const,
        capturedAt: 5000,
      },
      submissionId: '1234567890',
      refresh: true,
    }
    await client.readSubmissionResult(request)
    expect(sendMessage).toHaveBeenCalledWith('leetcode.readSubmissionResult', {
      ...request,
      surface: 'content-script',
      auth: { csrfToken: null },
    })
  })
  it('forwards problem refresh through runtime messages', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      ok: false,
      errorMessage: 'Missing content',
    })
    const client = createLeetCodeCaptureRemoteClient({
      getAuth: () => ({ csrfToken: null }),
    })
    await client.readProblemContent({ location, refresh: true })
    expect(sendMessage).toHaveBeenCalledWith('leetcode.readProblemContent', {
      location,
      refresh: true,
      surface: 'content-script',
      auth: { csrfToken: null },
    })
  })
})
