---
"@generata/core": patch
---

`setupWorktree`'s cleanup now probes the throwaway branch with `git rev-parse --verify` before issuing `git branch -D`. Skipping the delete when the branch is gone keeps cleanup quiet for callers (e.g. shippers) that have renamed the worktree branch to a semantic name and pushed it.
