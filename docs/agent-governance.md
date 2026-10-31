# Agent Governance

This document is the canonical operating contract for AI-assisted CogniPace
work across Codex, Claude, and future agents. Root tool files such as
`AGENTS.md` and `CLAUDE.md` are entrypoints; this file owns the full lifecycle,
validation, PR, issue, commit, release, and smoke expectations.

## Authority

Current authority, in order of relevance:

- `docs/product.md`: product behavior, scope, non-goals, and future candidates.
- `docs/architecture.md`: source layout, runtime boundaries, data flow, and
  change recipes.
- `docs/testing.md`: manual smoke flows and validation expectations.
- `design.md`: visual and interaction direction.
- `CONTRIBUTING.md`: contribution, review, validation, and release expectations.
- `AGENTS.md`: Codex-facing root operating guide.
- `CLAUDE.md`: Claude-facing root operating guide.
- `.agents/skills/cognipace-agent-workflow/SKILL.md`: CogniPace workflow,
  validation, PR/issue, governance, and agent-process routing skill.
- `.agents/skills/cognipace-autonomous-workflow/SKILL.md`: explicit autonomous
  mode selector for the shared workflow.
- `.agents/skills/cognipace-bulletproof-react/SKILL.md`: CogniPace architecture
  ownership lens.
- `docs/superpowers/README.md`: planning artifact index and historical context.

Planning artifacts under `docs/superpowers/*` are useful history. They do not
override current product, architecture, testing, design, contribution, or root
agent docs unless a current doc explicitly says otherwise.

## Workflow Modes

### Selection And Routine Checkpoints

Collaborative mode is the default. Use `cognipace-agent-workflow` as the shared
repo-local router before domain or implementation skills; the autonomous
selector loads it immediately when explicitly invoked. With no explicit mode
selection, the shared router is the collaborative entry skill. Explicit invocation of
`cognipace-autonomous-workflow`, or an explicit user request for autonomous
mode, selects autonomous execution for the current task, its phases, and its
subagents. Pass the selected mode and authorized scope to delegated agents.
Re-entering the shared router does not reset the mode. Honor later explicit
switches. Urgency, "fix it," ordinary implementation requests, or merely
mentioning subagents do not select autonomy.

In collaborative mode, use `superpowers:brainstorming`, obtain human approval
of the substantial design, and record a phase-sized plan before implementation.
In explicitly selected autonomous mode, use the lifecycle below instead of
generic skills' routine human approval, artifact-review, execution-choice, and
phase-handoff prompts. Develop alternatives and record the design and plan;
independent agent acceptance replaces routine human design approval within the
authorized task. Continue through accepted phases without asking the user to
approve each artifact or choose an execution method. Existing explicit human
approval remains valid in either mode; do not request it again.

Mode switches apply to unfinished work. Preserve completed work and prior human
approvals; independent agent acceptance is not human approval. After switching
to collaborative mode, obtain any missing human design approval before
implementing or resuming an unfinished substantial design or phase.

This override applies only to routine workflow checkpoints. Both modes retain
scope, safety, permissions, independent review when required, validation, and
human smoke gates. Mode selection alone does not authorize unrelated work,
destructive actions, external publication, merge, deployment, or release.
Account, auth, backend, team, hosted-service, generic SaaS, sync expansion,
Chrome permission, and secret-handling changes still require explicit approval
for that scope. Use an in-scope solution when available; prior specific approval
does not need repeating.

### Autonomous Execution

1. Orient using the required lifecycle below, inspect the checkout, and state
   the authorized scope and acceptance criteria. The branch/worktree guard
   applies in both modes; autonomy never authorizes overwriting, stashing, or
   carrying unrelated user changes into the task.
2. Develop alternatives internally and record the recommended design,
   assumptions, ownership, risks, and a phase-sized implementation plan with
   exact files, validation, and done-when criteria. Prefer current product and
   architecture patterns for reversible choices.
3. Before implementation, obtain an independent read-only subagent's acceptance
   of both design and plan against user intent and current authority. Resolve
   actionable findings and re-review before proceeding. The design/plan author
   cannot supply this independent acceptance.
4. Delegate bounded implementation with explicit read/write ownership. Parallel
   tasks must have disjoint files and no shared mutation; dependent work runs
   sequentially. The coordinator integrates results and owns final verification.
5. For each phase, obtain independent read-only spec-compliance review first,
   then a separate implementation-quality review after spec compliance passes.
   Implementers cannot approve their own work. Fix actionable findings and
   re-review affected work before continuing. Passing checks do not replace
   either review.
6. Run validation selected from the unchanged canonical matrix, inspect every
   result, and fix regressions. Implementation changes made during validation
   must return through affected independent spec-compliance review and then
   implementation-quality review. Rerun affected validation after fixes and
   reviews before completion. Continue routine work with concise progress
   updates instead of approval pauses.
