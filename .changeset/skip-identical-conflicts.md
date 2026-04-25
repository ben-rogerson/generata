---
"@generata/core": patch
---

`init` and `add` no longer treat identical files as conflicts. If the destination file already has byte-identical content to what the template would write, the copy is skipped silently and not counted as a conflict. Only files whose content differs trigger the existing "re-run with --force" error. Re-running `init`/`add` against an unchanged template is now idempotent.
