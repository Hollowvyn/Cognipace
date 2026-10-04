import { isFsrsStepUnit, type FsrsStepUnit } from './scheduling-options'

export interface FsrsEffectiveParameters {
  readonly targetRetention: number
  readonly maximumInterval: number
  readonly weights: readonly number[]
  readonly enableFuzz: boolean
  readonly enableShortTerm: boolean
  readonly learningSteps: readonly FsrsStepUnit[]
  readonly relearningSteps: readonly FsrsStepUnit[]
}

export interface FsrsSchedulerProfile {
  readonly schemaVersion: 1
  readonly libraryVersion: '5.4.0'
  readonly modelVersion: 'FSRS-6.0'
  /** Weight provenance; any explicitly supplied vector is custom. */
  readonly source: 'default' | 'custom'
  readonly parameters: FsrsEffectiveParameters
}

/** Structural decoding only; the adapter checks exact native reconstruction. */
export function readFsrsSchedulerProfile(value: unknown): FsrsSchedulerProfile {
  const record = (input: unknown): input is Record<string, unknown> =>
    typeof input === 'object' && input !== null && !Array.isArray(input)

  if (
    !record(value) ||
    Reflect.ownKeys(value).length !== 5 ||
    ![
      'schemaVersion',
      'libraryVersion',
      'modelVersion',
      'source',
      'parameters',
    ].every((key) => Object.hasOwn(value, key)) ||
    value.schemaVersion !== 1 ||
    value.libraryVersion !== '5.4.0' ||
    value.modelVersion !== 'FSRS-6.0' ||
    (value.source !== 'default' && value.source !== 'custom') ||
    !record(value.parameters)
  ) {
    throw new Error('Invalid or unsupported FSRS scheduler profile.')
  }

  const p = value.parameters
  const steps = (input: unknown): input is FsrsStepUnit[] =>
    Array.isArray(input) &&
    Array.from(input).every(
      (step) => typeof step === 'string' && isFsrsStepUnit(step),
    )
  const weights = (input: unknown): input is number[] =>
    Array.isArray(input) &&
    input.length === 21 &&
    Array.from(input).every(
      (weight) => typeof weight === 'number' && Number.isFinite(weight),
    )

  if (
    Reflect.ownKeys(p).length !== 7 ||
    ![
      'targetRetention',
      'maximumInterval',
      'weights',
      'enableFuzz',
      'enableShortTerm',
      'learningSteps',
      'relearningSteps',
    ].every((key) => Object.hasOwn(p, key)) ||
    typeof p.targetRetention !== 'number' ||
    !Number.isFinite(p.targetRetention) ||
    p.targetRetention <= 0 ||
    p.targetRetention > 1 ||
    typeof p.maximumInterval !== 'number' ||
    !Number.isSafeInteger(p.maximumInterval) ||
    p.maximumInterval <= 0 ||
    typeof p.enableFuzz !== 'boolean' ||
    typeof p.enableShortTerm !== 'boolean' ||
    !weights(p.weights) ||
    !steps(p.learningSteps) ||
    !steps(p.relearningSteps)
  ) {
    throw new Error('Invalid FSRS effective parameters.')
  }

  return Object.freeze({
    schemaVersion: 1,
    libraryVersion: '5.4.0',
    modelVersion: 'FSRS-6.0',
    source: value.source,
    parameters: Object.freeze({
      targetRetention: p.targetRetention,
      maximumInterval: p.maximumInterval,
      weights: Object.freeze([...p.weights]),
      enableFuzz: p.enableFuzz,
      enableShortTerm: p.enableShortTerm,
      learningSteps: Object.freeze([...p.learningSteps]),
      relearningSteps: Object.freeze([...p.relearningSteps]),
    }),
  })
}
