import { expect, it } from 'vitest'
import {
  createEmptyCard,
  default_w,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type FSRSParameters,
  type ReviewLog,
} from 'ts-fsrs'

import type { FsrsCardSnapshot } from '../domain/card-snapshot'
import type { FsrsReviewLogSnapshot } from '../domain/review-log-snapshot'
import type { FsrsSchedulerProfile } from '../domain/scheduler-profile'
import type { ReviewRating } from '../domain/review-rating'
import { rollbackCardReview } from '../adapter/ts-fsrs-adapter'
import {
  createInitialFsrsCard,
  createFsrsSchedulerProfile,
  scheduleReview,
  scheduleReviewWithProfile,
} from './review-scheduler'
import {
  correctLegacyReview,
  correctReviewFromEvidence,
  type FsrsLegacyReviewEntry,
} from './review-correction'

const firstAt = new Date('2026-01-01T10:00:00.000Z')
const secondAt = new Date('2026-01-10T10:00:00.000Z')
const thirdAt = new Date('2026-01-20T10:00:00.000Z')
const legacy75 = {
  targetRetention: 0.75,
  maximumInterval: 36_500,
  enableFuzz: false,
  enableShortTerm: true,
  learningSteps: ['12h', '23h'],
  relearningSteps: ['23h'],
} as const
const profile75 = createFsrsSchedulerProfile(legacy75)
const native75 = fsrs({
  request_retention: 0.75,
  maximum_interval: 36_500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['12h', '23h'],
  relearning_steps: ['23h'],
})
const replacementGrades = [
  ['again', Rating.Again],
  ['hard', Rating.Hard],
  ['good', Rating.Good],
  ['easy', Rating.Easy],
] as const

it.each(replacementGrades)(
  'corrects %s from original 75% context after retention changes',
  (rating, grade) => {
    const preCard = scheduleReview(
      createInitialFsrsCard(firstAt),
      'easy',
      firstAt,
      legacy75,
    ).card
    const saved = scheduleReviewWithProfile(
      preCard,
      'good',
      secondAt,
      profile75,
    )
    const before = JSON.stringify(saved.context)
    const active90 = createFsrsSchedulerProfile({
      ...legacy75,
      targetRetention: 0.9,
    })
    expect(active90.parameters.targetRetention).toBe(0.9)
    const corrected = correctReviewFromEvidence(saved.context, rating)
    const nativePre = native75.next(
      createEmptyCard(firstAt),
      firstAt,
      Rating.Easy,
    ).card
    const expected = native75.next(nativePre, secondAt, grade)

    expectNativeCard(corrected.card, expected.card)
    expectNativeLog(corrected.log, expected.log)
    expect(corrected.rating).toBe(rating)
    expect(corrected.reviewedAt.toISOString()).toBe(secondAt.toISOString())
    expect(corrected.context.profile.parameters.targetRetention).toBe(0.75)
    expect(corrected.context).toEqual(saved.context)
    expect(JSON.stringify(saved.context)).toBe(before)
    expect(correctReviewFromEvidence(saved.context, rating)).toEqual(corrected)
    const alternate = correctReviewFromEvidence(saved.context, 'again')
    expect(correctReviewFromEvidence(alternate.context, rating)).toEqual(
      corrected,
    )
    expect(corrected.card.reps).toBe(preCard.reps + 1)
  },
)

it('captures detached dates and freezes serialized context', () => {
  const at = new Date(firstAt)
  const card = createInitialFsrsCard(at)
  const saved = scheduleReviewWithProfile(card, 'good', at, profile75)
  const before = JSON.stringify(saved.context)
  const expected = native75.next(createEmptyCard(firstAt), firstAt, Rating.Easy)

  at.setUTCFullYear(2040)
  card.dueAt.setUTCFullYear(2041)
  saved.reviewedAt.setUTCFullYear(2042)
  saved.card.dueAt.setUTCFullYear(2043)
  saved.card.lastReviewAt!.setUTCFullYear(2044)

  expect(JSON.stringify(saved.context)).toBe(before)
  expect(Object.isFrozen(saved.context)).toBe(true)
  expect(Object.isFrozen(saved.context.preCard)).toBe(true)
  expect(Object.isFrozen(saved.context.profile)).toBe(true)
  expect(Object.isFrozen(saved.context.profile.parameters)).toBe(true)
  expect(Object.isFrozen(saved.context.profile.parameters.weights)).toBe(true)
  expect(saved.context.profile).not.toBe(profile75)
  expect(saved.context.profile.parameters).not.toBe(profile75.parameters)
  expect(saved.context.profile.parameters.weights).not.toBe(
    profile75.parameters.weights,
  )
  expect(Object.isFrozen(saved.context.profile.parameters.learningSteps)).toBe(
    true,
  )
  expect(
    Object.isFrozen(saved.context.profile.parameters.relearningSteps),
  ).toBe(true)
  expect(saved.context.preCard.lastReviewAt).toBeNull()
  const corrected = correctReviewFromEvidence(saved.context, 'easy')
  expectNativeCard(corrected.card, expected.card)
  expectNativeLog(corrected.log, expected.log)
  expect(corrected.reviewedAt.toISOString()).toBe(firstAt.toISOString())
  expect(JSON.stringify(saved.context)).toBe(before)
})

