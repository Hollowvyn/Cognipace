import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
import type { AiProviderSecretPresence } from '@/features/genai'
import {
  clearAiProviderSecretRequestSchema,
  setAiProviderSecretRequestSchema,
  testAiConnectionRequestSchema,
} from '@/features/genai/api'
import { createQueryTestHarness } from '@/testing/query-test-harness'

import { settingsUpdateRequestSchema } from '../../api/settings-contracts'
import {
  defaultUserSettings,
  mergeUserSettings,
  type UserSettings,
} from '../../domain'
import { useAiConnectionController } from '../../hooks/use-ai-connection-controller'
import { useSettingsOperationGate } from '../../hooks/use-settings-operation-gate'
import { AiAssessmentSection } from './ai-assessment-section'

vi.mock('@/extension/messaging', () => ({ sendMessage: vi.fn() }))

function renderSection(
  overrides: Partial<UserSettings['aiAssessment']> = {},
  presenceState: 'ready' | 'loading' | 'error' = 'ready',
  presenceOverrides: Partial<AiProviderSecretPresence> = {},
) {
  let stored: UserSettings = {
    ...defaultUserSettings,
    aiAssessment: { ...defaultUserSettings.aiAssessment, ...overrides },
  }
  let presence: AiProviderSecretPresence = {
    openai: false,
    anthropic: false,
    gemini: false,
    openrouter: false,
    ...presenceOverrides,
  }
  vi.mocked(sendMessage).mockImplementation((method, payload) => {
    if (method === 'settings.getSettings') return Promise.resolve(stored)
    if (method === 'genai.getAiProviderSecretPresence') {
      if (presenceState === 'loading') return new Promise(() => undefined)
      if (presenceState === 'error')
        return Promise.reject(new Error('worker unavailable'))
      return Promise.resolve(presence)
    }
    if (method === 'genai.setAiProviderSecret') {
      const request = setAiProviderSecretRequestSchema.parse(payload)
      presence = { ...presence, [request.provider]: true }
      return Promise.resolve(presence)
    }
    if (method === 'genai.clearAiProviderSecret') {
      const request = clearAiProviderSecretRequestSchema.parse(payload)
      presence = { ...presence, [request.provider]: false }
      return Promise.resolve(presence)
    }
    if (method === 'settings.updateSettings') {
      stored = mergeUserSettings(
        stored,
        settingsUpdateRequestSchema.parse(payload).patch,
      )
      return Promise.resolve(stored)
    }
    if (method === 'genai.testConnection') {
      const request = testAiConnectionRequestSchema.parse(payload)
      return Promise.resolve({
        status: 'success',
        provider: request.provider,
        model: request.model,
        durationMs: 1,
      })
    }
    return Promise.reject(new Error(`Unexpected method ${method}`))
  })
  const { wrapper } = createQueryTestHarness()
  function Fixture() {
    const controller = useAiConnectionController(useSettingsOperationGate())
    return (
      <form
        aria-label="AI connection"
        onSubmit={(event) => {
          event.preventDefault()
          void controller.actions.submit()
        }}
      >
        <fieldset disabled={controller.isBusy}>
          <AiAssessmentSection controller={controller} />
        </fieldset>
      </form>
    )
  }
  return render(<Fixture />, { wrapper })
}

beforeEach(() => vi.clearAllMocks())

