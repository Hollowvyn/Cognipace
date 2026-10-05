export type FsrsStepUnit = `${number}${'m' | 'h' | 'd'}`

/** Optional scheduler knobs passed to the pure FSRS wrapper. */
export interface FsrsSchedulingOptions {
  targetRetention?: number | undefined
  maximumInterval?: number | undefined
  weights?: readonly number[] | undefined
  enableFuzz?: boolean | undefined
  enableShortTerm?: boolean | undefined
  learningSteps?: readonly FsrsStepUnit[] | undefined
  relearningSteps?: readonly FsrsStepUnit[] | undefined
}

export interface NormalizedFsrsSchedulingOptions {
  targetRetention: number
  maximumInterval?: number | undefined
  weights?: readonly number[] | undefined
  enableFuzz: boolean
  enableShortTerm: boolean
  learningSteps: FsrsStepUnit[]
  relearningSteps: FsrsStepUnit[]
}

/** CogniPace defaults tuned for deliberate LeetCode review sessions. */
export const defaultFsrsSchedulingOptions = {
  targetRetention: 0.9,
  enableFuzz: false,
  enableShortTerm: true,
  learningSteps: ['12h', '23h'],
  relearningSteps: ['23h'],
} as const satisfies Required<
  Omit<FsrsSchedulingOptions, 'weights' | 'maximumInterval'>
>

/** Checks whether a persisted string is a valid ts-fsrs step unit. */
export function isFsrsStepUnit(value: string): value is FsrsStepUnit {
  return /^[1-9]\d*[mhd]$/.test(value)
}

/** Parses a scheduler step unit at settings and storage boundaries. */
export function parseFsrsStepUnit(value: string): FsrsStepUnit {
  if (isFsrsStepUnit(value)) {
    return value
  }

  throw new Error(
    `Invalid FSRS step unit "${value}". Use a positive whole number followed by m, h, or d.`,
  )
}

export function normalizeFsrsSchedulingOptions(
  options: FsrsSchedulingOptions = {},
): NormalizedFsrsSchedulingOptions {
  return {
    targetRetention: normalizeTargetRetention(options.targetRetention),
    enableFuzz: options.enableFuzz ?? defaultFsrsSchedulingOptions.enableFuzz,
    enableShortTerm:
      options.enableShortTerm ?? defaultFsrsSchedulingOptions.enableShortTerm,
    learningSteps: normalizeStepUnits(
      options.learningSteps,
      defaultFsrsSchedulingOptions.learningSteps,
    ),
    relearningSteps: normalizeStepUnits(
      options.relearningSteps,
      defaultFsrsSchedulingOptions.relearningSteps,
    ),
    ...(options.weights === undefined
      ? {}
      : { weights: normalizeWeights(options.weights) }),
    ...(options.maximumInterval === undefined
      ? {}
      : { maximumInterval: normalizeMaximumInterval(options.maximumInterval) }),
  }
}

function normalizeWeights(values: readonly number[]): number[] {
  const weights = Array.from(values)
  if (
    !weights.every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
  ) {
    throw new Error(
      'Invalid FSRS model weights: all values must be finite numbers.',
    )
  }

  return weights
}

function normalizeMaximumInterval(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      'Invalid FSRS maximum interval: use a positive safe integer.',
    )
  }

  return value
}

function normalizeTargetRetention(value: number | undefined) {
  const targetRetention = value ?? defaultFsrsSchedulingOptions.targetRetention

  if (
    !Number.isFinite(targetRetention) ||
    targetRetention <= 0 ||
    targetRetention > 1
  ) {
    throw new Error(
      `Invalid FSRS target retention "${targetRetention}". Use a finite number greater than 0 and less than or equal to 1.`,
    )
  }

  return targetRetention
}

function normalizeStepUnits(
  values: readonly FsrsStepUnit[] | undefined,
  fallback: readonly FsrsStepUnit[],
) {
  return [...(values ?? fallback)].map(parseFsrsStepUnit)
}
