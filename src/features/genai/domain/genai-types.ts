// Keep this UI/domain surface independent of the SDK implementation barrel.
export {
  aiProviderIds as genAiProviderIds,
  aiErrorCodes as genAiErrorCodes,
} from '@/lib/ai/types'
export type {
  AiProviderId as GenAiProviderId,
  AiErrorCode as GenAiError,
  AiProviderConfig as GenAiProviderConfig,
  AiPrompt as GenAiPrompt,
  AiGenerateJsonRequest as GenAiGenerateJsonRequest,
  AiProviderMetadata as GenAiProviderMetadata,
  AiGenerateJsonResult as GenAiGenerateJsonResult,
} from '@/lib/ai/types'
