import { and, asc, desc, eq } from 'drizzle-orm'

import {
  createInitialFsrsCard,
  defaultFsrsCardKind,
  parseSerializedFsrsReviewLogSnapshot,
  parseFsrsCardState,
  parseReviewRating,
  replayReviewHistorySequence,
  scheduleReview,
  serializeFsrsReviewLogSnapshot,
  type FsrsCardKind,
  type FsrsCardSnapshot,
  type FsrsReviewLogSnapshot,
} from '@/lib/fsrs'
import type { Db } from '@/platform/db'
import {
  fsrsCards,
  problemPractice,
  reviewAttempts,
  type FsrsCardRow,
  type ProblemPracticeRow,
  type ReviewAttemptRow,
} from '@/platform/db/schema'

import {
  buildPracticeProgressSummary,
  derivePracticeSummary,
  deriveNormalizedPracticeState,
  normalizeReviewLogFields,
  parsePracticeStatus,
  reviewModes,
  statusFromReview,
  type NormalizedPracticeState,
  type OverrideLastReviewResultInput,
  type PracticeDetails,
  type PracticeLogFields,
  type PracticeProgressSummary,
  type PracticeProgressSummaryInput,
  type PracticeReviewAttemptSnapshot,
  type PracticeReadOptions,
  type PracticeStateSnapshot,
  type ReviewMode,
  type ReviewResult,
  type ResetPracticeScheduleInput,
  type SaveReviewResultInput,
  type SetPracticeSuspendedInput,
} from '../domain'

export function createPracticeRepository(db: Db) {
  return new PracticeRepository(db)
}

export class PracticeRepository {
  constructor(private readonly db: Db) {}

  async saveReviewResult(input: SaveReviewResultInput): Promise<ReviewResult> {
    return this.db.transaction((transactionDb) =>
      this.saveReviewResultInTransaction(input, transactionDb as unknown as Db),
    )
  }

  async saveReviewResultInTransaction(
    input: SaveReviewResultInput,
    writeDb: Db,
  ): Promise<ReviewResult> {
    const reviewedAt = input.reviewedAt ?? new Date()
    const cardKind = input.cardKind ?? defaultFsrsCardKind
    const cardId = createFsrsCardId(input.problemSlug, cardKind)
    const timestamp = reviewedAt.getTime()
    const createdAt = new Date()
    const createdAtTimestamp = createdAt.getTime()
    const reviewAttemptId =
      input.reviewAttemptId ??
      createReviewAttemptId(input.problemSlug, timestamp)

    const currentCard =
      (await this.getCard(input.problemSlug, cardKind, writeDb)) ??
      createInitialFsrsCard(reviewedAt)
    const scheduled = scheduleReview(currentCard, input.rating, reviewedAt, {
      targetRetention: input.targetRetention,
    })
    const status = statusFromReview(input.rating, scheduled.card)
    const previousPractice = await this.getPracticeState(
      input.problemSlug,
      writeDb,
    )
    const reviewLogSnapshot = createPracticeLogSnapshot(
      previousPractice?.log,
      input.log,
    )

    await this.upsertCard(writeDb, {
      id: cardId,
      problemSlug: input.problemSlug,
      cardKind,
      card: scheduled.card,
      now: reviewedAt,
    })

    await writeDb.insert(reviewAttempts).values({
      id: reviewAttemptId,
      problemSlug: input.problemSlug,
      cardId,
      rating: input.rating,
      reviewMode: input.reviewMode ?? 'manual',
      reviewedAt: timestamp,
      elapsedSeconds: normalizeElapsedSeconds(input.elapsedSeconds),
      isCorrect: input.isCorrect ?? null,
      ...toReviewLogRow(reviewLogSnapshot),
      fsrsReviewLog: serializeFsrsReviewLogSnapshot(scheduled.log),
      createdAt: createdAtTimestamp,
      updatedAt: createdAtTimestamp,
    })

    const attempts = await this.readReviewAttempts(writeDb, {
      problemSlug: input.problemSlug,
      cardId,
    })
    const practice = await this.upsertPracticeAggregate(writeDb, {
      problemSlug: input.problemSlug,
      status,
      attempts,
      log: reviewLogSnapshot,
      isSuspended: previousPractice?.isSuspended ?? false,
      now: reviewedAt,
    })
    const summary = derivePracticeSummary({
      practice,
      card: scheduled.card,
      now: reviewedAt,
    })

    return {
      problemSlug: input.problemSlug,
      cardId,
      reviewAttemptId,
      rating: input.rating,
      status,
      dueAt: scheduled.card.dueAt,
      reviewedAt,
      card: scheduled.card,
      summary,
    }
  }

