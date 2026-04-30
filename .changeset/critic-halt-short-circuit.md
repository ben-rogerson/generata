---
"@generata/core": minor
---

Short-circuit critic retry on STATUS: halt and narrow Tool enum. The engine now breaks the critic-rejection retry loop when the worker reports a structural halt, since retrying cannot resolve a spec/plan-level conflict. The Tool enum drops `"read"`, `"glob"`, `"grep"` (no-op tokens that were never wired to the runner); shipped templates are updated to declare only the tools they use.
