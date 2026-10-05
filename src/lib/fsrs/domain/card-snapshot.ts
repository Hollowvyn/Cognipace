import { isCanonicalIsoDateString, isRecord } from './snapshot-validation'

/** Supported FSRS learning states exposed by the public library facade. */
export const fsrsCardStates = [
  'new',
  'learning',
  'review',
  'relearning',
] as const

/** Supported FSRS scheduler profile identifiers. */
export const fsrsCardKinds = ['default'] as const

/** Normalized FSRS learning state persisted by CogniPace. */
export type FsrsCardState = (typeof fsrsCardStates)[number]

/** Scheduler profile identifier for a persisted FSRS card. */
export type FsrsCardKind = (typeof fsrsCardKinds)[number]

/** Default scheduler profile used for LeetCode practice cards. */
export const defaultFsrsCardKind: FsrsCardKind = 'default'

/** Dependency-free snapshot of a ts-fsrs card persisted by CogniPace. */
export interface FsrsCardSnapshot {
  dueAt: Date
  stability: number
  difficulty: number
  /** @deprecated Upstream ts-fsrs removes elapsed_days in v6; derive from dates instead. */
  elapsedDays: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: FsrsCardState
  lastReviewAt: Date | null
}

/** Immutable card evidence with canonical ISO dates and no caller metadata. */
export type FsrsSerializedCardSnapshot = Readonly<
  Omit<FsrsCardSnapshot, 'dueAt' | 'lastReviewAt'> & {
    dueAt: string
    lastReviewAt: string | null
  }
>

/** Validates a live card before native scheduling or serialization. */
export function assertValidFsrsCardSnapshot(snapshot: FsrsCardSnapshot): void {
  parseFsrsCardState(snapshot.state)
  assertValidDate(snapshot.dueAt, 'dueAt')
  assertFiniteNonNegativeNumber(snapshot.stability, 'stability')
  assertFiniteNonNegativeNumber(snapshot.difficulty, 'difficulty')
  assertNonNegativeInteger(snapshot.elapsedDays, 'elapsedDays')
  assertNonNegativeInteger(snapshot.scheduledDays, 'scheduledDays')
  assertNonNegativeInteger(snapshot.learningSteps, 'learningSteps')
  assertNonNegativeInteger(snapshot.reps, 'reps')
  assertNonNegativeInteger(snapshot.lapses, 'lapses')

  if (snapshot.lastReviewAt !== null) {
    assertValidDate(snapshot.lastReviewAt, 'lastReviewAt')
  }

  if (snapshot.state !== 'new' && !snapshot.lastReviewAt) {
    throw new Error(
      `Invalid FSRS card snapshot: "${snapshot.state}" cards require lastReviewAt.`,
    )
  }

  if (snapshot.lapses > snapshot.reps) {
    throw new Error('Invalid FSRS card snapshot: lapses cannot exceed reps.')
  }
}

/** Captures detached, immutable evidence from a live FSRS card. */
export function toSerializableFsrsCardSnapshot(
  card: FsrsCardSnapshot,
): FsrsSerializedCardSnapshot {
  assertValidFsrsCardSnapshot(card)

  return Object.freeze({
    dueAt: card.dueAt.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReviewAt: card.lastReviewAt?.toISOString() ?? null,
  })
}

/** Decodes serialized card evidence into a card with fresh Date objects. */
export function parseFsrsCardSnapshot(value: unknown): FsrsCardSnapshot {
  if (
    !isRecord(value) ||
    !isCanonicalIsoDateString(value.dueAt) ||
    !(
      value.lastReviewAt === null ||
      isCanonicalIsoDateString(value.lastReviewAt)
    )
  ) {
    throw new Error('Invalid serialized FSRS card snapshot.')
  }

  const card = {
    dueAt: new Date(value.dueAt),
    stability: value.stability,
    difficulty: value.difficulty,
    elapsedDays: value.elapsedDays,
    scheduledDays: value.scheduledDays,
    learningSteps: value.learningSteps,
    reps: value.reps,
    lapses: value.lapses,
    state: value.state,
    lastReviewAt:
      value.lastReviewAt === null ? null : new Date(value.lastReviewAt),
  } as unknown as FsrsCardSnapshot

  assertValidFsrsCardSnapshot(card)
  return card
}

/** Serializes validated, detached card evidence for persistence. */
export function serializeFsrsCardSnapshot(card: FsrsCardSnapshot): string {
  return JSON.stringify(toSerializableFsrsCardSnapshot(card))
}

/** Decodes serialized JSON card evidence at a storage boundary. */
export function parseSerializedFsrsCardSnapshot(
  value: string,
): FsrsCardSnapshot {
  return parseFsrsCardSnapshot(JSON.parse(value))
}

/** Checks whether a persisted string is a supported FSRS card state. */
export function isFsrsCardState(value: string): value is FsrsCardState {
  return fsrsCardStates.includes(value as FsrsCardState)
}

/** Parses a persisted FSRS card state at storage and API boundaries. */
export function parseFsrsCardState(value: string): FsrsCardState {
  if (isFsrsCardState(value)) {
    return value
  }

  throw new Error(`Invalid FSRS card state "${value}".`)
}

/** Checks whether a persisted string is a supported FSRS card kind. */
export function isFsrsCardKind(value: string): value is FsrsCardKind {
  return fsrsCardKinds.includes(value as FsrsCardKind)
}

/** Parses a persisted FSRS card kind at storage and API boundaries. */
export function parseFsrsCardKind(value: string): FsrsCardKind {
  if (isFsrsCardKind(value)) {
    return value
  }

  throw new Error(`Invalid FSRS card kind "${value}".`)
}

function assertValidDate(value: Date, fieldName: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(
      `Invalid FSRS card snapshot: "${fieldName}" must be a valid Date.`,
    )
  }
}

function assertFiniteNonNegativeNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Invalid FSRS card snapshot: "${fieldName}" must be a finite non-negative number.`,
    )
  }
}

function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Invalid FSRS card snapshot: "${fieldName}" must be a non-negative integer.`,
    )
  }
}
