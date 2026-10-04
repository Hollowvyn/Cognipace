import { RefreshCw } from 'lucide-react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { InlineStatus } from '@/components/ui/inline-status'
import { Surface } from '@/components/ui/surface'
import { DataManagementScreen } from '@/features/backup'

import { useSettingsDraft } from '../hooks/use-settings-draft'
import { useAiConnectionController } from '../hooks/use-ai-connection-controller'
import { useSettingsOperationGate } from '../hooks/use-settings-operation-gate'
import { AdvancedReviewSection } from './sections/advanced-review-section'
import { AiAssessmentSection } from './sections/ai-assessment-section'
import { AppearanceSection } from './sections/appearance-section'
import { DailyPracticeSection } from './sections/daily-practice-section'
import { LeetCodeOverlaySection } from './sections/leetcode-overlay-section'
import { RemindersSection } from './sections/reminders-section'
import { SettingsSaveDock } from './settings-save-bar'
import { SettingsToast } from './settings-toast'

export function SettingsScreen() {
  const gate = useSettingsOperationGate()
  const aiController = useAiConnectionController(gate)
  const controller = useSettingsDraft(gate, aiController.actions.reset)

  if (controller.isInitialLoading) {
    return (
      <Surface className="max-w-[64rem]">
        <InlineStatus>Loading settings…</InlineStatus>
      </Surface>
    )
  }

  if (controller.isError && !controller.draft) {
    return (
      <Surface className="grid max-w-[64rem] gap-3">
        <InlineStatus role="alert" tone="danger">
          {controller.loadError ?? 'Failed to load settings.'}
        </InlineStatus>
        <div>
          <Button
            onClick={controller.actions.retry}
            size="sm"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" />
            Retry
          </Button>
        </div>
      </Surface>
    )
  }

  if (!controller.draft) {
    return null
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (controller.hasValidationErrors) {
      focusFirstInvalidField(event.currentTarget)
      return
    }

    if (!controller.canSave) {
      return
    }

    void controller.actions.save()
  }

  return (
    <div className="grid min-w-0 w-full max-w-[64rem] gap-[var(--cp-surface-gap)]">
      <form
        aria-label="Settings preferences"
        className="grid min-w-0 gap-[var(--cp-surface-gap)]"
        onSubmit={handleSubmit}
      >
        <Surface className="grid p-0">
          <fieldset
            className="min-w-0 border-0 px-4 pb-6 pt-4 md:px-5 lg:px-7"
            disabled={
              gate.activeOperation === 'preferences' ||
              gate.activeOperation === 'reset'
            }
          >
            <AppearanceSection
              actions={controller.actions}
              draft={controller.draft}
            />
            <DailyPracticeSection
              actions={controller.actions}
              draft={controller.draft}
              fieldErrors={controller.fieldErrors}
              numberInputs={controller.numberInputs}
            />
            <LeetCodeOverlaySection
              actions={controller.actions}
              draft={controller.draft}
            />
            <RemindersSection
              actions={{
                setRemindersEnabled: controller.actions.setRemindersEnabled,
                setRemindersTime: controller.actions.setRemindersTime,
              }}
              draft={controller.draft}
            />
            <AdvancedReviewSection
              actions={controller.actions}
              draft={controller.draft}
              fieldErrors={controller.fieldErrors}
              numberInputs={controller.numberInputs}
            />
          </fieldset>
          <SettingsSaveDock
            canDiscard={controller.canDiscard}
            canResetDefaults={
              controller.canResetDefaults ||
              (aiController.hasChanges && !gate.activeOperation)
            }
            canSave={controller.canSave}
            hasChanges={controller.hasChanges}
            hasValidationErrors={controller.hasValidationErrors}
            isResettingDefaults={controller.isResettingDefaults}
            isSaving={controller.isSaving}
            onDiscard={controller.actions.discard}
            onResetDefaults={() => {
              void controller.actions.resetDefaults()
            }}
          />
        </Surface>
        <SettingsToast status={controller.status} />
      </form>
      <form
        aria-label="AI connection"
        onSubmit={(event) => {
          event.preventDefault()
          void aiController.actions.submit()
        }}
      >
        <Surface className="grid">
          <fieldset
            className="min-w-0 border-0 p-0"
            disabled={aiController.isBusy}
          >
            <AiAssessmentSection controller={aiController} />
          </fieldset>
        </Surface>
      </form>
      <DataManagementScreen />
    </div>
  )
}

function focusFirstInvalidField(form: HTMLFormElement) {
  const field = form.querySelector<HTMLElement>('[aria-invalid="true"]')
  field?.focus()
}
