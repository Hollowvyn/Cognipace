import { z } from 'zod'

import { backupReplacementResultSchema } from '@/features/backup/api/backup-contracts'

import { normalizedPracticeStateSchema } from '@/features/practice/api/practice-contracts'
import { problemDifficulties } from '../domain'

export const problemDifficultySchema = z.enum(problemDifficulties)

export const problemSlugSchema = z.string().trim().min(1)

export const problemRuntimeSurfaceSchema = z.literal('dashboard')

export const problemsUpsertFromPageSurfaceSchema = z.enum([
  'content-script',
  'dashboard',
])

export const serializedProblemSchema = z.object({
  slug: problemSlugSchema,
  title: z.string(),
  difficulty: problemDifficultySchema,
  isPremium: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type SerializedProblem = z.infer<typeof serializedProblemSchema>

export const problemTopicSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
})

export const problemTopicOptionSchema = problemTopicSummarySchema.extend({
  aliases: z.array(z.string()),
})

export const problemTopicSchema = problemTopicSummarySchema.extend({
  parentTopics: z.array(problemTopicSummarySchema).default(() => []),
})

export type SerializedProblemTopic = z.infer<typeof problemTopicSchema>

export const problemCompanySchema = z.object({
  id: z.string(),
  label: z.string(),
})

export type SerializedProblemCompany = z.infer<typeof problemCompanySchema>

export const problemTrackMembershipSchema = z.object({
  trackId: z.string(),
  trackSlug: z.string(),
  trackTitle: z.string(),
  groupId: z.string(),
  groupTitle: z.string(),
  groupPosition: z.number().int(),
  problemPosition: z.number().int(),
})

export type SerializedProblemTrackMembership = z.infer<
  typeof problemTrackMembershipSchema
>

export const problemLibraryStatusSchema = z.enum([
  'not-started',
  'overdue',
  'due',
  'scheduled',
  'suspended',
])

export type ProblemLibraryStatus = z.infer<typeof problemLibraryStatusSchema>

export const problemLibraryRowSchema = z.object({
  problem: serializedProblemSchema,
  status: problemLibraryStatusSchema,
  state: normalizedPracticeStateSchema,
  nextReviewAt: z.iso.datetime().nullable(),
  lastReviewedAt: z.iso.datetime().nullable(),
  lastSolvedAt: z.iso.datetime().nullable(),
  topics: z.array(problemTopicSchema),
  effectiveTopicIds: z.array(z.string()),
  companies: z.array(problemCompanySchema),
  trackMemberships: z.array(problemTrackMembershipSchema),
})

export type ProblemLibraryRow = z.infer<typeof problemLibraryRowSchema>

export const problemLibrarySummarySchema = z
  .object({
    totalCount: z.number().int().min(0),
    filteredCount: z.number().int().min(0),
    dueCount: z.number().int().min(0),
    suspendedCount: z.number().int().min(0),
  })
  .superRefine((summary, context) => {
    if (summary.filteredCount > summary.totalCount) {
      context.addIssue({
        code: 'custom',
        message: 'filteredCount cannot exceed totalCount',
        path: ['filteredCount'],
      })
    }

    if (summary.dueCount > summary.totalCount) {
      context.addIssue({
        code: 'custom',
        message: 'dueCount cannot exceed totalCount',
        path: ['dueCount'],
      })
    }

    if (summary.suspendedCount > summary.totalCount) {
      context.addIssue({
        code: 'custom',
        message: 'suspendedCount cannot exceed totalCount',
        path: ['suspendedCount'],
      })
    }
  })

export type ProblemLibrarySummary = z.infer<typeof problemLibrarySummarySchema>

export const problemLibraryOptionsSchema = z.object({
  topics: z.array(problemTopicOptionSchema),
  companies: z.array(problemCompanySchema),
})

export type ProblemLibraryOptions = z.infer<typeof problemLibraryOptionsSchema>

export const problemLibraryResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  summary: problemLibrarySummarySchema,
  options: problemLibraryOptionsSchema,
  rows: z.array(problemLibraryRowSchema),
})

export type ProblemLibraryResponse = z.infer<
  typeof problemLibraryResponseSchema
>

export const problemForEditResponseSchema = z.object({
  problem: serializedProblemSchema,
  topics: z.array(problemTopicSchema),
  companies: z.array(problemCompanySchema),
  trackMemberships: z.array(problemTrackMembershipSchema),
  options: problemLibraryOptionsSchema,
})

