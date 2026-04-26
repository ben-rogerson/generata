---
"@generata/core": minor
---

Drop the `name` field from `defineAgent()` and `defineWorkflow()` - names are derived from each file's path relative to `agentsDir`. Workflows can now live anywhere under `agentsDir`; the `workflowsDir` config option has been removed. The CLI accepts either the canonical name (`core/plan-dreamer`) or just the basename (`plan-dreamer`) when the basename is unambiguous.
