import { defineExtensionMessaging } from '@webext-core/messaging'
import { z } from 'zod'

import type {
  AnalyticsSummaryRequest,
  SerializedAnalyticsSummary,
} from '@/features/analytics/api/analytics-contracts'
export {
  analyticsSummaryRequestSchema,
  analyticsSummarySchema,
} from '@/features/analytics/api/analytics-contracts'
import type {
  AppShellData,
  AppShellRequest,
} from '@/features/app-shell/api/app-shell-contracts'
import type {
  BackupFile,
  BackupPayloadRequest,
  BackupRequest,
  BackupSummary,
} from '@/features/backup/api/backup-contracts'
export {
  backupFileSchema,
  backupPayloadRequestSchema,
  backupRequestSchema,
  backupSummarySchema,
} from '@/features/backup/api/backup-contracts'
import type {
  ClearAiProviderSecretRequest,
  GetAiProviderSecretPresenceRequest,
  SetAiProviderSecretRequest,
  TestAiConnectionRequest,
  TestAiConnectionResponse,
} from '@/features/genai/api'
import type {
  ImportApplyRequest,
  ImportApplyResponse,
  ImportPreviewRequest,
  ImportPreviewResponse,
  ImportRetryPersistenceRequest,
  ImportRetryPersistenceResponse,
} from '@/features/imports/api/import-runtime-contracts'
export type {
  ImportApplyRequest,
  ImportApplyResponse,
  ImportPreviewRequest,
  ImportPreviewResponse,
  ImportRetryPersistenceRequest,
  ImportRetryPersistenceResponse,
} from '@/features/imports/api/import-runtime-contracts'
export {
  clearAiProviderSecretRequestSchema,
  getAiProviderSecretPresenceRequestSchema,
  setAiProviderSecretRequestSchema,
  testAiConnectionRequestSchema,
  testAiConnectionResponseSchema,
} from '@/features/genai/api'
import type { AiProviderSecretPresence } from '@/features/genai'
import type { DevSmokeReport, DevSmokeRequest } from '@/features/dev-smoke'
export {
  devSmokeReportSchema,
  devSmokeRequestSchema,
} from '@/features/dev-smoke'
export type { DevSmokeReport, DevSmokeRequest } from '@/features/dev-smoke'
import {
  leetcodeProblemRemoteRequestSchema,
  leetcodeSubmissionResultRemoteRequestSchema,
  type SerializedLeetCodeMetadataResult,
  type SerializedLeetCodeProblemContentResult,
  type SerializedLeetCodeSubmissionResultRemoteResponse,
} from '@/features/leetcode-capture/api/leetcode-capture-contracts'
import type {
  AnalyzeLeetCodeSubmissionRequest,
  AnalyzeLeetCodeSubmissionResponse,
  CancelLeetCodeAnalysisRequest,
  CancelLeetCodeAnalysisResponse,
} from '@/features/leetcode-review-assistant/api/code-analysis-contracts'
import {
  normalizedPracticeStateSchema,
  type PracticeDetailsRequest,
  type PracticeOverrideLastReviewResultRequest,
  type PracticeResetScheduleRequest,
  type PracticeSaveReviewResultRequest,
  type PracticeSetSuspendedRequest,
  type SerializedPracticeDetails,
} from '@/features/practice/api/practice-contracts'
import {
  problemDifficultySchema,
  problemSlugSchema,
  type ProblemBulkUpdateResponse,
  type ProblemDeleteResponse,
  type ProblemForEditResponse,
  type ProblemLibraryResponse,
  type ProblemsBulkDeleteRequest,
  type ProblemsBulkUpdateProblemsRequest,
  type ProblemsCreateProblemRequest,
  type ProblemsDeleteProblemRequest,
  type ProblemsGetLibraryRequest,
  type ProblemsGetProblemForEditRequest,
  type ProblemsUpdateProblemRequest,
  type ProblemsUpsertFromPageRequest,
  type SerializedProblem,
} from '@/features/problems/api/problems-contracts'
export {
  problemBulkUpdateResponseSchema,
  problemDeleteResponseSchema,
  problemForEditResponseSchema,
  problemLibraryResponseSchema,
  problemsBulkDeleteRequestSchema,
  problemsBulkUpdateProblemsRequestSchema,
  problemsCreateProblemRequestSchema,
  problemsDeleteProblemRequestSchema,
  problemsGetLibraryRequestSchema,
  problemsGetProblemForEditRequestSchema,
  problemsUpdateProblemRequestSchema,
  problemsUpsertFromPageRequestSchema,
} from '@/features/problems/api/problems-contracts'
export type { SerializedProblem } from '@/features/problems/api/problems-contracts'
import type { UserSettings } from '@/features/settings'
export {
  settingsCycleThemeModeRequestSchema,
  settingsRequestSchema,
  settingsToggleStudyModeRequestSchema,
  settingsUpdateRequestSchema,
} from '@/features/settings/api/settings-contracts'
import {
  type SettingsCycleThemeModeRequest,
  type SettingsRequest,
  type SettingsToggleStudyModeRequest,
  type SettingsUpdateRequest,
} from '@/features/settings/api/settings-contracts'
import type {
  SerializedSyncStatus,
  SyncActionResult,
  SyncGithubGistRequest,
  SyncGithubTokenRequest,
  SyncPullLatestRequest,
  SyncPushLocalRequest,
  SyncRequest,
  SyncSetEnabledRequest,
} from '@/features/sync/api/sync-contracts'
export {
  syncActionResultSchema,
  syncGithubGistRequestSchema,
  syncGithubTokenRequestSchema,
  syncPullLatestRequestSchema,
  syncPushLocalRequestSchema,
  syncRequestSchema,
  syncSetEnabledRequestSchema,
  syncStatusSchema,
} from '@/features/sync/api/sync-contracts'
import type {
  SerializedActiveTrack,
  TrackDeleteResponse,
  TrackForEditResponse,
  TracksClearActiveTrackRequest,
  TracksCreateTrackRequest,
  TracksDeleteTrackRequest,
  TracksGetActiveTrackRequest,
  TracksGetTrackForEditRequest,
  TracksGetWorkspaceRequest,
  TracksRemoveProblemRequest,
  TracksResetTrackProgressRequest,
  TracksSetActiveTrackRequest,
  TracksUpdateTrackRequest,
  TrackWorkspaceResponse,
} from '@/features/tracks/api/tracks-contracts'
export {
  activeTrackSchema,
  serializedActiveTrackSchema,
  trackDeleteResponseSchema,
  trackForEditResponseSchema,
  tracksNullResponseSchema,
  tracksClearActiveTrackRequestSchema,
  tracksCreateTrackRequestSchema,
  tracksDeleteTrackRequestSchema,
  tracksGetActiveTrackRequestSchema,
  tracksGetTrackForEditRequestSchema,
  tracksGetWorkspaceRequestSchema,
  tracksRemoveProblemRequestSchema,
  tracksResetTrackProgressRequestSchema,
  tracksSetActiveTrackRequestSchema,
  tracksUpdateTrackRequestSchema,
  trackWorkspaceResponseSchema,
} from '@/features/tracks/api/tracks-contracts'
export type {
  SerializedActiveTrack,
  TrackDeleteResponse,
  TrackForEditResponse,
  TracksClearActiveTrackRequest,
  TracksCreateTrackRequest,
  TracksDeleteTrackRequest,
  TracksGetActiveTrackRequest,
  TracksGetTrackForEditRequest,
  TracksGetWorkspaceRequest,
  TracksRemoveProblemRequest,
  TracksResetTrackProgressRequest,
  TracksSetActiveTrackRequest,
  TracksUpdateTrackRequest,
  TrackWorkspaceResponse,
} from '@/features/tracks/api/tracks-contracts'
import { dashboardRouteSchema } from '@/platform/chrome/extension-pages'
import { cacheInvalidationTags } from '@/platform/query/cache-invalidation'

