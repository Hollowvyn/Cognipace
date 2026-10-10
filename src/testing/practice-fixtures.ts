import type {
  SerializedNormalizedPracticeState,
  SerializedPracticeDetails,
} from '@/features/practice/api/practice-contracts'

export function createSerializedNormalizedPracticeState(
  overrides: Partial<SerializedNormalizedPracticeState> = {},
): SerializedNormalizedPracticeState {
  return {
    problemSlug: 'two-sum',
    cardId: 'two-sum:default',
    status: 'new',
    isSuspended: false,
    phase: 'new',
    isStarted: false,
    isDue: false,
    isOverdue: false,
    overdueDays: 0,
    dueAt: null,
    lastReviewedAt: null,
    retrievability: null,
    stability: null,
    difficulty: null,
    scheduledDays: null,
    lapses: 0,
    reviewCount: 0,
    reviewHistory: [],
    recentAttempts: [],
    latestAttempt: null,
    ...overrides,
  }
}

export function createSerializedPracticeDetails(
  overrides: Partial<SerializedPracticeDetails> = {},
): SerializedPracticeDetails {
  return {
    ...createSerializedNormalizedPracticeState(),
    practice: null,
    card: null,
    currentLog: {
      interviewPattern: null,
      timeComplexity: null,
      spaceComplexity: null,
      languages: null,
      notes: null,
    },
    canOverrideLatestReview: false,
    generation: null,
    latestReview: null,
    ...overrides,
  }
}
