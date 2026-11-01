import { z } from 'zod'
import {
  backupRestorePreviewSchema,
  backupReplacementResultSchema,
} from './backup-contracts'

export const backupTransferChunkBytes = 262144
export const transferHandleSchema = z.strictObject({
  sessionId: z.string().uuid(),
  ownerToken: z.string().uuid(),
})
const surface = z.literal('dashboard')
const sequence = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const beginTransferRequestSchema = z.strictObject({
  surface,
  direction: z.enum(['import', 'export']),
  requestId: z.string().uuid(),
  resume: transferHandleSchema.optional(),
})
export const transferRequestSchema = transferHandleSchema.extend({ surface })
export const readTransferChunkRequestSchema = transferRequestSchema.extend({
  sequence,
})
export const appendTransferChunkRequestSchema =
  readTransferChunkRequestSchema.extend({
    text: z
      .string()
      .min(1)
      .refine(
        (text) =>
          new TextEncoder().encode(text).byteLength <= backupTransferChunkBytes,
        'Transfer chunk exceeds 256 KiB.',
      ),
  })
export const finishTransferRequestSchema = transferRequestSchema.extend({
  chunks: sequence,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  confirmationToken: z.string().uuid().optional(),
})
export const transferSessionSchema = transferHandleSchema.extend({
  direction: z.enum(['import', 'export']),
  nextSequence: sequence,
  bytes: sequence,
  digest: z.string().nullable(),
  status: z.enum(['receiving', 'ready', 'complete']),
  sourceRevision: z.number().int().nullable(),
})
export const transferChunkSchema = z.strictObject({
  sequence,
  text: z
    .string()
    .refine(
      (text) =>
        new TextEncoder().encode(text).byteLength <= backupTransferChunkBytes,
    ),
})
export const finishTransferResultSchema = z.union([
  backupRestorePreviewSchema,
  backupReplacementResultSchema,
])
export type TransferHandle = z.infer<typeof transferHandleSchema>
export type TransferSession = z.infer<typeof transferSessionSchema>

const encoder = new TextEncoder()
// Standard whole-file SHA256. Hashing and JSON validation still allocate the
// full input; bounded transfer does not claim constant-memory validation.
export async function transferDigest(text: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}
export function* splitUtf8Text(text: string): Generator<string> {
  let start = 0,
    bytes = 0,
    end = 0
  for (const character of text) {
    const code = character.codePointAt(0)!
    const size = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
    if (bytes + size > backupTransferChunkBytes) {
      yield text.slice(start, end)
      start = end
      bytes = 0
    }
    bytes += size
    end += character.length
  }
  if (end > start) yield text.slice(start, end)
}
