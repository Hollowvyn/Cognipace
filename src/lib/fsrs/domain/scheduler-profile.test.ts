import { describe, expect, it } from 'vitest'
import { createEmptyCard, default_w, FSRSVersion, fsrs, Rating } from 'ts-fsrs'

import {
  createFsrsSchedulerProfile,
  createInitialFsrsCard,
  parseFsrsSchedulerProfile,
  parseSerializedFsrsSchedulerProfile,
  projectReviewSchedule,
  scheduleReview,
  serializeFsrsSchedulerProfile,
} from '..'

describe('effective FSRS profiles', () => {
  it('records the installed engine and round-trips a detached effective profile', () => {
    const weights = [...default_w]
    const learningSteps = ['12h', '23h'] as const
    const profile = createFsrsSchedulerProfile({
      targetRetention: 0.75,
      maximumInterval: 10,
      weights,
      learningSteps,
    })

    expect(FSRSVersion).toBe(
      `v${profile.libraryVersion} using ${profile.modelVersion}`,
    )
    expect(profile.parameters).toEqual({
      targetRetention: 0.75,
      maximumInterval: 10,
      weights: default_w,
      enableFuzz: false,
      enableShortTerm: true,
      learningSteps: ['12h', '23h'],
      relearningSteps: ['23h'],
    })
    expect(profile.source).toBe('custom')
    weights[0] = 99
    expect(profile.parameters.weights[0]).toBe(default_w[0])
    expect(Object.isFrozen(profile)).toBe(true)
    expect(Object.isFrozen(profile.parameters)).toBe(true)
    expect(Object.isFrozen(profile.parameters.weights)).toBe(true)
    expect(Object.isFrozen(profile.parameters.learningSteps)).toBe(true)
    expect(Object.isFrozen(profile.parameters.relearningSteps)).toBe(true)
    expect(
      parseSerializedFsrsSchedulerProfile(
        serializeFsrsSchedulerProfile(profile),
      ),
    ).toEqual(profile)
    expect(createFsrsSchedulerProfile().source).toBe('default')
  })

  it.each([17, 19, 21])(
    'captures final normalization for %s weights',
    (length) => {
      const profile = createFsrsSchedulerProfile({
        weights: default_w.slice(0, length),
      })

      expect(profile.parameters.weights).toHaveLength(21)
      if (length < 21) expect(profile.parameters.weights[19]).toBe(0.01)
      expect(parseFsrsSchedulerProfile(profile)).toEqual(profile)
      expect(
        parseSerializedFsrsSchedulerProfile(
          serializeFsrsSchedulerProfile(profile),
        ),
      ).toEqual(profile)
    },
  )

  it('rejects clipped imported weights and false default provenance', () => {
    const profile = createFsrsSchedulerProfile({
      relearningSteps: ['1m', '10m'],
    })
    const weights = [...profile.parameters.weights]
    weights[17] = 99
    expect(() =>
      parseFsrsSchedulerProfile({
        ...profile,
        source: 'custom',
        parameters: { ...profile.parameters, weights },
      }),
    ).toThrow('exactly')

    weights[17] = 0.01
    expect(() =>
      parseFsrsSchedulerProfile({
        ...profile,
        parameters: { ...profile.parameters, weights },
      }),
    ).toThrow('default')

    const signedZero = [...profile.parameters.weights]
    signedZero[8] = -0
    expect(() =>
      parseFsrsSchedulerProfile({
        ...profile,
        source: 'custom',
        parameters: { ...profile.parameters, weights: signedZero },
      }),
    ).toThrow('exactly')
  })

  it('carries internal maximum interval and weights through projection', () => {
    const options = { maximumInterval: 2, weights: [...default_w] }
    const card = createInitialFsrsCard(at)
    const expected = scheduleReview(card, 'easy', at, options)

    expect(
      projectReviewSchedule(card, {
        ...options,
        startAt: at,
        maxReviews: 1,
        assumedRating: 'easy',
      })[0],
    ).toEqual(expected)
    expect(expected.card.scheduledDays).toBeLessThanOrEqual(2)
  })

  it('preserves existing omitted-weight custom-step scheduling', () => {
    const options = { relearningSteps: ['1m', '10m'] } as const
    const native = fsrs({
      request_retention: 0.9,
      enable_fuzz: false,
      enable_short_term: true,
      learning_steps: ['12h', '23h'],
      relearning_steps: ['1m', '10m'],
    })
    let card = createInitialFsrsCard(at)
    let nativeCard = createEmptyCard(at)

    for (const [rating, grade, reviewedAt] of [
      ['easy', Rating.Easy, at],
      ['again', Rating.Again, new Date('2026-10-13T10:00:00.000Z')],
      ['good', Rating.Good, new Date('2026-10-13T10:05:00.000Z')],
    ] as const) {
      card = scheduleReview(card, rating, reviewedAt, options).card
      nativeCard = native.next(nativeCard, reviewedAt, grade).card
      expect([
        card.stability,
        card.difficulty,
        card.dueAt.toISOString(),
      ]).toEqual([
        nativeCard.stability,
        nativeCard.difficulty,
        nativeCard.due.toISOString(),
      ])
    }

    const profile = createFsrsSchedulerProfile(options)
    expect(parseFsrsSchedulerProfile(profile)).toEqual(profile)
    expect(profile.parameters.weights[17]).not.toBe(native.parameters.w[17])
  })

  it('canonicalizes field order and detaches parsed profile arrays', () => {
    const profile = createFsrsSchedulerProfile()
    const weights = [...profile.parameters.weights]
    const learningSteps = [...profile.parameters.learningSteps]
    const relearningSteps = [...profile.parameters.relearningSteps]
    const parsed = parseFsrsSchedulerProfile({
      parameters: {
        relearningSteps,
        learningSteps,
        enableShortTerm: profile.parameters.enableShortTerm,
        enableFuzz: profile.parameters.enableFuzz,
        weights,
        maximumInterval: profile.parameters.maximumInterval,
        targetRetention: profile.parameters.targetRetention,
      },
      source: profile.source,
      modelVersion: profile.modelVersion,
      libraryVersion: profile.libraryVersion,
      schemaVersion: profile.schemaVersion,
    })

    weights[0] = 99
    learningSteps[0] = '1m'
    relearningSteps[0] = '1m'
    expect(parsed).toEqual(profile)
    expect(serializeFsrsSchedulerProfile(parsed)).toBe(
      serializeFsrsSchedulerProfile(profile),
    )
  })

  it.each([
    { name: 'null', value: null },
    { name: 'array', value: [] },
    { name: 'missing fields', value: {} },
    { name: 'future schema', field: 'schemaVersion', value: 2 },
    { name: 'unsupported library', field: 'libraryVersion', value: '5.5.0' },
    { name: 'unsupported model', field: 'modelVersion', value: 'FSRS-7.0' },
    { name: 'invalid source', field: 'source', value: 'legacy' },
    { name: 'invalid parameters', field: 'parameters', value: null },
  ])('rejects $name profiles', ({ field, value }) => {
    const input = field
      ? { ...createFsrsSchedulerProfile(), [field]: value }
      : value
    expect(() => parseFsrsSchedulerProfile(input)).toThrow()
  })

  it.each([
    { name: 'zero retention', field: 'targetRetention', value: 0 },
    { name: 'high retention', field: 'targetRetention', value: 1.1 },
    { name: 'nonfinite retention', field: 'targetRetention', value: NaN },
    { name: 'fractional interval', field: 'maximumInterval', value: 1.5 },
    {
      name: 'unsafe interval',
      field: 'maximumInterval',
      value: Number.MAX_SAFE_INTEGER + 1,
    },
    { name: 'invalid fuzz flag', field: 'enableFuzz', value: 'false' },
    { name: 'invalid short-term flag', field: 'enableShortTerm', value: null },
    { name: 'short weights', field: 'weights', value: default_w.slice(0, 19) },
    { name: 'sparse weights', field: 'weights', value: new Array<number>(21) },
    {
      name: 'nonfinite weights',
      field: 'weights',
      value: Array.from({ length: 21 }, () => Infinity),
    },
    { name: 'invalid learning steps', field: 'learningSteps', value: ['1.5h'] },
    {
      name: 'sparse relearning steps',
      field: 'relearningSteps',
      value: new Array<string>(1),
    },
  ])('rejects $name effective parameters', ({ field, value }) => {
    const profile = createFsrsSchedulerProfile()
    expect(() =>
      parseFsrsSchedulerProfile({
        ...profile,
        parameters: { ...profile.parameters, [field]: value },
      }),
    ).toThrow()
  })

  it('requires exactly the documented own profile and parameter keys', () => {
    const profile = createFsrsSchedulerProfile()
    const { source, ...otherFields } = profile
    const inheritedSource: unknown = Object.assign(Object.create({ source }), {
      ...otherFields,
      extra: true,
    })
    const { targetRetention, ...otherParameters } = profile.parameters
    const inheritedRetention: unknown = Object.assign(
      Object.create({ targetRetention }),
      { ...otherParameters, extra: true },
    )

    expect(() => parseFsrsSchedulerProfile(inheritedSource)).toThrow()
    expect(() =>
      parseFsrsSchedulerProfile({ ...profile, parameters: inheritedRetention }),
    ).toThrow()
    expect(() =>
      parseFsrsSchedulerProfile({ ...profile, [Symbol('extra')]: true }),
    ).toThrow()
    expect(() =>
      parseFsrsSchedulerProfile({
        ...profile,
        parameters: { ...profile.parameters, extra: true },
      }),
    ).toThrow()
  })

  it('rejects malformed JSON and validates profiles during serialization', () => {
    expect(() => parseSerializedFsrsSchedulerProfile('{')).toThrow()
    const profile = createFsrsSchedulerProfile()
    const weights = [...profile.parameters.weights]
    weights[17] = 99
    expect(() =>
      serializeFsrsSchedulerProfile({
        ...profile,
        source: 'custom',
        parameters: { ...profile.parameters, weights },
      }),
    ).toThrow('exactly')
  })
})

const at = new Date('2026-10-04T10:00:00.000Z')