export const extensionSurfaceSchema = z.enum([
  'background',
  'popup',
  'dashboard',
  'content-script',
])

export type ExtensionSurface = z.infer<typeof extensionSurfaceSchema>

export const uiSurfaceSchema = z.enum(['popup', 'dashboard', 'content-script'])

export type UiSurface = z.infer<typeof uiSurfaceSchema>

export const cacheInvalidationReasonSchema = z.enum([
  'practice-updated',
  'problem-catalog-updated',
  'settings-updated',
  'genai-updated',
  'sync-updated',
  'tracks-updated',
])

export const cacheInvalidationEventSchema = z.object({
  emittedAt: z.iso.datetime(),
  problemSlug: problemSlugSchema.optional(),
  reason: cacheInvalidationReasonSchema,
  source: uiSurfaceSchema,
  tags: z.array(z.enum(cacheInvalidationTags)).min(1),
})

export type CacheInvalidationEvent = z.infer<
  typeof cacheInvalidationEventSchema
>

export const queueItemSchema = z.object({
  category: z.enum(['due', 'new', 'reinforcement']),
  problemSlug: problemSlugSchema,
  title: z.string(),
  difficulty: problemDifficultySchema,
  isPremium: z.boolean(),
  state: normalizedPracticeStateSchema,
  reason: z.enum(['overdue', 'due-today', 'reinforcement', 'new-problem']),
})

