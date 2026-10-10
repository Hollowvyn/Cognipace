import { and, asc, desc, eq, or } from 'drizzle-orm'

import {
  createInitialFsrsCard,
  createFsrsSchedulerProfile,
  correctLegacyReview,
  correctReviewFromEvidence,
  assertFsrsReviewLogMatchesPreCard,
  defaultFsrsCardKind,
  parseSerializedFsrsReviewLogSnapshot,
  parseFsrsCardState,
  parseReviewRating,
  parseSerializedFsrsCardSnapshot,
  parseSerializedFsrsSchedulerProfile,
  scheduleReviewWithProfile,
  serializeFsrsCardSnapshot,
  serializeFsrsSchedulerProfile,
  toSerializableFsrsCardSnapshot,
  serializeFsrsReviewLogSnapshot,
  type FsrsCardKind,
  type FsrsCardSnapshot,
  type FsrsReviewLogSnapshot,
  type FsrsReviewContext,
} from '@/lib/fsrs'
import type { Db } from '@/platform/db'
import {
  fsrsCards,
  problemPractice,
  reviewAttempts,
  practiceReviewEvidence,
  practiceCommandReceipts,
  practiceGenerations,
  fsrsSchedulerProfiles,
  type FsrsCardRow,
  type ProblemPracticeRow,
  type ReviewAttemptRow,
  type PracticeReviewEvidenceRow,
} from '@/platform/db/schema'

