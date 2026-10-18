# Configuration layers

1. **Pi** remains the runtime. Its own resource discovery, package loader, project trust and extension interfaces remain authoritative.
2. **Selected Matt upstream** is pinned by config/matt-skills.json. The installer copies only twenty folders and their supporting files plus the upstream license.
3. **Pi mechanics** in skills/PI-COMPATIBILITY.md maps tool names, delegation, shell and invocation. It carries no corporate tracker or commit policy.
4. **Project storage policy** in skills/PROJECT-CONTEXT.md and the external resolver maps personal planning into private per-project storage, without replacing official repository documentation.
5. **Common user policy** in instructions/common.md includes implementation/review and explicit-publication rules.
6. **Machine profile** selects home or work instructions. The generated global AGENTS.md is small navigation; existing private content is preserved outside the managed block.
7. **Private configuration** in ~/.pi/agent/projects.json supplies inherited project profiles/rules and exceptional projects. Corporate instructions and credentials remain private.

Home and work share skill code, mechanics and common user policy, not a byte-identical global AGENTS.md. The current home machine is the only directly inspected environment; the old user-supplied work archive informs the new design but does not establish current work-PC state or mandatory policy. Twenty common skills can coexist with a separately managed corporate collection; this installer owns only matt-pocock.

## Source and adaptation

Build fails if the Matt origin, pinned revision, clean state or known patch targets change. PROVENANCE.json contains original hashes, generated hashes and explicit patch categories. Update the pin intentionally, review upstream changes, regenerate, test and compare the adaptation; never overwrite a locally modified managed file.

The setup skill is a deliberate project-policy replacement. Code-review adds working-tree/new-file coverage; implement removes automatic commit authorization. Every selected Markdown workflow/reference has an explicit external-storage pointer. Upstream templates are retained as examples under that mapping, not instructions to scaffold every repository.

## Side effects

Project resolution is read-only. Installation is plan-first and manages a dedicated folder with drift checks and backups. No tool auto-creates tracker issues, repository steering, commits, PRs or browser sessions.