export const todayQueueSchema = z.object({
  generatedAt: z.iso.datetime(),
  dueCount: z.number().int().min(0),
  dueToday: z.number().int().min(0),
  newCount: z.number().int().min(0),
  newAvailable: z.number().int().min(0),
  queueLoad: z.number().int().min(0),
  reinforcementCount: z.number().int().min(0),
  excludedCount: z.number().int().min(0),
  recommendationReason: z
    .enum(['overdue', 'due-today', 'reinforcement', 'new-problem'])
    .nullable(),
  items: z.array(queueItemSchema),
  topRecommendation: queueItemSchema.nullable(),
})

export type SerializedTodayQueue = z.infer<typeof todayQueueSchema>

export const pingRequestSchema = z.object({
  surface: extensionSurfaceSchema,
})

export type PingRequest = z.infer<typeof pingRequestSchema>

export type PingResponse = {
  ok: true
  surface: ExtensionSurface
  receivedAt: string
}

export const queueRequestSchema = z.object({
  surface: z.enum(['popup', 'dashboard']),
  at: z.iso.datetime().optional(),
})

export type QueueRequest = z.infer<typeof queueRequestSchema>

export const openDashboardRequestSchema = z.object({
  surface: z.literal('content-script'),
  route: dashboardRouteSchema.optional(),
})

export type OpenDashboardRequest = z.infer<typeof openDashboardRequestSchema>

export { tracksGetActiveTrackRequestSchema as tracksRequestSchema } from '@/features/tracks/api/tracks-contracts'

export type TracksRequest = TracksGetActiveTrackRequest

export const leetcodeProblemRemoteRuntimeRequestSchema =
  leetcodeProblemRemoteRequestSchema.extend({
    surface: z.literal('content-script'),
  })

export type LeetCodeProblemRemoteRuntimeRequest = z.infer<
  typeof leetcodeProblemRemoteRuntimeRequestSchema
>

export const leetcodeSubmissionResultRemoteRuntimeRequestSchema =
  leetcodeSubmissionResultRemoteRequestSchema.extend({
    surface: z.literal('content-script'),
  })

export type LeetCodeSubmissionResultRemoteRuntimeRequest = z.infer<
  typeof leetcodeSubmissionResultRemoteRuntimeRequestSchema
>

