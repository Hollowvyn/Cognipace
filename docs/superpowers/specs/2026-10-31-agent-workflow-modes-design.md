# Selectable Agent Workflow Modes

## Approval And Scope

The user approved this two-skill design on October 31, 2026: preserve the
collaborative default and add explicitly selected autonomous execution, sharing
one governance rulebook. The user also requested a clean worktree. Work is on
`codex/agent-workflow-modes`, based on the fetched `origin/main`; unrelated
package edits remain in the original checkout.

This is a docs/governance/skill change. It does not change extension behavior,
permissions, dependencies, CI, repository settings, or release artifacts.

## Problem

The workflow currently requires human approval of substantial designs but does
not define autonomous mode or independent agent review. A baseline evaluator
asked to work autonomously paused for design approval and observed that the
current files do not mandate subagents or reviewer roles.

## Chosen Structure

- Keep `cognipace-agent-workflow` as the first shared repo-local router and the
  collaborative entry skill.
- Add `cognipace-autonomous-workflow` as a small mode selector that loads the
  shared router and canonical governance instructions.
- Keep mode definitions, approval semantics, and autonomous lifecycle in
  `docs/agent-governance.md`; keep validation in its existing matrix.
- Update `AGENTS.md`, `CLAUDE.md`, and the contribution workflow together.
- Index the design and plan in `docs/superpowers/README.md`.

One skill with a mode argument is smaller but makes the choice less visible.
Two complete workflow copies would create drift. The selected approach makes
both choices discoverable while sharing authority.

## Selection And Approval

Collaborative mode remains the default. Explicit invocation of the autonomous
skill or an explicit request for autonomous mode selects autonomy for the
current task and its phases and subagents. Invoking the shared router afterward
does not reset that selection. Do not infer autonomy from urgency or ordinary
requests to fix or implement something. Honor later explicit mode changes.
Switches apply to unfinished work without discarding completed work or prior
human approvals. Agent acceptance does not become human approval when switching
back to collaborative mode.

Collaborative mode uses `superpowers:brainstorming`, human design approval, and
the phase-sized planning workflow. Autonomous mode retains design and planning
but delegates routine choices and their review to agents. Its explicit
selection authorizes continuing through those routine checkpoints without
asking for approval of each artifact, phase, or execution method.

The root guides must explicitly explain that mode-specific repository rules
replace generic skills' routine human approval and handoff prompts in
autonomous mode. This does not waive safety, scope, independent review,
validation, or permission requirements.

## Autonomous Lifecycle

1. Read current authority, inspect the checkout, and establish task scope and
   acceptance criteria. Follow the branch/worktree guard in either mode.
2. Develop alternatives internally and record the recommended design,
   assumptions, affected ownership, risks, and phase-sized plan. Prefer
   established product and architecture patterns for reversible choices.
3. Have an independent read-only subagent review the design and plan against
   user intent and current authority. Resolve actionable findings before
   implementation. Agent acceptance replaces routine human design approval
   only within the selected task's authorized scope.
4. Delegate bounded implementation work with explicit read/write ownership.
   Parallel work requires disjoint files and no shared mutation; run dependent
   work sequentially. The coordinator owns integration and final verification.
5. Review each phase independently for spec compliance and then implementation
   quality. Implementers cannot approve their own work. Fix and re-review
   findings; do not use passing automated checks as a substitute for review.
6. Run risk-selected validation, inspect results, and fix regressions. Continue
   without routine approval prompts, with concise progress updates. If a fix
   changes implementation after review, repeat the affected independent
   spec-compliance and quality reviews and affected validation before completion.
7. Prepare an honest PR-ready handoff. Distinguish implementation/automated
   validation completion from human smoke completion and review/merge readiness.

Capacity limits are not a reason to invent review results: schedule agents
sequentially when slots are scarce. If delegation is unavailable, report the
missing independent review and hold the affected implementation/review gate.
If a blocker cannot be resolved with available evidence and permitted actions,
request the narrow missing decision and continue independent work. Do not
retry the same failed approach indefinitely.

## Shared Boundaries

Both modes preserve current ownership rules and the canonical validation
matrix. Autonomy does not approve new account/auth/backend/team/hosted-service
or generic SaaS scope, sync expansion, Chrome permissions, or secret-handling
changes. Existing explicit authorization remains valid; do not ask again when
the task already authorizes the specific change.

Mode selection does not itself authorize unrelated work, overwriting user
changes, destructive actions, external publication, merge, deployment, or
release. Complete the authorized local work before requesting any genuinely
missing approval. Prefer an in-scope solution when available.

Human-run happy-path and edge-case installed-extension smoke and screenshot or
recording proof remain required before PR review or merge for behavior-changing
code. Agents can prepare the checklist and supplementary evidence but cannot
claim human testing. For this docs-only change, app smoke is not applicable.

## Validation And Done-When

Record baseline and post-change scenario outcomes in the implementation plan.
Exercise autonomous design-through-implementation, collaborative default,
mode inheritance/switching, scarce agent capacity, failed validation, protected
scope, dirty worktrees, and missing human smoke proof. Evaluate concrete next
actions rather than wording matches. Test the shared router before adding the
autonomous selector, then test that selector independently.

Run the skill-creator validator on each touched skill and Prettier on all
touched Markdown. Review the final diff independently for spec compliance and
quality, preserving parity between Codex and Claude guides. Report exact
commands run and skipped, with reasons. No app lint/build/database checks are
required because no application, dependency, CI, or artifact behavior changes.

Done means both entry skills route correctly, autonomous routine checkpoints
work without human approval pauses, shared gates remain intact, scenarios and
formatting pass, and the original checkout's package edits are preserved.
