import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

import { problems } from './problems'

export const practiceGenerations = sqliteTable(
  'practice_generations',
  {
    scopeId: text('scope_id').primaryKey(),
    problemSlug: text('problem_slug').references(() => problems.slug, {
      onDelete: 'cascade',
    }),
    generationToken: text('generation_token').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    unique('practice_generations_problem_slug_unique').on(table.problemSlug),
  ],
)

export type PracticeGenerationRow = typeof practiceGenerations.$inferSelect
export type InsertPracticeGenerationRow =
  typeof practiceGenerations.$inferInsert
