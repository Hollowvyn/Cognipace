import { asc } from 'drizzle-orm'

import type { Db } from '@/platform/db'
import {
  companies,
  problemCompanies,
  problemTopics,
  problems,
  topicAliases,
  topics,
} from '@/platform/db/schema'

import type {
  ProblemImportChanges,
  ProblemImportState,
} from '../domain/problem-import'

const insertBatchSize = 100

export async function readProblemImportState(
  db: Db,
): Promise<ProblemImportState> {
  const [
    problemRows,
    topicRows,
    companyRows,
    aliasRows,
    topicLinkRows,
    companyLinkRows,
  ] = await Promise.all([
    db
      .select({
        slug: problems.slug,
        title: problems.title,
        difficulty: problems.difficulty,
        isPremium: problems.isPremium,
      })
      .from(problems)
      .orderBy(asc(problems.slug)),
    db
      .select({ id: topics.id, label: topics.label })
      .from(topics)
      .orderBy(asc(topics.id)),
    db
      .select({ id: companies.id, label: companies.label })
      .from(companies)
      .orderBy(asc(companies.id)),
    db
      .select({
        aliasKey: topicAliases.aliasKey,
        label: topicAliases.label,
        topicId: topicAliases.topicId,
      })
      .from(topicAliases)
      .orderBy(asc(topicAliases.aliasKey)),
    db
      .select({
        problemSlug: problemTopics.problemSlug,
        topicId: problemTopics.topicId,
      })
      .from(problemTopics)
      .orderBy(asc(problemTopics.problemSlug), asc(problemTopics.topicId)),
    db
      .select({
        problemSlug: problemCompanies.problemSlug,
        companyId: problemCompanies.companyId,
      })
      .from(problemCompanies)
      .orderBy(
        asc(problemCompanies.problemSlug),
        asc(problemCompanies.companyId),
      ),
  ])

  return {
    problems: problemRows,
    topics: topicRows,
    companies: companyRows,
    aliases: aliasRows,
    problemTopics: topicLinkRows,
    problemCompanies: companyLinkRows,
  }
}

export async function insertProblemImportChanges(
  db: Db,
  changes: ProblemImportChanges,
  now: Date,
): Promise<void> {
  const timestamp = now.getTime()

  for (const batch of batches(changes.topics)) {
    await db.insert(topics).values(
      batch.map((row) => ({
        ...row,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    )
  }

  for (const batch of batches(changes.companies)) {
    await db.insert(companies).values(batch)
  }

  for (const batch of batches(changes.problems)) {
    await db.insert(problems).values(
      batch.map((row) => ({
        ...row,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    )
  }

  for (const batch of batches(changes.problemTopics)) {
    await db.insert(problemTopics).values(batch)
  }

  for (const batch of batches(changes.problemCompanies)) {
    await db.insert(problemCompanies).values(batch)
  }
}

function batches<T>(rows: readonly T[]): T[][] {
  const result: T[][] = []

  for (let offset = 0; offset < rows.length; offset += insertBatchSize) {
    result.push(rows.slice(offset, offset + insertBatchSize))
  }

  return result
}