7. Prepare a PR-ready handoff with exact commands, skipped commands and reasons,
   remaining risks, and the affected human smoke checklist. Report
   implementation and automated validation separately from human smoke and
   PR-review/merge readiness. Agent evidence cannot claim human testing.

Scarce agent slots require sequential scheduling, not invented review results
or self-approval. If delegation is unavailable, disclose the limitation and hold
the affected independent design/implementation/review gate. Continue independent
work that does not depend on it. When permitted actions and available evidence
cannot resolve a blocker, request only the missing input or decision; do not
repeat the same failed approach indefinitely. Complete authorized local work
before requesting genuinely missing approval for a later action.

## Required Lifecycle

### 1. Orient

Before substantial work, read the current authority docs that match the change.
For broad work, start with:

- `README.md`
- `docs/product.md`
- `docs/architecture.md`
- `docs/testing.md`
- `design.md`
- `CONTRIBUTING.md`
- `docs/superpowers/README.md`

For code ownership, runtime, database, routing, popup, dashboard, overlay, sync,
GenAI, release, CI, governance, or agent-workflow changes, read the directly
relevant sections before proposing edits.

Before starting `superpowers:brainstorming` for substantial work, run
`git status --short --branch`. If the work will create specs, plans, commits,
or implementation changes, fetch first when network is available and work on a
task branch from the latest `origin/main` when possible. If unrelated
uncommitted changes are present, do not overwrite, stash, or carry them into the
task without explicit user approval; ask whether to continue on the dirty
worktree, branch with the changes, or let the user stash or commit them first.

### 2. Select Skills

Use explicit skills that match the affected boundary.

- Use `cognipace-agent-workflow` as the shared repo-local router before domain
  or implementation skills for non-trivial CogniPace work involving product
  behavior, feature changes, runtime,
  database, UI surfaces, sync, GenAI, CI, release, governance, PR/issue
  workflow, validation, or agent-process changes.
- Use `cognipace-autonomous-workflow` only for explicitly selected autonomous
  execution; it selects the mode and loads the shared router.
- Use `superpowers:brainstorming` in collaborative mode before substantial creative work, behavior
  changes, feature changes, architecture changes, repo governance changes, CI
  changes, release changes, or agent-workflow changes. In autonomous mode,
  follow the design and independent acceptance process above.
- Use `cognipace-bulletproof-react` when reviewing, planning, or implementing
  React architecture, feature ownership, runtime boundaries, import direction,
  popup responsibilities, dashboard responsibilities, overlay responsibilities,
  or Bulletproof React decisions in CogniPace.
- Use Context7 for current library, framework, SDK, API, CLI, or cloud-service
  documentation questions. Resolve the library ID first, then query the current
  docs.
- Use implementation-specific skills only when the task reaches that boundary:
  `vitest` for test design, `zod` for runtime validation, `drizzle-orm` or
  `drizzle-migrations` for database work, `tanstack-query` for query and
  invalidation work, and relevant React composition skills for component API
  work.

Do not load unrelated skills just because they exist. Skill use should match
the affected ownership boundary.

### 3. Design Before Implementation

Do not jump from request to code for substantial work.

Design is required before implementation for:

- product behavior
- feature behavior
- runtime messaging
- database schema or persistence
- popup, dashboard, or overlay workflows
- sync, backup, restore, GenAI, or secret-handling behavior
- extension permissions
- CI, release, branch protection, PR hygiene, issue templates, or governance
- agent workflow or skill changes
- architecture ownership or dependency direction changes

Small docs-only fixes may use a short stated design instead of a full spec, but
the agent still must keep docs honest and run the appropriate formatting check.

### 4. Plan Phase Work

Multi-step work must become a plan before implementation.

- Use one master design when the end state spans multiple systems.
- Use phase-sized implementation plans for execution.
- Do not execute broad repo-hardening, release, CI, feature, or
  agent-governance work in one uncontrolled pass.
- In collaborative mode, prefer separate chats or threads for independent
  implementation phases when requested. Autonomous mode uses bounded subagents
  and the phase review gates above.
- Keep each plan tied to exact files, validation commands, and done-when
  criteria.

### 5. Implement Within Ownership Boundaries

Preserve the existing dependency direction:

```text
entrypoints -> app -> features -> platform/lib/components
```

Implementation rules:

- `src/entrypoints` boots WXT surfaces only.
- `src/app` composes surfaces, providers, and routes.
- `src/features` owns product behavior.
- `src/extension` owns trusted runtime messaging, sender authorization, and
  background handler registration.