export interface ProtocolMap {
  'analytics.getSummary'(
    request: AnalyticsSummaryRequest,
  ): SerializedAnalyticsSummary
  'cache.invalidate'(request: CacheInvalidationEvent): null
  'runtime.ping'(request: PingRequest): PingResponse
  'app.getShellData'(request: AppShellRequest): AppShellData
  'app.openDashboard'(request: OpenDashboardRequest): null
  'backup.exportFullBackup'(request: BackupRequest): BackupFile
  'backup.validateFullBackup'(request: BackupPayloadRequest): BackupSummary
  'backup.restoreFullBackup'(request: BackupPayloadRequest): BackupSummary
  'backup.resetLocalData'(request: BackupRequest): null
  'genai.getAiProviderSecretPresence'(
    request: GetAiProviderSecretPresenceRequest,
  ): AiProviderSecretPresence
  'genai.setAiProviderSecret'(
    request: SetAiProviderSecretRequest,
  ): AiProviderSecretPresence
  'genai.clearAiProviderSecret'(
    request: ClearAiProviderSecretRequest,
  ): AiProviderSecretPresence
  'genai.testConnection'(
    request: TestAiConnectionRequest,
  ): TestAiConnectionResponse
  'genai.analyzeLeetCodeSubmission'(
    request: AnalyzeLeetCodeSubmissionRequest,
  ): AnalyzeLeetCodeSubmissionResponse
  'genai.cancelLeetCodeAnalysis'(
    request: CancelLeetCodeAnalysisRequest,
  ): CancelLeetCodeAnalysisResponse
  'imports.preview'(request: ImportPreviewRequest): ImportPreviewResponse
  'imports.apply'(request: ImportApplyRequest): ImportApplyResponse
  'imports.retryPersistence'(
    request: ImportRetryPersistenceRequest,
  ): ImportRetryPersistenceResponse
  'devSmoke.run'(request: DevSmokeRequest): DevSmokeReport
  'sync.getStatus'(request: SyncRequest): SerializedSyncStatus
  'sync.validateGithubToken'(request: SyncGithubTokenRequest): SyncActionResult
  'sync.validateStoredGithubToken'(request: SyncRequest): SyncActionResult
  'sync.saveGithubToken'(request: SyncGithubTokenRequest): SyncActionResult
  'sync.deleteGithubToken'(request: SyncRequest): SyncActionResult
  'sync.createGithubGist'(request: SyncRequest): SyncActionResult
  'sync.connectGithubGist'(request: SyncGithubGistRequest): SyncActionResult
  'sync.setEnabled'(request: SyncSetEnabledRequest): SyncActionResult
  'sync.checkRemoteOnOpen'(request: SyncRequest): SyncActionResult
  'sync.requestOpenCheck'(request: SyncRequest): null
  'sync.pullLatest'(request: SyncPullLatestRequest): SyncActionResult
  'sync.pushLocal'(request: SyncPushLocalRequest): SyncActionResult
  'problems.upsertFromPage'(
    request: ProblemsUpsertFromPageRequest,
  ): SerializedProblem
  'problems.getLibrary'(
    request: ProblemsGetLibraryRequest,
  ): ProblemLibraryResponse
  'problems.getProblemForEdit'(
    request: ProblemsGetProblemForEditRequest,
  ): ProblemForEditResponse
  'problems.createProblem'(
    request: ProblemsCreateProblemRequest,
  ): ProblemForEditResponse
  'problems.updateProblem'(
    request: ProblemsUpdateProblemRequest,
  ): ProblemForEditResponse
  'problems.deleteProblem'(
    request: ProblemsDeleteProblemRequest,
  ): ProblemDeleteResponse
  'problems.bulkUpdateProblems'(
    request: ProblemsBulkUpdateProblemsRequest,
  ): ProblemBulkUpdateResponse
  'problems.bulkDelete'(
    request: ProblemsBulkDeleteRequest,
  ): ProblemDeleteResponse
  'practice.saveReviewResult'(
    request: PracticeSaveReviewResultRequest,
  ): SerializedPracticeDetails
  'practice.getDetails'(
    request: PracticeDetailsRequest,
  ): SerializedPracticeDetails
  'practice.overrideLastReviewResult'(
    request: PracticeOverrideLastReviewResultRequest,
  ): SerializedPracticeDetails
  'practice.setSuspended'(
    request: PracticeSetSuspendedRequest,
  ): SerializedPracticeDetails
  'practice.resetSchedule'(
    request: PracticeResetScheduleRequest,
  ): SerializedPracticeDetails
  'queue.getTodayQueue'(request: QueueRequest): SerializedTodayQueue
  'tracks.getActiveTrack'(
    request: TracksGetActiveTrackRequest,
  ): SerializedActiveTrack
  'tracks.getWorkspace'(
    request: TracksGetWorkspaceRequest,
  ): TrackWorkspaceResponse
  'tracks.getTrackForEdit'(
    request: TracksGetTrackForEditRequest,
  ): TrackForEditResponse
  'tracks.setActiveTrack'(request: TracksSetActiveTrackRequest): null
  'tracks.clearActiveTrack'(request: TracksClearActiveTrackRequest): null
  'tracks.createTrack'(request: TracksCreateTrackRequest): TrackForEditResponse
  'tracks.updateTrack'(request: TracksUpdateTrackRequest): TrackForEditResponse
  'tracks.deleteTrack'(request: TracksDeleteTrackRequest): TrackDeleteResponse
  'tracks.removeProblem'(request: TracksRemoveProblemRequest): null
  'tracks.resetTrackProgress'(request: TracksResetTrackProgressRequest): null
  'settings.getSettings'(request: SettingsRequest): UserSettings
  'settings.updateSettings'(request: SettingsUpdateRequest): UserSettings
  'settings.toggleStudyMode'(request: SettingsToggleStudyModeRequest): null
  'settings.cycleThemeMode'(request: SettingsCycleThemeModeRequest): null
  'leetcode.readProblemMetadata'(
    request: LeetCodeProblemRemoteRuntimeRequest,
  ): SerializedLeetCodeMetadataResult
  'leetcode.readProblemContent'(
    request: LeetCodeProblemRemoteRuntimeRequest,
  ): SerializedLeetCodeProblemContentResult
  'leetcode.readSubmissionResult'(
    request: LeetCodeSubmissionResultRemoteRuntimeRequest,
  ): SerializedLeetCodeSubmissionResultRemoteResponse
}

