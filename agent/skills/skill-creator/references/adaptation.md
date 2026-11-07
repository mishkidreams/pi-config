# Adaptation checks

Use these checks when moving a skill between harnesses or environments, or changing platform-sensitive helpers. Inspect the actual target and selected source; do not assume that a skill labeled "Pi-compatible" matches the installed tools. Use the relevant sections, not a new project setup or a separate checklist file.

## Find the complete capability

An entrypoint may only call another skill. Follow the relevant calls and relative links to the actual method, prompt templates, scripts, and assets before copying or removing them. Inspect helpers before executing them. Look for assumptions supplied by a plugin's hooks, setup, or global instructions that will not accompany a standalone skill.

Bring only what the capability needs. Inline a short needed method or keep a useful local reference instead of requiring a whole foreign skill pack. Retain genuinely useful integrations and state real prerequisites. If a required resource is missing or a capability cannot be preserved, explain the limitation rather than inventing a replacement or silently dropping part of the method.

## Shell and process behavior

Use the shell and command tools of the intended target, not an assumption carried over from the source skill or the machine doing the adaptation. In this Pi configuration, Windows uses `powershell` and macOS uses `bash`; neither should be imposed on the other platform. Renaming a tool or changing `.sh` to `.ps1` does not translate a program.

- Check quoting, variable expansion, argument passing, here-documents, redirection, pipelines, and error handling. PowerShell pipelines can carry objects; Bash pipelines carry byte streams.
- Check external commands and versions, not just shell syntax. `sed`, `jq`, `python3`, or GNU flags may be unavailable or mean something different. On Windows, a shebang does not establish an available interpreter.
- Preserve output formats, ordering, empty and singleton collections, stdout/stderr separation, and exit codes. Check native-program failures explicitly; shell success is not proof that a helper succeeded.
- Keep a required helper in an interpreter available on the target, or adapt it to the target shell or an already available portable runtime when appropriate. Do not silently install an interpreter or compatibility environment, change execution policy, request elevation, or introduce an adapter service.

## Files, paths, and text

Resolve bundled resources from the skill directory, not an assumed working directory; resolve user inputs according to the request. Check absolute versus relative paths, spaces, Unicode, separators, drive letters, and case sensitivity. Preserve executable permissions where relevant instead of assuming Windows and Unix behave identically.

Choose encodings deliberately when writing files or exchanging JSON/text with a process. On Windows, PowerShell 5.1 and 7 have different defaults. Check BOMs and line endings when the consumer cares; keep binary output out of text pipelines. Do not copy the author's home directory, temporary paths, or machine-specific configuration into reusable instructions.

## Tools and execution contracts

Check the installed tool's schema and behavior, not merely its name or an upstream platform note. Relevant differences include blocking versus asynchronous calls, result and error shapes, session/context inheritance, cancellation, and delegation limits. Do not invent polling, steering, nested agents, model names, or tool availability. If preserving the method requires an unavailable capability, surface that constraint.

Pi loads skills by reading their files, not through a foreign `Skill` API. Discover deferred MCP tools when needed and inspect their real contracts; a returned result may itself report an error. Keep service authorization and configuration as actual prerequisites, not fabricated successful access.

## Invocation, state, and side effects

Check descriptions, explicit-only flags, and startup hooks. A narrowly selected skill must not accidentally become an always-on workflow. Preserve intended invocation behavior; do not assume foreign tool-list or permission metadata grants capabilities in Pi.

Identify setup, worktrees, ledgers, generated files, installations, commits, publication, and live service mutations before carrying them over. Distinguish necessary task behavior from the author's surrounding workflow, and keep changes within the user's authorization. Credentials, cookies, browser profiles, proxy values, and private configuration are local state, not reusable skill assets. Do not stop shared services or clean up another task's artifacts.

## Verify the changed assumptions

Choose checks for the risks actually introduced. For an executable port, exercise the changed helper with isolated inputs in the target shell/runtime, not just a syntax check or renamed command. Useful cases include a different working directory, a path with spaces or non-ASCII text, empty/singleton input, and an intentional failure. Check real output and exit status. Inspect remaining callers and references for stale source-harness assumptions.

Report concrete issues found beyond the requested edit without treating them as permission for a rewrite. State what was preserved, what changed, what ran, and what remains unverified. Keep technical portability fixes distinct from methodological changes: translating a tool call is not the same as removing the testing method from a TDD skill.
