---
"@generata/core": minor
---

Add `isolation: "worktree"` opt-in to `defineWorkflow`. When enabled, the workflow runs against a fresh git worktree created from `origin/main`, while logs, metrics, and a configurable list of `sharedPaths` symlink back to the main checkout. The worktree is pruned at run end regardless of outcome. New CLI: `--worktree` / `--local` runtime overrides on `generata workflow <name>`, and a `generata worktree prune` recovery subcommand for orphaned worktrees.
