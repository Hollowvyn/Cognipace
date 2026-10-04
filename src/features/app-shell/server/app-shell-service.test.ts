import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { setAiProviderSecret } from '@/features/genai/server/genai-settings-service'
import { createPracticeRepository } from '@/features/practice/data/practice-repository'
import { createSettingsRepository } from '@/features/settings/data/settings-repository'
import { updateSettings } from '@/features/settings/server/settings-service'
import { recordActiveTrackProblemCompletion } from '@/features/tracks/server/tracks-service'
import { problemPractice, tracks, trackSession } from '@/platform/db/schema'
import { createTestDb } from '@/platform/db/test-db'

import {
  dashboardAppShellDataSchema,
  overlayAppShellDataSchema,
  popupAppShellDataSchema,
} from '../api/app-shell-contracts'
import { getAppShellData } from './app-shell-service'

const generatedAt = '2026-01-01T10:00:00.000Z'

describe('app-shell service', () => {
  it('composes popup payload from queue, settings, and active track state', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    const payload = await getPopupPayload(handle)

    expect(payload).toMatchObject({
      surface: 'popup',
      generatedAt,
      status: {
        label: 'Practice ready',
      },
      metrics: [
        { label: 'Reviews Due', value: '0' },
        { label: 'Streak', value: '0 days' },
      ],
      queue: {
        dueCount: 0,
        newCount: 101,
        reinforcementCount: 0,
      },
      activeTrack: {
        state: 'ready',
        trackId: 'bytebytego-coding-patterns-101',
        title: 'ByteByteGo Coding Patterns 101',
        groupTitle: 'Two Pointers',
        dueAt: null,
        progress: {
          completedCount: 0,
          totalCount: 101,
          percent: 0,
        },
        nextProblem: {
          problemSlug: 'two-sum-ii-input-array-is-sorted',
          title: 'Pair Sum - Sorted',
        },
      },
      settings: {
        appearance: {
          themeMode: 'system',
        },
        practice: {
          mode: 'studyPlan',
        },
        assessment: {
          requireSolveTime: false,
          strictTiming: false,
        },
      },
    })
    expect(payload.recommendation).toMatchObject({
      category: 'new',
      problem: { problemSlug: 'ones-and-zeroes' },
    })
    expect(payload.settings.appearance).toEqual({
      themeMode: 'system',
    })
    expect(payload.popup.queuePreview).toHaveLength(3)
  })

  it('composes popup metrics from shared practice progress', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const practiceRepository = createPracticeRepository(handle.db)

    await createSettingsRepository(handle.db).updateSettings({
      practice: {
        dailyGoal: 2,
      },
    })
    await practiceRepository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'again',
      reviewedAt: new Date('2026-01-01T08:00:00.000Z'),
      reviewMode: 'manual',
    })
    await practiceRepository.saveReviewResult({
      problemSlug: 'valid-parentheses',
      rating: 'good',
      reviewedAt: new Date('2026-01-01T09:00:00.000Z'),
      reviewMode: 'manual',
    })

    const payload = await getPopupPayload(handle)

    expect(payload.practiceProgress).toMatchObject({
      completedToday: 2,
      dailyGoal: 2,
      currentStreak: 1,
      goalMetToday: true,
      todayDateKey: '2026-01-01',
    })
    expect(payload.metrics).toEqual([
      { label: 'Reviews Due', value: String(payload.queue.dueCount) },
      { label: 'Streak', value: '1 day' },
    ])
  })

  it.each(['popup', 'dashboard'] as const)(
    'uses the next problem group for %s guidance after another tab was persisted',
    async (surface) => {
      const handle = await createTestDb({
        now: new Date('2026-01-01T00:00:00.000Z'),
      })

      await handle.db
        .update(trackSession)
        .set({ activeGroupId: 'bytebytego-coding-patterns-101:intervals' })
        .where(eq(trackSession.id, 'active'))

      const payload =
        surface === 'popup'
          ? await getPopupPayload(handle)
          : await getDashboardPayload(handle)

      expect(payload.activeTrack).toMatchObject({
        state: 'ready',
        groupTitle: 'Two Pointers',
        nextProblem: { problemSlug: 'two-sum-ii-input-array-is-sorted' },
      })
    },
  )

  it('serializes the active track due date when present', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const dueAt = new Date('2026-02-14T00:00:00.000Z')

    await activateLeetCode75Track(handle)
    await handle.db
      .update(tracks)
      .set({ dueAt: dueAt.getTime() })
      .where(eq(tracks.id, 'leetcode-75'))

    const payload = await getPopupPayload(handle)

    expect(payload.activeTrack.dueAt).toBe(dueAt.toISOString())
  })

  it('uses the track ledger instead of global practice history for popup progress', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const practiceRepository = createPracticeRepository(handle.db)

    await activateLeetCode75Track(handle)
    await practiceRepository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date(generatedAt),
      reviewMode: 'manual',
    })

    const payloadAfterGlobalReview = await getPopupPayload(handle)

    expect(payloadAfterGlobalReview.activeTrack).toMatchObject({
      progress: {
        completedCount: 0,
        totalCount: 1,
        percent: 0,
      },
      nextProblem: {
        problemSlug: 'two-sum',
      },
    })

    await recordActiveTrackProblemCompletion(handle.db, {
      problemSlug: 'two-sum',
      rating: 'good',
      completedAt: new Date(generatedAt),
    })

    const payloadAfterLedgerCompletion = await getPopupPayload(handle)

    expect(payloadAfterLedgerCompletion.activeTrack).toMatchObject({
      state: 'exhausted',
      trackId: 'leetcode-75',
      groupTitle: null,
      detail: 'No more problems in track.',
      progress: {
        completedCount: 1,
        totalCount: 1,
        percent: 100,
      },
      nextProblem: null,
    })
  })

  it('does not include active-track state in popup free practice mode', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })

    await createSettingsRepository(handle.db).updateSettings({
      practice: { mode: 'freePractice' },
    })

    const payload = await getPopupPayload(handle)

    expect(payload.recommendation).toMatchObject({
      category: 'new',
      problem: { problemSlug: 'ones-and-zeroes' },
    })
    expect(payload.activeTrack).toMatchObject({
      state: 'disabled-free-practice',
      trackId: null,
      title: 'Track guidance disabled',
      nextProblem: null,
    })
    expect(payload.settings.practice.mode).toBe('freePractice')
  })

  it('composes dashboard payload with a larger queue preview', async () => {
    const handle = await createTestDb()

    const payload = await getDashboardPayload(handle)

    expect(payload.surface).toBe('dashboard')
    expect(payload.overview.queuePreview).toEqual(
      payload.dashboard.queuePreview,
    )
    expect(
      payload.dashboard.queuePreview.map((item) => item.problem.problemSlug),
    ).toEqual([
      'ones-and-zeroes',
      'balanced-binary-tree',
      'validate-binary-search-tree',
      'binary-tree-vertical-order-traversal',
    ])
  })

  it('composes dashboard overview progress from unique practiced problems', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const practiceRepository = createPracticeRepository(handle.db)

    await createSettingsRepository(handle.db).updateSettings({
      practice: {
        dailyGoal: 2,
      },
    })
    await practiceRepository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'again',
      reviewedAt: new Date('2026-01-01T08:00:00.000Z'),
      reviewMode: 'manual',
    })
    await practiceRepository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date('2026-01-01T09:00:00.000Z'),
      reviewMode: 'manual',
    })
    await practiceRepository.saveReviewResult({
      problemSlug: 'valid-parentheses',
      rating: 'again',
      reviewedAt: new Date('2026-01-01T09:30:00.000Z'),
      reviewMode: 'manual',
    })

    const payload = await getDashboardPayload(handle)

    expect(payload.overview.practiceProgress).toMatchObject({
      completedToday: 2,
      dailyGoal: 2,
      currentStreak: 1,
      goalMetToday: true,
      todayDateKey: '2026-01-01',
    })
    expect(payload.overview.practiceProgress).toEqual(payload.practiceProgress)
    expect(payload.metrics).toContainEqual({ label: 'Streak', value: '1 day' })
  })

  it('composes overlay payload with current problem practice details', async () => {
    const handle = await createTestDb()
    await handle.db.insert(problemPractice).values({
      problemSlug: 'two-sum',
      status: 'new',
      interviewPattern: 'Hash map',
      notes: 'Track complements.',
      firstSeenAt: 0,
      createdAt: 0,
      updatedAt: 0,
    })

    const payload = await getOverlayPayload(handle, 'two-sum')

    expect(payload).toMatchObject({
      surface: 'overlay',
      overlay: {
        appearance: {
          themeMode: 'system',
        },
        automation: {
          autoDetectSolved: true,
        },
        problem: {
          problemSlug: 'two-sum',
        },
        practice: {
          problemSlug: 'two-sum',
          card: null,
          currentLog: {
            interviewPattern: 'Hash map',
            notes: 'Track complements.',
          },
          phase: 'new',
          isStarted: false,
        },
        timing: {
          requireSolveTime: false,
          strictTiming: false,
        },
        nextStep: {
          kind: 'track',
          title: 'Pair Sum - Sorted',
          problem: {
            problemSlug: 'two-sum-ii-input-array-is-sorted',
          },
        },
      },
    })
    expect('queue' in payload).toBe(false)
  })

  it('returns an empty overlay payload before a page problem is known', async () => {
    const handle = await createTestDb()

    const payload = await getOverlayPayload(handle)

    expect(payload).toMatchObject({
      surface: 'overlay',
      overlay: {
        appearance: {
          themeMode: 'system',
        },
        automation: {
          autoDetectSolved: true,
        },
        problem: null,
        practice: null,
        timing: {
          requireSolveTime: false,
          strictTiming: false,
        },
        nextStep: null,
      },
    })
  })

  it('uses the distinct active-track problem for overlay next step', async () => {
    const handle = await createTestDb()

    const payload = await getOverlayPayload(handle, 'valid-parentheses')

    expect(payload.overlay.nextStep).toMatchObject({
      kind: 'track',
      title: 'Pair Sum - Sorted',
      problem: {
        problemSlug: 'two-sum-ii-input-array-is-sorted',
      },
    })
  })

  it('ignores active-track next step in overlay free practice mode', async () => {
    const handle = await createTestDb()

    await createSettingsRepository(handle.db).updateSettings({
      practice: { mode: 'freePractice' },
    })

    const payload = await getOverlayPayload(handle, 'valid-parentheses')

    expect(payload.overlay.nextStep).toMatchObject({
      kind: 'recommendation',
      problem: { problemSlug: 'ones-and-zeroes' },
    })
  })

  it('falls back to the queue for overlay next step when active track has no next problem', async () => {
    const handle = await createTestDb({
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    const practiceRepository = createPracticeRepository(handle.db)

    await activateLeetCode75Track(handle)
    await recordActiveTrackProblemCompletion(handle.db, {
      problemSlug: 'two-sum',
      rating: 'easy',
      completedAt: new Date('2025-12-31T10:00:00.000Z'),
    })
    await practiceRepository.saveReviewResult({
      problemSlug: 'valid-parentheses',
      rating: 'again',
      reviewedAt: new Date('2025-12-01T10:00:00.000Z'),
      reviewMode: 'manual',
    })

    const payload = await getOverlayPayload(handle, 'two-sum')

    expect(payload.overlay.nextStep).toMatchObject({
      kind: 'recommendation',
      title: 'Valid Parentheses',
      problem: {
        problemSlug: 'valid-parentheses',
      },
      category: 'due',
    })
  })

  it('exposes disabled overlay auto-detect from overlay settings', async () => {
    const handle = await createTestDb()

    await createSettingsRepository(handle.db).updateSettings({
      overlay: {
        autoDetectSolved: false,
      },
    })

    const payload = await getOverlayPayload(handle, 'two-sum')

    expect(payload.overlay.automation.autoDetectSolved).toBe(false)
  })

  it('reflects saved reviews in overlay practice details and queue categories', async () => {
    const handle = await createTestDb()
    const practiceRepository = createPracticeRepository(handle.db)

    await practiceRepository.saveReviewResult({
      problemSlug: 'two-sum',
      rating: 'good',
      reviewedAt: new Date(generatedAt),
      reviewMode: 'leetcode',
    })

    const readAt = '2026-01-01T10:05:00.000Z'
    const popupPayload = await getPopupPayload(handle, readAt)
    const overlayPayload = await getOverlayPayload(handle, 'two-sum', readAt)

    expect(popupPayload.queue).toMatchObject({
      dueCount: 0,
      newCount: 100,
      reinforcementCount: 1,
    })
    expect(popupPayload.recommendation.category).toBe('reinforcement')
    expect(overlayPayload.overlay.practice?.latestAttempt).toMatchObject({
      rating: 'good',
      reviewMode: 'leetcode',
    })
  })
})

