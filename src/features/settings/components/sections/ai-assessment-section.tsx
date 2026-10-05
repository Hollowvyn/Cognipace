import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import type { GenAiProviderId } from '@/features/genai'

import {
  aiProviderLabels,
  aiProviderModelDefaults,
  type AiConnectionController,
} from '../../hooks/use-ai-connection-controller'
import { SegmentedControl, SwitchControl } from '../settings-controls'
import { readSettingsRowLabelId, SettingsRow } from '../settings-row'
import { SettingsSection } from '../settings-section'

const providerOptions: ReadonlyArray<{
  label: string
  value: GenAiProviderId
}> = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'OpenRouter', value: 'openrouter' },
]

const inputClassName =
  'w-full min-w-0 rounded-[var(--cp-control-radius)] border border-border bg-background px-3 py-2 text-[length:var(--cp-copy-font-size)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
const stepLabels = {
  'saving-key': 'Saving key…',
  'saving-settings': 'Saving configuration…',
  testing: 'Testing connection…',
  'removing-key': 'Removing key…',
  'saving-assessment': 'Saving assessment…',
}

export function AiAssessmentSection({
  controller,
}: {
  controller: AiConnectionController
}) {
  const { provider, model, actions } = controller
  return (
    <SettingsSection id="ai-assessment-settings" title="AI connection">
      <SettingsRow
        controlClassName="w-full md:max-w-[34rem]"
        id="ai-provider-row"
        label="Provider"
      >
        <SegmentedControl
          ariaLabelledBy={readSettingsRowLabelId('ai-provider-row')}
          label="Provider"
          name="ai-provider"
          onChange={actions.setProvider}
          options={providerOptions}
          value={provider}
        />
      </SettingsRow>
      <SettingsRow
        controlClassName="w-full md:max-w-[34rem]"
        id="ai-model-row"
        label="Model"
        labelFor="ai-model"
      >
        <div className="grid gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              className={`${inputClassName} flex-1 basis-48`}
              id="ai-model"
              maxLength={120}
              onChange={(event) => actions.setModel(event.currentTarget.value)}
              placeholder={aiProviderModelDefaults[provider]}
              spellCheck={false}
              type="text"
              value={model}
            />
            {provider === 'openrouter' ? (
              <Button
                disabled={controller.isBusy}
                onClick={() => actions.setModel('openrouter/free')}
                size="sm"
                type="button"
                variant="outline"
              >
                Use free models
              </Button>
            ) : null}
          </div>
          {model.trim() === '' ? (
            <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
              Enter a model to save and test the connection. The suggestion is
              not saved.
            </p>
          ) : null}
          {provider === 'openrouter' ? (
            <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
              Free models are chosen automatically; quality and response time
              may vary. Usage limits apply. You can enter a specific free or
              paid model instead.
            </p>
          ) : null}
        </div>
      </SettingsRow>
      <SettingsRow
        controlClassName="w-full md:max-w-[34rem]"
        hint="Stored locally. Not synced. Sent only to the selected provider."
        id="ai-key-row"
        label={`${aiProviderLabels[provider]} API key`}
        labelFor="ai-key"
      >
        <div className="grid min-w-0 gap-2">
          <input
            autoComplete="new-password"
            className={inputClassName}
            id="ai-key"
            onChange={(event) => actions.setKeyInput(event.currentTarget.value)}
            placeholder={
              controller.hasKey
                ? 'Saved key; enter a new key to replace'
                : 'Enter key'
            }
            spellCheck={false}
            type="password"
            value={controller.keyInput}
          />
          {provider === 'gemini' ? (
            <a
              className="w-fit text-[length:var(--cp-copy-font-size)] text-primary underline underline-offset-4"
              href="https://aistudio.google.com/apikey"
              rel="noreferrer"
              target="_blank"
            >
              Get a key in Google AI Studio
            </a>
          ) : null}
          {provider === 'openrouter' ? (
            <>
              <a
                className="w-fit text-[length:var(--cp-copy-font-size)] text-primary underline underline-offset-4"
                href="https://openrouter.ai/settings/keys"
                rel="noreferrer"
                target="_blank"
              >
                Get an OpenRouter API key
              </a>
              <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
                OpenRouter forwards your submission code and problem context to
                a model provider. OpenRouter and provider{' '}
                <a
                  className="text-primary underline underline-offset-4"
                  href="https://openrouter.ai/docs/guides/privacy/provider-logging"
                  rel="noreferrer"
                  target="_blank"
                >
                  data policies
                </a>{' '}
                apply.
              </p>
            </>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge>{controller.connectionStatus}</Badge>
            {controller.presenceError ? (
              <Button
                onClick={actions.retryPresence}
                size="sm"
                type="button"
                variant="outline"
              >
                Retry saved keys
              </Button>
            ) : null}
            {controller.hasKey ? (
              <Button
                disabled={controller.isBusy}
                onClick={() => {
                  void actions.clearKey()
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Remove key
              </Button>
            ) : null}
          </div>
        </div>
      </SettingsRow>
      <SettingsRow
        controlClassName="w-full md:max-w-[34rem]"
        id="ai-actions-row"
        label="Connection test"
      >
        <div className="grid gap-2">
          <p className="m-0 text-[length:var(--cp-copy-font-size)] text-muted-foreground">
            Sends one small request to the saved provider and model. Testing
            works while AI assessment is off.
          </p>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button disabled={!controller.canSubmit} size="sm" type="submit">
              {controller.step
                ? stepLabels[controller.step]
                : controller.hasChanges
                  ? 'Save & test connection'
                  : 'Test connection'}
            </Button>
            {controller.hasChanges ? (
              <Button
                disabled={controller.isBusy}
                onClick={actions.discard}
                size="sm"
                type="button"
                variant="ghost"
              >
                Discard connection changes
              </Button>
            ) : null}
          </div>
          {controller.feedback ? (
            <InlineStatus
              aria-label="AI connection feedback"
              role={controller.feedback.tone === 'danger' ? 'alert' : 'status'}
              tone={controller.feedback.tone}
            >
              {controller.feedback.message}
            </InlineStatus>
          ) : null}
        </div>
      </SettingsRow>
      <SettingsRow
        controlClassName="w-full md:max-w-28"
        hint="When on, CogniPace analyzes completed LeetCode submissions for approach, efficiency, and code style."
        id="ai-enabled-row"
        label="AI assessment"
        labelFor="ai-enabled"
      >
        <SwitchControl
          ariaLabelledBy={readSettingsRowLabelId('ai-enabled-row')}
          checked={controller.enabled}
          disabled={
            controller.isBusy ||
            (!controller.enabled && !controller.canEnableAssessment)
          }
          disabledReason={
            controller.isBusy
              ? 'Wait for the current settings operation.'
              : controller.assessmentDisabledReason
          }
          id="ai-enabled"
          onChange={(enabled) => {
            void actions.setAssessmentEnabled(enabled)
          }}
        />
      </SettingsRow>
    </SettingsSection>
  )
}
