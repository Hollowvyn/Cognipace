import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import {
  createSerializedActiveTrack,
  createTrackForEditResponse,
  createTrackWorkspaceResponse,
} from '@/testing/track-fixtures'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import {
  tracksQueryKeys,
  useActiveTrack,
  useClearActiveTrack,
  useCreateTrack,
  useDeleteTrack,
  useRemoveTrackProblem,
  useResetTrackProgress,
  useSetActiveTrack,
  useTrackForEdit,
  useTrackWorkspace,
  useUpdateTrack,
} from './tracks-api'
import type {
  TracksCreateTrackRequest,
  TracksDeleteTrackRequest,
  TracksRemoveProblemRequest,
  TracksResetTrackProgressRequest,
  TracksSetActiveTrackRequest,
  TracksUpdateTrackRequest,
} from './tracks-contracts'

vi.mock('@/extension/messaging', () => ({
  sendMessage: vi.fn(),
}))

describe('tracks API hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes stable track query keys', () => {
    expect(tracksQueryKeys.active()).toEqual(['tracks', 'active', null])
    expect(tracksQueryKeys.active('dashboard')).toEqual([
      'tracks',
      'active',
      'dashboard',
    ])
    expect(tracksQueryKeys.workspace()).toEqual(['tracks', 'workspace', 'now'])
    expect(tracksQueryKeys.workspace('2026-01-01T10:00:00.000Z')).toEqual([
      'tracks',
      'workspace',
      '2026-01-01T10:00:00.000Z',
    ])
    expect(tracksQueryKeys.edit()).toEqual(['tracks', 'edit', 'new'])
    expect(tracksQueryKeys.edit('leetcode-75')).toEqual([
      'tracks',
      'edit',
      'leetcode-75',
    ])
  })

  it('reads the active track through the runtime boundary', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(activeTrack)
    const { wrapper } = createQueryTestHarness()
    const request = { surface: 'popup' } as const

    const { result } = renderHook(() => useActiveTrack(request), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBe(activeTrack)
    })
    expect(sendMessage).toHaveBeenCalledWith('tracks.getActiveTrack', request)
  })

  it('reads the track workspace through the runtime boundary', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(workspaceResponse)
    const { wrapper } = createQueryTestHarness()
    const request = {
      surface: 'dashboard',
      at: '2026-01-01T10:00:00.000Z',
    } as const

    const { result } = renderHook(() => useTrackWorkspace(request), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.data).toBe(workspaceResponse)
    })
    expect(sendMessage).toHaveBeenCalledWith('tracks.getWorkspace', request)
  })

  it('reads track edit data through the runtime boundary', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(trackForEditResponse)
    const { wrapper } = createQueryTestHarness()
    const request = {
      surface: 'dashboard',
      trackId: 'leetcode-75',
    } as const

    const { result } = renderHook(() => useTrackForEdit(request), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toBe(trackForEditResponse)
    })
    expect(sendMessage).toHaveBeenCalledWith('tracks.getTrackForEdit', request)
  })

  it('invalidates track queries after active track mutations', async () => {
    await expectTrackMutation({
      method: 'tracks.setActiveTrack',
      request: {
        surface: 'dashboard',
        trackId: 'leetcode-75',
      } satisfies TracksSetActiveTrackRequest,
      response: null,
      useHook: useSetActiveTrack,
      invalidatedQueryKeys: [['tracks'], ['app-shell-data']],
    })
    await expectTrackMutation({
      method: 'tracks.clearActiveTrack',
      request: {
        surface: 'dashboard',
      },
      response: null,
      useHook: useClearActiveTrack,
      invalidatedQueryKeys: [['tracks'], ['app-shell-data']],
    })
  })

  it('invalidates track and problem queries after management mutations', async () => {
    const invalidatedQueryKeys = [
      ['tracks'],
      ['app-shell-data'],
      ['problems'],
      ['analytics'],
      ['practice-details'],
      ['today-queue'],
    ]

    await expectTrackMutation({
      method: 'tracks.createTrack',
      request: {
        surface: 'dashboard',
        title: 'Interview Track',
        allowExternalProgress: false,
        description: null,
        dueAt: null,
        groups: [{ title: 'Arrays', problemSlugs: ['two-sum'] }],
        setActive: true,
      } satisfies TracksCreateTrackRequest,
      response: trackForEditResponse,
      useHook: useCreateTrack,
      invalidatedQueryKeys,
    })
    await expectTrackMutation({
      method: 'tracks.updateTrack',
      request: {
        surface: 'dashboard',
        trackId: 'leetcode-75',
        title: 'Interview Track',
        allowExternalProgress: false,
        description: null,
        dueAt: null,
        groups: [
          {
            id: 'leetcode-75:arrays-hashing',
            title: 'Arrays',
            problemSlugs: ['two-sum'],
          },
        ],
      } satisfies TracksUpdateTrackRequest,
      response: trackForEditResponse,
      useHook: useUpdateTrack,
      invalidatedQueryKeys,
    })
    await expectTrackMutation({
      method: 'tracks.deleteTrack',
      request: {
        surface: 'dashboard',
        trackId: 'leetcode-75',
      } satisfies TracksDeleteTrackRequest,
      response: null,
      useHook: useDeleteTrack,
      invalidatedQueryKeys,
    })
    await expectTrackMutation({
      method: 'tracks.removeProblem',
      request: {
        surface: 'dashboard',
        trackId: 'leetcode-75',
        problemSlug: 'two-sum',
      } satisfies TracksRemoveProblemRequest,
      response: null,
      useHook: useRemoveTrackProblem,
      invalidatedQueryKeys,
    })
    await expectTrackMutation({
      method: 'tracks.resetTrackProgress',
      request: {
        surface: 'dashboard',
        trackId: 'leetcode-75',
      } satisfies TracksResetTrackProgressRequest,
      response: null,
      useHook: useResetTrackProgress,
      invalidatedQueryKeys,
    })
  })
})

async function expectTrackMutation<TRequest>(input: {
  method: string
  request: TRequest
  response: Awaited<ReturnType<typeof sendMessage>>
  useHook: () => {
    mutateAsync: (request: TRequest) => Promise<unknown>
  }
  invalidatedQueryKeys: unknown[]
}) {
  const { queryClient, wrapper } = createQueryTestHarness()
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
  vi.mocked(sendMessage).mockResolvedValueOnce(input.response)
  const { result } = renderHook(() => input.useHook(), { wrapper })

  await act(async () => {
    await result.current.mutateAsync(input.request)
  })

  expect(sendMessage).toHaveBeenCalledWith(input.method, input.request)
  expect(invalidateQueries.mock.calls.map(([call]) => call)).toEqual(
    input.invalidatedQueryKeys.map((queryKey) => ({ queryKey })),
  )
}

const activeTrack = createSerializedActiveTrack()
const workspaceResponse = createTrackWorkspaceResponse()
const trackForEditResponse = createTrackForEditResponse()
