import { sendMessage } from '@/extension/messaging'

import {
  generateLeetCodeHintsResponseSchema,
  cancelLeetCodeHintsResponseSchema,
  type GenerateLeetCodeHintsRequest,
  type CancelLeetCodeHintsRequest,
} from './code-hint-contracts'

export async function generateLeetCodeHintsViaRuntime(
  request: GenerateLeetCodeHintsRequest,
) {
  return generateLeetCodeHintsResponseSchema.parse(
    await sendMessage('genai.generateLeetCodeHints', request),
  )
}

export async function cancelLeetCodeHintsViaRuntime(
  request: CancelLeetCodeHintsRequest,
) {
  return cancelLeetCodeHintsResponseSchema.parse(
    await sendMessage('genai.cancelLeetCodeHints', request),
  )
}
