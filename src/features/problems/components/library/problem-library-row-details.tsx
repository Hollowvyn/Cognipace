import type { ProblemDataConfirmation } from '../problem-row/use-problem-data-confirmation'
import { useState } from 'react'

import type { ProblemLibraryRow } from '../../api/problems-contracts'
import {
  ProblemRowActionsBar,
  ProblemRowDeleteAction,
  ProblemRowPracticeActions,
  type RenderProblemEditAction,
} from '../problem-row/problem-row-actions'
import { ProblemRowDetails } from '../problem-row/problem-row-details'

export function ProblemLibraryRowDetails({
  confirmation,
  renderEditProblemAction,
  row,
}: {
  confirmation: ProblemDataConfirmation
  renderEditProblemAction: RenderProblemEditAction
  row: ProblemLibraryRow
}) {
  const [isPracticeActionPending, setIsPracticeActionPending] = useState(false)
  const [isDeleteActionPending, setIsDeleteActionPending] = useState(false)

  return (
    <ProblemRowDetails
      actions={
        <ProblemRowActionsBar>
          <ProblemRowPracticeActions
            disabled={isDeleteActionPending}
            onPendingChange={setIsPracticeActionPending}
            confirmation={confirmation}
            renderEditProblemAction={renderEditProblemAction}
            row={row}
          />
          <ProblemRowDeleteAction
            confirmation={confirmation}
            disabled={isPracticeActionPending}
            onPendingChange={setIsDeleteActionPending}
            row={row}
          />
        </ProblemRowActionsBar>
      }
      row={row}
    />
  )
}