it('rejects invalid original time/profile and keeps the captured value intact', () => {
  const saved = scheduleReviewWithProfile(
    createInitialFsrsCard(firstAt),
    'good',
    firstAt,
    profile75,
  )
  const before = JSON.stringify(saved.context)

  expect(() =>
    correctReviewFromEvidence(
      { ...saved.context, reviewedAt: '2026-01-01' },
      'easy',
    ),
  ).toThrow('Invalid FSRS review context time.')
  expect(() =>
    correctReviewFromEvidence(
      {
        ...saved.context,
        profile: {
          ...profile75,
          libraryVersion: 'unsupported',
        } as unknown as FsrsSchedulerProfile,
      },
      'easy',
    ),
  ).toThrow('Invalid or unsupported FSRS scheduler profile.')
  expect(() =>
    scheduleReviewWithProfile(
      saved.card,
      'good',
      new Date('2025-12-31T10:00:00.000Z'),
      profile75,
    ),
  ).toThrow('FSRS review time precedes the captured last review.')
  expect(JSON.stringify(saved.context)).toBe(before)
})

it.each([new Date('invalid'), firstAt.toISOString() as unknown as Date])(
  'rejects invalid live review times %s',
  (at) => {
    expect(() =>
      scheduleReviewWithProfile(
        createInitialFsrsCard(firstAt),
        'good',
        at,
        profile75,
      ),
    ).toThrow('Invalid FSRS review time.')
  },
)

it('corrects custom effective weights and steps once from the original pre-card', () => {
  const weights = customWeights()
  const profile = createFsrsSchedulerProfile({
    ...legacy75,
    weights,
    learningSteps: ['1m', '10m'],
    relearningSteps: ['1m', '10m'],
  })
  const native = fsrs(
    generatorParameters({
      request_retention: 0.75,
      maximum_interval: 36_500,
      w: weights,
      enable_fuzz: false,
      enable_short_term: true,
      learning_steps: ['1m', '10m'],
      relearning_steps: ['1m', '10m'],
    }),
  )
  expectNativeProfile(profile, native.parameters)
  const first = scheduleReviewWithProfile(
    createInitialFsrsCard(firstAt),
    'easy',
    firstAt,
    profile,
  )
  const nativeFirst = native.next(
    createEmptyCard(firstAt),
    firstAt,
    Rating.Easy,
  )
  expectNativeCard(first.card, nativeFirst.card)
  expectNativeLog(first.log, nativeFirst.log)
  const pre = scheduleReviewWithProfile(first.card, 'good', secondAt, profile)
  const nativePre = native.next(nativeFirst.card, secondAt, Rating.Good)
  expectNativeCard(pre.card, nativePre.card)
  expectNativeLog(pre.log, nativePre.log)
  const saved = scheduleReviewWithProfile(pre.card, 'again', thirdAt, profile)
  const nativeSaved = native.next(nativePre.card, thirdAt, Rating.Again)
  expectNativeCard(saved.card, nativeSaved.card)
  expectNativeLog(saved.log, nativeSaved.log)
  const before = JSON.stringify(saved.context)
  const corrected = correctReviewFromEvidence(saved.context, 'easy')
  const expected = native.next(nativePre.card, thirdAt, Rating.Easy)

  expectNativeCard(corrected.card, expected.card)
  expectNativeLog(corrected.log, expected.log)
  expect(corrected.context).toEqual(saved.context)
  expect(corrected.context.profile).toEqual(profile)
  expect(corrected.context.profile.parameters).not.toEqual(
    createFsrsSchedulerProfile().parameters,
  )
  expect(corrected.card.stability).not.toBe(
    native75.next(nativePre.card, thirdAt, Rating.Easy).card.stability,
  )
  expect(corrected.card.reps).toBe(pre.card.reps + 1)
  expect(corrected.card.reps).not.toBe(
    native.next(nativeSaved.card, thirdAt, Rating.Easy).card.reps,
  )
  expect(JSON.stringify(saved.context)).toBe(before)
})

