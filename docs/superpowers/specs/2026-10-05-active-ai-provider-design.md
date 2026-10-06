# Explicit active AI provider

The user approved keeping **Test connection** and adding a separate
**Save & make active / Make active** action. Saving may activate automatically;
testing must never save or change the active provider.

## Behavior

- Show the saved active provider and model above the connection editor. Browsing
  providers or editing a draft does not change this summary. A blank saved model
  means no active connection; a missing active key is shown separately.
- **Save & make active** persists an entered key and the selected provider/model,
  without sending a provider request. Disable it when the saved connection is
  unchanged. It does not change assessment enablement.
- **Make active** uses another provider's existing key and the model shown in the
  editor. Keep all other keys. The existing provider model suggestions remain;
  returning to the active provider restores its exact saved model.
- **Test connection** remains a separate button. It tests the saved active
  connection through the existing trusted background service, without writes.
  Unsaved provider/model/key changes must be saved or activated before testing;
  explain this beside the test action. Testing works with assessment off.
- Keep the shared synchronous operation gate, safe errors, stale-test protection,
  key removal, Discard, Reset Defaults, and independent preference saves.

## Ownership and validation

Settings owns the controller and UI. Reuse its existing scoped settings mutation
and GenAI secret mutation. No new database shape, runtime payload, permissions,
provider transport, or per-provider model storage is needed.

Test actual Settings interactions for independent test/save actions, multiple
saved keys, unchanged disabled saves, active summary persistence, failures,
operation races, and remount. Run focused tests, `rtk npm run check`,
`rtk npm run build`, touched-file Prettier, and `rtk git diff --check`.
Capture desktop/mobile production-component proof. Human installed-extension
happy-path and edge-case smoke remains required before PR review or merge.
