import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import {
  createProblemForEditResponse,
  createProblemLibraryResponse,
  createSerializedProblem,
} from '@/testing/problem-fixtures'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import { ProblemForm } from './problem-form'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

describe('ProblemForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getLibrary') {
        return Promise.resolve(
          createProblemLibraryResponse({
            options: {
              topics: [{ id: 'array', label: 'Array', aliases: [] }],
              companies: [{ id: 'meta', label: 'Meta' }],
            },
          }),
        )
      }

      return Promise.resolve(createProblemForEditResponse())
    })
  })

  it('validates required create fields', async () => {
    const user = userEvent.setup()
    renderProblemForm(
      <ProblemForm mode="create" onCancel={vi.fn()} onSaved={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: 'SAVE' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a LeetCode URL or slug.',
    )
    expect(screen.getByLabelText('LeetCode URL or slug')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(sendMessage).not.toHaveBeenCalledWith(
      'problems.createProblem',
      expect.anything(),
    )
  })

  it('creates a problem with a normalized LeetCode slug', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    renderProblemForm(
      <ProblemForm mode="create" onCancel={vi.fn()} onSaved={onSaved} />,
    )

    await user.type(
      screen.getByLabelText('LeetCode URL or slug'),
      'https://leetcode.com/problems/Two_Sum/',
    )
    await user.type(screen.getByLabelText('Title'), 'Two Sum')
    await user.selectOptions(screen.getByLabelText('Difficulty'), 'medium')
    await user.click(screen.getByRole('switch', { name: 'LeetCode Premium' }))
    await user.click(screen.getByRole('button', { name: 'SAVE' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(sendMessage).toHaveBeenCalledWith('problems.createProblem', {
      surface: 'dashboard',
      slugOrUrl: 'two-sum',
      title: 'Two Sum',
      difficulty: 'medium',
      isPremium: true,
      topicLabels: [],
      companyLabels: [],
    })
  })

  it('rejects a foreign problem URL without submitting a fabricated slug', async () => {
    const user = userEvent.setup()
    renderProblemForm(
      <ProblemForm mode="create" onCancel={vi.fn()} onSaved={vi.fn()} />,
    )

    await user.type(
      screen.getByLabelText('LeetCode URL or slug'),
      'https://example.com/problems/two-sum/',
    )
    await user.type(screen.getByLabelText('Title'), 'Two Sum')
    await user.click(screen.getByRole('button', { name: 'SAVE' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a LeetCode URL or slug.',
    )
    expect(screen.getByLabelText('LeetCode URL or slug')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(sendMessage).not.toHaveBeenCalledWith(
      'problems.createProblem',
      expect.anything(),
    )
  })

  it('loads an edit problem and saves base metadata', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getProblemForEdit') {
        return Promise.resolve(
          createProblemForEditResponse({
            problem: createSerializedProblem({
              slug: 'two-sum',
              title: 'Two Sum',
              difficulty: 'easy',
              isPremium: false,
            }),
            topics: [{ id: 'array', label: 'Array', parentTopics: [] }],
            companies: [{ id: 'meta', label: 'Meta' }],
          }),
        )
      }

      return Promise.resolve(
        createProblemForEditResponse({
          problem: createSerializedProblem({
            slug: 'two-sum',
            title: '2Sum',
            difficulty: 'hard',
            isPremium: true,
          }),
        }),
      )
    })
    renderProblemForm(
      <ProblemForm
        mode="edit"
        onCancel={vi.fn()}
        onSaved={onSaved}
        problemSlug="two-sum"
      />,
    )

    await user.clear(await screen.findByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), '2Sum')
    await user.selectOptions(screen.getByLabelText('Difficulty'), 'hard')
    await user.click(screen.getByRole('switch', { name: 'LeetCode Premium' }))
    await user.click(screen.getByRole('button', { name: 'SAVE' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(sendMessage).toHaveBeenCalledWith('problems.updateProblem', {
      surface: 'dashboard',
      problemSlug: 'two-sum',
      title: '2Sum',
      difficulty: 'hard',
      isPremium: true,
      topicLabels: ['Array'],
      companyLabels: ['Meta'],
    })
  })

  it('creates with existing and new topic and company labels', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    renderProblemForm(
      <ProblemForm mode="create" onCancel={vi.fn()} onSaved={onSaved} />,
    )

    await user.type(screen.getByLabelText('LeetCode URL or slug'), 'two-sum')
    await user.type(screen.getByLabelText('Title'), 'Two Sum')
    await addLabel(user, 'Topics', 'array')
    await addLabel(user, 'Topics', 'Dynamic Programming')
    await addLabel(user, 'Companies', 'Meta')
    await addLabel(user, 'Companies', 'Netflix')
    await user.click(screen.getByRole('button', { name: 'SAVE' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(sendMessage).toHaveBeenCalledWith('problems.createProblem', {
      surface: 'dashboard',
      slugOrUrl: 'two-sum',
      title: 'Two Sum',
      difficulty: 'unknown',
      isPremium: false,
      topicLabels: ['Array', 'Dynamic Programming'],
      companyLabels: ['Meta', 'Netflix'],
    })
  })

  it('replaces and clears edit labels without duplicate submissions', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getProblemForEdit') {
        return Promise.resolve(
          createProblemForEditResponse({
            problem: createSerializedProblem({
              slug: 'two-sum',
              title: 'Two Sum',
            }),
            topics: [{ id: 'array', label: 'Array', parentTopics: [] }],
            companies: [{ id: 'meta', label: 'Meta' }],
          }),
        )
      }

      return Promise.resolve(createProblemForEditResponse())
    })
    renderProblemForm(
      <ProblemForm
        mode="edit"
        onCancel={vi.fn()}
        onSaved={vi.fn()}
        problemSlug="two-sum"
      />,
    )

    await screen.findByRole('button', { name: 'Remove topic Array' })
    await user.click(screen.getByRole('button', { name: 'Remove topic Array' }))
    await addLabel(user, 'Topics', 'Graph')
    await addLabel(user, 'Topics', ' graph ')
    await user.click(
      screen.getByRole('button', { name: 'Remove company Meta' }),
    )
    await user.click(screen.getByRole('button', { name: 'SAVE' }))

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith('problems.updateProblem', {
        surface: 'dashboard',
        problemSlug: 'two-sum',
        title: 'Two Sum',
        difficulty: 'easy',
        isPremium: false,
        topicLabels: ['Graph'],
        companyLabels: [],
      })
    })
  })

  it('keeps label edits visible after a failed save', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessage).mockImplementation((method) => {
      if (method === 'problems.getLibrary') {
        return Promise.resolve(createProblemLibraryResponse())
      }

      return Promise.reject(new Error('save failed'))
    })
    renderProblemForm(
      <ProblemForm mode="create" onCancel={vi.fn()} onSaved={vi.fn()} />,
    )

    await user.type(screen.getByLabelText('LeetCode URL or slug'), 'two-sum')
    await user.type(screen.getByLabelText('Title'), 'Two Sum')
    await addLabel(user, 'Topics', 'Array')
    await user.click(screen.getByRole('button', { name: 'SAVE' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('save failed')
    expect(screen.getByText('Array')).toBeVisible()
  })

  it('cancels without mutating', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    renderProblemForm(
      <ProblemForm mode="create" onCancel={onCancel} onSaved={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: 'CANCEL' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(sendMessage).not.toHaveBeenCalledWith(
      'problems.createProblem',
      expect.anything(),
    )
  })
})

function renderProblemForm(ui: React.ReactElement) {
  const { wrapper } = createQueryTestHarness()

  return render(ui, { wrapper })
}

async function addLabel(
  user: ReturnType<typeof userEvent.setup>,
  groupLabel: 'Companies' | 'Topics',
  value: string,
) {
  await user.clear(screen.getByLabelText(groupLabel))
  await user.type(screen.getByLabelText(groupLabel), value)
  await user.keyboard('{Enter}')
}