it.each(replacementGrades)(
  'reproduces %s under a recorded long-term profile with deterministic fuzz',
  (rating, grade) => {
    const weights = customWeights()
    const profile = createFsrsSchedulerProfile({
      targetRetention: 0.9,
      maximumInterval: 36_500,
      weights,
      enableFuzz: true,
      enableShortTerm: false,
      learningSteps: [],
      relearningSteps: [],
    })
    const native = fsrs(
      generatorParameters({
        request_retention: 0.9,
        maximum_interval: 36_500,
        w: weights,
        enable_fuzz: true,
        enable_short_term: false,
        learning_steps: [],
        relearning_steps: [],
      }),
    )
    const p = native.parameters
    const nativeParameters = {
      request_retention: p.request_retention,
      maximum_interval: p.maximum_interval,
      w: [...p.w],
      enable_fuzz: p.enable_fuzz,
      enable_short_term: p.enable_short_term,
      learning_steps: [...p.learning_steps],
      relearning_steps: [...p.relearning_steps],
    }
    expectNativeProfile(profile, nativeParameters)
    const card = createInitialFsrsCard(firstAt)
    const saved = scheduleReviewWithProfile(card, 'good', firstAt, profile)
    const before = JSON.stringify(saved.context)
    const expected = fsrs(nativeParameters).next(
      createEmptyCard(firstAt),
      firstAt,
      grade,
    )
    const corrected = correctReviewFromEvidence(saved.context, rating)

    expectNativeCard(corrected.card, expected.card)
    expectNativeLog(corrected.log, expected.log)
    expect(corrected.rating).toBe(rating)
    expect(corrected.reviewedAt.toISOString()).toBe(firstAt.toISOString())
    expect(corrected.context.profile).toEqual(profile)
    expect(corrected.context.profile.parameters.enableShortTerm).toBe(false)
    expect(corrected.context.profile.parameters.enableFuzz).toBe(true)
    expect(corrected.card.reps).toBe(card.reps + 1)
    expect(correctReviewFromEvidence(saved.context, rating)).toEqual(corrected)
    if (rating === 'hard') {
      const shortTerm = fsrs({
        ...nativeParameters,
        enable_short_term: true,
      }).next(createEmptyCard(firstAt), firstAt, grade)
      expect(corrected.card.scheduledDays).not.toBe(
        shortTerm.card.scheduled_days,
      )
    }
    if (rating === 'easy') {
      const withoutFuzz = fsrs({
        ...nativeParameters,
        enable_fuzz: false,
      }).next(createEmptyCard(firstAt), firstAt, grade)
      expect(corrected.card.scheduledDays).not.toBe(
        withoutFuzz.card.scheduled_days,
      )
    }
    expect(JSON.stringify(saved.context)).toBe(before)
  },
)

it('corrects verified latest memory with an explicitly unknown original profile', () => {
  const { card, history } = legacyHistory()
  const before = JSON.stringify({ card, history })
  const corrected = correctLegacyReview(card, history, 'easy', 0.9)
  const nativeA = native75.next(createEmptyCard(firstAt), firstAt, Rating.Easy)
  const nativeB = native75.next(nativeA.card, secondAt, Rating.Good)
  const nativeC = native75.next(nativeB.card, thirdAt, Rating.Again)
  const recovered = native75.rollback(nativeC.card, nativeC.log)
  expect(recovered.due).not.toEqual(nativeB.card.due)
  const expected = fsrs({
    ...native75.parameters,
    request_retention: 0.9,
  }).next(recovered, thirdAt, Rating.Easy)

  expectNativeCard(corrected.card, expected.card)
  expectNativeLog(corrected.log, expected.log)
  expect(corrected.card.lapses).toBe(0)
  expect(corrected.rating).toBe('easy')
  expect(corrected.reviewedAt.toISOString()).toBe(thirdAt.toISOString())
  expect(corrected.reviewedAt).not.toBe(history.at(-1)?.reviewedAt)
  expect(corrected).toMatchObject({
    evidence: 'legacy-derived',
    originalProfile: null,
  })
  expect(corrected).not.toHaveProperty('context')
  expect(corrected.profile.parameters.targetRetention).toBe(0.9)
  expect(JSON.stringify({ card, history })).toBe(before)
})

