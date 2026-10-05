import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const fsrsSchedulerProfiles = sqliteTable(
  'fsrs_scheduler_profiles',
  {
    id: text('id').primaryKey(),
    profileJson: text('profile_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    unique('fsrs_scheduler_profiles_json_unique').on(table.profileJson),
  ],
)

export type FsrsSchedulerProfileRow = typeof fsrsSchedulerProfiles.$inferSelect
export type InsertFsrsSchedulerProfileRow =
  typeof fsrsSchedulerProfiles.$inferInsert
