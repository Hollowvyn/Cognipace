import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendMessage } from '@/extension/messaging'
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
) {
  let stored: UserSettings = {
    ...defaultUserSettings,
    aiAssessment: { ...defaultUserSettings.aiAssessment, ...overrides },
  }
  let presence = { openai: false, anthropic: false, gemini: false }
  vi.mocked(sendMessage).mockImplementation((method, payload) => {
    if (method === 'settings.getSettings') return Promise.resolve(stored)
    if (method === 'genai.getAiProviderSecretPresence') {
      if (presenceState === 'loading') return new Promise(() => undefined)
      if (presenceState === 'error')
        return Promise.reject(new Error('worker unavailable'))
      return Promise.resolve(presence)
    }
    if (method === 'genai.setAiProviderSecret') {
      presence = { ...presence, openai: true }
      return Promise.resolve(presence)
    }
    if (method === 'genai.clearAiProviderSecret') {
      presence = { ...presence, openai: false }
      return Promise.resolve(presence)
    }
    if (method === 'settings.updateSettings') {
      stored = mergeUserSettings(
        stored,
        settingsUpdateRequestSchema.parse(payload).patch,
      )
      return Promise.resolve(stored)
    }
    if (method === 'genai.testConnection')
      return Promise.resolve({
        status: 'success',
        provider: 'openai',
        model: 'custom-model',
        durationMs: 1,
      })
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
  it('renders all providers with a focused connection form', async () => {
    renderSection()
    expect(screen.getByRole('heading', { name: 'AI connection' })).toBeVisible()
    expect(screen.getByRole('radio', { name: 'OpenAI' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Anthropic' })).toBeVisible()
    expect(screen.getByRole('radio', { name: 'Gemini' })).toBeVisible()
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
            resolve({ openai: true, anthropic: false, gemini: false })
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
})
