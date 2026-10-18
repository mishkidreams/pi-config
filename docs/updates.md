# Controlled updates

## What Pi updates

In the installed Pi 1.3.0 CLI:

| Command | Selection |
|---|---|
| `pi update` | Pi itself |
| `pi update --extensions` | Configured managed packages |
| `pi update <source>` | One configured managed package |
| `pi update --models` | Model catalogs |
| `pi update --all` | Pi plus all configured managed packages |

Source: installed Pi `docs/cli.md`, `docs/packages.md` and package-manager implementation. This describes selection, not compatibility approval. An exact npm version is pinned; git refs are reconciled to the selected ref rather than advanced to a different tag/commit. Local source directories and unmanaged copied Matt skills are not git-pulled or rebuilt by this command.

An unpinned npm billion-context package is therefore covered; an existing local subagent/compact/pwsh/smart-fetch checkout is not. Shared Matt resources have their own pinned build/provenance workflow. Do not run `--all` blindly while trying to preserve a known compatible set.

## Candidate process

1. Record runtime versions, source HEAD/branch/remotes and pre-existing changes. Back up private configuration outside the public repository; never print credentials or allowlist values into a report.
2. Read the actual upstream changes and PR state. Distinguish an upstream-equivalent fix from a similar commit title. Keep accepted behavior until equivalence is demonstrated.
3. Prepare isolated candidates/topics. A feature depending on a fork-only continuation API is not an upstream-ready independent PR; extract and validate its prerequisite first. Keep published history and a combined installation branch.
4. Install candidate production dependencies/build outputs in isolation, using each package's lockfile and build tool. Do not hide new vulnerabilities by sweeping dependency upgrades into an unrelated fix. Report development-only findings separately from runtime dependencies.
5. Run unit/integration/native-loader tests and focused offline behavior/performance loops. Separate synthetic input/frame measurements from physical UI acceptance; preserve full history and models.
6. Independently review Standards and Spec, freeze the exact scope, correct findings, rerun affected checks. A green test that never reaches the failure is not a regression test.
7. Apply only an agreed compatible set with backups. Preserve Telegram profile/auth/permissions and unrelated sessions. Restart/reconnect only the relevant process when safe; recheck actual runtime identity.
8. Report installed, published, candidate, not activated and not tested separately. Obtain a separate request before commits, pushes, PR/MRs, issues/labels or public repository creation.

## Matt changes

`config/matt-skills.json` identifies the official upstream and revision. Review upstream diff, adjust explicit patch targets only when justified, regenerate in a temporary destination, inspect all changed generated files and `PROVENANCE.json`, run `npm test`, then apply with the backup/drift checks. Never copy the work archive's corporate-adapted Matt texts into the common source.

The common mechanics, user policy, project-storage mapping and private machine layer have different owners. Update the shared source once; regenerate home/work from the same revision while retaining their distinct global/private policy. Do not install a Skill-tool addon to compensate for stale literal tool calls.

See [rollback](rollback.md) for rejected candidates and [status](status.md) for this preparation's actual outcomes.
