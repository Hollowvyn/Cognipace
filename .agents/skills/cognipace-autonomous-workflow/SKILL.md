---
name: cognipace-autonomous-workflow
description: Use when the user explicitly invokes this skill or requests autonomous CogniPace execution for the current task; not for ordinary implementation requests, urgency, or merely mentioning subagents.
---

# CogniPace Autonomous Workflow

This is an explicit mode selector for the shared CogniPace workflow. Reading it
for discovery, evaluation, or review does not select autonomous mode. Without
explicit selection, use the collaborative default.

On explicit invocation or an explicit autonomous request:

1. Select autonomous mode for the current task, its phases, and its subagents.
2. Immediately load `cognipace-agent-workflow`, the shared repo-local router,
   before domain or implementation skills. Preserve the selection on router
   re-entry; honor later explicit switches.
3. Read `docs/agent-governance.md#workflow-modes` and follow its autonomous
   lifecycle, acceptance gates, and canonical validation selection. Governance
   owns policy; this selector does not duplicate it.

Only explicitly selected autonomy replaces generic skills' routine human
checkpoints. Follow governance for the branch/worktree guard, unavailable
independent delegation, protected scope and permissions, and human smoke/proof.
Selection does not authorize unrelated or destructive work, publication, merge,
deployment, or release. Existing specific authorization remains valid.
