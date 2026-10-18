### 1. Pin the base and coverage

Record initial HEAD and dirty/untracked inventory before implementation. Resolve an agreed fixed point once with `git rev-parse <fixed-point>^{commit}`. For precommit review, the implementation's initial HEAD is the default; ask if the base or task scope is unknown.

- Committed-branch review: `git diff <resolved-base>...HEAD --` and `git log <resolved-base>..HEAD --oneline`.
- Working-tree/precommit review: `git diff <resolved-base> --` covers final staged and unstaged tracked content. List new files with `git ls-files --others --exclude-standard` and read task-owned new files too. Include renames, deletions and tests. Record unrelated pre-existing edits separately.
- A bad ref fails before delegation. Only report empty coverage when tracked changes and relevant untracked files are both absent.
- Give both reviewers the identical resolved base, mode, exact paths, requirements and standards. Freeze those files while they read. Require each to list inspected files. Keep Standards and Spec reports separate.

