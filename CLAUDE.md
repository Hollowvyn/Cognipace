# Claude Operating Guide

This is the Claude-facing root guide for CogniPace. Follow
`docs/agent-governance.md` for the full lifecycle, skill rules, validation
matrix, PR/issue rules, release expectations, and skipped-validation policy.

## Required Reading

Before substantial work, read:

- `README.md`
- `docs/product.md`
- `docs/architecture.md`
- `docs/testing.md`
- `design.md`
- `CONTRIBUTING.md`
- `docs/agent-governance.md`
- `docs/superpowers/README.md` for historical planning context

For focused work, read the directly relevant sections of the authority docs
before proposing edits.

## Hard Gates

- Use `cognipace-agent-workflow` as the shared repo-local router before domain
  or implementation skills for non-trivial CogniPace work. The autonomous
  selector loads it immediately when explicitly invoked.
- Collaborative mode is the default. Explicitly invoke
  `cognipace-autonomous-workflow` or request autonomous mode to select it for the
  current task and delegated phases. Shared-router re-entry preserves selection;
  honor later explicit switches. Urgency or a subagent mention does not select it.
- In collaborative mode, use `superpowers:brainstorming` and human design
  approval before substantial work. In autonomous mode, follow governance's
  recorded design/plan and independent agent acceptance lifecycle.
- Only in explicitly selected autonomous mode, governance replaces generic
  skills' routine human approval, artifact-review, execution-choice, and phase
  handoff prompts. Protected scope, permissions, validation, and human smoke
  gates remain. Existing explicit approval does not need repeating.
- Use `cognipace-bulletproof-react` for ownership, runtime, React architecture,
  feature placement, popup, dashboard, or overlay boundary decisions.
- Do not implement before the design and phase-sized plan have the acceptance
  required by the selected mode in `docs/agent-governance.md`.
- Do not hide skipped validation or failed validation.
- List exact validation commands run and exact commands skipped with reasons.
- For behavior-changing code, do not mark manual smoke testing or visual proof
  as N/A. The human engineer must run happy-path and edge-case realtime smoke
  tests and attach screenshot or screen recording proof before PR review or
  merge.
- Use Conventional Commit titles and PR-ready summaries for agent-authored
  changes.

## Skills

Use repo-local skills under `.agents/skills` when they match the work:

- `.agents/skills/cognipace-agent-workflow/SKILL.md` for non-trivial CogniPace
  workflow, validation, PR/issue, governance, and agent-process work.
- `.agents/skills/cognipace-autonomous-workflow/SKILL.md` for explicit autonomous
  mode selection; it loads the shared router and canonical governance.
- `.agents/skills/cognipace-bulletproof-react/SKILL.md` for CogniPace
  architecture ownership, runtime boundaries, dependency direction, and
  popup/dashboard/overlay responsibility decisions.

Use documentation lookup tooling for current library, framework, SDK, API, CLI,
or cloud-service questions. Resolve the library first, then query current docs.

## Authority

- `docs/product.md` owns current product behavior and scope.
- `docs/architecture.md` owns current technical structure and change recipes.
- `docs/testing.md` owns manual smoke flows and validation expectations.
- `design.md` owns current visual and interaction direction.
- `CONTRIBUTING.md` owns contribution and release expectations.
- `docs/agent-governance.md` owns cross-agent workflow, validation, PR, issue,
  and release-impact rules.
- `docs/superpowers/*` files are planning artifacts unless current docs say
  otherwise.

## Safety Rules

- Do not revert unrelated user work.
- Do not add account, auth, backend, team, hosted service, or generic SaaS
  behavior without explicit approval.
- Do not add or expand sync behavior without explicit approval.
- Do not expand Chrome permissions without explicit approval.
- Validate runtime payloads with Zod.
- Keep database writes behind the owning feature repository or service.
- Keep dependency direction: `entrypoints -> app -> features -> platform/lib/components`.
- Prefer existing feature patterns over new architecture layers.
- Keep docs honest about current behavior and validation actually run.

## Change Guidance

- For runtime, database, route, feature mutation, popup, dashboard, overlay,
  sync, GenAI, secret, release, CI, or governance changes, follow
  `docs/agent-governance.md` and `docs/architecture.md`.
- For product behavior and testing expectations, follow `docs/product.md` and
  `docs/testing.md`.
- For visible UI changes, follow `design.md` and existing component patterns.

## Validation

Use the validation matrix in `docs/agent-governance.md`.

For docs-only changes, run Prettier on the touched Markdown files. For
substantial code, run focused tests first and then the required full commands
for the change type. For database changes, run the relevant Drizzle/database
checks. Always report skipped validation with reasons.
