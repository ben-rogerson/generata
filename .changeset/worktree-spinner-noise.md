---
"@generata/core": patch
---

`setupWorktree` no longer wraps `git fetch`, `git worktree add`, and the install command in animated spinners. Each step now prints a plain `→ worktree: ...` line instead. The spinners often appeared frozen on fast operations because the work completed before the animation could cycle, and the cursor blinking on top of the braille frames read as buggy.
