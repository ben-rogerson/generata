---
"@generata/core": minor
---

Fix worktree isolation prompt header and surface typed outputs on `WorkflowResult`.

The prompt's `Working directory:` line (and the agent factory's `${work_dir}` substitution) now reflect the actual cwd the agent runs in, not the user-config workDir. Agents under worktree isolation were previously misled into resolving absolute file paths against the main repo and mutating it instead of the worktree.

`WorkflowResult` now exposes `outputs: Record<string, string>` (typed outputs accumulated across steps) and `worktreePath?: string` (when the workflow ran with worktree isolation), so programmatic post-workflow drivers can read what agents emitted and locate the worktree without re-deriving either.