  async overrideLastReviewResult(
    input: OverrideLastReviewResultInput,
  ): Promise<ReviewResult> {
    return this.db.transaction((transactionDb) =>
      this.overrideLastReviewResultInTransaction(
        input,
        transactionDb as unknown as Db,
      ),
    )
  }

  async overrideLastReviewResultInTransaction(
    input: OverrideLastReviewResultInput,
    writeDb: Db,
  ): Promise<ReviewResult> {
    const cardKind = input.cardKind ?? defaultFsrsCardKind
    const cardId = createFsrsCardId(input.problemSlug, cardKind)

    const attempts = await this.readReviewAttempts(writeDb, {
      problemSlug: input.problemSlug,
      cardId,
    })
    const latestAttempt = attempts.at(-1)

    if (!latestAttempt) {
      throw new Error('No review result exists to override.')
    }

    const previousPractice = await this.getPracticeState(
      input.problemSlug,
      writeDb,
    )
    const changedAt = new Date()
    const updatedLogSnapshot = createPracticeLogSnapshot(
      previousPractice?.log ?? latestAttempt.log,
      input.log,
    )
    const updatedAttempt: StoredPracticeReviewAttempt = {
      ...latestAttempt,
      rating: input.rating,
      reviewedAt: latestAttempt.reviewedAt,
      elapsedSeconds:
        input.elapsedSeconds === undefined
          ? latestAttempt.elapsedSeconds
          : normalizeElapsedSeconds(input.elapsedSeconds),
      isCorrect:
        input.isCorrect === undefined
          ? latestAttempt.isCorrect
          : input.isCorrect,
      log: updatedLogSnapshot,
      updatedAt: changedAt,
    }
    const updatedAttempts = [...attempts.slice(0, -1), updatedAttempt]
    const replayedReview = replayReviewHistorySequence(updatedAttempts, {
      targetRetention: input.targetRetention,
    }).at(-1)
    if (!replayedReview) {
      throw new Error('No review result exists to override.')
    }

    const replayedCard = replayedReview.card
    const status = statusFromReview(input.rating, replayedCard)

    await this.upsertCard(writeDb, {
      id: cardId,
      problemSlug: input.problemSlug,
      cardKind,
      card: replayedCard,
      now: changedAt,
    })

    await writeDb
      .update(reviewAttempts)
      .set({
        rating: updatedAttempt.rating,
        reviewedAt: updatedAttempt.reviewedAt.getTime(),
        elapsedSeconds: updatedAttempt.elapsedSeconds,
        isCorrect: updatedAttempt.isCorrect,
        ...toReviewLogRow(updatedAttempt.log),
        fsrsReviewLog: serializeFsrsReviewLogSnapshot(replayedReview.log),
        updatedAt: updatedAttempt.updatedAt.getTime(),
      })
      .where(eq(reviewAttempts.id, updatedAttempt.id))

    const practice = await this.upsertPracticeAggregate(writeDb, {
      problemSlug: input.problemSlug,
      status,
      attempts: updatedAttempts,
      log: updatedAttempt.log,
      isSuspended: previousPractice?.isSuspended ?? false,
      now: changedAt,
    })
    const summary = derivePracticeSummary({
      practice,
      card: replayedCard,
      now: changedAt,
    })

    return {
      problemSlug: input.problemSlug,
      cardId,
      reviewAttemptId: updatedAttempt.id,
      rating: input.rating,
      status,
      dueAt: replayedCard.dueAt,
      reviewedAt: updatedAttempt.reviewedAt,
      card: replayedCard,
      summary,
    }
  }