describe('AiAssessmentSection', () => {
  it('describes automatic code analysis independently of connection testing', async () => {
    renderSection()
    await screen.findByText('No saved key')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'AI assessment details' }))
    expect(
      screen.getByText(
        'When on, CogniPace analyzes completed LeetCode submissions for approach, efficiency, and code style.',
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('switch', { name: 'AI assessment' }),
    ).not.toBeChecked()
  })

  it('renders all providers with a focused connection form', async () => {
    renderSection()
    expect(screen.getByRole('heading', { name: 'AI connection' })).toBeVisible()
    expect(screen.getByRole('radio', { name: 'OpenAI' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Anthropic' })).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Gemini' })).toBeVisible()
    expect(screen.getByRole('radio', { name: 'OpenRouter' })).toBeVisible()
    await screen.findByText('No saved key')
  })

  it('leaves the initial blank model blank and explains the unsaved suggestion', async () => {
    renderSection()
    await screen.findByText('No saved key')
    expect(screen.getByLabelText('Model')).toHaveValue('')
    expect(screen.getByLabelText('Model')).toHaveAttribute(
      'placeholder',
      'gpt-5.4-mini',
    )
    expect(
      screen.getByText(
        'Enter a model to save and test the connection. The suggestion is not saved.',
      ),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Test connection' }),
    ).toBeDisabled()
  })

  it('shows loading independently of a missing key', () => {
    renderSection({ model: 'custom-model' }, 'loading')
    expect(screen.getByText('Loading saved key…')).toBeVisible()
    expect(screen.queryByText('No saved key')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Test connection' }),
    ).toBeDisabled()
  })

  it('shows a recoverable presence error independently of a missing key', async () => {
    renderSection({ model: 'custom-model' }, 'error')
    await screen.findByText('Could not load saved keys.')
    expect(screen.queryByText('No saved key')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Retry saved keys' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Test connection' }),
    ).toBeDisabled()
  })

  it('saves a masked key and model with one connection action then shows verified feedback', async () => {
    renderSection({ model: 'custom-model' })
    await screen.findByText('No saved key')
    const user = userEvent.setup()
    const input = screen.getByLabelText('OpenAI API key')
    expect(input).toHaveAttribute('type', 'password')
    await user.type(input, 'local-key')
    await user.click(
      screen.getByRole('button', { name: 'Save & test connection' }),
    )
    await screen.findByText('Connected to OpenAI · custom-model.')
    expect(sendMessage).toHaveBeenCalledWith('genai.setAiProviderSecret', {
      surface: 'dashboard',
      provider: 'openai',
      secret: { apiKey: 'local-key' },
    })
    expect(input).toHaveValue('')
    expect(
      screen.getByRole('button', { name: 'Test connection' }),
    ).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Remove key' }))
    await screen.findByText('OpenAI key removed.')
    expect(screen.queryByText('Connected to OpenAI · custom-model.')).toBeNull()
    expect(
      screen.getByRole('switch', { name: 'AI assessment' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('provider switching clears typed keys, changes the model, and links Gemini key setup', async () => {
    renderSection({ model: 'custom-model' })
    await screen.findByText('No saved key')
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('OpenAI API key'), 'temporary-key')
    await user.click(screen.getByRole('radio', { name: 'Gemini' }))
    expect(screen.getByLabelText('Gemini API key')).toHaveValue('')
    expect(screen.getByLabelText('Model')).toHaveValue('gemini-3.5-flash-lite')
    expect(
      screen.getByRole('link', { name: 'Get a key in Google AI Studio' }),
    ).toHaveAttribute('href', 'https://aistudio.google.com/apikey')
    await user.click(
      screen.getByRole('button', { name: 'Discard connection changes' }),
    )
    expect(screen.getByLabelText('Model')).toHaveValue('custom-model')
    expect(screen.getByRole('radio', { name: 'OpenAI' })).toBeChecked()
  })

  it('keeps edited fields after a save failure and only shows safe feedback', async () => {
    renderSection({ model: 'custom-model' })
    await screen.findByText('No saved key')
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('OpenAI API key'), 'local-key')
    vi.mocked(sendMessage).mockRejectedValueOnce(
      new Error('private provider details'),
    )
    await user.click(
      screen.getByRole('button', { name: 'Save & test connection' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the connection. Your changes are ready to retry.',
    )
    expect(screen.getByLabelText('OpenAI API key')).toHaveValue('local-key')
  })

  it('freezes every AI control during key persistence', async () => {
    renderSection({ model: 'custom-model' })
    await screen.findByText('No saved key')
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('OpenAI API key'), 'local-key')
    let finish: (() => void) | undefined
    vi.mocked(sendMessage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              openai: true,
              anthropic: false,
              gemini: false,
              openrouter: false,
            })
        }),
    )
    fireEvent.submit(screen.getByRole('form', { name: 'AI connection' }))
    await screen.findByRole('button', { name: 'Saving key…' })
    expect(screen.getByLabelText('Model')).toBeDisabled()
    expect(screen.getByLabelText('OpenAI API key')).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Gemini' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Discard connection changes' }),
    ).toBeDisabled()
    finish?.()
    await screen.findByText('Connected to OpenAI · custom-model.')
  })

  it('suggests the free OpenRouter route, clears an unsaved key, and shows bounded model and routing guidance', async () => {
    renderSection({ model: 'custom-model' })
    await screen.findByText('No saved key')
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('OpenAI API key'), 'unsaved-key')
    await user.click(screen.getByRole('radio', { name: 'OpenRouter' }))
    const model = screen.getByLabelText('Model')
    expect(model).toHaveValue('openrouter/free')
    expect(model).toHaveAttribute('maxLength', '120')
    expect(model).toBeEnabled()
    expect(screen.getByLabelText('OpenRouter API key')).toHaveAttribute(
      'type',
      'password',
    )
    expect(screen.getByLabelText('OpenRouter API key')).toHaveValue('')
    expect(
      screen.getByText(
        'Free models are chosen automatically; quality and response time may vary. Usage limits apply. You can enter a specific free or paid model instead.',
      ),
    ).toBeVisible()
    const keyLink = screen.getByRole('link', {
      name: 'Get an OpenRouter API key',
    })
    expect(keyLink).toHaveAttribute(
      'href',
      'https://openrouter.ai/settings/keys',
    )
    expect(keyLink).toHaveAttribute('target', '_blank')
    expect(keyLink).toHaveAttribute('rel', 'noreferrer')
    const policyLink = screen.getByRole('link', { name: 'data policies' })
    expect(policyLink).toHaveAttribute(
      'href',
      'https://openrouter.ai/docs/guides/privacy/provider-logging',
    )
    expect(policyLink).toHaveAttribute('target', '_blank')
    expect(policyLink).toHaveAttribute('rel', 'noreferrer')
    expect(policyLink.parentElement).toHaveTextContent(
      'OpenRouter forwards your submission code and problem context to a model provider. OpenRouter and provider data policies apply.',
    )
    expect(sendMessage).not.toHaveBeenCalledWith(
      'genai.testConnection',
      expect.anything(),
    )
    expect(
      screen.getByRole('switch', { name: 'AI assessment' }),
    ).not.toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Gemini' }))
    expect(screen.queryByRole('button', { name: 'Use free models' })).toBeNull()
    expect(
      screen.queryByRole('link', { name: 'Get an OpenRouter API key' }),
    ).toBeNull()
    expect(screen.queryByRole('link', { name: 'data policies' })).toBeNull()
  })

  it('restores a custom OpenRouter connection and changes only its draft when Use free models is clicked', async () => {
    renderSection(
      { provider: 'openrouter', model: 'vendor/custom-model:free' },
      'ready',
      { openrouter: true },
    )
    await screen.findByText('Saved key · not tested')
    const user = userEvent.setup()
    expect(screen.getByLabelText('Model')).toHaveValue(
      'vendor/custom-model:free',
    )
    expect(screen.getByLabelText('OpenRouter API key')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    await screen.findByText(
      'Connected to OpenRouter · vendor/custom-model:free.',
    )
    vi.mocked(sendMessage).mockClear()
    await user.click(screen.getByRole('button', { name: 'Use free models' }))
    expect(screen.getByLabelText('Model')).toHaveValue('openrouter/free')
    expect(
      screen.queryByText('Connected to OpenRouter · vendor/custom-model:free.'),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Save & test connection' }),
    ).toBeEnabled()
    expect(
      screen.getByRole('switch', { name: 'AI assessment' }),
    ).not.toBeChecked()
    expect(sendMessage).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Discard connection changes' }),
    )
    expect(screen.getByLabelText('Model')).toHaveValue(
      'vendor/custom-model:free',
    )
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('disables the free preset during key persistence and leaves the captured custom model intact', async () => {
    renderSection({ provider: 'openrouter', model: 'vendor/custom-model' })
    await screen.findByText('No saved key')
    const user = userEvent.setup()
    await user.type(
      screen.getByLabelText('OpenRouter API key'),
      'private-openrouter-key',
    )
    let finish: (() => void) | undefined
    vi.mocked(sendMessage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              openai: false,
              anthropic: false,
              gemini: false,
              openrouter: true,
            })
        }),
    )
    fireEvent.submit(screen.getByRole('form', { name: 'AI connection' }))
    await screen.findByRole('button', { name: 'Saving key…' })
    expect(
      screen.getByRole('button', { name: 'Use free models' }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Use free models' }))
    expect(screen.getByLabelText('Model')).toHaveValue('vendor/custom-model')
    finish?.()
    await screen.findByText('Connected to OpenRouter · vendor/custom-model.')
    expect(
      screen.getByRole('button', { name: 'Use free models' }),
    ).toBeEnabled()
  })
})
