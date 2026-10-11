import {
  assertFsrsReviewLogMatchesPreCard,
  getRetrievability,
  isReviewRating,
  parseSerializedFsrsCardSnapshot,
  parseSerializedFsrsReviewLogSnapshot,
  parseSerializedFsrsSchedulerProfile,
  scheduleReviewWithProfile,
  type FsrsCardSnapshot,
  type FsrsSchedulerProfile,
} from '@/lib/fsrs'

export interface HistoricalSchedulingEvidenceInput {
  rating: string
  reviewedAt: Date
  fsrsReviewLog: string | null
  schedulingEvidenceKind?: 'captured' | 'legacy-derived' | 'unknown'
  schedulerProfileJson?: string | null
  preCardJson?: string | null
}

export interface ResolvedHistoricalSchedulingEvidence {
  kind: 'captured' | 'legacy-derived' | 'unknown'
  preCard: FsrsCardSnapshot | null
  postCard: FsrsCardSnapshot | null
  profile: FsrsSchedulerProfile | null
  estimate: number | null
}

export type HistoricalSchedulingProvenance =
  | 'captured'
  | 'legacy-derived'
  | 'mixed'
  | 'unknown'

export function summarizeHistoricalSchedulingProvenance(
  kinds: readonly ('captured' | 'legacy-derived' | 'unknown')[],
): HistoricalSchedulingProvenance {
  if (kinds.length === 0 || kinds.every((kind) => kind === 'unknown'))
    return 'unknown'
  if (kinds.every((kind) => kind === 'captured')) return 'captured'
  if (kinds.every((kind) => kind === 'legacy-derived')) return 'legacy-derived'
  return 'mixed'
}

export function resolveHistoricalSchedulingEvidence(
  event: HistoricalSchedulingEvidenceInput,
): ResolvedHistoricalSchedulingEvidence {
  const unknown: ResolvedHistoricalSchedulingEvidence = {
    kind: 'unknown',
    preCard: null,
    postCard: null,
    profile: null,
    estimate: null,
  }
  if (
    (event.schedulingEvidenceKind !== 'captured' &&
      event.schedulingEvidenceKind !== 'legacy-derived') ||
    !event.preCardJson ||
    !event.schedulerProfileJson ||
    !event.fsrsReviewLog ||
    !isReviewRating(event.rating)
  )
    return unknown

  try {
    const preCard = parseSerializedFsrsCardSnapshot(event.preCardJson)
    const profile = parseSerializedFsrsSchedulerProfile(
      event.schedulerProfileJson,
    )
    const log = parseSerializedFsrsReviewLogSnapshot(event.fsrsReviewLog)
    if (
      log.rating !== event.rating ||
      log.reviewedAt !== event.reviewedAt.toISOString()
    )
      return unknown
    assertFsrsReviewLogMatchesPreCard(log, preCard, profile)
    const scheduled = scheduleReviewWithProfile(
      preCard,
      event.rating,
      event.reviewedAt,
      profile,
    )
    if (
      Object.entries(log).some(
        ([key, value]) =>
          scheduled.log[key as keyof typeof scheduled.log] !== value,
      )
    )
      return unknown
    const postCard = scheduled.card
    const estimate = getRetrievability(
      preCard,
      event.reviewedAt,
      profile.parameters,
    )
    return {
      kind: event.schedulingEvidenceKind,
      preCard,
      postCard,
      profile,
      estimate:
        Number.isFinite(estimate) && estimate >= 0 && estimate <= 1
          ? estimate
          : null,
    }
  } catch {
    return unknown
  }
}
