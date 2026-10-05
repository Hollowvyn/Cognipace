# CogniPace Privacy Policy

Effective date: October 5, 2026

CogniPace is a local-first Chrome extension for planning and recording deliberate LeetCode practice. This policy explains what information the extension handles, why it handles it, and the optional third-party services a user can choose to connect.

## Summary

- CogniPace does not operate a hosted application backend.
- Core problem, practice, review, track, settings, and analytics data stays in the user's Chrome browser profile.
- CogniPace does not contain developer-operated analytics, advertising, or tracking.
- CogniPace does not sell personal information.
- GitHub Gist sync and AI assessments are optional and use credentials supplied by the user.

## Information CogniPace Handles

### Local study data

CogniPace stores its problem catalog, practice records, review schedules, recall ratings, study tracks, settings, derived analytics, backup metadata, and sync status in the extension's local browser storage.

### LeetCode page and submission data

On supported LeetCode problem pages, CogniPace may read the problem URL and slug, title, difficulty, topic labels, problem statement, editor language, solution code, submission status, runtime, memory result, passed and total test counts, failure diagnostics, and timing needed for the user-facing practice and review workflow. CogniPace does not monitor unrelated websites.

### GitHub Gist sync data

If the user enables GitHub Gist sync, CogniPace stores the user-provided GitHub token locally, calls GitHub to validate it, reads the associated GitHub login, and transfers a CogniPace backup envelope to or from a Gist. New Gists created by CogniPace are private; if the user connects an existing Gist, its existing visibility may be public or private and remains governed by the user's GitHub settings. Gist content and retention are also governed by the user's GitHub account and GitHub's policies.

### Optional AI assessment data

CogniPace stores the user's selected-provider API key in trusted local extension
storage. The user can choose OpenAI, Anthropic, Google Gemini, or OpenRouter.
Saving and testing a connection sends a small structured verification request
even while AI assessment is disabled. Connection testing does not send a
submission's solution code or enable assessment.

When the user enables AI assessment, completed-submission analysis sends the
problem slug, title, difficulty, topics, statement, examples, constraints,
follow-ups, submission status, language/version, runtime, memory result, test
counts, solution code, and bounded failure diagnostics to the selected service.
OpenRouter forwards code and problem context to a model provider. OpenRouter
and the serving provider's terms, data policies, and account privacy settings
govern that processing. The app does not override OpenRouter account privacy
routing settings. See [OpenRouter provider data policies](https://openrouter.ai/docs/guides/privacy/provider-logging).

Provider retention varies by provider policy and settings. CogniPace does not
persist raw provider payloads or analysis reports in the app database, backups,
or sync. Reports remain in the active analysis session. Analysis does not save
a review automatically; the local workflow stores only review information the
user separately chooses to save. API keys are excluded from backups, sync,
logs, query caches, and returned runtime data.

## How Information Is Used

CogniPace uses this information only to provide the extension's study, practice, review scheduling, backup/restore, optional sync, and optional AI assessment functions. It is not used for advertising, credit decisions, lending, or sale to data brokers.

## Storage, Transfer, and Sharing

Core data is processed locally in the browser. Information leaves the browser only when needed for a user-selected function:

- LeetCode requests support the problem-page and submission workflow and may include browser credentials or session cookies through the authenticated user workflow; these requests are sent only to LeetCode.
- GitHub requests validate a user-supplied token and perform optional Gist sync.
- AI-service requests perform user-requested connection tests or enabled code
  analysis using the user's selected provider and API key. OpenRouter forwards
  analysis input to the serving model provider under the applicable policies.

CogniPace does not send this information to a CogniPace-operated server. It does not share information with independent advertisers or analytics providers.
Raw GitHub tokens and AI-provider API keys are kept in local extension storage. They are excluded from CogniPace backup files, Gist sync envelopes, logs, and user-interface status payloads.

## Retention and Deletion

Local information remains in the browser profile until the user changes or clears it, restores another backup, removes the extension and its associated browser data, or the browser removes that data.
The Settings page provides backup export, backup restore, and local-data clear controls. The local-data clear control resets local study and database data; it does not clear GitHub or AI-provider secrets stored separately in `chrome.storage.local` or sync metadata. Those secrets require their separate removal or revocation controls, or extension-data removal where applicable. Because backups intentionally exclude credentials, GitHub and AI-provider secrets must be re-entered after moving to another extension installation.
Deleting local data does not delete information already sent to an optional third-party service. Users must manage Gist visibility and delete Gists through GitHub, and manage provider-side assessment data through the selected AI provider.

## Security

CogniPace limits its Chrome permissions and remote hosts to the functions described above and does not load remote executable code. No storage or transmission method can guarantee absolute security, so users should protect their browser profile and revoke a GitHub token or AI-provider key if they believe it has been exposed.

## Changes to This Policy

Material changes to CogniPace data handling will be reflected in this policy and in the Chrome Web Store privacy disclosures before the changed behavior is released.

## Contact

For privacy questions or support, open an issue at https://github.com/Hollowvyn/CogniPace/issues.
