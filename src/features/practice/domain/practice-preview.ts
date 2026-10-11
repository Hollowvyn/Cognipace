import type { PracticeGenerationContext } from './practice-storage'
import type { ReviewRating } from '@/lib/fsrs'

export type PracticePreviewInput =
  | {
      mode: 'submit'
      problemSlug: string
      generation: PracticeGenerationContext
      previewedAt: string
    }
  | {
      mode: 'update'
      problemSlug: string
      generation: PracticeGenerationContext
      targetAttemptId: string
      expectedRevision: number
      reviewedAt: string
    }

export type PracticePreviewIdentity = PracticePreviewInput

export type PracticePreviewResult =
  | {
      status: 'ready'
      identity: PracticePreviewIdentity
      evidence: 'active' | 'captured' | 'legacy-derived'
      ratings: Record<
        ReviewRating,
        {
          dueAt: string
          eligibleOn: string
          studyDays: number
          scheduledDays: number
        }
      >
    }
  | {
      status: 'unavailable'
      identity: PracticePreviewIdentity
      reason: 'unsupported-legacy' | 'missing-context'
    }
  | {
      status: 'conflict'
      identity: PracticePreviewIdentity
      reason: 'stale-generation' | 'stale-review' | 'backdated'
    }
