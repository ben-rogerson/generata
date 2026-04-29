---
"@generata/core": patch
---

Mark failed workflow steps with ✗ in the per-step CLI output. Previously a step whose agent exited non-zero still rendered with a green tick, even though the workflow summary correctly reported FAILED.