  async setPracticeSuspended(
    input: SetPracticeSuspendedInput,
  ): Promise<PracticeDetails> {
    const now = new Date()
    const existing = await this.getPracticeState(input.problemSlug)

    if (!existing && !input.suspended) {
      return this.getPracticeDetails(input.problemSlug, { now })
    }

    if (!existing) {
      await this.upsertEmptyPracticeState(this.db, {
        problemSlug: input.problemSlug,
        status: 'new',
        log: normalizeReviewLogFields(),
        isSuspended: true,
        now,
      })

      return this.getPracticeDetails(input.problemSlug, { now })
    }

    await this.updateSuspensionFlag(this.db, {
      problemSlug: input.problemSlug,
      status: existing.status === 'suspended' ? 'new' : existing.status,
      isSuspended: input.suspended,
      now,
    })

    return this.getPracticeDetails(input.problemSlug, { now })
  }

  async resetPracticeSchedule(
    input: ResetPracticeScheduleInput,
  ): Promise<PracticeDetails> {
    return this.db.transaction((transactionDb) =>
      this.resetPracticeScheduleInTransaction(
        input,
        transactionDb as unknown as Db,
      ),
    )
  }

  async resetPracticeScheduleInTransaction(
    input: ResetPracticeScheduleInput,
    writeDb: Db,
  ): Promise<PracticeDetails> {
    const now = new Date()
    const existing = await this.getPracticeState(input.problemSlug, writeDb)
    const preservedLog =
      input.keepLog === false ? normalizeReviewLogFields() : existing?.log
    const isSuspended =
      existing?.isSuspended === true || existing?.status === 'suspended'

    await writeDb
      .delete(reviewAttempts)
      .where(eq(reviewAttempts.problemSlug, input.problemSlug))
    await writeDb
      .delete(fsrsCards)
      .where(eq(fsrsCards.problemSlug, input.problemSlug))
    await this.upsertEmptyPracticeState(writeDb, {
      problemSlug: input.problemSlug,
      status: 'new',
      log: preservedLog ?? normalizeReviewLogFields(),
      isSuspended,
      now,
    })

    return this.getPracticeDetails(input.problemSlug, { now }, writeDb)
  }

  async getPracticeDetails(
    problemSlug: string,
    options: PracticeReadOptions = {},
    db: PracticeReadDb = this.db,
  ): Promise<PracticeDetails> {
    const cardKind = options.cardKind ?? defaultFsrsCardKind
    const cardId = createFsrsCardId(problemSlug, cardKind)
    const [practice, card, attempts] = await Promise.all([
      this.getPracticeState(problemSlug, db),
      this.getCard(problemSlug, cardKind, db),
      this.readReviewAttempts(db, { problemSlug, cardId }),
    ])
    const attemptSnapshots = attempts.map(toReviewAttemptSnapshot)
    const normalized = deriveNormalizedPracticeState({
      problemSlug,
      cardId,
      practice,
      card,
      attempts: attemptSnapshots,
      ...(options.now !== undefined && { now: options.now }),
    })

    return {
      ...normalized,
      practice,
      card,
      currentLog: practice?.log ?? normalizeReviewLogFields(),
      canOverrideLatestReview: normalized.latestAttempt !== null,
    }
  }

  async getNormalizedPracticeState(
    problemSlug: string,
    options: PracticeReadOptions = {},
  ): Promise<NormalizedPracticeState> {
    return this.getPracticeDetails(problemSlug, options)
  }

  async getPracticeProgressSummary(
    input: PracticeProgressSummaryInput,
  ): Promise<PracticeProgressSummary> {
    const rows = await this.db
      .select({
        problemSlug: reviewAttempts.problemSlug,
        reviewedAt: reviewAttempts.reviewedAt,
      })
      .from(reviewAttempts)
      .orderBy(desc(reviewAttempts.reviewedAt))

    return buildPracticeProgressSummary(
      rows.map((row) => ({
        problemSlug: row.problemSlug,
        reviewedAt: new Date(row.reviewedAt),
      })),
      input,
    )
  }

  async getCard(
    problemSlug: string,
    cardKind: FsrsCardKind = defaultFsrsCardKind,
    db: PracticeReadDb = this.db,
  ): Promise<FsrsCardSnapshot | null> {
    const rows = await db
      .select()
      .from(fsrsCards)
      .where(
        and(
          eq(fsrsCards.problemSlug, problemSlug),
          eq(fsrsCards.cardKind, cardKind),
        ),
      )
      .limit(1)

    return rows[0] ? mapFsrsCardRow(rows[0]) : null
  }

