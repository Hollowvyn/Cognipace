import { z } from 'zod'

export const contentFormat = 'cognipace-content' as const
export const contentVersion = 1 as const
export const maxImportBytes = 5 * 1024 * 1024
export const maxImportArrayEntries = 50_000

export const importSlugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const importUrlSchema = z
  .string()
  .regex(
    /^https:\/\/(?:www\.)?leetcode\.com(?::443)?\/problems\/(?=[a-z0-9-]{1,200}(?:[/?#]|$))[a-z0-9]+(?:-[a-z0-9]+)*(?:[/?#].*)?$/,
  )

export const problemReferenceSchema = z.union([
  importSlugSchema,
  importUrlSchema,
])

const labels = z.array(z.string().min(1).nullable()).nullish()

const fields = {
  slug: importSlugSchema.nullish(),
  url: importUrlSchema.nullish(),
  title: z.string().nullish(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'unknown']).nullish(),
  isPremium: z.boolean().nullish(),
  topics: labels,
  companies: labels,
}

export const problemObjectSchema = z.union([
  z.strictObject({ ...fields, slug: importSlugSchema }),
  z.strictObject({ ...fields, url: importUrlSchema }),
])

export const groupObjectSchema = z.strictObject({
  slug: importSlugSchema,
  title: z.string().nullish(),
  problems: z.array(problemReferenceSchema).nullish(),
})

export const trackObjectSchema = z.strictObject({
  slug: importSlugSchema,
  title: z.string().nullish(),
  description: z.string().nullish(),
  groups: z.array(groupObjectSchema).min(1),
})

export const contentFileSchema = z.strictObject({
  $schema: z.string().optional(),
  format: z.literal(contentFormat),
  version: z.literal(contentVersion),
  problems: z
    .array(z.union([problemReferenceSchema, problemObjectSchema]))
    .nullish(),
  tracks: z.array(trackObjectSchema).nullish(),
  companies: labels,
  topics: labels,
})
