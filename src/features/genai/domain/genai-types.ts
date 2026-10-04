// Keep this UI/domain surface independent of the SDK implementation barrel.
export {
  aiProviderIds as genAiProviderIds,
  aiErrorCodes as genAiErrorCodes,
} from '@/lib/ai/types'
export type {
  AiProviderId as GenAiProviderId,
  AiErrorCode as GenAiError,
  AiProviderConfig as GenAiProviderConfig,
  AiProviderMetadata as GenAiProviderMetadata,
} from '@/lib/ai/types'
