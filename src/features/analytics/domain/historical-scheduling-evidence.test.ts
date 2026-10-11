import { describe, expect, it } from 'vitest'
import {
  createFsrsSchedulerProfile,
  createInitialFsrsCard,
  getRetrievability,
  scheduleReviewWithProfile,
  serializeFsrsCardSnapshot,
  serializeFsrsSchedulerProfile,
} from '@/lib/fsrs'

import { resolveHistoricalSchedulingEvidence } from './historical-scheduling-evidence'

describe('historical scheduling evidence', () => {
  const at = new Date('2026-08-01T12:00:00.000Z')
  const profile = createFsrsSchedulerProfile({ targetRetention: 0.75 })
  const preCard = createInitialFsrsCard(at)
  const scheduled = scheduleReviewWithProfile(preCard, 'good', at, profile)
  const captured = {
    rating: 'good',
    reviewedAt: at,
    fsrsReviewLog: JSON.stringify(scheduled.log),
    schedulingEvidenceKind: 'captured' as const,
    schedulerProfileJson: serializeFsrsSchedulerProfile(profile),
    preCardJson: serializeFsrsCardSnapshot(preCard),
  }

  it('uses exact recorded context and event time for a captured result', () => {
    const resolved = resolveHistoricalSchedulingEvidence(captured)
    expect(resolved.kind).toBe('captured')
    expect(resolved.postCard).toEqual(scheduled.card)
    expect(resolved.estimate).toBe(
      getRetrievability(preCard, at, profile.parameters),
    )
  })

  it('labels recovered compatibility context and refuses missing or invalid context', () => {
    expect(
      resolveHistoricalSchedulingEvidence({
        ...captured,
        schedulingEvidenceKind: 'legacy-derived',
      }).kind,
    ).toBe('legacy-derived')
    expect(
      resolveHistoricalSchedulingEvidence({ ...captured, preCardJson: null })
        .kind,
    ).toBe('unknown')
    expect(
      resolveHistoricalSchedulingEvidence({
        ...captured,
        schedulerProfileJson: '{}',
      }).kind,
    ).toBe('unknown')
    expect(
      resolveHistoricalSchedulingEvidence({
        ...captured,
        fsrsReviewLog: JSON.stringify({ ...scheduled.log, elapsedDays: 999 }),
      }).kind,
    ).toBe('unknown')
  })
})
