import { asc, eq } from 'drizzle-orm'

import { parseFsrsCardState, parseReviewRating } from '@/lib/fsrs'
import type { Db } from '@/platform/db'
import {
  fsrsCards,
  fsrsSchedulerProfiles,
  practiceCommandReceipts,
  practiceGenerations,
  practiceReviewEvidence,
  problemPractice,
  problems,
  reviewAttempts,
} from '@/platform/db/schema'

import {
  normalizeLegacyPracticeStorage,
  practiceStorageDataSchema,
  validatePracticeStorageData,
  type PracticeStorageData,
  type PracticeStorageReferences,
} from '../domain/practice-storage'

type PracticeStorageDb = Pick<Db, 'delete' | 'insert' | 'select' | 'update'>

export async function readPracticeStorageData(
  db: Pick<Db, 'select'>,
): Promise<PracticeStorageData> {
  const [schedulerProfiles, reviewEvidence, generations, commandReceipts] =
    await Promise.all([
      db
        .select()
        .from(fsrsSchedulerProfiles)
        .orderBy(asc(fsrsSchedulerProfiles.id)),
      db
        .select()
        .from(practiceReviewEvidence)
        .orderBy(
          asc(practiceReviewEvidence.cardId),
          asc(practiceReviewEvidence.applicationSequence),
        ),
      db
        .select()
        .from(practiceGenerations)
        .orderBy(asc(practiceGenerations.scopeId)),
      db
        .select()
        .from(practiceCommandReceipts)
        .orderBy(
          asc(practiceCommandReceipts.generationKey),
          asc(practiceCommandReceipts.commandId),
        ),
    ])
  return practiceStorageDataSchema.parse({
    schedulerProfiles: schedulerProfiles.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
    reviewEvidence,
    generations: generations.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
    commandReceipts: commandReceipts.map((row) => ({
      ...row,
      acceptedAt: new Date(row.acceptedAt).toISOString(),
    })),
  })
}

export async function preparePracticeStorage(
  db: Db,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const writeDb = tx as unknown as Db
    const references = await readPracticeStorageReferences(writeDb)
    const existing = await readPracticeStorageData(writeDb)
    const evidenceIds = new Set(
      existing.reviewEvidence.map((row) => row.reviewAttemptId),
    )
    const byCard = new Map<
      string,
      PracticeStorageReferences['attempts'][number][]
    >()
    for (const attempt of references.attempts) {
      const group = byCard.get(attempt.cardId) ?? []
      group.push(attempt)
      byCard.set(attempt.cardId, group)
    }
    const inferredAttempts: PracticeStorageReferences['attempts'][number][] = []
    for (const attempts of byCard.values()) {
      const covered = attempts.filter((attempt) =>
        evidenceIds.has(attempt.id),
      ).length
      if (covered > 0 && covered !== attempts.length)
        throw new Error('Practice storage has partially covered card history.')
      if (covered === 0) inferredAttempts.push(...attempts)
    }
    const inferred = normalizeLegacyPracticeStorage(inferredAttempts)
    if (inferred.reviewEvidence.length > 0)
      await writeDb
        .insert(practiceReviewEvidence)
        .values(inferred.reviewEvidence)
    await ensurePracticeGenerationsInTransaction(
      writeDb,
      applicableProblemSlugs(references),
      now,
    )
    await validatePracticeStorage(writeDb)
  })
}

/** Matching-current opens call this without preparation or any token writes. */
export async function validatePracticeStorage(
  db: Pick<Db, 'select'>,
): Promise<void> {
  const [storage, references] = await Promise.all([
    readPracticeStorageData(db),
    readPracticeStorageReferences(db),
  ])
  validatePracticeStorageData(storage, references, {
    requireActiveGenerations: true,
  })
}

