import { relations } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { trackGroups } from './track-groups'
import { trackSession } from './track-session'

export const tracks = sqliteTable('tracks', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  dueAt: integer('due_at'),
  allowExternalProgress: integer('allow_external_progress', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const tracksRelations = relations(tracks, ({ many }) => ({
  groups: many(trackGroups),
  sessions: many(trackSession),
}))

export type TrackRow = typeof tracks.$inferSelect
