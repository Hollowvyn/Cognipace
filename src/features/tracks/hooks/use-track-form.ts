import { useReducer } from 'react'

import type { ProblemLibraryRow } from '@/features/problems'

import type {
  TrackForEditResponse,
  TrackGroupInput,
  TrackMutationInput,
} from '../api/tracks-contracts'
import { isPastDateInputValue, toDateInputValue } from '../domain'
import {
  createGroupsFromInitialDraftRows,
  type TrackFormGroupBy,
  type TrackFormInitialDraft,
} from './track-form-initial-draft'

export type TrackFormAction =
  | { type: 'set-title'; title: string }
  | { type: 'set-description'; description: string }
  | { type: 'set-due-at'; dueAt: string }
  | { type: 'set-active-after-create'; checked: boolean }
  | { type: 'set-allow-external-progress'; checked: boolean }
  | {
      type: 'set-group-by'
      groupBy: TrackFormGroupBy
      problemRows: readonly ProblemLibraryRow[]
    }
  | { type: 'add-group' }
  | { type: 'rename-group'; groupKey: string; title: string }
  | { type: 'remove-group'; groupKey: string }
  | { type: 'move-group'; groupKey: string; direction: 'up' | 'down' }
  | { type: 'select-group'; groupKey: string }
  | { type: 'toggle-group'; groupKey: string }
  | { type: 'add-problem'; groupKey: string; problemSlug: string }
  | { type: 'remove-problem'; groupKey: string; problemSlug: string }
  | {
      type: 'move-problem-to-group'
      fromGroupKey: string
      toGroupKey: string
      problemSlug: string
    }
  | {
      type: 'move-problem'
      groupKey: string
      problemSlug: string
      direction: 'up' | 'down'
    }

export interface TrackFormGroupState {
  id?: string
  key: string
  problemSlugs: string[]
  title: string
}

export interface TrackFormState {
  allowExternalProgress: boolean
  description: string
  dueAt: string
  groupBy: TrackFormGroupBy
  groups: TrackFormGroupState[]
  initialDueAt: string
  nextGroupNumber: number
  selectedGroupKey: string | null
  setActiveAfterCreate: boolean
  title: string
}

export interface TrackFormFieldErrors {
  dueAt: string | null
  groupTitles: Record<string, string>
  groups: string | null
  problemSlugs: string | null
  title: string | null
}

export interface UseTrackFormOptions {
  initialDraft?: TrackFormInitialDraft | null
}

export function useTrackForm(
  source: TrackForEditResponse,
  options: UseTrackFormOptions = {},
) {
  const [state, dispatch] = useReducer(
    trackFormReducer,
    {
      initialDraft: options.initialDraft,
      source,
    },
    createInitialTrackFormState,
  )
  const fieldErrors = deriveFieldErrors(state)
  const canSubmit = isFieldErrorFree(fieldErrors)
  const payload = canSubmit ? createTrackMutationPayload(state) : null
  const selectedGroup =
    state.groups.find((group) => group.key === state.selectedGroupKey) ?? null

  return {
    canSubmit,
    dispatch,
    fieldErrors,
    payload,
    selectedGroup,
    state,
  }
}