/** Backup owns base inserts and the outer transaction. Active tokens are always fresh. */
export async function replacePracticeStorageDataInTransaction(
  tx: PracticeStorageDb,
  input: PracticeStorageData,
  now = new Date(),
): Promise<void> {
  const references = await readPracticeStorageReferences(tx)
  const storage = validatePracticeStorageData(input, references)
  await clearPracticeStorageDataInTransaction(tx)
  if (storage.schedulerProfiles.length > 0)
    await tx.insert(fsrsSchedulerProfiles).values(
      storage.schedulerProfiles.map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt).getTime(),
      })),
    )
  if (storage.reviewEvidence.length > 0)
    await tx.insert(practiceReviewEvidence).values(storage.reviewEvidence)
  if (storage.commandReceipts.length > 0)
    await tx.insert(practiceCommandReceipts).values(
      storage.commandReceipts.map((row) => ({
        ...row,
        acceptedAt: new Date(row.acceptedAt).getTime(),
      })),
    )
  await ensurePracticeGenerationsInTransaction(
    tx,
    applicableProblemSlugs(references),
    now,
  )
  await validatePracticeStorage(tx)
}

export async function clearPracticeStorageDataInTransaction(
  tx: PracticeStorageDb,
): Promise<void> {
  await tx.delete(practiceCommandReceipts)
  await tx.delete(practiceReviewEvidence)
  await tx.delete(fsrsSchedulerProfiles)
  await tx.delete(practiceGenerations)
}

export async function rotateProblemPracticeGenerationInTransaction(
  tx: PracticeStorageDb,
  problemSlug: string,
  now = new Date(),
): Promise<void> {
  await ensurePracticeGenerationsInTransaction(tx, [], now)
  const row = {
    scopeId: `problem:${problemSlug}`,
    problemSlug,
    generationToken: crypto.randomUUID(),
    createdAt: now.getTime(),
  }
  await tx
    .insert(practiceGenerations)
    .values(row)
    .onConflictDoUpdate({
      target: practiceGenerations.scopeId,
      set: { generationToken: row.generationToken, createdAt: row.createdAt },
    })
}

/** Used only by existing Practice transactions, never a lazy global preparation. */
export async function ensurePracticeGenerationsInTransaction(
  tx: PracticeStorageDb,
  problemSlugs: readonly string[],
  now = new Date(),
): Promise<void> {
  const scopes = [
    { scopeId: 'local', problemSlug: null },
    ...Array.from(new Set(problemSlugs), (problemSlug) => ({
      scopeId: `problem:${problemSlug}`,
      problemSlug,
    })),
  ]
  for (const scope of scopes) {
    const [existing] = await tx
      .select({ scopeId: practiceGenerations.scopeId })
      .from(practiceGenerations)
      .where(eq(practiceGenerations.scopeId, scope.scopeId))
      .limit(1)
    if (!existing)
      await tx.insert(practiceGenerations).values({
        ...scope,
        generationToken: crypto.randomUUID(),
        createdAt: now.getTime(),
      })
  }
}

async function readPracticeStorageReferences(
  db: Pick<Db, 'select'>,
): Promise<PracticeStorageReferences> {
  const [problemRows, practiceRows, cards, attempts] = await Promise.all([
    db.select({ slug: problems.slug }).from(problems),
    db
      .select({ problemSlug: problemPractice.problemSlug })
      .from(problemPractice),
    db.select().from(fsrsCards),
    db.select().from(reviewAttempts),
  ])
  return {
    problemSlugs: problemRows.map((row) => row.slug),
    practiceProblemSlugs: practiceRows.map((row) => row.problemSlug),
    cards: cards.map((row) => ({
      id: row.id,
      problemSlug: row.problemSlug,
      card: {
        dueAt: new Date(row.dueAt),
        stability: row.stability,
        difficulty: row.difficulty,
        elapsedDays: row.elapsedDays,
        scheduledDays: row.scheduledDays,
        learningSteps: row.learningSteps,
        reps: row.reps,
        lapses: row.lapses,
        state: parseFsrsCardState(row.state),
        lastReviewAt:
          row.lastReviewAt === null ? null : new Date(row.lastReviewAt),
      },
    })),
    attempts: attempts.map((row) => ({
      id: row.id,
      cardId: row.cardId,
      problemSlug: row.problemSlug,
      rating: parseReviewRating(row.rating),
      reviewedAt: new Date(row.reviewedAt).toISOString(),
      fsrsReviewLog: row.fsrsReviewLog,
    })),
  }
}

function applicableProblemSlugs(
  references: PracticeStorageReferences,
): string[] {
  return [
    ...new Set([
      ...references.practiceProblemSlugs,
      ...references.cards.map((row) => row.problemSlug),
      ...references.attempts.map((row) => row.problemSlug),
    ]),
  ]
}
