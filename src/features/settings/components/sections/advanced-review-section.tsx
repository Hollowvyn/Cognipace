import type { UserSettings } from '../../domain'
import type {
  SettingsDraftActions,
  SettingsFieldErrors,
  SettingsNumberInputs,
} from '../../hooks/use-settings-draft'
import {
  NumberControl,
  RetentionSlider,
  SwitchControl,
} from '../settings-controls'
import { readSettingsRowLabelId, SettingsRow } from '../settings-row'
import { SettingsSection } from '../settings-section'

interface AdvancedReviewSectionProps {
  actions: Pick<
    SettingsDraftActions,
    'setNumberInput' | 'setStrictTiming' | 'setTargetRetention'
  >
  draft: UserSettings
  fieldErrors: SettingsFieldErrors
  numberInputs: SettingsNumberInputs
}

export function AdvancedReviewSection({
  actions,
  draft,
  fieldErrors,
  numberInputs,
}: AdvancedReviewSectionProps) {
  const isStrictTimingDisabled = !draft.assessment.requireSolveTime
  const targetRetentionHint =
    'This is an FSRS model target, not a guarantee of coding success or interview readiness. It applies to your next review; existing due dates stay unchanged. The configured 180-day maximum can yield native 181–183-day intervals after rating ordering.'
  const strictTimingHint =
    'Requires solve time; over-time accepted solutions are saved as Again.'
  const timingTargetsHint =
    'Set target minutes by difficulty; keep easy below medium below hard.'

  return (
    <SettingsSection id="advanced-review-settings" title="Review & Timing">
      <SettingsRow
        controlClassName="w-full md:max-w-[34rem]"
        hint={targetRetentionHint}
        id="target-retention-row"
        label="Target retention"
        labelFor="target-retention"
      >
        <RetentionSlider
          id="target-retention"
          onChange={actions.setTargetRetention}
          value={draft.review.targetRetention}
        />
      </SettingsRow>
      <SettingsRow
        controlClassName="w-full md:max-w-28"
        hint={strictTimingHint}
        id="strict-timing-row"
        label="Strict timing"
        labelFor="strict-timing"
      >
        <SwitchControl
          ariaLabelledBy={readSettingsRowLabelId('strict-timing-row')}
          checked={draft.assessment.strictTiming}
          disabled={isStrictTimingDisabled}
          disabledReason="Enable Require solve time before using strict timing."
          id="strict-timing"
          onChange={actions.setStrictTiming}
        />
      </SettingsRow>
      <SettingsRow
        controlClassName="w-fit max-w-full"
        hint={timingTargetsHint}
        id="timing-targets-row"
        label="Timing targets"
      >
        <TimingTargetsControl
          actions={actions}
          fieldErrors={fieldErrors}
          numberInputs={numberInputs}
        />
      </SettingsRow>
    </SettingsSection>
  )
}

const timingTargetFields = [
  {
    errorKey: 'easyTargetMinutes',
    id: 'easy-target-minutes',
    label: 'Easy',
  },
  {
    errorKey: 'mediumTargetMinutes',
    id: 'medium-target-minutes',
    label: 'Medium',
  },
  {
    errorKey: 'hardTargetMinutes',
    id: 'hard-target-minutes',
    label: 'Hard',
  },
] as const

interface TimingTargetsControlProps {
  actions: Pick<SettingsDraftActions, 'setNumberInput'>
  fieldErrors: SettingsFieldErrors
  numberInputs: SettingsNumberInputs
}

function TimingTargetsControl({
  actions,
  fieldErrors,
  numberInputs,
}: TimingTargetsControlProps) {
  return (
    <div className="grid w-fit max-w-full grid-cols-3 gap-2 sm:gap-3">
      {timingTargetFields.map((field) => {
        const error = fieldErrors[field.errorKey]
        const errorId = `${field.id}-error`

        return (
          <NumberControl
            className="w-20 md:w-20"
            error={error}
            errorMessageId={errorId}
            id={field.id}
            key={field.id}
            label={field.label}
            max={60}
            min={10}
            onChange={(value) => {
              actions.setNumberInput(field.errorKey, value)
            }}
            value={numberInputs[field.errorKey]}
          />
        )
      })}
    </div>
  )
}
