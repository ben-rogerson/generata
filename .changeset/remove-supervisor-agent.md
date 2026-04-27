---
"@generata/core": minor
---

Remove the `supervisor` agent type. No shipped template used it, and the dynamic-workflow-generation path it powered added complexity to the `agent` CLI without a corresponding consumer. `defineAgent({ type: "supervisor", ... })` is no longer accepted.
