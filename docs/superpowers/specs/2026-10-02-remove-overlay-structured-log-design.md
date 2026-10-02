# Remove overlay structured logs

Approved in chat on 2026-10-02: remove the complete structured-log experience
from the LeetCode overlay while preserving existing saved data.

The overlay retains timing, assessment, submission, rating updates, Help, and
next-problem guidance. Remove Interview Pattern, Time Complexity, Space
Complexity, Languages, Notes, and their field controls. Remove the overlay draft
controller, draft reducer actions/state, dirty tracking, collapse/dock draft
persistence, and log payloads from review saves and overrides.

Practice owns historical logs and keeps its existing database schema, backup
format, and sync behavior. Omitting log patches preserves stored values through
the existing practice repository. Remove the unused standalone log-editing
runtime endpoint and its full implementation chain. Remove the unused AI draft
flag from the internal request contract, fixtures, and tests. Both runtime ends
ship together; no persisted format depends on these removed request fields.

Update product, architecture, and smoke documentation. Automated verification
must cover absent form controls, rating-only updates, no writes on collapse or
dock, payload omission, and preservation of historical logs. Human realtime
happy-path and edge-case Chrome smoke with screenshots remains required before
review or merge.

The user approved applying these ponytail-review findings on 2026-10-02.
Historical planning artifacts remain historical; current authority documents
reflect the final implementation.
