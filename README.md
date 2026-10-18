# Pi configuration: personal and work

A clean configuration source for an existing Pi installation on two Windows computers. This is not a replacement harness and does not publish the old experimentation repository.

See [status](docs/status.md) for actual published, installed and candidate versions. Publication of this source does not mean the work computer was accessed or changed.

## What is shared

- The chosen twenty Matt Pocock skills, with an explicit upstream pin and reproducible Pi adaptation.
- Common user rules, including independent review and separately authorized publication.
- External project context and personal artifact paths, inherited profiles and project exceptions.
- [Component sources/pins](config/components.json), installation/update validation and rollback instructions.

## What stays private

Private machine-specific AGENTS.md additions, corporate skills/instructions, auth, MCP secret values, Telegram permissions and authenticated browser profiles, conversations and local artifacts.

## Start with a plan

Requires Windows PowerShell 7, Git, Node 24 and the existing Pi 1.3.0 setup. Linux/macOS are not validated here.

```powershell
npm test
node scripts/machine-profile.mjs --profile home
node scripts/matt-skills.mjs --source "$HOME/source/repos/matt-pocock-skills" --destination "$HOME/.agents/skills/matt-pocock"
node scripts/project-context.mjs --cwd "$HOME/source/repos/example"
```

Use `--apply` only after checking the plan and keeping the reported backup. Home and work use the same common user-policy base with justified environment-specific additions. On the work machine choose `--profile work`; back up and review its current private instructions instead of copying the home file or restoring old archive policy unchanged.

Copy the appropriate profiles/*.projects.example.json to private ~/.pi/agent/projects.json only when that file does not already exist; edit private rules there. Resolver defaults already provide personal/local tracking without creating anything.

See [architecture](docs/architecture.md), [rollback](docs/rollback.md), [installation](docs/install.md), [updates](docs/updates.md), and [status](docs/status.md). The scripts do not authorize commits, remote repository creation or publication.