function trackFormReducer(
  state: TrackFormState,
  action: TrackFormAction,
): TrackFormState {
  switch (action.type) {
    case 'set-title':
      return { ...state, title: action.title }
    case 'set-description':
      return { ...state, description: action.description }
    case 'set-due-at':
      return { ...state, dueAt: action.dueAt }
    case 'set-allow-external-progress':
      return { ...state, allowExternalProgress: action.checked }
    case 'set-active-after-create':
      return { ...state, setActiveAfterCreate: action.checked }
    case 'set-group-by': {
      const draftGroups = createGroupsFromInitialDraftRows(
        action.problemRows,
        action.groupBy,
      )
      const groups =
        draftGroups.length > 0 ? draftGroups : [createFallbackMainGroup()]
      const selectedGroup = groups[0] ?? createFallbackMainGroup()

      return {
        ...state,
        groupBy: action.groupBy,
        groups,
        nextGroupNumber: groups.length + 1,
        selectedGroupKey: selectedGroup.key,
      }
    }
    case 'add-group': {
      const nextGroup: TrackFormGroupState = {
        key: `new-group-${state.nextGroupNumber}`,
        problemSlugs: [],
        title: `Group ${state.nextGroupNumber}`,
      }

      return {
        ...state,
        groups: [...state.groups, nextGroup],
        nextGroupNumber: state.nextGroupNumber + 1,
        selectedGroupKey: nextGroup.key,
      }
    }
    case 'rename-group':
      return {
        ...state,
        groups: state.groups.map((group) =>
          group.key === action.groupKey
            ? { ...group, title: action.title }
            : group,
        ),
      }
    case 'remove-group': {
      const groupIndex = state.groups.findIndex(
        (group) => group.key === action.groupKey,
      )
      const group = state.groups[groupIndex]

      if (!group || state.groups.length <= 1 || group.problemSlugs.length > 0) {
        return state
      }

      const groups = state.groups.filter((candidate) => candidate !== group)
      const replacementGroup =
        groups[Math.min(groupIndex, groups.length - 1)] ?? groups[0]

      return {
        ...state,
        groups,
        selectedGroupKey:
          state.selectedGroupKey === action.groupKey && replacementGroup
            ? replacementGroup.key
            : state.selectedGroupKey,
      }
    }
    case 'move-group': {
      const groupIndex = state.groups.findIndex(
        (group) => group.key === action.groupKey,
      )

      return {
        ...state,
        groups: moveArrayItem(state.groups, groupIndex, action.direction),
      }
    }
    case 'select-group':
      return state.groups.some((group) => group.key === action.groupKey)
        ? { ...state, selectedGroupKey: action.groupKey }
        : state
    case 'toggle-group':
      return state.groups.some((group) => group.key === action.groupKey)
        ? {
            ...state,
            selectedGroupKey:
              state.selectedGroupKey === action.groupKey
                ? null
                : action.groupKey,
          }
        : state
    case 'add-problem':
      if (hasProblemSlugInTrack(state.groups, action.problemSlug)) {
        return state
      }

      return {
        ...state,
        groups: state.groups.map((group) => {
          if (group.key !== action.groupKey) {
            return group
          }

          return {
            ...group,
            problemSlugs: [...group.problemSlugs, action.problemSlug],
          }
        }),
      }
    case 'remove-problem':
      return {
        ...state,
        groups: state.groups.map((group) =>
          group.key === action.groupKey
            ? {
                ...group,
                problemSlugs: group.problemSlugs.filter(
                  (problemSlug) => problemSlug !== action.problemSlug,
                ),
              }
            : group,
        ),
      }
    case 'move-problem-to-group': {
      if (action.fromGroupKey === action.toGroupKey) {
        return state
      }

      const sourceGroup = state.groups.find(
        (group) => group.key === action.fromGroupKey,
      )
      const targetGroup = state.groups.find(
        (group) => group.key === action.toGroupKey,
      )

      if (
        !sourceGroup ||
        !targetGroup ||
        !sourceGroup.problemSlugs.includes(action.problemSlug)
      ) {
        return state
      }

      return {
        ...state,
        groups: state.groups.map((group) => {
          if (group.key === action.fromGroupKey) {
            return {
              ...group,
              problemSlugs: group.problemSlugs.filter(
                (problemSlug) => problemSlug !== action.problemSlug,
              ),
            }
          }

          if (group.key === action.toGroupKey) {
            return group.problemSlugs.includes(action.problemSlug)
              ? group
              : {
                  ...group,
                  problemSlugs: [...group.problemSlugs, action.problemSlug],
                }
          }

          return group
        }),
      }
    }
    case 'move-problem':
      return {
        ...state,
        groups: state.groups.map((group) => {
          if (group.key !== action.groupKey) {
            return group
          }

          return {
            ...group,
            problemSlugs: moveArrayItem(
              group.problemSlugs,
              group.problemSlugs.indexOf(action.problemSlug),
              action.direction,
            ),
          }
        }),
      }
  }
}

function createInitialTrackFormState({
  initialDraft,
  source,
}: {
  initialDraft: TrackFormInitialDraft | null | undefined
  source: TrackForEditResponse
}): TrackFormState {
  const groups = createInitialGroups(source, initialDraft)
  const firstGroup = groups[0] ?? createFallbackMainGroup()
  const initialDueAt = toDateInputValue(source.track?.dueAt ?? null)

  return {
    allowExternalProgress: source.track?.allowExternalProgress ?? false,
    description: source.track?.description ?? '',
    dueAt: initialDueAt,
    groupBy: 'none',
    groups,
    initialDueAt,
    nextGroupNumber: groups.length + 1,
    selectedGroupKey: firstGroup.key,
    setActiveAfterCreate: false,
    title: source.track?.title ?? '',
  }
}

