import { generateJson as generateAiJson } from '@/lib/ai'
import type {
  GenAiGenerateJsonRequest,
  GenAiGenerateJsonResult,
} from '../domain'

export function generateJson<T>(
  request: GenAiGenerateJsonRequest<T>,
): Promise<GenAiGenerateJsonResult<T>> {
  return generateAiJson(request)
}