- `src/platform` and `src/lib` own infrastructure and integrations.
- `src/components` stays generic.
- Runtime payloads are validated with Zod at the extension boundary.
- Database writes stay behind the owning feature repository or server service.
- UI code does not call the database directly.
- Feature writes broadcast correct invalidation tags after persistence.
- New Chrome permissions require explicit human approval.

Prefer current feature patterns over new architecture layers.

### 6. Validate With Proof

Validation proof must name exact commands and, when relevant, exact affected
manual smoke flows. If a required command could not be run, state that clearly
in the handoff and PR summary with the reason.

These phrases are not sufficient on their own:

- "looks good"
- "tested locally"
- "checks pass"
- "validated"
- "should work"

### 7. Handoff With PR-Ready Context

Handoffs and agent-authored PR descriptions must use the current repository
template as the source of truth:

- `.github/PULL_REQUEST_TEMPLATE.md` owns the required PR body sections and
  prompt wording.
- `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/task.yml`, and
  `.github/ISSUE_TEMPLATE/config.yml` own issue intake fields and issue type
  labels.

Do not duplicate those templates into agent instructions. Fill the current
template sections with PR-ready context, including:

- why the change exists
- what changed
- issue link or documented exception
- validation commands run
- validation commands skipped and why
- remaining validation risk
- risk areas touched
- manual testing checklist for affected smoke flows when relevant, including
  human-run happy-path and edge-case smoke for behavior-changing code
- release impact
- rollback or recovery notes when relevant
- screenshots or recordings for behavior-changing code, including UI and UX
  proof

## Validation Selection

Choose validation by risk area, not only by file extension.

1. Identify every touched risk area.
2. Select every matching validation category in the matrix below.
3. When categories overlap, use the strictest required command set.
4. Add focused tests for touched behavior when feasible.
5. Add the affected manual smoke checklist when feature work, extension
   surfaces, or background workflows touch a manual flow. For behavior-changing
   code, the checklist must include human-run happy-path and edge-case smoke.
6. In the handoff, list exact commands run, exact commands skipped, why each
   skipped command was skipped, and remaining validation risk.

Visible popup/dashboard/overlay changes use both the UI and surface rows.

| Changed area                          | Validation category                                    | Notes                                             |
| ------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| Docs/governance/planning Markdown     | Docs or governance only                                | Run Prettier on touched Markdown.                 |
| Feature code without surface effects  | Normal code change                                     | Add happy-path and edge-case smoke proof.         |
| Visible React UI                      | UI change                                              | Add focused tests and screenshot/recording proof. |
| Popup/dashboard/overlay behavior      | Popup, dashboard, or overlay behavior                  | Add build and manual smoke checklist.             |
| Runtime/background/sync/GenAI/secrets | Runtime messaging, background, sync, GenAI, or secrets | Include notifications and cache effects.          |
| Database/schema/persisted shape       | Database or schema change                              | Add DB checks, migrations, and persistence tests. |
| Release/CI/package/extension build    | Release, CI, package, or extension build workflow      | Add build/zip proof or static-review reason.      |

## Validation Matrix

### Docs Or Governance Only

Required:

```sh
npx prettier --check <touched markdown files>
```

Use this for docs-only and governance-only changes.

### Normal Code Change

Required:

```sh
npm run lint
npm run check
```

Also required:

- focused tests for the touched behavior before the full check when feasible
- exact test paths or test names in the handoff
- human-run happy-path and edge-case smoke proof for behavior-changing code

### UI Change

Required:

```sh
npm run lint
npm run check
```

Also required:

- focused component, hook, or route tests for the affected behavior
- screenshot or screen recording proof for the changed UI and UX behavior
- human-run happy-path and edge-case smoke checklist for the affected popup,
  dashboard, or overlay flow

### Popup, Dashboard, Or Overlay Behavior

Required:

```sh
npm run lint
npm run check
npm run build
```

Also required:

- focused tests for the affected controller, route, component, hook, or feature
  service
- human-run happy-path and edge-case smoke checklist for the affected extension
  surface flow
- screenshot or screen recording proof for the changed UI and UX behavior

### Runtime Messaging, Background, Sync, GenAI, Or Secrets

Required:

```sh
npm run lint
npm run check
npm run build
```

Also required:

- focused contract, runtime-policy, handler, service, repository, or API tests
- human-run happy-path and edge-case smoke checklist for affected background,
  sync, GenAI, notification, secret, runtime, or service-worker flows
- screenshot or screen recording proof when the runtime behavior changes a user
  visible or UX-observable flow
- explicit note about sender authorization, Zod parsing, secret redaction,
  cache invalidation, and sync side effects when touched
- release impact and rollback or recovery notes when shipped behavior changes

### Database Or Schema Change

Required when schema changes:

```sh
npm run db:generate
npm run db:check
npm run lint
npm run check
```

Required when database behavior changes without schema changes:

```sh
npm run db:check
npm run lint
npm run check
```

