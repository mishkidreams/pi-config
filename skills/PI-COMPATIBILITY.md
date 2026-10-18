# Pi mechanics

This is our adapter, not a Matt Pocock upstream file. It is identical for personal and work machines. Project policy is in PROJECT-CONTEXT.md; user policy comes from the loaded global instructions.

- Load an advertised skill with `read` on its SKILL.md and follow its relative references. The human command is `/skill:name`; upstream `/name` is shorthand. Preserve upstream frontmatter and explicit-only invocation. A human's `/new` replaces upstream `/clear`; neither is an agent tool.
- Delegate with `spawn_agent`, `check_subagents`, `send_to_subagent`, `cancel_subagent`, and `read_subagent_messages`. Omit model/thinking/tools unless the task requests a choice; configured inheritance and enabled aliases remain authoritative. Give each child absolute paths, scope, requirements, relevant instructions, and a defined output. Skills and the parent conversation are not inherited.
- For independent reviews, start Standards and Spec separately, make them read-only, freeze their exact task scope, and collect both with `check_subagents(wait:true)`. Report findings per axis; correct a finding with a regression before claiming resolution.
- Use `pwsh` and PowerShell syntax for commands, `read/edit/write` for files. Bash-specific examples need translation. The diagnosing-bugs interactive Bash fallback is not Pi's noninteractive command tool: use an agent-runnable reproduction or ask for redacted human-run results.
- Only the twenty selected Matt skills are installed. Referenced pr, wizard, triage, implement-spec, handoff, teach and to-questionnaire workflows are not silently available. Offer a manual equivalent rather than installing or reading an upstream-only skill implicitly.
- Branch/worktree capture must not switch a directory another agent uses. Use an isolated worktree or serialize. Do not assume the wayfinder parallel-branch example is validated on this machine.
