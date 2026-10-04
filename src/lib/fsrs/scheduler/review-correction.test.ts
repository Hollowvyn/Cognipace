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
import {
  createInitialFsrsCard,
  createFsrsSchedulerProfile,
  scheduleReview,
  scheduleReviewWithProfile,
} from './review-scheduler'
import { correctReviewFromEvidence } from './review-correction'

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
