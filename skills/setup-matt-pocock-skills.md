---
name: setup-matt-pocock-skills
description: "Configure inherited tracker and personal project notes outside repositories. Run only to change a shared profile or a project exception."
disable-model-invocation: true
---

# Configure external project context

This Pi replacement preserves upstream exploration, draft and confirmation, while keeping private setup outside the working repository. Read ../PROJECT-CONTEXT.md.

1. Run `node "{{CONFIG_ROOT}}/scripts/project-context.mjs" --cwd "<working directory>"`. Read the returned profile, tracker, paths, and existing private instructions. Inspect existing official repository instructions, glossary, ADRs and relevant remote identity without changing them.
2. Show the effective settings. If inherited settings already satisfy the request, report them and finish: no questionnaire or repository scaffold.
3. When a change is requested, recommend either a shared profile/rule (for many repositories) or a single project exception (for one repository). Keep unrelated profiles and exceptions. Use the resolver's stable projectId. Personal GitHub projects can override the work default.
4. Present the exact proposed private JSON change to `~/.pi/agent/projects.json` and any external note changes. Tracker kind can be local, GitHub, GitLab or another explicitly configured service. Ask only for unknown decisions. Preserve the user's draft/confirmation gate before writing.
5. After confirmation, back up that private configuration and apply only the agreed changes. Resolve again and show the effective result. Personal artifacts go to returned paths; optional notes are created lazily. Official repository steering and documentation remain untouched unless changing them is the actual requested task.
6. Mention where settings live and how to change them. New clones inherit shared rules. Never migrate credentials, corporate instructions or browser profiles into this public configuration repository.

The resolver is read-only: applying a confirmed edit is a separate file operation. No tracker credentials are stored in shared profiles or in the public source tree.
