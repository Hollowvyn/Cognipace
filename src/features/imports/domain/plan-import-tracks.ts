import { normalizeLeetCodeSlug } from '@/lib/leetcode'
import { normalizeTopicSearchKey } from '@/features/problems/domain/topic-taxonomy'
import { titleFromSlug } from '@/features/problems/domain/problem'

import type {
  GroupDraft,
  ImportDiagnostic,
  ImportItem,
  TrackDraft,
} from './import-types'
import type {
  ImportedGroup,
  ImportedMembership,
  ImportedTrack,
  TrackImportChanges,
  TrackImportState,
} from '@/features/tracks/domain/track-import'

export type PlannedTracks = {
  changes: TrackImportChanges
  references: { slug: string; path: string }[]
  items: ImportItem[]
  diagnostics: ImportDiagnostic[]
  relevantState: TrackImportState
}

const emptyChanges = (): TrackImportChanges => ({
  tracks: [],
  groups: [],
  memberships: [],
})

function membershipKey(trackId: string, problemSlug: string) {
  return JSON.stringify([trackId, problemSlug])
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareMemberships(
  left: ImportedMembership,
  right: ImportedMembership,
) {
  return (
    compareText(left.trackId, right.trackId) ||
    compareText(left.trackGroupId, right.trackGroupId) ||
    compareText(left.problemSlug, right.problemSlug) ||
    left.position - right.position
  )
}

function diagnostic(
  diagnostics: ImportDiagnostic[],
  code: string,
  path: string,
  message: string,
) {
  diagnostics.push({ severity: 'warning', code, path, message })
}

function preservedValue(
  diagnostics: ImportDiagnostic[],
  path: string,
  field: string,
) {
  diagnostic(
    diagnostics,
    'existing-value-preserved',
    path,
    `The stored ${field} is preserved; imported metadata does not update existing content.`,
  )
}

function relevantTrackState(
  drafts: readonly TrackDraft[],
  state: TrackImportState,
): TrackImportState {
  const requestedSlugs = new Set(drafts.map(({ slug }) => slug))
  const relevantTracks = state.tracks.filter(
    (track) => requestedSlugs.has(track.slug) || requestedSlugs.has(track.id),
  )
  const trackIds = new Set(relevantTracks.map(({ id }) => id))
  const relevantTracksBySlug = new Map<string, string[]>()
  for (const track of relevantTracks) {
    const matches = relevantTracksBySlug.get(track.slug) ?? []
    matches.push(track.id)
    relevantTracksBySlug.set(track.slug, matches)
  }
  const requestedGroupIds = new Set<string>()
  for (const draft of drafts) {
    const matchingTrackIds = relevantTracksBySlug.get(draft.slug)
    const trackIdsForDraft = matchingTrackIds?.length
      ? matchingTrackIds
      : [draft.slug]
    for (const trackId of trackIdsForDraft) {
      for (const group of draft.groups) {
        requestedGroupIds.add(`${trackId}:${group.slug}`)
      }
    }
  }
  const directlyRelevantGroups = state.groups.filter(
    (group) => trackIds.has(group.trackId) || requestedGroupIds.has(group.id),
  )
  for (const group of directlyRelevantGroups) trackIds.add(group.trackId)
  const relevantGroups = state.groups.filter(
    (group) => trackIds.has(group.trackId) || requestedGroupIds.has(group.id),
  )
  const relevantGroupIds = new Set(relevantGroups.map(({ id }) => id))

  return {
    tracks: state.tracks
      .filter((track) => trackIds.has(track.id))
      .map((row) => ({ ...row }))
      .sort((left, right) => compareText(left.id, right.id)),
    groups: relevantGroups
      .map((row) => ({ ...row }))
      .sort(
        (left, right) =>
          compareText(left.trackId, right.trackId) ||
          compareText(left.id, right.id),
      ),
    memberships: state.memberships
      .filter(
        (membership) =>
          trackIds.has(membership.trackId) ||
          relevantGroupIds.has(membership.trackGroupId),
      )
      .map((row) => ({ ...row }))
      .sort(compareMemberships),
  }
}

function trackItem(
  track: ImportedTrack,
  path: string,
  action: ImportItem['action'],
): ImportItem {
  return {
    kind: 'tracks',
    identity: track.id,
    label: track.title,
    action,
    path,
  }
}

function groupItem(
  group: ImportedGroup,
  path: string,
  action: ImportItem['action'],
): ImportItem {
  return {
    kind: 'groups',
    identity: group.id,
    label: group.title,
    action,
    path,
  }
}

function membershipItem(
  trackId: string,
  groupId: string,
  problemSlug: string,
  path: string,
  action: ImportItem['action'],
): ImportItem {
  return {
    kind: 'memberships',
    identity: JSON.stringify([trackId, groupId, problemSlug]),
    label: problemSlug,
    action,
    path,
  }
}

function planTrack(
  draft: TrackDraft,
  changes: TrackImportChanges,
  references: { slug: string; path: string }[],
  referenceSlugs: Set<string>,
  items: ImportItem[],
  diagnostics: ImportDiagnostic[],
  trackMemberships: Map<string, ImportedMembership>,
  groupById: Map<string, ImportedGroup>,
  existingTrackBySlug: Map<string, ImportedTrack>,
  existingTrackById: Map<string, ImportedTrack>,
  groupTitlesByTrack: Map<string, Set<string>>,
  groupTitleSlugKeysByTrack: Map<string, Set<string>>,
  maxGroupPositionByTrack: Map<string, number>,
  maxMembershipPositionByGroup: Map<string, number>,
): void {
  const existingTrack = existingTrackBySlug.get(draft.slug)
  const idCollision = existingTrackById.get(draft.slug)
  if (!existingTrack && idCollision && idCollision.slug !== draft.slug) {
    diagnostic(
      diagnostics,
      'identity-conflict',
      draft.path,
      `Track ID "${draft.slug}" is already used by a different track.`,
    )
    return
  }

  const trackId = existingTrack?.id ?? draft.slug
  const plannedGroups: {
    draft: GroupDraft
    row: ImportedGroup
    isNew: boolean
  }[] = []
  const localGroupTitles = groupTitlesByTrack.get(trackId) ?? new Set<string>()
  const localGroupTitleSlugKeys =
    groupTitleSlugKeysByTrack.get(trackId) ?? new Set<string>()
  const initialMaxGroupPosition = maxGroupPositionByTrack.get(trackId) ?? 0
  let newGroupCount = 0

  for (const groupDraft of draft.groups) {
    const expectedId = `${trackId}:${groupDraft.slug}`
    const byExpectedId = groupById.get(expectedId)
    if (byExpectedId) {
      if (byExpectedId.trackId !== trackId) {
        diagnostic(
          diagnostics,
          'identity-conflict',
          groupDraft.path,
          `Group ID "${expectedId}" is already owned by a different track.`,
        )
        continue
      }
      if (
        groupDraft.title !== null &&
        groupDraft.title !== byExpectedId.title
      ) {
        preservedValue(diagnostics, groupDraft.path, 'group title')
      }
      plannedGroups.push({ draft: groupDraft, row: byExpectedId, isNew: false })
      continue
    }

    const incomingTitleKey =
      groupDraft.title === null
        ? null
        : normalizeTopicSearchKey(groupDraft.title)
    const incomingSlugKeys = [groupDraft.slug, groupDraft.title]
      .filter((value): value is string => value !== null)
      .map(normalizeLeetCodeSlug)
      .filter(Boolean)
    const hasFallbackMatch =
      (incomingTitleKey !== null && localGroupTitles.has(incomingTitleKey)) ||
      incomingSlugKeys.some((key) => localGroupTitleSlugKeys.has(key))
    if (hasFallbackMatch) {
      diagnostic(
        diagnostics,
        'identity-conflict',
        groupDraft.path,
        'A different group has a matching display title; automatic fallback matching is ambiguous.',
      )
      continue
    }

    const row: ImportedGroup = {
      id: expectedId,
      trackId,
      title: groupDraft.title ?? titleFromSlug(groupDraft.slug),
      position: initialMaxGroupPosition + newGroupCount + 1,
    }
    newGroupCount += 1
    plannedGroups.push({ draft: groupDraft, row, isNew: true })
  }

  if (!existingTrack && plannedGroups.length === 0) return

  if (existingTrack) {
    items.push(trackItem(existingTrack, draft.path, 'retain'))
    if (draft.title !== null && draft.title !== existingTrack.title) {
      preservedValue(diagnostics, draft.path, 'track title')
    }
    if (
      draft.description !== null &&
      draft.description !== existingTrack.description
    ) {
      preservedValue(diagnostics, draft.path, 'track description')
    }
  } else {
    const newTrack: ImportedTrack = {
      id: draft.slug,
      slug: draft.slug,
      title: draft.title ?? titleFromSlug(draft.slug),
      description: draft.description,
      dueAt: null,
      allowExternalProgress: false,
    }
    changes.tracks.push(newTrack)
    items.push(trackItem(newTrack, draft.path, 'add'))
  }

  for (const planned of plannedGroups) {
    const { draft: groupDraft, row: group, isNew } = planned
    if (isNew) {
      changes.groups.push(group)
      groupById.set(group.id, group)
      items.push(groupItem(group, groupDraft.path, 'add'))
    } else {
      items.push(groupItem(group, groupDraft.path, 'retain'))
    }

    for (const reference of groupDraft.problems) {
      if (!referenceSlugs.has(reference.slug)) {
        references.push({ slug: reference.slug, path: reference.path })
        referenceSlugs.add(reference.slug)
      }

      const key = membershipKey(trackId, reference.slug)
      const existingMembership = trackMemberships.get(key)
      if (existingMembership) {
        const actionGroup = groupById.get(existingMembership.trackGroupId)
        const retainedGroupId =
          actionGroup?.id ?? existingMembership.trackGroupId
        items.push(
          membershipItem(
            trackId,
            retainedGroupId,
            reference.slug,
            reference.path,
            'retain',
          ),
        )
        if (existingMembership.trackGroupId !== group.id) {
          diagnostic(
            diagnostics,
            'placement-preserved',
            reference.path,
            'The existing group placement for this problem is preserved.',
          )
        }
        continue
      }

      const membership: ImportedMembership = {
        trackId,
        trackGroupId: group.id,
        problemSlug: reference.slug,
        position: (maxMembershipPositionByGroup.get(group.id) ?? 0) + 1,
      }
      maxMembershipPositionByGroup.set(group.id, membership.position)
      changes.memberships.push(membership)
      trackMemberships.set(key, membership)
      items.push(
        membershipItem(
          trackId,
          group.id,
          reference.slug,
          reference.path,
          'add',
        ),
      )
    }
  }
}

export function planImportTracks(
  tracks: TrackDraft[],
  state: TrackImportState,
): PlannedTracks {
  const relevantState = relevantTrackState(tracks, state)
  const changes = emptyChanges()
  const references: { slug: string; path: string }[] = []
  const items: ImportItem[] = []
  const diagnostics: ImportDiagnostic[] = []
  const trackMemberships = new Map<string, ImportedMembership>()
  const groupById = new Map<string, ImportedGroup>()
  const existingTrackBySlug = new Map(
    state.tracks.map((track) => [track.slug, track]),
  )
  const existingTrackById = new Map(
    state.tracks.map((track) => [track.id, track]),
  )
  const groupTitlesByTrack = new Map<string, Set<string>>()
  const groupTitleSlugKeysByTrack = new Map<string, Set<string>>()
  const maxGroupPositionByTrack = new Map<string, number>()
  for (const group of state.groups) {
    const titles = groupTitlesByTrack.get(group.trackId) ?? new Set<string>()
    titles.add(normalizeTopicSearchKey(group.title))
    groupTitlesByTrack.set(group.trackId, titles)
    const slugKeys =
      groupTitleSlugKeysByTrack.get(group.trackId) ?? new Set<string>()
    const slugKey = normalizeLeetCodeSlug(group.title)
    if (slugKey) slugKeys.add(slugKey)
    groupTitleSlugKeysByTrack.set(group.trackId, slugKeys)
    maxGroupPositionByTrack.set(
      group.trackId,
      Math.max(
        maxGroupPositionByTrack.get(group.trackId) ?? -1,
        group.position,
      ),
    )
  }
  const maxMembershipPositionByGroup = new Map<string, number>()
  const referenceSlugs = new Set<string>()

  for (const group of state.groups) groupById.set(group.id, group)
  for (const membership of state.memberships) {
    const key = membershipKey(membership.trackId, membership.problemSlug)
    if (!trackMemberships.has(key)) trackMemberships.set(key, membership)
    maxMembershipPositionByGroup.set(
      membership.trackGroupId,
      Math.max(
        maxMembershipPositionByGroup.get(membership.trackGroupId) ?? -1,
        membership.position,
      ),
    )
  }
  for (const draft of tracks) {
    planTrack(
      draft,
      changes,
      references,
      referenceSlugs,
      items,
      diagnostics,
      trackMemberships,
      groupById,
      existingTrackBySlug,
      existingTrackById,
      groupTitlesByTrack,
      groupTitleSlugKeysByTrack,
      maxGroupPositionByTrack,
      maxMembershipPositionByGroup,
    )
  }

  return { changes, references, items, diagnostics, relevantState }
}
