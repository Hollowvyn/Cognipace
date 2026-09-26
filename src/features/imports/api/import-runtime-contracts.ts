import { z } from 'zod'

import { maxImportBytes } from './content-file-contracts'

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/)
const requestFileTextSchema = z
  .string()
  .max(maxImportBytes)
  .refine(
    (fileText) =>
      new TextEncoder().encode(fileText).byteLength <= maxImportBytes,
    'Import file exceeds the maximum UTF-8 size.',
  )

export const importPreviewRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
  fileText: requestFileTextSchema,
})

export const importApplyRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
  fileText: requestFileTextSchema,
  fingerprint: fingerprintSchema,
})

export const importRetryPersistenceRequestSchema = z.strictObject({
  surface: z.literal('dashboard'),
})

const importCountsSchema = z.strictObject({
  problems: z.number().int().nonnegative(),
  topics: z.number().int().nonnegative(),
  companies: z.number().int().nonnegative(),
  problemTopics: z.number().int().nonnegative(),
  problemCompanies: z.number().int().nonnegative(),
  tracks: z.number().int().nonnegative(),
  groups: z.number().int().nonnegative(),
  memberships: z.number().int().nonnegative(),
})

const importDiagnosticSchema = z.strictObject({
  severity: z.enum(['warning', 'error']),
  code: z.string(),
  path: z.string(),
  message: z.string(),
})

const importItemSchema = z.strictObject({
  kind: z.enum([
    'problems',
    'topics',
    'companies',
    'problemTopics',
    'problemCompanies',
    'tracks',
    'groups',
    'memberships',
  ]),
  identity: z.string(),
  label: z.string(),
  action: z.enum(['add', 'retain']),
  path: z.string(),
})

export const importPreviewResponseSchema = z.strictObject({
  status: z.enum(['ready', 'unchanged', 'empty', 'blocked']),
  fingerprint: fingerprintSchema.nullable(),
  additions: importCountsSchema,
  items: z.array(importItemSchema),
  diagnostics: z.array(importDiagnosticSchema),
})

export const importApplyResponseSchema = z.strictObject({
  status: z.enum([
    'saved',
    'persistence-error',
    'stale',
    'unchanged',
    'blocked',
  ]),
  preview: importPreviewResponseSchema,
})

export const importRetryPersistenceResponseSchema = z.strictObject({
  status: z.enum(['saved', 'persistence-error', 'repreview']),
})

export type ImportPreviewRequest = z.infer<typeof importPreviewRequestSchema>
export type ImportApplyRequest = z.infer<typeof importApplyRequestSchema>
export type ImportRetryPersistenceRequest = z.infer<
  typeof importRetryPersistenceRequestSchema
>
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>
export type ImportApplyResponse = z.infer<typeof importApplyResponseSchema>
export type ImportRetryPersistenceResponse = z.infer<
  typeof importRetryPersistenceResponseSchema
>
