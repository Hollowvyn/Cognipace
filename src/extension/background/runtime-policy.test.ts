import { describe, expect, it } from 'vitest'

import { protocolMethodNames } from '@/extension/messaging'

import {
  assertCanCallExtensionMethod,
  assertCanSenderCallExtensionMethod,
  canCallExtensionMethod,
  extensionMethodNames,
  getMessageSenderSurface,
  isExtensionMethod,
} from './runtime-policy'
import { getAppShellRuntimeSurface } from './register-handlers'

describe('runtime-policy', () => {
  it('keeps protocol methods covered by runtime sender policy', () => {
    expect([...extensionMethodNames].sort()).toEqual(
      [...protocolMethodNames].sort(),
    )
  })

  it('allows popup shell data reads', () => {
    expect(canCallExtensionMethod('app.getShellData', 'popup')).toBe(true)
  })

  it('allows dashboard senders to read analytics summary', () => {
    expect(canCallExtensionMethod('analytics.getSummary', 'dashboard')).toBe(
      true,
    )
    expect(canCallExtensionMethod('analytics.getSummary', 'popup')).toBe(false)
    expect(
      canCallExtensionMethod('analytics.getSummary', 'content-script'),
    ).toBe(false)
  })

  it('keeps dev smoke dashboard-only', () => {
    expect(canCallExtensionMethod('devSmoke.run', 'dashboard')).toBe(true)
    expect(canCallExtensionMethod('devSmoke.run', 'popup')).toBe(false)
    expect(canCallExtensionMethod('devSmoke.run', 'content-script')).toBe(false)
    expect(canCallExtensionMethod('devSmoke.run', 'background')).toBe(false)
  })

  it('allows content scripts to read overlay app-shell data', () => {
    expect(canCallExtensionMethod('app.getShellData', 'content-script')).toBe(
      true,
    )
  })

  it('allows content scripts to ask the background to open dashboard pages', () => {
    expect(canCallExtensionMethod('app.openDashboard', 'content-script')).toBe(
      true,
    )
    expect(canCallExtensionMethod('app.openDashboard', 'dashboard')).toBe(false)
    expect(canCallExtensionMethod('app.openDashboard', 'popup')).toBe(false)
  })

  it('maps overlay app-shell requests to the content-script runtime surface', () => {
    expect(getAppShellRuntimeSurface({ surface: 'overlay' })).toBe(
      'content-script',
    )
    expect(
      getAppShellRuntimeSurface({
        surface: 'overlay',
        problemSlug: 'two-sum',
      }),
    ).toBe('content-script')
  })

  it('rejects unknown methods', () => {
    expect(isExtensionMethod('unknown.method')).toBe(false)
    expect(canCallExtensionMethod('unknown.method', 'popup')).toBe(false)
  })

  it('throws for unauthorized surfaces', () => {
    expect(() =>
      assertCanCallExtensionMethod('app.getShellData', 'background'),
    ).toThrow(/not allowed/)
  })

  it('resolves extension page surfaces from sender URLs', () => {
    expect(
      getMessageSenderSurface({
        url: 'chrome-extension://extension-id/popup.html',
      }),
    ).toBe('popup')

    expect(
      getMessageSenderSurface({
        url: 'chrome-extension://extension-id/dashboard.html',
      }),
    ).toBe('dashboard')
  })

  it('resolves content scripts from tab-backed senders', () => {
    expect(
      getMessageSenderSurface({
        tab: { id: 7 },
        url: 'https://leetcode.com/problems/two-sum/',
      }),
    ).toBe('content-script')
  })

  it('prefers extension page URLs over tab presence for dashboard pages', () => {
    expect(
      getMessageSenderSurface({
        tab: { id: 7 },
        url: 'chrome-extension://extension-id/dashboard.html',
      }),
    ).toBe('dashboard')
  })

  it('does not classify tab-backed web dashboard paths as extension pages', () => {
    const sender = {
      tab: { id: 7 },
      url: 'https://leetcode.com/problems/dashboard.html',
    }

    expect(getMessageSenderSurface(sender)).toBe('content-script')
    expect(() =>
      assertCanSenderCallExtensionMethod(
        'backup.resetLocalData',
        'dashboard',
        sender,
      ),
    ).toThrow(/cannot claim/)
  })

  it('rejects content scripts claiming privileged extension surfaces', () => {
    expect(() =>
      assertCanSenderCallExtensionMethod('settings.updateSettings', 'popup', {
        tab: { id: 7 },
        url: 'https://leetcode.com/problems/two-sum/',
      }),
    ).toThrow(/cannot claim/)
  })

  it('allows dashboard senders to update settings', () => {
    expect(() =>
      assertCanSenderCallExtensionMethod(
        'settings.updateSettings',
        'dashboard',
        {
          url: 'chrome-extension://extension-id/dashboard.html',
        },
      ),
    ).not.toThrow()
  })

  it('keeps Library problem management dashboard-only', () => {
    expect(canCallExtensionMethod('problems.getLibrary', 'dashboard')).toBe(
      true,
    )
    expect(canCallExtensionMethod('problems.createProblem', 'dashboard')).toBe(
      true,
    )
    expect(
      canCallExtensionMethod('problems.bulkUpdateProblems', 'dashboard'),
    ).toBe(true)
    expect(
      canCallExtensionMethod('problems.getLibrary', 'content-script'),
    ).toBe(false)
    expect(canCallExtensionMethod('problems.deleteProblem', 'popup')).toBe(
      false,
    )
  })

  it('keeps track management methods dashboard-only', () => {
    for (const method of [
      'tracks.getWorkspace',
      'tracks.getTrackForEdit',
      'tracks.setActiveTrack',
      'tracks.setActiveGroup',
      'tracks.clearActiveTrack',
      'tracks.createTrack',
      'tracks.updateTrack',
      'tracks.deleteTrack',
      'tracks.resetTrackProgress',
    ]) {
      expect(canCallExtensionMethod(method, 'dashboard')).toBe(true)
      expect(canCallExtensionMethod(method, 'popup')).toBe(false)
      expect(canCallExtensionMethod(method, 'content-script')).toBe(false)
    }
  })

  it('keeps content import methods dashboard-only and rejects forged senders', () => {
    for (const method of [
      'imports.preview',
      'imports.apply',
      'imports.retryPersistence',
    ]) {
      expect(canCallExtensionMethod(method, 'dashboard')).toBe(true)
      expect(canCallExtensionMethod(method, 'popup')).toBe(false)
      expect(canCallExtensionMethod(method, 'content-script')).toBe(false)

      expect(() =>
        assertCanSenderCallExtensionMethod(method, 'dashboard', {
          url: 'chrome-extension://extension-id/popup.html',
        }),
      ).toThrow(/cannot claim/)
      expect(() =>
        assertCanSenderCallExtensionMethod(method, 'dashboard', {
          tab: { id: 7 },
          url: 'https://leetcode.com/problems/two-sum/',
        }),
      ).toThrow(/cannot claim/)
    }
  })

  it('keeps backup and local reset methods dashboard-only', () => {
    for (const method of [
      'backup.exportFullBackup',
      'backup.validateFullBackup',
      'backup.restoreFullBackup',
      'backup.resetLocalData',
    ]) {
      expect(canCallExtensionMethod(method, 'dashboard')).toBe(true)
      expect(canCallExtensionMethod(method, 'popup')).toBe(false)
      expect(canCallExtensionMethod(method, 'content-script')).toBe(false)
    }
  })

  it('allows sync status reads from every UI surface', () => {
    for (const surface of ['popup', 'dashboard', 'content-script'] as const) {
      expect(canCallExtensionMethod('sync.getStatus', surface)).toBe(true)
    }
  })

  it('allows safe sync open checks from every UI surface', () => {
    for (const method of [
      'sync.checkRemoteOnOpen',
      'sync.requestOpenCheck',
    ] as const) {
      for (const surface of ['popup', 'dashboard', 'content-script'] as const) {
        expect(canCallExtensionMethod(method, surface)).toBe(true)
      }
    }
  })

  it('keeps privileged sync writes dashboard-only', () => {
    for (const method of [
      'sync.validateGithubToken',
      'sync.validateStoredGithubToken',
      'sync.saveGithubToken',
      'sync.deleteGithubToken',
      'sync.createGithubGist',
      'sync.connectGithubGist',
      'sync.setEnabled',
      'sync.pullLatest',
      'sync.pushLocal',
    ]) {
      expect(canCallExtensionMethod(method, 'dashboard')).toBe(true)
      expect(canCallExtensionMethod(method, 'popup')).toBe(false)
      expect(canCallExtensionMethod(method, 'content-script')).toBe(false)
    }
  })

  it('does not expose removed sync runtime methods', () => {
    for (const method of [
      'sync.syncNow',
      'sync.resolveConflict',
      'sync.checkOnOpen',
    ]) {
      expect(isExtensionMethod(method)).toBe(false)
      expect(canCallExtensionMethod(method, 'dashboard')).toBe(false)
    }
  })

  it('allows popup and dashboard senders to update study mode', () => {
    expect(canCallExtensionMethod('settings.toggleStudyMode', 'popup')).toBe(
      true,
    )
    expect(
      canCallExtensionMethod('settings.toggleStudyMode', 'dashboard'),
    ).toBe(true)
  })

  it('allows dashboard senders to cycle theme mode', () => {
    expect(canCallExtensionMethod('settings.cycleThemeMode', 'dashboard')).toBe(
      true,
    )
    expect(canCallExtensionMethod('settings.cycleThemeMode', 'popup')).toBe(
      false,
    )
    expect(
      canCallExtensionMethod('settings.cycleThemeMode', 'content-script'),
    ).toBe(false)
  })

  it('rejects content scripts for settings reads and writes', () => {
    expect(
      canCallExtensionMethod('settings.getSettings', 'content-script'),
    ).toBe(false)
    expect(
      canCallExtensionMethod('settings.updateSettings', 'content-script'),
    ).toBe(false)
    expect(
      canCallExtensionMethod('settings.toggleStudyMode', 'content-script'),
    ).toBe(false)
    expect(
      canCallExtensionMethod('settings.cycleThemeMode', 'content-script'),
    ).toBe(false)
  })

  describe('genai method surface enforcement', () => {
    it('allows popup and dashboard to call genai secret methods', () => {
      for (const method of [
        'genai.getAiProviderSecretPresence',
        'genai.setAiProviderSecret',
        'genai.clearAiProviderSecret',
      ] as const) {
        expect(canCallExtensionMethod(method, 'popup')).toBe(true)
        expect(canCallExtensionMethod(method, 'dashboard')).toBe(true)
      }
    })

    it('blocks content-script and background from calling genai secret methods', () => {
      for (const method of [
        'genai.getAiProviderSecretPresence',
        'genai.setAiProviderSecret',
        'genai.clearAiProviderSecret',
      ] as const) {
        expect(canCallExtensionMethod(method, 'content-script')).toBe(false)
        expect(canCallExtensionMethod(method, 'background')).toBe(false)
      }
    })

    it('allows only content-script to call genai.recommendLeetCodeAssessment', () => {
      expect(
        canCallExtensionMethod(
          'genai.recommendLeetCodeAssessment',
          'content-script',
        ),
      ).toBe(true)
      expect(
        canCallExtensionMethod('genai.recommendLeetCodeAssessment', 'popup'),
      ).toBe(false)
      expect(
        canCallExtensionMethod(
          'genai.recommendLeetCodeAssessment',
          'dashboard',
        ),
      ).toBe(false)
      expect(
        canCallExtensionMethod(
          'genai.recommendLeetCodeAssessment',
          'background',
        ),
      ).toBe(false)
    })
  })

  it('allows content scripts to use practice controls for the current problem', () => {
    expect(() =>
      assertCanSenderCallExtensionMethod(
        'practice.setSuspended',
        'content-script',
        {
          tab: { id: 7 },
          url: 'https://leetcode.com/problems/two-sum/',
        },
      ),
    ).not.toThrow()
    expect(() =>
      assertCanSenderCallExtensionMethod(
        'practice.resetSchedule',
        'content-script',
        {
          tab: { id: 7 },
          url: 'https://leetcode.com/problems/two-sum/',
        },
      ),
    ).not.toThrow()
    expect(() =>
      assertCanSenderCallExtensionMethod(
        'practice.updateCurrentLog',
        'content-script',
        {
          tab: { id: 7 },
          url: 'https://leetcode.com/problems/two-sum/',
        },
      ),
    ).not.toThrow()
  })
})
