export {
  genAiErrorCodes,
  genAiProviderIds,
  type AiProviderSecretPresence,
  type GenAiError,
  type GenAiProviderConfig,
  type GenAiProviderId,
  type GenAiProviderMetadata,
} from './domain'

export {
  useClearAiProviderSecretMutation,
  useGenAiSecretPresenceQuery,
  useSetAiProviderSecretMutation,
  useTestAiConnectionMutation,
  useGenAiConfigurationRevision,
  type ClearAiProviderSecretHookInput,
  type SetAiProviderSecretHookInput,
  type TestAiConnectionHookInput,
  type TestAiConnectionRequest,
  type TestAiConnectionResponse,
} from './api'

export { useAiHintConnection } from './api/hint-connection-hooks'
export {
  hintConnectionRequestSchema,
  hintConnectionStatusSchema,
  type HintConnectionRequest,
  type HintConnectionStatus,
} from './api/hint-connection-contracts'