Also required:

- focused repository, service, migration, backup, restore, or integration tests
- note whether local extension data may reset because migration SQL changed
- note backup, restore, and sync compatibility when persisted shape changes

### Release, CI, Package, Or Extension Build Workflow

Required:

```sh
npm run lint
npm run check
npm run build
```

Required when artifact behavior is touched:

```sh
npm run zip
```

Also required:

- explain impact on Release Please, PR title semantics, release artifacts,
  branch protection, or Chrome Web Store handoff
- identify any GitHub secrets, permissions, or check names affected
- state whether the workflow was tested locally, by dry-run PR, or only by
  static review

## Manual Smoke Checklist

Use `docs/testing.md` for exact manual smoke flows. Agents do not replace human
browser smoke testing. For feature, surface, runtime, sync, GenAI, release,
package, extension-build, or other behavior-changing code, agents must add the
relevant manual testing checklist to the PR description, and the human engineer
must complete real-time happy-path and edge-case smoke testing before PR review
or merge.

- Popup changes should include the extension popup smoke checklist.
- Dashboard route or dashboard workflow changes should include the affected
  dashboard smoke checklist.
- Overlay changes should include the LeetCode problem-page smoke checklist.
- Background, sync, GenAI, notification, secret, or runtime changes should
  include the relevant hidden `/dev/smoke`, service-worker, or focused manual
  flow checklist.
- Release, CI, package, or extension build changes should include any relevant
  release or artifact manual checks, plus whether automated workflow validation
  was local, dry-run PR, or static review only.

Behavior-changing code must not mark manual smoke testing or visual proof as
N/A. The PR must name the happy-path and edge-case flows tested and attach a
screenshot or screen recording for UI and UX proof. N/A is acceptable only for
docs/governance-only changes that do not touch app behavior. Vague claims such
as "not tested" or "should work" are not sufficient.

## Commit And PR Rules

Use Conventional Commit format for commit messages and PR titles:

```text
<type>(optional-scope): short summary
```

CogniPace uses squash merge. The PR title is the release signal that Release
Please reads.

Release-triggering title types:

- `feat`
- `fix`
- `deps`
- any allowed type with `!`

Allowed maintenance types:

- `chore`
- `test`
- `ci`
- `build`
- `style`
- `docs`
- `perf`
- `refactor`

## Issue Rules

Create or propose issues only when the request needs tracked work.

Use the current issue forms as the source of truth:

- `.github/ISSUE_TEMPLATE/bug.yml` for broken or incorrect behavior.
- `.github/ISSUE_TEMPLATE/task.yml` for planned product, engineering, docs,
  tests, CI, cleanup, or maintenance work.

Issue content should satisfy the relevant form and include:

- problem or request
- why it matters
- affected surface or ownership area
- done-when criteria
- relevant constraints
- suggested validation
- links to relevant docs, specs, plans, or PRs

Issues do not approve new product scope. Product behavior still comes from
explicit human approval and current product docs.

## Drift Audit

Use this checklist to keep agent governance, local skills, GitHub templates, CI,
and repository settings aligned as CogniPace changes. The first audit should
happen after the first release cycle using the hardened governance model. After
that, review this checklist on a recurring release-cycle cadence and whenever
governance, CI, templates, release behavior, or local agent skills change.

Audit these source-of-truth files and settings:

- `AGENTS.md`
- `CLAUDE.md`
- `.agents/skills/cognipace-agent-workflow/SKILL.md`
- `.agents/skills/cognipace-autonomous-workflow/SKILL.md`
- `.agents/skills/cognipace-bulletproof-react/SKILL.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/bug.yml`
- `.github/ISSUE_TEMPLATE/task.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/pr-title.yml`
- `.github/workflows/pr-hygiene.yml`
- `.github/workflows/labeler.yml`
- `.github/workflows/stale-prs.yml`
- `.github/workflows/release-please.yml`
- `.github/labeler.yml`
- GitHub branch protection settings for `main`

Confirm:

- Root agent guides still delegate to `docs/agent-governance.md`.
- Codex and Claude root instructions remain equivalent in requirements.
- Local skills route agents to this canonical governance doc instead of
  duplicating changing rules.
- Collaborative remains the default; autonomous selection survives shared-router
  re-entry and delegation without waiving protected gates.
- PR and issue template expectations still match PR hygiene automation.
- Workflow names and required checks match branch protection.
- Labeler paths still cover sensitive areas accurately.
- Release, package, and validation rules still match actual npm scripts and CI.
- Noisy rules are simplified or removed before new rules are added.
- New mechanical checks are proposed only after repeated human-review misses.

Branch protection is configured in GitHub, not in repository files. Repository
docs and workflows should document the expected checks; GitHub settings must
block failed required checks on `main`.
