# Remove overlay structured logs

Approved in chat on 2026-10-02: remove the complete structured-log experience
from the LeetCode overlay while preserving existing saved data.

The overlay retains timing, assessment, submission, rating updates, Help, and
next-problem guidance. Remove Interview Pattern, Time Complexity, Space
Complexity, Languages, Notes, and their field controls. Remove the overlay draft
controller, draft reducer actions/state, dirty tracking, collapse/dock draft
persistence, and log payloads from review saves and overrides.

Practice owns historical logs and keeps its existing database schema, runtime
contracts, backup format, and sync behavior. Omitting log patches preserves
stored values through the existing practice repository. Keep the AI request's
legacy `currentDraftHasChanges` boolean as `false` for contract compatibility;
the overlay no longer holds editable log state.

Update product, architecture, and smoke documentation. Automated verification
must cover absent form controls, rating-only updates, no writes on collapse or
dock, payload omission, and preservation of historical logs. Human realtime
happy-path and edge-case Chrome smoke with screenshots remains required before
review or merge.
