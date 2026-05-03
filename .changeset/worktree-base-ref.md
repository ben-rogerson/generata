---
"@generata/core": minor
---

Add `baseRef` to `WorktreeConfig` so workflows can override the default `origin/main` base for git-worktree isolation. A `<remote>/<branch>` value triggers a fetch first; a bare branch like `"main"` is treated as a local ref and used without fetching.
