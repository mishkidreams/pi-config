# Maintaining pi-config

This repository is a small personal Pi configuration set, not a Pi extension or runtime dependency.

- Keep shared settings in `agent/settings.json`. OS directories contain only setup instructions and necessary differences, not full copies of the shared configuration.
- Preserve intentional package filters, explicit per-agent models and `xhigh`. Do not introduce generators, adapters, pinned package versions, mandatory project setup or runtime links to this checkout.
- Copy the skill as a complete directory with its license and referenced resources. Do not install this repository's AGENTS.md as global Pi instructions.
- Keep credentials, session history, device IDs, caches, private archives, machine proxy addresses and old-company material out of the repository.
- Check changed JSON, resource paths and the actual installation steps. Report executed checks and limitations; Windows inspection is not a macOS runtime test.
- Commits and publication require a separate user request.
