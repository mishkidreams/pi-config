# Configuration source

This repository configures an existing Pi installation; it is not a Pi fork.

- Use Node 24 built-ins for deterministic tools. Tests cross the same CLI/module interfaces as users and use temporary repositories/homes.
- Plan is the default; applying filesystem or runtime changes is explicit. Preserve unrelated files and private machine instructions.
- Public fixtures use synthetic hosts, repositories and text. Secrets, corporate instructions, allowlists, browser profiles and raw histories stay outside this tree.
- Run `npm test`. Matt integration tests require the clean pinned upstream checkout; report a skip rather than claiming that integration ran when it is absent.
- No commit/push/PR/MR without the user's separate authorization.
