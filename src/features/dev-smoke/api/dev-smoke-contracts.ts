import { z } from 'zod'

export const devSmokeRequestSchema = z.object({
  surface: z.literal('dashboard'),
  runLiveGenAi: z.boolean().optional(),
  includeCapacity: z.boolean().optional(),
})

export type DevSmokeRequest = z.infer<typeof devSmokeRequestSchema>

export const devSmokeCheckStatusSchema = z.enum([
  'pass',
  'fail',
  'skip',
  'warn',
])

export const devSmokeCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: devSmokeCheckStatusSchema,
  detail: z.string(),
  latencyMs: z.number().int().nonnegative().optional(),
})

export const devSmokeReportSchema = z.object({
  generatedAt: z.iso.datetime(),
  checks: z.array(devSmokeCheckSchema),
  readTimings: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('available'),
        method: z.literal('sequential-background-service-reads'),
        warmups: z.literal(1),
        analytics: z.object({
          samplesMs: z.array(z.number().finite().nonnegative()).length(5),
          p50Ms: z.number().finite().nonnegative(),
          p95Ms: z.number().finite().nonnegative(),
        }),
        queue: z.object({
          samplesMs: z.array(z.number().finite().nonnegative()).length(5),
          p50Ms: z.number().finite().nonnegative(),
          p95Ms: z.number().finite().nonnegative(),
        }),
      }),
      z.object({ status: z.literal('unavailable') }),
    ])
    .optional(),
  capacity: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('available'),
        storage: z.object({
          totalBytes: z.number().int().nonnegative(),
          quotaBytes: z.number().int().nonnegative().nullable(),
          headroomBytes: z.number().int().nonnegative().nullable(),
          activeSnapshotBytes: z.number().int().nonnegative(),
          activeFingerprintBytes: z.number().int().nonnegative(),
          recoveryTopicsBytes: z.number().int().nonnegative(),
          recoveryTracksBytes: z.number().int().nonnegative(),
          recoveryFsrsBytes: z.number().int().nonnegative(),
        }),
      }),
      z.object({ status: z.literal('unavailable') }),
    ])
    .optional(),
})

export type DevSmokeReport = z.infer<typeof devSmokeReportSchema>
export type DevSmokeCapacityStorage = Extract<
  NonNullable<DevSmokeReport['capacity']>,
  { status: 'available' }
>['storage']