  async getPracticeState(
    problemSlug: string,
    db: PracticeReadDb = this.db,
  ): Promise<PracticeStateSnapshot | null> {
    const rows = await db
      .select()
      .from(problemPractice)
      .where(eq(problemPractice.problemSlug, problemSlug))
      .limit(1)

    return rows[0] ? mapProblemPracticeRow(rows[0]) : null
  }

  private async readReviewAttempts(
    db: PracticeReadDb,
    input: {
      problemSlug: string
      cardId: string
    },
  ): Promise<StoredPracticeReviewAttempt[]> {
    const rows = await db
      .select()
      .from(reviewAttempts)
      .where(
        and(
          eq(reviewAttempts.problemSlug, input.problemSlug),
          eq(reviewAttempts.cardId, input.cardId),
        ),
      )
      .orderBy(asc(reviewAttempts.createdAt), asc(reviewAttempts.id))

    return rows.map(mapReviewAttempt)
  }

  private async upsertPracticeAggregate(
    db: PracticeWriteDb,
    input: {
      problemSlug: string
      status: PracticeStateSnapshot['status']
      attempts: StoredPracticeReviewAttempt[]
      log?: Required<PracticeLogFields> | undefined
      isSuspended?: boolean | undefined
      now: Date
    },
  ): Promise<PracticeStateSnapshot> {
    const aggregate = summarizeAttempts(input.attempts)
    const log = input.log ?? aggregate.lastAttempt.log
    const firstReviewedAt = aggregate.firstAttempt.reviewedAt.getTime()
    const lastReviewedAt = aggregate.lastAttempt.reviewedAt.getTime()
    const updatedAt = input.now.getTime()

    await db
      .insert(problemPractice)
      .values({
        problemSlug: input.problemSlug,
        status: input.status,
        firstSeenAt: firstReviewedAt,
        lastSeenAt: lastReviewedAt,
        lastReviewedAt,
        solvedCount: aggregate.solvedCount,
        attemptCount: aggregate.attemptCount,
        isSuspended: input.isSuspended ?? false,
        lastRating: aggregate.lastAttempt.rating,
        lastElapsedSeconds: aggregate.lastAttempt.elapsedSeconds,
        bestElapsedSeconds: aggregate.bestElapsedSeconds,
        ...toPracticeLogRow(log),
        createdAt: firstReviewedAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: problemPractice.problemSlug,
        set: {
          status: input.status,
          lastSeenAt: lastReviewedAt,
          lastReviewedAt,
          solvedCount: aggregate.solvedCount,
          attemptCount: aggregate.attemptCount,
          isSuspended: input.isSuspended ?? false,
          lastRating: aggregate.lastAttempt.rating,
          lastElapsedSeconds: aggregate.lastAttempt.elapsedSeconds,
          bestElapsedSeconds: aggregate.bestElapsedSeconds,
          ...toPracticeLogRow(log),
          updatedAt,
        },
      })

    const practice = await this.getPracticeState(input.problemSlug, db)

    if (!practice) {
      throw new Error(
        `Failed to read practice state for "${input.problemSlug}".`,
      )
    }

    return practice
  }

  private async updateSuspensionFlag(
    db: PracticeWriteDb,
    input: {
      problemSlug: string
      status: PracticeStateSnapshot['status']
      isSuspended: boolean
      now: Date
    },
  ) {
    await db
      .update(problemPractice)
      .set({
        status: input.status,
        isSuspended: input.isSuspended,
        updatedAt: input.now.getTime(),
      })
      .where(eq(problemPractice.problemSlug, input.problemSlug))
  }

