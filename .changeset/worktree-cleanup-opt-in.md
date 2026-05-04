---
"@generata/core": minor
---

`worktree({...})` now accepts a `cleanup` field (default `false`). When `false`, the worktree and its `generata/wt-<runId>` branch are kept on disk after the workflow finishes so you can inspect the run; pass `cleanup: true` to restore the previous teardown-on-exit behaviour. The engine logs `[worktree] cleaned up <path>` or `[worktree] preserved at <path>` at end of run. Setup-failure cleanup is unchanged - half-built worktrees are still torn down. Use `generata worktree prune` to clear preserved worktrees.
