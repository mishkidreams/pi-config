---
name: skill-creator
description: Create, edit, or adapt agent skills for Pi. Use when authoring a SKILL.md, improving an existing skill, or porting a skill from another agent harness, not for merely carrying out the task a skill describes.
---

# Skill Creator

Create useful, appropriately scoped skills, or make the requested change to an existing one. A skill adds reusable guidance; it is not a new agent framework or permission to redesign the user's workflow.

## Establish the actual change

Distinguish a new capability, a focused edit, and a harness adaptation. Use the request, existing files, approved examples, and conversation corrections already available. Ask only about missing information that materially affects the result; do not restart a settled discussion or require an interview for a clear request.

For an existing skill, read its instructions and the supporting files relevant to the change. Inspect the purpose and callers of a resource before removing it. Preserve unrelated behavior, supported metadata, invocation policy, and useful dependencies.

Notice and report all concrete problems you find in the skill and resources you inspect, even during a focused edit. Include visible tool, platform, and authorization assumptions; a textual edit is not a reason to ignore them. Fix what is within scope; flag unrelated corrections and changes to method, prerequisites, or workflow rather than silently expanding the task. This is not a request to audit an unrelated repository.

A successful example or corrected result can be a good starting point: identify what the user approved, separate reusable guidance from incidental details, and express that guidance so another agent can apply it. This is an option, not a required authoring ritual. Do not turn a particular task's workflow, output format, failure, company, people, or implementation names into rules for unrelated skills.

## Keep the guidance useful and scoped

Assume the agent is capable. Include non-obvious context, decisions, real constraints, and examples that materially improve its work. Prefer clear outcomes and decision criteria to a fixed sequence when several approaches are valid. Explain the reason for a surprising constraint rather than accumulating prohibitions.

Separate actual requirements from recommendations and local conventions. Do not silently add mandatory setup, tickets, Git repositories, project notes, reviews, tests, or subagents. Keep a domain-specific workflow when that is the requested capability; do not impose it on every skill. Do not force an author's preferred workflow where the request allows alternatives, such as reviewing a dirty working tree or selected commits.

Committing, pushing, publishing, opening a PR/MR, and mutating an external service are separate actions requiring the user's request, not automatic steps granted by using a skill. Keep authorization at the relevant action. Avoid duplicating global agent policy or adding a second competing source of methodology.

## Adapt without replacing the method

When porting an existing skill, distinguish its useful method from its original harness assumptions. Preserve the method unless the user requests a methodological change.

For harness adaptations, platform-sensitive helper changes, or platform-specific commands and tool calls encountered in an existing skill, read [Adaptation checks](references/adaptation.md). Apply the relevant checks even when the requested edit is small; they are not a mandatory setup or documentation process. Make compatibility changes narrow and truthful:

- Check actual Pi tools and current documentation when uncertain. Pi loads a skill by reading its `SKILL.md`; do not retain a nonexistent `Skill` tool, unavailable subagent API, or imaginary command.
- Translate tool calls, paths, invocation syntax, and resource references to the target environment. Do not mechanically rename one shell or delegation API to another without checking its contract.
- Remove accidental dependencies on another installed skill, compatibility layer, personal tracker, or repository when the method can stand alone. Keep genuinely useful scripts, references, MCP access, or other integrations the capability actually needs, and make real prerequisites clear.
- Keep general work policy out of compatibility notes. Do not recreate routing files, global instructions, or a notes infrastructure just to make a skill load.
- Remove gratuitous instructions prescribing the language of conversation; do not replace them with another language mandate. Preserve genuine task-specific output requirements, such as the target language of a requested translation.

## Use the smallest useful package

Prefer a directory containing `SKILL.md`. Use the requested location. Pi supports global `~/.agents/skills/` and `~/.pi/agent/skills/`, and project `.agents/skills/` and `.pi/skills/`. Clarify global versus project scope only when it matters and cannot be inferred; do not silently install duplicate copies.

Authoring skill files and changing discovery settings are separate changes. If the requested location is not automatically discovered, explain the limitation and offer a supported location or explicit configuration; do not silently modify Pi settings to register it.

A minimal entrypoint is:

```markdown
---
name: skill-name
description: State the capability and the requests for which this skill is useful.
---

# Skill Name

The useful instructions for this capability.
```

Use lowercase letters, digits, and single hyphens in a name of at most 64 characters, without leading or trailing hyphens. Match the folder name for portability. Keep the description nonempty and at most 1024 characters.

Pi advertises the name, description, and path before loading the body. Write the description for routing: what the skill does and when it applies. Add a boundary only when it prevents likely confusion. Do not use it as a long workflow summary.

Keep essential guidance in `SKILL.md`. Add resources only for a concrete benefit:

- `references/`: substantial conditional instructions, schemas, or examples read on demand.
- `assets/`: templates or other files used in the output.
- `scripts/`: repeated or fragile operations that benefit from deterministic execution.

Link resources relative to the skill directory and say when they are needed. Keep information in one place; do not load every reference by default. A short self-contained skill needs no router, generated placeholders, README, changelog, UI metadata, or helper scripts.

Choose invocation policy by purpose and scope: normally keep narrow knowledge aids and task helpers automatically discoverable; make separately opted-in workflows explicit-only with Pi's `disable-model-invocation: true` unless agreed otherwise. Judge whether a skill helps the requested task or redirects it into its own process, not merely whether it contains instructions or steps. Discuss mixed or unclear cases; split knowledge from an opt-in workflow only when useful. Preserve an existing invocation policy on a focused edit.

This flag hides the name, description, and path from Pi's automatic model catalog, not filesystem access; `/skill:name` still works and already-read instructions can remain in context. Discoverability does not authorize writes, commits, or publication.

## Check the change proportionately

Check frontmatter, naming, referenced paths, and unfinished placeholders. Inspect the diff for unintended behavioral changes and unnecessary dependencies. For an adaptation, also check for stale harness instructions and whether the original method still works.

Structural checks do not establish behavioral quality. When behavioral testing adds meaningful confidence, use a realistic request and judge the result against the requested capability and boundaries, not just exact wording or headings. Include a meaningful non-trigger or scope boundary when routing is in doubt. Exercise new or changed executable helpers with safe inputs.

Fresh-context trials can reveal missing assumptions, but are not compulsory for every edit. Use isolated temporary artifacts and permitted side effects. Do not require a particular model, independent reviewer, eval framework, baseline, or recursive invocation of this creator. Ask before a proposed test needs additional access, live mutations, or substantial cost.

Improve from observed failures or actual feedback with the smallest sufficient correction; do not add universal rules for every one-off example.

Finish with a concise account of what changed, what was actually checked, and any remaining limitation. In an active Pi session, `/reload` refreshes skill discovery; `/skill:name` explicitly loads a discovered skill. Do not claim runtime validation if only the files were inspected.

