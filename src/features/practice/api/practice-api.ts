import { useMutation, useQuery } from '@tanstack/react-query'

import { sendMessage } from '@/extension/messaging'
import { queryKeys } from '@/platform/query/query-keys'

import { practiceReviewCommandResultSchema } from './practice-contracts'

import type {
  PracticeDetailsRequest,
  PracticeOverrideLastReviewResultRequest,
  PracticeResetScheduleRequest,
  PracticeSaveReviewResultRequest,
  PracticeSetSuspendedRequest,
} from './practice-contracts'

export const practiceQueryKeys = queryKeys.practice

export function saveReviewResultViaRuntime(
  request: PracticeSaveReviewResultRequest,
) {
  return sendMessage('practice.saveReviewResult', request).then((result) =>
    practiceReviewCommandResultSchema.parse(result),
  )
}

export function getPracticeDetailsViaRuntime(request: PracticeDetailsRequest) {
  return sendMessage('practice.getDetails', request)
}

export function overrideLastReviewResultViaRuntime(
  request: PracticeOverrideLastReviewResultRequest,
) {
  return sendMessage('practice.overrideLastReviewResult', request).then(
    (result) => practiceReviewCommandResultSchema.parse(result),
  )
}

export function setPracticeSuspendedViaRuntime(
  request: PracticeSetSuspendedRequest,
) {
  return sendMessage('practice.setSuspended', request)
}

export function resetPracticeScheduleViaRuntime(
  request: PracticeResetScheduleRequest,
) {
  return sendMessage('practice.resetSchedule', request)
}

export type RuntimePracticeDetails = Awaited<
  ReturnType<typeof getPracticeDetailsViaRuntime>
>

export function usePracticeDetails(request: PracticeDetailsRequest) {
  return useQuery({
    queryKey: practiceQueryKeys.details(request.problemSlug, request.at),
    queryFn: () => getPracticeDetailsViaRuntime(request),
  })
}

export function useSaveReviewResult() {
  return useMutation({
    mutationFn: saveReviewResultViaRuntime,
  })
}

export function useOverrideLastReviewResult() {
  return useMutation({
    mutationFn: overrideLastReviewResultViaRuntime,
  })
}

export function useSetPracticeSuspended() {
  return useMutation({
    mutationFn: setPracticeSuspendedViaRuntime,
  })
}

export function useResetPracticeSchedule() {
  return useMutation({
    mutationFn: resetPracticeScheduleViaRuntime,
  })
}
