---
"@generata/core": patch
---

`generata skills sync` now writes slash-command bodies that invoke the workflow shorthand (`pnpm generata <name>`) instead of the long form. Existing `.claude/commands/<name>.md` files are regenerated on next sync.
