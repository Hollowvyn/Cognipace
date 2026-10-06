import { z } from 'zod'

import {
  completeCodeSnapshotSchema,
  type CompleteCodeSnapshot,
} from '@/lib/leetcode/editor/complete-code-snapshot'

export const codeHintSchema = z.strictObject({
  text: z.string().trim().min(1).max(600),
  strength: z.enum(['light', 'medium', 'heavy']),
  progress: z.enum(['initial', 'improved', 'stuck']),
})
export type CodeHint = z.infer<typeof codeHintSchema>

export const codeHintTurnSchema = z.strictObject({
  snapshot: completeCodeSnapshotSchema,
  hint: codeHintSchema,
})
export type CodeHintTurn = z.infer<typeof codeHintTurnSchema>

/** Only CRLF normalization is allowed; timestamps do not measure progress. */
function sameCode(a: CompleteCodeSnapshot, b: CompleteCodeSnapshot): boolean {
  return (
    a.language === b.language &&
    a.code.replaceAll('\r\n', '\n') === b.code.replaceAll('\r\n', '\n')
  )
}

export function isCodeHintConsistent(
  input: { snapshot: CompleteCodeSnapshot; history: CodeHintTurn[] },
  hint: CodeHint,
): boolean {
  if (input.history.some((turn) => turn.hint.text.trim() === hint.text.trim()))
    return false
  const previous = input.history.at(-1)
  if (!previous) return hint.progress === 'initial' && hint.strength === 'light'
  if (hint.progress === 'initial') return false
  if (hint.progress === 'improved')
    return (
      !sameCode(previous.snapshot, input.snapshot) && hint.strength === 'light'
    )
  const strength = previous.hint.strength === 'light' ? 'medium' : 'heavy'
  return hint.strength === strength
}

export const codeHintHistorySchema = z
  .array(codeHintTurnSchema)
  .max(2)
  .superRefine((history, ctx) => {
    for (let index = 0; index < history.length; index++) {
      const turn = history[index]!
      if (
        !isCodeHintConsistent(
          { snapshot: turn.snapshot, history: history.slice(0, index) },
          turn.hint,
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'hint'],
          message: 'Hint history has an inconsistent adaptive transition.',
        })
      }
    }
  })
