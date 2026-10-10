import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

import { fsrsCards } from './fsrs-cards'
import { problems } from './problems'
import { reviewAttempts } from './review-attempts'

export const practiceCommandReceipts = sqliteTable(
  'practice_command_receipts',
  {
    generationKey: text('generation_key').notNull(),
    commandId: text('command_id').notNull(),
    payloadFingerprint: text('payload_fingerprint').notNull(),
    operation: text('operation').notNull(),
    problemSlug: text('problem_slug')
      .notNull()
      .references(() => problems.slug, { onDelete: 'cascade' }),
    cardId: text('card_id')
      .notNull()
      .references(() => fsrsCards.id, { onDelete: 'cascade' }),
    reviewAttemptId: text('review_attempt_id')
      .notNull()
      .references(() => reviewAttempts.id, { onDelete: 'cascade' }),
    applicationSequence: integer('application_sequence').notNull(),
    revision: integer('revision').notNull(),
    acceptedAt: integer('accepted_at').notNull(),
    commandSummaryJson: text('command_summary_json').notNull(),
    resultJson: text('result_json').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.generationKey, table.commandId] }),
    index('practice_command_receipts_problem_idx').on(table.problemSlug),
  ],
)

export type PracticeCommandReceiptRow =
  typeof practiceCommandReceipts.$inferSelect
export type InsertPracticeCommandReceiptRow =
  typeof practiceCommandReceipts.$inferInsert
