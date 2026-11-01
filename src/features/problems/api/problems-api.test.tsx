import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import {
  createProblemForEditResponse,
  createProblemLibraryResponse,
} from '@/testing/problem-fixtures'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  problemsQueryKeys,
  useBulkDeleteProblems,
  useBulkUpdateProblems,
  useCreateProblem,
  useDeleteProblem,
  useProblemForEdit,
  useProblemLibrary,
  useUpdateProblem,
} from './problems-api'
import type {
  ProblemsBulkDeleteRequest,
  ProblemsBulkUpdateProblemsRequest,
  ProblemsCreateProblemRequest,
  ProblemsDeleteProblemRequest,
  ProblemsUpdateProblemRequest,
} from './problems-contracts'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

describe('problems API hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes stable problem query keys', () => {
    expect(problemsQueryKeys.library()).toEqual(['problems', 'library', 'now'])
    expect(problemsQueryKeys.library('2026-01-01T10:00:00.000Z')).toEqual([
      'problems',
      'library',
      '2026-01-01T10:00:00.000Z',
    ])
    expect(problemsQueryKeys.edit('binary-search')).toEqual([
      'problems',
      'edit',
      'binary-search',
    ])
  })

  it('reads the problem library through the runtime boundary', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(libraryResponse)
    const { wrapper } = createQueryTestHarness()
    const request = {
      surface: 'dashboard',
      at: '2026-01-01T10:00:00.000Z',
    } as const

    const { result } = renderHook(() => useProblemLibrary(request), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.data).toBe(libraryResponse)
    })
    expect(sendMessage).toHaveBeenCalledWith('problems.getLibrary', request)
  })

  it('reads edit data through the runtime boundary', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(problemForEditResponse)
    const { wrapper } = createQueryTestHarness()
    const request = {
      surface: 'dashboard',
      problemSlug: 'binary-search',
    } as const

    const { result } = renderHook(() => useProblemForEdit(request), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.data).toBe(problemForEditResponse)
    })
    expect(sendMessage).toHaveBeenCalledWith(
      'problems.getProblemForEdit',
      request,
    )
  })

  it('invalidates problem-backed queries after create, update, delete, and bulk mutations', async () => {
    await expectProblemMutation({
      method: 'problems.createProblem',
      response: problemForEditResponse,
      request: {
        surface: 'dashboard',
        slugOrUrl: 'binary-search',
        title: 'Binary Search',
        difficulty: 'easy',
        isPremium: false,
        topicLabels: [],
        companyLabels: [],
      } satisfies ProblemsCreateProblemRequest,
      useHook: useCreateProblem,
    })
    await expectProblemMutation({
      method: 'problems.updateProblem',
      response: problemForEditResponse,
      request: {
        surface: 'dashboard',
        problemSlug: 'binary-search',
        title: 'Binary Search',
        difficulty: 'easy',
        isPremium: false,
        topicLabels: [],
        companyLabels: [],
      } satisfies ProblemsUpdateProblemRequest,
      useHook: useUpdateProblem,
    })
    await expectProblemMutation({
      method: 'problems.deleteProblem',
      response: {
        status: 'durable',
        kind: 'problem-delete',
        summary: null,
        syncMetadataPending: false,
      },
      request: {
        surface: 'dashboard',
        problemSlug: 'binary-search',
      } satisfies ProblemsDeleteProblemRequest,
      useHook: useDeleteProblem,
    })
    await expectProblemMutation({
      method: 'problems.bulkUpdateProblems',
      response: undefined,
      request: {
        surface: 'dashboard',
        problemSlugs: ['binary-search'],
        set: { isPremium: true },
      } satisfies ProblemsBulkUpdateProblemsRequest,
      useHook: useBulkUpdateProblems,
    })
    await expectProblemMutation({
      method: 'problems.bulkDelete',
      response: {
        status: 'durable',
        kind: 'problem-delete',
        summary: null,
        syncMetadataPending: false,
      },
      request: {
        surface: 'dashboard',
        problemSlugs: ['binary-search'],
      } satisfies ProblemsBulkDeleteRequest,
      useHook: useBulkDeleteProblems,
    })
  })
})

async function expectProblemMutation<TRequest>(input: {
  method: string
  request: TRequest
  response: Awaited<ReturnType<typeof sendMessage>>
  useHook: () => {
    mutateAsync: (request: TRequest) => Promise<unknown>
  }
}) {
  const { queryClient, wrapper } = createQueryTestHarness()
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
  vi.mocked(sendMessage).mockResolvedValueOnce(input.response)
  const { result } = renderHook(() => input.useHook(), { wrapper })

  await act(async () => {
    await result.current.mutateAsync(input.request)
  })

  expect(sendMessage).toHaveBeenCalledWith(input.method, input.request)
  expect(invalidateQueries.mock.calls.map(([call]) => call)).toEqual([
    { queryKey: ['problems'] },
    { queryKey: ['app-shell-data'] },
    { queryKey: ['analytics'] },
    { queryKey: ['practice-details'] },
    { queryKey: ['today-queue'] },
    { queryKey: ['tracks'] },
  ])
}

const problemForEditResponse = createProblemForEditResponse()
const libraryResponse = createProblemLibraryResponse()
