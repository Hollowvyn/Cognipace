# Remove from track

Approved in chat on October 1, 2026.

Add a small ghost “Remove from track” button immediately after Edit in the
expanded track problem footer. Use the existing red destructive text/hover styling
and a decorative ListMinus icon. Clicking removes the current track membership
without an extra confirmation. Keep the problem, practice data, review history,
and memberships in other tracks. Track-specific completion follows existing
membership deletion semantics. Preserve empty groups and compact remaining order.

Use a dashboard-only, Zod-validated runtime mutation through the Tracks service
and repository. Perform deletion and ordering in a transaction, then flush and
invalidate tracks and problems using existing mutation infrastructure. Disable
the removal button and practice actions while saving; show inline failure text
and allow retry. No schema, permission, or sync feature changes.

Alternative: load and save the entire track through its existing edit API. A
focused membership mutation is preferable because it avoids overwriting other
track edits. Confirmation is unnecessary for this quick, editable action.

Verify component success/failure/pending behavior, repository isolation and empty
groups, contracts, runtime authorization, and mutation persistence/invalidation.
Run focused tests, npm run lint, npm run check, npm run build, and npm run format.
Human smoke and screenshot proof remain required before review or merge.
