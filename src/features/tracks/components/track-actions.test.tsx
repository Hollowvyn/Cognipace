import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { createQueryTestHarness } from '@/testing/query-test-harness'
import { createSerializedTrack } from '@/testing/track-fixtures'

import { TrackActions } from './track-actions'

describe('TrackActions', () => {
  it('explains that reset disables external progress and retains practice history', async () => {
    const user = userEvent.setup()
    const { wrapper } = createQueryTestHarness()
    render(
      <TrackActions
        ariaLabel="Track actions"
        renderEditTrackAction={() => null}
        track={createSerializedTrack({ allowExternalProgress: true })}
      />,
      { wrapper },
    )
    await user.click(screen.getByRole('button', { name: 'Reset Progress' }))
    expect(screen.getByText(/turns off external progress/)).toBeVisible()
    expect(screen.getByText(/practice history is kept/)).toBeVisible()
  })
})