import {
  buildPracticeProgressSummary,
  derivePracticeSummary,
  deriveNormalizedPracticeState,
  normalizeReviewLogFields,
  parsePracticeStatus,
  reviewModes,
  ReviewCommandConflictError,
  practiceAssessmentEvidenceSchema,
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

import {
  ensurePracticeGenerationsInTransaction,
  rotateProblemPracticeGenerationInTransaction,
} from './practice-storage-repository'

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
    const currentCardRecord = await this.getCardRecord(
      input.problemSlug,
      cardKind,
      writeDb,
    )
    const cardId =
      currentCardRecord?.id ??
      (await this.createAvailableCardId(input.problemSlug, cardKind, writeDb))
    const timestamp = reviewedAt.getTime()
    const createdAt = new Date()
    const createdAtTimestamp = createdAt.getTime()
    const reviewAttemptId =
      input.reviewAttemptId ??
      createReviewAttemptId(input.problemSlug, timestamp)

    const currentCard =
      currentCardRecord?.card ?? createInitialFsrsCard(reviewedAt)
    const evidenceRows = await writeDb
      .select()
      .from(practiceReviewEvidence)
      .where(eq(practiceReviewEvidence.cardId, cardId))
    const existingAttempts = await this.readReviewAttempts(writeDb, {
      problemSlug: input.problemSlug,
      cardId,
    })
    const evidenceIds = new Set(evidenceRows.map((row) => row.reviewAttemptId))
    if (existingAttempts.some((attempt) => !evidenceIds.has(attempt.id))) {
      throw new Error(
        'Practice history requires storage preparation before Save.',
      )
    }
    const maximumSequence = evidenceRows.reduce(
      (maximum, row) => Math.max(maximum, row.applicationSequence),
      0,
    )
    const applicationSequence = incrementPracticeCounter(
      maximumSequence,
      'application sequence',
    )
    const latestAttempt = existingAttempts.at(-1)
    if (
      (latestAttempt && timestamp < latestAttempt.reviewedAt.getTime()) ||
      (currentCard.lastReviewAt &&
        timestamp < currentCard.lastReviewAt.getTime())
    ) {
      throw new ReviewCommandConflictError(
        'backdated',
        'This review time precedes the last applied review. Refresh before saving; your draft is preserved.',
      )
    }
    const scheduled = scheduleReviewWithProfile(
      currentCard,
      input.rating,
      reviewedAt,
      createFsrsSchedulerProfile({ targetRetention: input.targetRetention }),
    )
    const assessmentEvidenceJson = serializeAssessmentEvidence(
      input.assessmentEvidence,
      input.rating,
    )
    const status = statusFromReview(input.rating, scheduled.card)
    const previousPractice = await this.getPracticeState(
      input.problemSlug,
      writeDb,
    )
    const reviewLogSnapshot = createPracticeLogSnapshot(
      previousPractice?.log,
      input.log,
    )

    await ensurePracticeGenerationsInTransaction(
      writeDb,
      [input.problemSlug],
      createdAt,
    )
    const schedulerProfileId = await this.ensureSchedulerProfile(
      writeDb,
      scheduled.context,
      createdAt,
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

    await writeDb.insert(practiceReviewEvidence).values({
      reviewAttemptId,
      cardId,
      applicationSequence,
      revision: 0,
      sequenceSource: 'applied',
      schedulingEvidenceKind: 'captured',
      schedulerProfileId,
      preCardJson: JSON.stringify(scheduled.context.preCard),
      assessmentEvidenceJson,
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
    const currentCardRecord = await this.getCardRecord(
      input.problemSlug,
      cardKind,
      writeDb,
    )
    const cardId =
      currentCardRecord?.id ?? createFsrsCardId(input.problemSlug, cardKind)

    const attempts = await this.readReviewAttempts(writeDb, {
      problemSlug: input.problemSlug,
      cardId,
    })
    const latestAttempt = attempts.at(-1)

    const evidenceRows = await writeDb
      .select()
      .from(practiceReviewEvidence)
      .where(eq(practiceReviewEvidence.cardId, cardId))
    const evidenceById = new Map(
      evidenceRows.map((row) => [row.reviewAttemptId, row]),
    )
    const targetEvidence = evidenceById.get(input.targetAttemptId)
    if (
      !currentCardRecord ||
      !latestAttempt ||
      latestAttempt.id !== input.targetAttemptId ||
      !targetEvidence ||
      targetEvidence.cardId !== cardId ||
      targetEvidence.applicationSequence !==
        evidenceRows.reduce(
          (max, row) => Math.max(max, row.applicationSequence),
          0,
        ) ||
      targetEvidence.revision !== input.expectedRevision ||
      (input.reviewedAt !== undefined &&
        input.reviewedAt.getTime() !== latestAttempt.reviewedAt.getTime())
    ) {
      throw new ReviewCommandConflictError(
        'stale-review',
        'This review changed. Refresh before updating; your draft is preserved.',
      )
    }
    const revision = incrementPracticeCounter(
      targetEvidence.revision,
      'revision',
    )
    const context = await this.getCorrectionContext(
      writeDb,
      currentCardRecord.card,
      attempts,
      evidenceById,
      input.targetRetention,
    )
    const replacement = correctReviewFromEvidence(context, input.rating)
    const previousPractice = await this.getPracticeState(
      input.problemSlug,
      writeDb,
    )
    const changedAt = new Date()
    const updatedAttempt: StoredPracticeReviewAttempt = {
      ...latestAttempt,
      rating: input.rating,
      elapsedSeconds:
        input.elapsedSeconds === undefined
          ? latestAttempt.elapsedSeconds
          : normalizeElapsedSeconds(input.elapsedSeconds),
      isCorrect:
        input.isCorrect === undefined
          ? latestAttempt.isCorrect
          : input.isCorrect,
      log: createPracticeLogSnapshot(latestAttempt.log, input.log),
      updatedAt: changedAt,
      fsrsReviewLog: replacement.log,
      hasStoredFsrsReviewLog: true,
    }
    const updatedAttempts = [...attempts.slice(0, -1), updatedAttempt]
    const correctedCard = replacement.card
    const status = statusFromReview(input.rating, correctedCard)
    const assessmentEvidenceJson = serializeAssessmentEvidence(
      input.assessmentEvidence,
      input.rating,
    )

    await ensurePracticeGenerationsInTransaction(
      writeDb,
      [input.problemSlug],
      changedAt,
    )
    const schedulerProfileId = await this.ensureSchedulerProfile(
      writeDb,
      context,
      changedAt,
    )
    await this.upsertCard(writeDb, {
      id: cardId,
      problemSlug: input.problemSlug,
      cardKind,
      card: correctedCard,
      now: changedAt,
    })
    await writeDb
      .update(reviewAttempts)
      .set({
        rating: updatedAttempt.rating,
        elapsedSeconds: updatedAttempt.elapsedSeconds,
        isCorrect: updatedAttempt.isCorrect,
        ...toReviewLogRow(updatedAttempt.log),
        fsrsReviewLog: serializeFsrsReviewLogSnapshot(replacement.log),
        updatedAt: updatedAttempt.updatedAt.getTime(),
      })
      .where(
        and(
          eq(reviewAttempts.id, input.targetAttemptId),
          eq(reviewAttempts.problemSlug, input.problemSlug),
          eq(reviewAttempts.cardId, cardId),
        ),
      )
    await writeDb
      .update(practiceReviewEvidence)
      .set({
        revision,
        schedulingEvidenceKind:
          targetEvidence.schedulingEvidenceKind === 'unknown'
            ? 'legacy-derived'
            : targetEvidence.schedulingEvidenceKind,
        schedulerProfileId,
        preCardJson: JSON.stringify(context.preCard),
        assessmentEvidenceJson,
      })
      .where(
        and(
          eq(practiceReviewEvidence.reviewAttemptId, input.targetAttemptId),
          eq(practiceReviewEvidence.revision, input.expectedRevision),
        ),
      )

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
      card: correctedCard,
      now: changedAt,
    })

    return {
      problemSlug: input.problemSlug,
      cardId,
      reviewAttemptId: updatedAttempt.id,
      rating: input.rating,
      status,
      dueAt: correctedCard.dueAt,
      reviewedAt: updatedAttempt.reviewedAt,
      card: correctedCard,
      summary,
    }
  }

  async setPracticeSuspended(
    input: SetPracticeSuspendedInput,
  ): Promise<PracticeDetails> {
    const now = new Date()
    return this.db.transaction(async (tx) => {
      const writeDb = tx as unknown as Db
      const existing = await this.getPracticeState(input.problemSlug, writeDb)
      if (!existing && !input.suspended)
        return this.getPracticeDetails(input.problemSlug, { now }, writeDb)
      await ensurePracticeGenerationsInTransaction(
        writeDb,
        [input.problemSlug],
        now,
      )
      if (!existing) {
        await this.upsertEmptyPracticeState(writeDb, {
          problemSlug: input.problemSlug,
          status: 'new',
          log: normalizeReviewLogFields(),
          isSuspended: true,
          now,
        })
      } else {
        await this.updateSuspensionFlag(writeDb, {
          problemSlug: input.problemSlug,
          status: existing.status === 'suspended' ? 'new' : existing.status,
          isSuspended: input.suspended,
          now,
        })
      }
      return this.getPracticeDetails(input.problemSlug, { now }, writeDb)
    })
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
      .delete(practiceCommandReceipts)
      .where(eq(practiceCommandReceipts.problemSlug, input.problemSlug))
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
    await rotateProblemPracticeGenerationInTransaction(
      writeDb,
      input.problemSlug,
      now,
    )

    return this.getPracticeDetails(input.problemSlug, { now }, writeDb)
  }

  async getPracticeDetails(
    problemSlug: string,
    options: PracticeReadOptions = {},
    db: PracticeReadDb = this.db,
  ): Promise<PracticeDetails> {
    const cardKind = options.cardKind ?? defaultFsrsCardKind
    const cardRecord = await this.getCardRecord(problemSlug, cardKind, db)
    const cardId = cardRecord?.id ?? createFsrsCardId(problemSlug, cardKind)
    const card = cardRecord?.card ?? null
    const [practice, attempts, evidenceRows, generations] = await Promise.all([
      this.getPracticeState(problemSlug, db),
      this.readReviewAttempts(db, { problemSlug, cardId }),
      db
        .select()
        .from(practiceReviewEvidence)
        .where(eq(practiceReviewEvidence.cardId, cardId)),
      db
        .select()
        .from(practiceGenerations)
        .where(
          or(
            eq(practiceGenerations.scopeId, 'local'),
            eq(practiceGenerations.scopeId, `problem:${problemSlug}`),
          ),
        ),
    ])
    const attemptSnapshots = attempts.map(toReviewAttemptSnapshot)
    const evidenceById = new Map(
      evidenceRows.map((row) => [row.reviewAttemptId, row]),
    )
    const latest = attempts.at(-1)
    const latestEvidence = latest ? evidenceById.get(latest.id) : null
    const localGeneration = generations.find((row) => row.scopeId === 'local')
    const problemGeneration = generations.find(
      (row) => row.scopeId === `problem:${problemSlug}`,
    )
    let canOverrideLatestReview = false
    if (card && latestEvidence) {
      try {
        await this.getCorrectionContext(db, card, attempts, evidenceById)
        canOverrideLatestReview = true
      } catch {
        // Reads expose unsafe context as unavailable; writes retain the error.
      }
    }
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
      canOverrideLatestReview,
      generation: localGeneration
        ? {
            localGenerationToken: localGeneration.generationToken,
            problemGenerationToken: problemGeneration?.generationToken ?? null,
          }
        : null,
      latestReview:
        latest && latestEvidence
          ? {
              reviewAttemptId: latest.id,
              applicationSequence: latestEvidence.applicationSequence,
              revision: latestEvidence.revision,
              reviewedAt: latest.reviewedAt,
            }
          : null,
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
        elapsedSeconds: reviewAttempts.elapsedSeconds,
      })
      .from(reviewAttempts)
      .orderBy(desc(reviewAttempts.reviewedAt))

    return buildPracticeProgressSummary(
      rows.map((row) => ({
        problemSlug: row.problemSlug,
        reviewedAt: new Date(row.reviewedAt),
        elapsedSeconds: row.elapsedSeconds,
      })),
      input,
    )
  }

  async getCard(
    problemSlug: string,
    cardKind: FsrsCardKind = defaultFsrsCardKind,
    db: PracticeReadDb = this.db,
  ): Promise<FsrsCardSnapshot | null> {
    return (await this.getCardRecord(problemSlug, cardKind, db))?.card ?? null
  }

  private async getCardRecord(
    problemSlug: string,
    cardKind: FsrsCardKind,
    db: PracticeReadDb,
  ): Promise<{ id: string; card: FsrsCardSnapshot } | null> {
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

    return rows[0] ? { id: rows[0].id, card: mapFsrsCardRow(rows[0]) } : null
  }

  private async createAvailableCardId(
    problemSlug: string,
    cardKind: FsrsCardKind,
    db: PracticeReadDb,
  ): Promise<string> {
    const canonicalId = createFsrsCardId(problemSlug, cardKind)
    const [occupied] = await db
      .select({ id: fsrsCards.id })
      .from(fsrsCards)
      .where(eq(fsrsCards.id, canonicalId))
      .limit(1)
    return occupied ? crypto.randomUUID() : canonicalId
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
      .leftJoin(
        practiceReviewEvidence,
        eq(practiceReviewEvidence.reviewAttemptId, reviewAttempts.id),
      )
      .where(
        and(
          eq(reviewAttempts.problemSlug, input.problemSlug),
          eq(reviewAttempts.cardId, input.cardId),
        ),
      )
      .orderBy(asc(practiceReviewEvidence.applicationSequence))

    return rows.map((row) => mapReviewAttempt(row.review_attempts))
  }

  private async ensureSchedulerProfile(
    db: PracticeWriteDb,
    context: FsrsReviewContext,
    now: Date,
  ): Promise<string> {
    const profileJson = serializeFsrsSchedulerProfile(context.profile)
    const [existing] = await db
      .select()
      .from(fsrsSchedulerProfiles)
      .where(eq(fsrsSchedulerProfiles.profileJson, profileJson))
      .limit(1)
    if (existing) return existing.id
    const id = crypto.randomUUID()
    await db
      .insert(fsrsSchedulerProfiles)
      .values({ id, profileJson, createdAt: now.getTime() })
    return id
  }

  /** Reads and verifies the exact same context used by Update availability. */
  private async getCorrectionContext(
    db: PracticeReadDb,
    card: FsrsCardSnapshot,
    attempts: StoredPracticeReviewAttempt[],
    evidenceById: Map<string, PracticeReviewEvidenceRow>,
    targetRetention?: number,
  ): Promise<FsrsReviewContext> {
    const latest = attempts.at(-1)
    const evidence = latest ? evidenceById.get(latest.id) : null
    if (
      !latest ||
      !evidence ||
      attempts.some((attempt) => !evidenceById.has(attempt.id))
    ) {
      throw new ReviewCommandConflictError(
        'unsupported-legacy',
        'Unsupported or ambiguous legacy FSRS correction evidence.',
      )
    }
    if (
      evidence.cardId !== latest.cardId ||
      evidence.applicationSequence !==
        [...evidenceById.values()].reduce(
          (max, row) => Math.max(max, row.applicationSequence),
          0,
        )
    ) {
      throw new ReviewCommandConflictError(
        'stale-review',
        'This review changed. Refresh before updating; your draft is preserved.',
      )
    }
    if (evidence.schedulingEvidenceKind === 'unknown') {
      if (attempts.some((attempt) => !attempt.hasStoredFsrsReviewLog)) {
        throw new ReviewCommandConflictError(
          'unsupported-legacy',
          'Unsupported or ambiguous legacy FSRS correction evidence.',
        )
      }
      try {
        return correctLegacyReview(
          card,
          attempts.map((attempt) => ({
            reviewedAt: attempt.reviewedAt,
            rating: attempt.rating,
            log: attempt.fsrsReviewLog,
          })),
          latest.rating,
          targetRetention ?? 0.9,
        ).context
      } catch (error) {
        if (
          error instanceof Error &&
          error.message ===
            'Unsupported or ambiguous legacy FSRS correction evidence.'
        ) {
          throw new ReviewCommandConflictError(
            'unsupported-legacy',
            error.message,
          )
        }
        throw error
      }
    }
    const [profileRow] =
      evidence.schedulerProfileId === null
        ? []
        : await db
            .select()
            .from(fsrsSchedulerProfiles)
            .where(eq(fsrsSchedulerProfiles.id, evidence.schedulerProfileId))
            .limit(1)
    if (!profileRow || !evidence.preCardJson || !latest.fsrsReviewLog) {
      throw new Error('Captured Practice correction context is incomplete.')
    }
    const preCard = parseSerializedFsrsCardSnapshot(evidence.preCardJson)
    const profile = parseSerializedFsrsSchedulerProfile(profileRow.profileJson)
    assertFsrsReviewLogMatchesPreCard(latest.fsrsReviewLog, preCard, profile)
    const context: FsrsReviewContext = {
      preCard: toSerializableFsrsCardSnapshot(preCard),
      profile,
      reviewedAt: latest.reviewedAt.toISOString(),
    }
    const original = correctReviewFromEvidence(context, latest.rating)
    if (
      serializeFsrsCardSnapshot(original.card) !==
        serializeFsrsCardSnapshot(card) ||
      serializeFsrsReviewLogSnapshot(original.log) !==
        serializeFsrsReviewLogSnapshot(latest.fsrsReviewLog)
    ) {
      throw new ReviewCommandConflictError(
        'stale-review',
        'This review changed. Refresh before updating; your draft is preserved.',
      )
    }
    return context
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
        target: [fsrsCards.problemSlug, fsrsCards.cardKind],
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

function incrementPracticeCounter(value: number, label: string): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(`Practice ${label} cannot be incremented safely.`)
  }
  return value + 1
}

interface StoredPracticeReviewAttempt extends PracticeReviewAttemptSnapshot {
  fsrsReviewLog: FsrsReviewLogSnapshot | null
  hasStoredFsrsReviewLog: boolean
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
    hasStoredFsrsReviewLog: row.fsrsReviewLog !== null,
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

function serializeAssessmentEvidence(
  value: SaveReviewResultInput['assessmentEvidence'],
  rating: SaveReviewResultInput['rating'],
): string | null {
  if (value === undefined) return null
  const evidence = practiceAssessmentEvidenceSchema.parse(value)
  if (evidence.finalRating !== rating) {
    throw new Error(
      'Practice assessment evidence must match the effective rating.',
    )
  }
  return JSON.stringify(evidence)
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
