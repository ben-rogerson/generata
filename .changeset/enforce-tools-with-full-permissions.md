---
"@generata/core": patch
---

Enforce tools[] restrictions for full-permission agents. Previously the runner ignored the tools[] array under permissions: 'full', silently disabling any declared restriction; it now emits --allowedTools alongside --dangerously-skip-permissions.
