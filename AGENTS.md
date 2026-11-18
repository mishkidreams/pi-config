# Maintaining pi-config

This repository is a small personal Pi configuration set, not a Pi extension or runtime dependency.

Design this setup for capable models: give them the goal and the context they lack. Add guidance or tools when they solve a concrete problem, not to script how the model thinks.

- Keep shared settings in `agent/settings.json`. OS directories contain only setup instructions and necessary differences, not full copies of the shared configuration.
- Keep the home/work distinction explicit: `agent/` and `billion-context/` are shared; `work/` is a separate opt-in addition for a work laptop. Preserve both sections of its anonymized AGENTS.md; employer-specific paths and materials stay local. Do not install the work instructions as part of the home baseline.
- Keep `collaborative-dev` in the shared skills and preserve `disable-model-invocation: true`; its collaboration style must not become a mandatory global workflow.
- Preserve intentional package filters and explicit per-agent model choices.
- Prefer `max` for the main agent and subagents, but use a different thinking level when it better suits the model or task. The configured defaults live in `agent/settings.json` and `agent/agents/*.md`.
- Do not introduce generators, adapters, pinned package versions, mandatory project setup or runtime links to this checkout.
- Keep the Pi-specific creator in `agent/skills/skill-creator/` and install it only under `~/.pi/agent/skills/`, not shared `~/.agents/skills/`. Preserve its complete directory, license and referenced resources. Do not install this repository's AGENTS.md as global Pi instructions.
- Keep credentials, session history, device IDs, caches, private archives, machine proxy addresses and private corporate material out of the repository.
- Check changed JSON, resource paths and the actual installation steps. Report executed checks and limitations; Windows inspection is not a macOS runtime test.
- Commits and publication require a separate user request.
