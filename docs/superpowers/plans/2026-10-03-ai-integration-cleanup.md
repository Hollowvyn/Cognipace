# AI Integration Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the eleven Ponytail review findings approved by the user's “apply” instruction to PR #188.

**Architecture:** Features call the reusable `src/lib/ai` integration directly. Vercel AI SDK owns provider transport and structured output validation; CogniPace retains trusted credential loading, fixed endpoints, whole-operation deadlines, safe errors, runtime validation, and stale-result guards.

**Tech Stack:** TypeScript, Vercel AI SDK 7, Zod 4, React, TanStack Query, Vitest, WXT.

## Task 1: Remove SDK and assessment duplication

Files: `src/lib/ai/{generate-json,types}.ts`, `src/features/genai/server/{genai-service,genai-connection-service,index}.ts`, `src/features/genai/{domain/genai-types,domain/index,index}.ts`, `src/features/leetcode-review-assistant/{server/recommendation-service,server/recommendation-normalizer,domain/recommendation-types,api/runtime-contracts}.ts`, and `src/extension/background/register-handlers.ts`.

- [x] Delete the generation forwarding service and its export; update its three consumers to `import { generateJson } from '@/lib/ai'`. Remove `GenAiPrompt`, `GenAiGenerateJsonRequest`, and `GenAiGenerateJsonResult` aliases and infer the assessment result.
- [x] Delete the unused `baseUrl` option, its validation branch, and `isApprovedEndpoint`; keep fixed provider factory URLs.
- [x] Remove the second Zod parse and its subsequent abort check. Keep the abort check immediately after generation, finish-reason handling, and the whole-operation deadline. Return `data: result.output` and `providerMetadata: metadata()`, preserving existing duration semantics.
- [x] Remove unread `modelVersion` and `totalTokens` fields from metadata types, runtime schemas, and result fixtures. Keep native provider response fixtures intact.
- [x] Delete `FALLBACK_REASON_BY_CODE` and `buildFallbackRecommendation`. Return `{ status: 'fallback', error: { code: result.code, message: result.message } }` and remove only the fallback variant's unused recommendation field.
- [x] Reuse the canonical response schema with `assessmentRecommendationSchema.extend({ evidence: assessmentRecommendationSchema.shape.evidence.readonly(), improvementPoints: assessmentRecommendationSchema.shape.improvementPoints.readonly(), edgeCaseNotes: assessmentRecommendationSchema.shape.edgeCaseNotes.readonly() })`.
- [x] Move native SDK tests to `src/lib/ai/generate-json.test.ts`, update direct-import mocks, and remove tests exclusively for deleted options or metadata. Preserve provider wire, privacy, refusal, timeout, async schema, and error classification coverage.
- [x] Run `rtk npm run test -- src/lib/ai src/features/genai/server/genai-connection-service.test.ts src/features/leetcode-review-assistant src/extension/background/register-handlers.test.ts src/testing/architecture-boundaries.test.ts`; expect all selected tests to pass.

## Task 2: Remove unused secret and Settings state

Files: `src/features/genai/domain/{genai-secrets-types,index}.ts`, `src/features/genai/api/{genai-settings-contracts,genai-settings-hooks}.ts`, `src/features/settings/hooks/use-settings-draft.ts`, and their existing tests.

- [x] Delete `aiProviderSecretsSchema`, `AiProviderSecrets`, and `emptyAiProviderSecrets` and aggregate-only tests. Retain strict per-provider key and presence schemas.
- [x] Replace the duplicate secret-body validator with imported `aiProviderSecretSchema` in `setAiProviderSecretRequestSchema`.
- [x] Remove the key-save hook's unused status/data/error/reset state and return `{ mutateAsync }`. Retain the synchronous pending ref, sanitized rejection, runtime parsing, and secret exclusion from MutationCache.
- [x] Remove the duplicate presence `cancelQueries` call; keep `await invalidateTaggedQueries(queryClient, ['genai'])` before applying validated returned presence.
- [x] Remove `SettingsMutationKind`, `pendingMutation`, and its setters. Derive `isSaving = gate.activeOperation === 'preferences'` and `isResettingDefaults = gate.activeOperation === 'reset'`; retain synchronous own-operation protection.
- [x] Verify hooks, contracts, domain, and invalidation through the combined cleanup run: `rtk npm run test -- src/lib/ai src/features/genai src/features/settings/hooks src/features/leetcode-review-assistant src/features/overlay-session/hooks/use-leetcode-assessment-recommendation.test.tsx src/extension/background/register-handlers.test.ts src/platform/query/cache-invalidation.test.ts src/testing/architecture-boundaries.test.ts`; expect all selected tests to pass.

## Task 3: Integrate, validate, and update the existing draft PR

- [x] Review the integrated diff against all eleven approved findings, then review correctness and ownership. Do not apply extra review suggestions.
- [x] Update current architecture documentation and the AI connection handoff with direct library usage, retained safeguards, exact commands, and remaining human smoke requirements.
- [x] Run `rtk npm run lint`, `rtk npm run check`, `rtk npm run format`, `rtk npm run build`, `rtk npm run zip`, `rtk npm run store:check`, `rtk proxy npx prettier --check --ignore-path /dev/null docs/architecture.md docs/superpowers/plans/2026-10-03-ai-integration-cleanup.md docs/superpowers/handoffs/2026-10-03-ai-connection-setup.md`, and `rtk git diff --check`.
- [x] Record database generation and Firefox checks as skipped because schema and Firefox support are unaffected. Keep installed-extension/live Gemini happy-path, edge-case, and visual proof pending for the human engineer.
- [x] Commit as `refactor(genai): remove redundant AI integration layers`, push `codex/ai-assessment-repair`, and update PR #188 while preserving human testing fields and draft status.

Done when all eleven cuts are present, automated validation passes, the draft PR contains the cleanup, and remaining manual validation is explicit.