it('rejects an earlier valid log even though native rollback accepts it', () => {
  const { card, history } = legacyHistory()
  const earlierLog = history[1]?.log
  if (!earlierLog) throw new Error('Missing earlier fixture log.')
  const nativeA = native75.next(createEmptyCard(firstAt), firstAt, Rating.Easy)
  const nativeB = native75.next(nativeA.card, secondAt, Rating.Good)
  const nativeC = native75.next(nativeB.card, thirdAt, Rating.Again)
  expect(() => native75.rollback(nativeC.card, nativeB.log)).not.toThrow()
  expect(() => rollbackCardReview(card, earlierLog)).not.toThrow()
  const replaced = history.map((event, index) =>
    index === 2 ? { ...event, log: earlierLog } : event,
  )
  const before = JSON.stringify({ card, replaced })

  expect(() => correctLegacyReview(card, replaced, 'easy', 0.9)).toThrow(
    'Unsupported or ambiguous legacy FSRS correction evidence.',
  )
  expect(JSON.stringify({ card, replaced })).toBe(before)
})

it.each([
  { label: 'tied', hours: [10, 10, 14] },
  { label: 'reordered', hours: [10, 18, 14] },
])(
  'rejects $label histories in original and sorted order without mutation',
  ({ hours }) => {
    const times = hours.map((hour) => new Date(`2026-01-01T${hour}:00:00.000Z`))
    const { card, history } = legacyHistory(times, ['again', 'hard', 'good'])
    expect(card.reps).toBe(3)
    const sorted = history.toSorted(
      (left, right) => left.reviewedAt.getTime() - right.reviewedAt.getTime(),
    )
    const before = JSON.stringify({ card, history, sorted })

    expect(() => correctLegacyReview(card, history, 'easy', 0.9)).toThrow(
      'Unsupported or ambiguous legacy FSRS correction evidence.',
    )
    expect(() => correctLegacyReview(card, sorted, 'easy', 0.9)).toThrow(
      'Unsupported or ambiguous legacy FSRS correction evidence.',
    )
    expect(JSON.stringify({ card, history, sorted })).toBe(before)
  },
)

it.each(['latest only', 'missing middle'])(
  'rejects sparse legacy history with %s entries without mutation',
  (shape) => {
    const { card, history } = legacyHistory(undefined, ['easy', 'good', 'good'])
    const first = history[0]
    const latest = history.at(-1)
    if (!first || !latest) throw new Error('Missing fixture entries.')
    const sparse: FsrsLegacyReviewEntry[] = new Array(history.length)
    sparse[history.length - 1] = latest
    if (shape === 'missing middle') sparse[0] = first
    const before = JSON.stringify({ card, history: sparse })
    const keys = Object.keys(sparse)

    expect(card.lapses).toBe(0)
    expect(() => correctLegacyReview(card, sparse, 'easy', 0.9)).toThrow(
      'Unsupported or ambiguous legacy FSRS correction evidence.',
    )
    expect(JSON.stringify({ card, history: sparse })).toBe(before)
    expect(Object.keys(sparse)).toEqual(keys)
  },
)

it('rejects missing, incomplete and inconsistent saved evidence without mutation', () => {
  const { card, history } = legacyHistory()
  const missing = history.map((event, index) =>
    index === 2 ? { ...event, log: null } : event,
  )
  const unsupported =
    'Unsupported or ambiguous legacy FSRS correction evidence.'
  for (const [candidateCard, entries, error] of [
    [card, [], unsupported],
    [card, history.slice(1), unsupported],
    [card, missing, 'Invalid FSRS review log snapshot.'],
    [{ ...card, lapses: 0 }, history, unsupported],
    [{ ...card, stability: card.stability + 1 }, history, unsupported],
    [{ ...card, lastReviewAt: secondAt }, history, unsupported],
  ] as const) {
    const before = JSON.stringify({ card: candidateCard, history: entries })
    expect(() =>
      correctLegacyReview(candidateCard, entries, 'easy', 0.9),
    ).toThrow(error)
    expect(JSON.stringify({ card: candidateCard, history: entries })).toBe(
      before,
    )
  }
})

