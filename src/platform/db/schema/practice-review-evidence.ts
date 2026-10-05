import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

import { fsrsCards } from './fsrs-cards'
import { fsrsSchedulerProfiles } from './fsrs-scheduler-profiles'
import { reviewAttempts } from './review-attempts'

export const practiceReviewEvidence = sqliteTable(
  'practice_review_evidence',
  {
    reviewAttemptId: text('review_attempt_id')
      .primaryKey()
      .references(() => reviewAttempts.id, { onDelete: 'cascade' }),
    cardId: text('card_id')
      .notNull()
      .references(() => fsrsCards.id, { onDelete: 'cascade' }),
    applicationSequence: integer('application_sequence').notNull(),
    revision: integer('revision').notNull().default(0),
    sequenceSource: text('sequence_source').notNull(),
    schedulingEvidenceKind: text('scheduling_evidence_kind').notNull(),
    schedulerProfileId: text('scheduler_profile_id').references(
      () => fsrsSchedulerProfiles.id,
    ),
    preCardJson: text('pre_card_json'),
    assessmentEvidenceJson: text('assessment_evidence_json'),
  },
  (table) => [
    unique('practice_review_evidence_card_sequence_unique').on(
      table.cardId,
      table.applicationSequence,
    ),
  ],
)

export type PracticeReviewEvidenceRow =
  typeof practiceReviewEvidence.$inferSelect
export type InsertPracticeReviewEvidenceRow =
  typeof practiceReviewEvidence.$inferInsert
