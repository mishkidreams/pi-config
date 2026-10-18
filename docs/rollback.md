# Backups and rollback

Apply commands report the backup paths. Keep backups outside skill discovery and outside this public repository.

- **Global instructions:** restore the reported original AGENTS.md backup only if no newer private edits would be lost; otherwise remove or replace just the managed pi-config block. The machine profile installer preserves all content outside its block.
- **Matt skills:** keep the previous complete managed folder and provenance outside ~/.agents/skills and ~/.pi/agent/skills. The default durable backup is in `.pi-config-state/backups` beside the discovery root, not in temporary staging. Verify it before restoration. Remove a new folder only after checking that no local changes were added, then restore the prior folder.
- **Migration:** keep the old Pi-only installation outside every skill-search directory. Roll back by restoring it and removing the new common folder; never expose both copies simultaneously.
- **Extensions:** retain the prior commit/ref and dependency lock. A rejected update is not a reason to reset or discard the combined accepted fork.
- **Telegram:** code and browser authentication are different. Preserve the old app separately, keep the authenticated profile and private MCP configuration in place, stop only an explicitly owned idle reader before switching code, and validate the selected executable/version after reconnection. Do not move authentication to another computer.

A failed apply may leave an original backup or an intentionally unreclaimed lock. Inspect its reported location and owner; do not delete unknown files or overwrite newer private edits in an attempt to retry. Stop noncooperating editors before apply/restore.

Reload/restart only after the coherent set has been installed. A running process does not automatically load changed source, global instructions or skill catalogs.
