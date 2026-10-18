# External project context

Before a skill needs tracker settings, task/spec storage, personal domain notes, or project setup, resolve the current project once:

```powershell
node "{{CONFIG_ROOT}}/scripts/project-context.mjs" --cwd "<actual working directory>"
```

The resolver reads private `~/.pi/agent/projects.json`, selects the inherited profile and project exception, and returns paths. It does not create anything. Read any returned private instructions that exist. Missing optional notes are not a setup error.

## Path mapping for every installed workflow and reference

The following upstream names are logical roles, not permission to create files in the working repository:

| Upstream name | Effective location |
|---|---|
| `.scratch/<feature>/...`, ad-hoc research/prototype/spec/ticket output | returned `paths.artifacts/<feature>/...` |
| `docs/agents/issue-tracker.md` | returned tracker object; optional descriptive note `paths.project/issue-tracker.md` |
| `docs/agents/domain.md` | this mapping; optional note `paths.project/domain.md` |
| `docs/agents/triage-labels.md` | optional `paths.project/triage-labels.md`, only for an installed workflow that needs it |
| new personal `GLOSSARY.md` or `GLOSSARY-MAP.md` | returned `paths.glossary` or `paths.project/GLOSSARY-MAP.md` |
| new personal `docs/adr/` | returned `paths.adrs` |
| new agent steering/configuration | private profile/project instructions outside the repository |

This applies to trees, examples, templates and instructions in all selected skills and referenced Markdown, including domain-modeling, grill-with-docs, research, prototype, wayfinder, to-spec, to-tickets, code-review and implement. An upstream 'run setup' fallback means resolve inherited context first; a valid default profile already provides local tracking. Do not repeat a setup questionnaire for every clone.

Existing official repository instructions, glossary, ADRs, standards and issue references remain evidence and must be read when relevant. They are not replaced or copied into personal notes. Change official repository documentation when the task actually requests that deliverable, not merely because a workflow needs somewhere to save personal planning. Surface conflicts between private notes and official decisions.

Remote trackers use the selected project's tracker kind and supplied settings, not an unconditional GitHub default. Authentication stays in the local tool configuration. Creating remote issues/labels/PRs still needs the applicable user authorization. The absent triage workflow does not require labels.

Invoke `/skill:setup-matt-pocock-skills` only to intentionally change the inherited profile or a project exception. Its confirmation gate remains; ordinary reviews and implementation do not require setup.
