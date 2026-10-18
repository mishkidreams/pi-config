# Install or reconcile a Windows machine

This configures an existing Pi installation. It is not a second harness. Preparation is not publication: a local-only commit cannot yet be fetched on another computer. Consult [status](status.md) before using component pins.

## Prerequisites and private state

Use PowerShell 7, Git, Node 24 and Pi 1.3.0. The smart-fetch source build additionally uses Bun. Windows is the validated target; no Linux/macOS support claim is made.

Keep the following out of this checkout: credentials, device identity, private MCP settings and environment values, corporate instructions/skills, session JSONL, Telegram permissions and authenticated browser data. A new computer authenticates independently; copying a logged-in Telegram browser profile is not installation.

## Shared skills and the machine profile

Run from this repository. Commands are fail-fast; plan is the default.

```powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
npm test
node scripts/machine-profile.mjs --profile home
node scripts/matt-skills.mjs --source "$HOME/source/repos/matt-pocock-skills" --destination "$HOME/.agents/skills/matt-pocock"
```

The Matt source must be the canonical root of the clean official checkout at the exact `config/matt-skills.json` revision, not a copied subtree. The build reads pinned Git blobs, never ignored working-tree files, and ignores inherited Git redirects/replacement objects. Fetch/review an update separately; the installer does not pull it or rewrite the pin. Review the plan and use `--apply` intentionally. Default Matt backups are retained under `.pi-config-state/backups` outside every enclosing `skills` directory; a custom backup must remain outside discovery on the destination volume. Paths under any directory named `skills` are rejected, including another standard Pi discovery tree. If you configured additional resource-search paths or aliases, verify that backups are outside those too: this installer does not load private Pi settings.

The machine-profile command uses `PI_CODING_AGENT_DIR` when set, otherwise `~/.pi/agent`; `--agents-dir` overrides either default. Substitute that active directory in private configuration examples instead of modifying a different Pi installation.

On home use `--profile home`; on work use `--profile work` and read [work migration](work-migration.md) first. They share twenty generated skills and common user policy, with environment-specific navigation/private additions rather than necessarily byte-identical `~/.pi/agent/AGENTS.md`. Applying a machine profile preserves existing private text outside its managed block for safety; that is not approval of outdated rules or a substitute for reviewing the intended new policy.

Apply commands use exclusive cooperative locks and recheck captured target content before replacement. Close noncooperating editors during apply: a final check/rename is not an OS compare-and-swap against arbitrary writers. Existing locks fail fast and are never stolen; inspect the owner before manually removing a stale lock. Preserve reported original backups even when an apply aborts.

Never expose an old Pi-only Matt copy and the shared copy simultaneously. Before migration record both trees and provenance, verify the old copy is unchanged, move it to a private backup outside `~/.pi/agent/skills` and `~/.agents/skills`, then install the shared copy. If building/applying fails, restore the old copy; do not delete it. The generic installer does not implicitly migrate or remove arbitrary old installations.

## Project context

Existing defaults already provide personal/local tracking without a setup questionnaire or per-project files:

```powershell
node scripts/project-context.mjs --cwd "$HOME/source/repos/example"
```

Only if private `~/.pi/agent/projects.json` is absent, start from the appropriate `profiles/*.projects.example.json`, then configure private remote/path rules and instruction pointers. Do not overwrite an existing file. A GitLab remote is not authorization to create issues and does not identify a Jira project. Official repository AGENTS, standards, glossary and ADRs remain authoritative evidence; personal notes/specs/research go to the returned external paths.

## Extensions

Keep accepted combined forks rather than selecting a partial upstream PR branch. For each repository, verify clean state, expected previous HEAD and the exact candidate commit; use fast-forward-only integration when possible. If a required commit is local-only or unavailable from the configured remote, stop rather than installing an older partial feature set. Do not reset, stash or discard unknown work.

Local Pi packages are loaded in place. They need their own lockfile-respecting production dependency installation; do not create physical duplicate Pi/TypeBox peer packages. Package-specific build requirements differ: do not apply one generic npm command to the Bun smart-fetch monorepo. Configured local paths are relative to `~/.pi/agent/settings.json`, not this checkout.

Do not replace the entire settings/MCP/model-selection file with a home snapshot. Preserve intentional model aliases, enabled model choices, exposure and private values. The component report distinguishes published upstream/fork heads from installed local and uncommitted candidates.

## Activation

After the coherent code/resource set passes native loader and focused tests, restart Pi when required. A changed global AGENTS/catalog or package on disk does not prove an already-running session reloaded it. Check exactly twenty common Matt skills with no duplicate names, check the separately reviewed work-only corporate collection when applicable, and check native subagent, compact transcript and pwsh behavior without launching a paid fleet merely to benchmark.

See [updates](updates.md), [rollback](rollback.md) and [status](status.md). No command here grants permission to commit, create a remote, push, or open PRs.
