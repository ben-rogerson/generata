---
"@generata/core": minor
---

Show isolation mode (`local` or `worktree: <path>`) in the workflow start header so the run environment is visible at a glance and the worktree location is discoverable. Adds an optional `isolation` parameter to `logWorkflowStart` and exports a new `WorkflowIsolation` type.