  private async upsertEmptyPracticeState(
    db: PracticeWriteDb,
    input: {
      problemSlug: string
      status: PracticeStateSnapshot['status']
      log: Required<PracticeLogFields>
      isSuspended: boolean
      now: Date
    },
  ): Promise<PracticeStateSnapshot> {
    const timestamp = input.now.getTime()

    await db
      .insert(problemPractice)
      .values({
        problemSlug: input.problemSlug,
        status: input.status,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        lastReviewedAt: null,
        solvedCount: 0,
        attemptCount: 0,
        isSuspended: input.isSuspended,
        lastRating: null,
        lastElapsedSeconds: null,
        bestElapsedSeconds: null,
        ...toPracticeLogRow(input.log),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: problemPractice.problemSlug,
        set: {
          status: input.status,
          lastSeenAt: timestamp,
          lastReviewedAt: null,
          solvedCount: 0,
          attemptCount: 0,
          isSuspended: input.isSuspended,
          lastRating: null,
          lastElapsedSeconds: null,
          bestElapsedSeconds: null,
          ...toPracticeLogRow(input.log),
          updatedAt: timestamp,
        },
      })

    const practice = await this.getPracticeState(input.problemSlug, db)

    if (!practice) {
      throw new Error(
        `Failed to read practice state for "${input.problemSlug}".`,
      )
    }

    return practice
  }

  private async upsertCard(
    db: PracticeWriteDb,
    input: {
      id: string
      problemSlug: string
      cardKind: FsrsCardKind
      card: FsrsCardSnapshot
      now: Date
    },
  ) {
    const row = toFsrsCardRow(input)

    await db
      .insert(fsrsCards)
      .values(row)
      .onConflictDoUpdate({
        target: fsrsCards.id,
        set: {
          dueAt: row.dueAt,
          stability: row.stability,
          difficulty: row.difficulty,
          elapsedDays: row.elapsedDays,
          scheduledDays: row.scheduledDays,
          learningSteps: row.learningSteps,
          reps: row.reps,
          lapses: row.lapses,
          state: row.state,
          lastReviewAt: row.lastReviewAt,
          updatedAt: row.updatedAt,
        },
      })
  }
}

type PracticeReadDb = Pick<Db, 'select'>
type PracticeWriteDb = Pick<Db, 'delete' | 'insert' | 'select' | 'update'>

interface StoredPracticeReviewAttempt extends PracticeReviewAttemptSnapshot {
  fsrsReviewLog: FsrsReviewLogSnapshot | null
}

export function createFsrsCardId(problemSlug: string, cardKind: FsrsCardKind) {
  return `${problemSlug}:${cardKind}`
}

export function mapFsrsCardRow(row: FsrsCardRow): FsrsCardSnapshot {
  return {
    dueAt: new Date(row.dueAt),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsedDays,
    scheduledDays: row.scheduledDays,
    learningSteps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: parseFsrsCardState(row.state),
    lastReviewAt: row.lastReviewAt === null ? null : new Date(row.lastReviewAt),
  }
}

export function mapProblemPracticeRow(
  row: ProblemPracticeRow,
): PracticeStateSnapshot {
  return {
    status: parsePracticeStatus(row.status),
    lastReviewedAt:
      row.lastReviewedAt === null ? null : new Date(row.lastReviewedAt),
    attemptCount: row.attemptCount,
    solvedCount: row.solvedCount,
    isSuspended: row.isSuspended,
    lastRating:
      row.lastRating === null ? null : parseReviewRating(row.lastRating),
    lastElapsedSeconds: row.lastElapsedSeconds,
    bestElapsedSeconds: row.bestElapsedSeconds,
    log: normalizeReviewLogFields({
      interviewPattern: row.interviewPattern,
      timeComplexity: row.timeComplexity,
      spaceComplexity: row.spaceComplexity,
      languages: row.languages,
      notes: row.notes,
    }),
  }
}

function mapReviewAttempt(row: ReviewAttemptRow): StoredPracticeReviewAttempt {
  return {
    id: row.id,
    problemSlug: row.problemSlug,
    cardId: row.cardId,
    rating: parseReviewRating(row.rating),
    reviewMode: parseReviewMode(row.reviewMode),
    reviewedAt: new Date(row.reviewedAt),
    elapsedSeconds: row.elapsedSeconds,
    isCorrect: row.isCorrect,
    log: normalizeReviewLogFields({
      interviewPattern: row.interviewPattern,
      timeComplexity: row.timeComplexity,
      spaceComplexity: row.spaceComplexity,
      languages: row.languages,
      notes: row.notes,
    }),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    fsrsReviewLog: parseStoredFsrsReviewLogSnapshot(row.fsrsReviewLog),
  }
}