export type ProblemForEditResponse = z.infer<
  typeof problemForEditResponseSchema
>

export const problemsGetLibraryRequestSchema = z.object({
  surface: problemRuntimeSurfaceSchema,
  at: z.iso.datetime().optional(),
})

export type ProblemsGetLibraryRequest = z.infer<
  typeof problemsGetLibraryRequestSchema
>

export const problemsGetProblemForEditRequestSchema = z.object({
  surface: problemRuntimeSurfaceSchema,
  problemSlug: problemSlugSchema,
})

export type ProblemsGetProblemForEditRequest = z.infer<
  typeof problemsGetProblemForEditRequestSchema
>

const labelListSchema = z.array(z.string().trim().min(1)).default(() => [])

const problemMetadataInputSchema = z.object({
  title: z.string().trim().min(1),
  difficulty: problemDifficultySchema.default('unknown'),
  isPremium: z.boolean().default(false),
  topicLabels: labelListSchema,
  companyLabels: labelListSchema,
})

export const problemsUpsertFromPageRequestSchema = z.object({
  surface: problemsUpsertFromPageSurfaceSchema,
  url: z.string(),
  slug: problemSlugSchema.nullish(),
  title: z.string().nullish(),
  difficulty: z.string().nullish(),
  isPremium: z.boolean().nullish(),
  topicLabels: z.array(z.string().trim().min(1)).optional(),
})

export type ProblemsUpsertFromPageRequest = z.infer<
  typeof problemsUpsertFromPageRequestSchema
>

export const problemsCreateProblemRequestSchema =
  problemMetadataInputSchema.extend({
    surface: problemRuntimeSurfaceSchema,
    slugOrUrl: z.string().trim().min(1),
  })

export type ProblemsCreateProblemRequest = z.infer<
  typeof problemsCreateProblemRequestSchema
>

export const problemsUpdateProblemRequestSchema =
  problemMetadataInputSchema.extend({
    surface: problemRuntimeSurfaceSchema,
    problemSlug: problemSlugSchema,
  })

export type ProblemsUpdateProblemRequest = z.infer<
  typeof problemsUpdateProblemRequestSchema
>

export const problemsDeleteProblemRequestSchema = z
  .object({
    commandId: z.string().trim().min(1).optional(),
    surface: problemRuntimeSurfaceSchema,
    problemSlug: problemSlugSchema,
  })
  .strict()

export type ProblemsDeleteProblemRequest = z.infer<
  typeof problemsDeleteProblemRequestSchema
>

const problemsBulkUpdateSetSchema = z
  .object({
    difficulty: problemDifficultySchema.optional(),
    isPremium: z.boolean().optional(),
    topicLabels: z.array(z.string().trim().min(1)).optional(),
    companyLabels: z.array(z.string().trim().min(1)).optional(),
  })
  .refine((set) => Object.keys(set).length > 0, {
    message: 'At least one bulk update field is required.',
  })

export const problemsBulkUpdateProblemsRequestSchema = z.object({
  surface: problemRuntimeSurfaceSchema,
  problemSlugs: z.array(problemSlugSchema).min(1),
  set: problemsBulkUpdateSetSchema,
})

export type ProblemsBulkUpdateProblemsRequest = z.infer<
  typeof problemsBulkUpdateProblemsRequestSchema
>

export const problemsBulkDeleteRequestSchema = z
  .object({
    commandId: z.string().trim().min(1).optional(),
    surface: problemRuntimeSurfaceSchema,
    problemSlugs: z.array(problemSlugSchema).min(1),
  })
  .strict()

export type ProblemsBulkDeleteRequest = z.infer<
  typeof problemsBulkDeleteRequestSchema
>

export const problemDeleteResponseSchema = z.lazy(
  () => backupReplacementResultSchema,
)

export const problemsResetProblemDataRequestSchema = z.strictObject({
  surface: problemRuntimeSurfaceSchema,
  commandId: z.string().trim().min(1).optional(),
  problemSlugs: z.array(problemSlugSchema).min(1),
})
export type ProblemsResetProblemDataRequest = z.infer<
  typeof problemsResetProblemDataRequestSchema
>

export type ProblemDeleteResponse = z.infer<typeof problemDeleteResponseSchema>

export const problemBulkUpdateResponseSchema = z.void()

export type ProblemBulkUpdateResponse = z.infer<
  typeof problemBulkUpdateResponseSchema
>