function createInitialGroups(
  source: TrackForEditResponse,
  initialDraft?: TrackFormInitialDraft | null,
) {
  if (
    !source.track &&
    initialDraft?.problemRows &&
    initialDraft.problemRows.length > 0
  ) {
    return createGroupsFromInitialDraftRows(initialDraft.problemRows, 'none')
  }

  const sortedGroups = [...source.groups].sort(
    (groupA, groupB) => groupA.position - groupB.position,
  )

  if (sortedGroups.length === 0) {
    return [createFallbackMainGroup()]
  }

  return sortedGroups.map((group, index) => {
    const key = group.id ?? `group-${index + 1}`
    const formGroup: TrackFormGroupState = {
      key,
      problemSlugs: [...group.problemSlugs],
      title: group.title,
    }

    if (group.id) {
      formGroup.id = group.id
    }

    return formGroup
  })
}

function createFallbackMainGroup(): TrackFormGroupState {
  return {
    key: 'group-1',
    problemSlugs: [],
    title: 'Main',
  }
}

function deriveFieldErrors(state: TrackFormState): TrackFormFieldErrors {
  const groupTitles: Record<string, string> = {}
  const duplicateProblemSlug = findDuplicateProblemSlug(state.groups)

  for (const group of state.groups) {
    if (group.title.trim().length === 0) {
      groupTitles[group.key] = 'Group title is required.'
    }
  }

  return {
    dueAt: isInvalidPastDueAt(state)
      ? 'Target date must be today or later.'
      : null,
    groupTitles,
    groups:
      state.groups.length === 0 ? 'At least one group is required.' : null,
    problemSlugs: duplicateProblemSlug
      ? `Problem "${duplicateProblemSlug}" can only appear once in a track.`
      : null,
    title: state.title.trim().length === 0 ? 'Title is required.' : null,
  }
}

function isFieldErrorFree(fieldErrors: TrackFormFieldErrors) {
  return (
    fieldErrors.dueAt === null &&
    fieldErrors.title === null &&
    fieldErrors.groups === null &&
    fieldErrors.problemSlugs === null &&
    Object.keys(fieldErrors.groupTitles).length === 0
  )
}

function createTrackMutationPayload(state: TrackFormState): TrackMutationInput {
  return {
    allowExternalProgress: state.allowExternalProgress,
    description: toNullableTrimmedValue(state.description),
    dueAt: state.dueAt ? `${state.dueAt}T00:00:00.000Z` : null,
    groups: state.groups.map(createGroupInput),
    title: state.title.trim(),
  }
}

function createGroupInput(group: TrackFormGroupState): TrackGroupInput {
  const input: TrackGroupInput = {
    problemSlugs: [...group.problemSlugs],
    title: group.title.trim(),
  }

  if (group.id) {
    input.id = group.id
  }

  return input
}

function toNullableTrimmedValue(value: string) {
  const trimmedValue = value.trim()

  return trimmedValue.length > 0 ? trimmedValue : null
}

function hasProblemSlugInTrack(
  groups: readonly TrackFormGroupState[],
  problemSlug: string,
) {
  return groups.some((group) => group.problemSlugs.includes(problemSlug))
}

function findDuplicateProblemSlug(groups: readonly TrackFormGroupState[]) {
  const seenProblemSlugs = new Set<string>()

  for (const group of groups) {
    for (const problemSlug of group.problemSlugs) {
      if (seenProblemSlugs.has(problemSlug)) {
        return problemSlug
      }

      seenProblemSlugs.add(problemSlug)
    }
  }

  return null
}

function isInvalidPastDueAt(state: TrackFormState) {
  if (!state.dueAt) {
    return false
  }

  if (state.initialDueAt && state.dueAt === state.initialDueAt) {
    return false
  }

  return isPastDateInputValue(state.dueAt)
}

function moveArrayItem<T>(
  items: readonly T[],
  itemIndex: number,
  direction: 'up' | 'down',
) {
  const nextIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1

  if (
    itemIndex < 0 ||
    nextIndex < 0 ||
    itemIndex >= items.length ||
    nextIndex >= items.length
  ) {
    return [...items]
  }

  const nextItems = [...items]
  const item = nextItems[itemIndex]
  const displacedItem = nextItems[nextIndex]

  if (item === undefined || displacedItem === undefined) {
    return nextItems
  }

  nextItems[itemIndex] = displacedItem
  nextItems[nextIndex] = item

  return nextItems
}