export const protocolMethodNames = [
  'analytics.getSummary',
  'cache.invalidate',
  'runtime.ping',
  'app.getShellData',
  'app.openDashboard',
  'backup.exportFullBackup',
  'backup.validateFullBackup',
  'backup.restoreFullBackup',
  'backup.resetLocalData',
  'genai.getAiProviderSecretPresence',
  'genai.setAiProviderSecret',
  'genai.clearAiProviderSecret',
  'genai.testConnection',
  'genai.analyzeLeetCodeSubmission',
  'genai.cancelLeetCodeAnalysis',
  'imports.preview',
  'imports.apply',
  'imports.retryPersistence',
  'devSmoke.run',
  'sync.getStatus',
  'sync.validateGithubToken',
  'sync.validateStoredGithubToken',
  'sync.saveGithubToken',
  'sync.deleteGithubToken',
  'sync.createGithubGist',
  'sync.connectGithubGist',
  'sync.setEnabled',
  'sync.checkRemoteOnOpen',
  'sync.requestOpenCheck',
  'sync.pullLatest',
  'sync.pushLocal',
  'problems.upsertFromPage',
  'problems.getLibrary',
  'problems.getProblemForEdit',
  'problems.createProblem',
  'problems.updateProblem',
  'problems.deleteProblem',
  'problems.bulkUpdateProblems',
  'problems.bulkDelete',
  'practice.saveReviewResult',
  'practice.getDetails',
  'practice.overrideLastReviewResult',
  'practice.setSuspended',
  'practice.resetSchedule',
  'queue.getTodayQueue',
  'tracks.getActiveTrack',
  'tracks.getWorkspace',
  'tracks.getTrackForEdit',
  'tracks.setActiveTrack',
  'tracks.clearActiveTrack',
  'tracks.createTrack',
  'tracks.updateTrack',
  'tracks.deleteTrack',
  'tracks.removeProblem',
  'tracks.resetTrackProgress',
  'settings.getSettings',
  'settings.updateSettings',
  'settings.toggleStudyMode',
  'settings.cycleThemeMode',
  'leetcode.readProblemMetadata',
  'leetcode.readProblemContent',
  'leetcode.readSubmissionResult',
] as const satisfies readonly (keyof ProtocolMap)[]

type MissingProtocolMethod = Exclude<
  keyof ProtocolMap,
  (typeof protocolMethodNames)[number]
>

const protocolMethodCoverageCheck: Record<MissingProtocolMethod, never> = {}
void protocolMethodCoverageCheck

const extensionMessenger = defineExtensionMessaging<ProtocolMap>()

export const onMessage = extensionMessenger.onMessage.bind(extensionMessenger)

export const sendMessage =
  extensionMessenger.sendMessage.bind(extensionMessenger)