function toFsrsCardRow(input: {
  id: string
  problemSlug: string
  cardKind: FsrsCardKind
  card: FsrsCardSnapshot
  now: Date
}) {
  const timestamp = input.now.getTime()

  return {
    id: input.id,
    problemSlug: input.problemSlug,
    cardKind: input.cardKind,
    dueAt: input.card.dueAt.getTime(),
    stability: input.card.stability,
    difficulty: input.card.difficulty,
    elapsedDays: input.card.elapsedDays,
    scheduledDays: input.card.scheduledDays,
    learningSteps: input.card.learningSteps,
    reps: input.card.reps,
    lapses: input.card.lapses,
    state: input.card.state,
    lastReviewAt: input.card.lastReviewAt?.getTime() ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function summarizeAttempts(attempts: StoredPracticeReviewAttempt[]) {
  const [firstAttempt] = attempts
  const lastAttempt = attempts.at(-1)

  if (!firstAttempt || !lastAttempt) {
    throw new Error('Cannot summarize an empty review attempt history.')
  }

  const elapsedValues = attempts
    .map((attempt) => attempt.elapsedSeconds)
    .filter((value): value is number => value !== null && value > 0)

  return {
    firstAttempt,
    lastAttempt,
    attemptCount: attempts.length,
    solvedCount: attempts.filter((attempt) => attempt.isCorrect === true)
      .length,
    bestElapsedSeconds:
      elapsedValues.length > 0 ? Math.min(...elapsedValues) : null,
  }
}

function normalizeElapsedSeconds(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return Math.round(value)
}

function toPracticeLogRow(log: Required<PracticeLogFields>) {
  return {
    interviewPattern: log.interviewPattern,
    timeComplexity: log.timeComplexity,
    spaceComplexity: log.spaceComplexity,
    languages: log.languages,
    notes: log.notes,
  }
}

function toReviewLogRow(log: Required<PracticeLogFields>) {
  return toPracticeLogRow(log)
}

function toReviewAttemptSnapshot(
  attempt: StoredPracticeReviewAttempt,
): PracticeReviewAttemptSnapshot {
  return {
    id: attempt.id,
    problemSlug: attempt.problemSlug,
    cardId: attempt.cardId,
    rating: attempt.rating,
    reviewMode: attempt.reviewMode,
    reviewedAt: attempt.reviewedAt,
    elapsedSeconds: attempt.elapsedSeconds,
    isCorrect: attempt.isCorrect,
    log: attempt.log,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  }
}

function createPracticeLogSnapshot(
  currentLog: Required<PracticeLogFields> | null | undefined,
  inputLog: PracticeLogFields | undefined,
): Required<PracticeLogFields> {
  if (inputLog === undefined) {
    return normalizeReviewLogFields(currentLog)
  }

  return {
    interviewPattern: normalizeReviewLogFieldPatch(
      currentLog?.interviewPattern,
      inputLog.interviewPattern,
    ),
    timeComplexity: normalizeReviewLogFieldPatch(
      currentLog?.timeComplexity,
      inputLog.timeComplexity,
    ),
    spaceComplexity: normalizeReviewLogFieldPatch(
      currentLog?.spaceComplexity,
      inputLog.spaceComplexity,
    ),
    languages: normalizeReviewLogFieldPatch(
      currentLog?.languages,
      inputLog.languages,
    ),
    notes: normalizeReviewLogFieldPatch(currentLog?.notes, inputLog.notes),
  }
}

function normalizeReviewLogFieldPatch(
  currentValue: string | null | undefined,
  nextValue: string | null | undefined,
) {
  return nextValue === undefined
    ? normalizePracticeLogValue(currentValue)
    : normalizePracticeLogValue(nextValue)
}

function normalizePracticeLogValue(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseStoredFsrsReviewLogSnapshot(
  value: string | null,
): FsrsReviewLogSnapshot | null {
  if (!value) {
    return null
  }

  try {
    return parseSerializedFsrsReviewLogSnapshot(value)
  } catch {
    return null
  }
}

function parseReviewMode(value: string): ReviewMode {
  if (reviewModes.includes(value as ReviewMode)) {
    return value as ReviewMode
  }

  throw new Error(`Invalid review mode "${value}".`)
}

function createReviewAttemptId(problemSlug: string, timestamp: number) {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `${problemSlug}:${timestamp}`
}