type TestDbHandle = Awaited<ReturnType<typeof createTestDb>>

async function activateLeetCode75Track(handle: TestDbHandle) {
  await handle.db
    .update(trackSession)
    .set({
      activeTrackId: 'leetcode-75',
      activeGroupId: 'leetcode-75:arrays-hashing',
    })
    .where(eq(trackSession.id, 'active'))
}

async function getPopupPayload(handle: TestDbHandle, readAt = generatedAt) {
  return popupAppShellDataSchema.parse(
    await getAppShellData(handle.db, { surface: 'popup' }, new Date(readAt)),
  )
}

async function getDashboardPayload(handle: TestDbHandle, readAt = generatedAt) {
  return dashboardAppShellDataSchema.parse(
    await getAppShellData(
      handle.db,
      { surface: 'dashboard' },
      new Date(readAt),
    ),
  )
}

async function getOverlayPayload(
  handle: TestDbHandle,
  problemSlug?: string,
  readAt = generatedAt,
) {
  return overlayAppShellDataSchema.parse(
    await getAppShellData(
      handle.db,
      {
        surface: 'overlay',
        ...(problemSlug ? { problemSlug } : {}),
      },
      new Date(readAt),
    ),
  )
}

describe('AI assessment exposure', () => {
  it('overlay payload reports aiAssessmentAvailable=false when settings disabled', async () => {
    const handle = await createTestDb({ seed: false })
    const payload = await getOverlayPayload(handle)
    expect(payload.overlay.aiAssessmentAvailable).toBe(false)
  })

  it('overlay payload reports aiAssessmentAvailable=false when enabled but key missing', async () => {
    const handle = await createTestDb({ seed: false })
    await updateSettings(handle.db, {
      aiAssessment: { enabled: true, provider: 'openai', model: 'gpt-test' },
    })
    // no setAiProviderSecret call
    const payload = await getOverlayPayload(handle)
    expect(payload.overlay.aiAssessmentAvailable).toBe(false)
  })

  it('overlay payload reports aiAssessmentAvailable=true when fully configured', async () => {
    const handle = await createTestDb({ seed: false })
    await updateSettings(handle.db, {
      aiAssessment: { enabled: true, provider: 'openai', model: 'gpt-test' },
    })
    await setAiProviderSecret('openai', {
      apiKey: 'sk-must-not-leak',
    })
    const payload = await getOverlayPayload(handle)
    expect(payload.overlay.aiAssessmentAvailable).toBe(true)
  })

  it('overlay payload never contains apiKey or the literal key string', async () => {
    const handle = await createTestDb({ seed: false })
    await updateSettings(handle.db, {
      aiAssessment: { enabled: true, provider: 'openai', model: 'gpt-test' },
    })
    await setAiProviderSecret('openai', {
      apiKey: 'sk-must-not-leak',
    })
    const payload = await getOverlayPayload(handle)
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('sk-must-not-leak')
  })

  it('popup payload exposes safe aiAssessment fields but no apiKey', async () => {
    const handle = await createTestDb({ seed: false })
    await updateSettings(handle.db, {
      aiAssessment: { enabled: true, provider: 'anthropic', model: 'claude-x' },
    })
    await setAiProviderSecret('anthropic', {
      apiKey: 'sk-ant-must-not-leak',
    })
    const payload = await getPopupPayload(handle)
    expect(payload.settings.aiAssessment).toEqual({
      enabled: true,
      provider: 'anthropic',
      model: 'claude-x',
    })
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('sk-ant-must-not-leak')
  })

  it('dashboard payload exposes safe aiAssessment fields but no apiKey', async () => {
    const handle = await createTestDb({ seed: false })
    await updateSettings(handle.db, {
      aiAssessment: { enabled: true, provider: 'gemini', model: 'gemini-x' },
    })
    await setAiProviderSecret('gemini', {
      apiKey: 'g-must-not-leak',
    })
    const payload = await getDashboardPayload(handle)
    expect(payload.settings.aiAssessment).toEqual({
      enabled: true,
      provider: 'gemini',
      model: 'gemini-x',
    })
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('g-must-not-leak')
  })
})