it.each([
  { state: 'new', pairs: [['easy', Rating.Easy]] },
  {
    state: 'learning',
    pairs: [
      ['again', Rating.Again],
      ['again', Rating.Again],
    ],
  },
  {
    state: 'relearning',
    pairs: [
      ['easy', Rating.Easy],
      ['again', Rating.Again],
      ['again', Rating.Again],
    ],
  },
] as const)(
  'corrects captured and verified legacy $state pre-states',
  ({ state, pairs }) => {
    let card = createInitialFsrsCard(firstAt)
    let nativeCard = createEmptyCard(firstAt)
    const history: FsrsLegacyReviewEntry[] = []
    for (const [index, [rating, grade]] of pairs.entries()) {
      const at = new Date(firstAt.getTime() + index * 86_400_000)
      const saved = scheduleReviewWithProfile(card, rating, at, profile75)
      const nativeSaved = native75.next(nativeCard, at, grade)
      history.push({ reviewedAt: at, rating, log: saved.log })
      if (index === pairs.length - 1) {
        expect(card.state).toBe(state)
        for (const [replacement, replacementGrade] of replacementGrades) {
          const expected = native75.next(nativeCard, at, replacementGrade)
          const captured = correctReviewFromEvidence(saved.context, replacement)
          const legacy = correctLegacyReview(
            saved.card,
            history,
            replacement,
            0.75,
          )
          expectNativeCard(captured.card, expected.card)
          expectNativeLog(captured.log, expected.log)
          expectNativeCard(legacy.card, expected.card)
          expectNativeLog(legacy.log, expected.log)
        }
      }
      card = saved.card
      nativeCard = nativeSaved.card
    }
    const again = correctLegacyReview(card, history, 'again', 0.75)
    expect(again.card.lapses).toBe(pairs.length === 3 ? 1 : 0)
    const latest = history.at(-1)
    if (!latest) throw new Error('Missing latest fixture entry.')
    expect(
      scheduleReviewWithProfile(card, 'good', latest.reviewedAt, profile75).card
        .reps,
    ).toBe(card.reps + 1)
  },
)

function legacyHistory(
  times = [firstAt, secondAt, thirdAt],
  ratings: readonly ReviewRating[] = ['easy', 'good', 'again'],
) {
  let card = createInitialFsrsCard(times[0])
  const history: FsrsLegacyReviewEntry[] = []
  for (const [index, at] of times.entries()) {
    const rating = ratings[index]
    if (!rating) throw new Error('Missing fixture rating.')
    const result = scheduleReview(card, rating, at, legacy75)
    history.push({ reviewedAt: at, rating: result.rating, log: result.log })
    card = result.card
  }
  return { card, history }
}

function customWeights() {
  const weights = [...default_w]
  weights[0] = 0.3
  weights[3] = 12
  weights[8] = 2.2
  weights[20] = 0.2
  return weights
}

function expectNativeProfile(
  profile: FsrsSchedulerProfile,
  expected: FSRSParameters,
) {
  expect(profile.parameters).toEqual({
    targetRetention: expected.request_retention,
    maximumInterval: expected.maximum_interval,
    weights: [...expected.w],
    enableFuzz: expected.enable_fuzz,
    enableShortTerm: expected.enable_short_term,
    learningSteps: [...expected.learning_steps],
    relearningSteps: [...expected.relearning_steps],
  })
}

function expectNativeCard(actual: FsrsCardSnapshot, expected: Card) {
  expect([
    actual.dueAt.toISOString(),
    actual.stability,
    actual.difficulty,
    actual.elapsedDays,
    actual.scheduledDays,
    actual.learningSteps,
    actual.reps,
    actual.lapses,
    actual.state,
    actual.lastReviewAt?.toISOString() ?? null,
  ]).toEqual([
    expected.due.toISOString(),
    expected.stability,
    expected.difficulty,
    expected.elapsed_days,
    expected.scheduled_days,
    expected.learning_steps,
    expected.reps,
    expected.lapses,
    State[expected.state].toLowerCase(),
    expected.last_review?.toISOString() ?? null,
  ])
}

function expectNativeLog(actual: FsrsReviewLogSnapshot, expected: ReviewLog) {
  expect(actual).toEqual({
    rating: Rating[expected.rating].toLowerCase(),
    state: State[expected.state].toLowerCase(),
    dueAt: expected.due.toISOString(),
    stability: expected.stability,
    difficulty: expected.difficulty,
    elapsedDays: expected.elapsed_days,
    lastElapsedDays: expected.last_elapsed_days,
    scheduledDays: expected.scheduled_days,
    learningSteps: expected.learning_steps,
    reviewedAt: expected.review.toISOString(),
  })
}
