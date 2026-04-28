---
"@generata/core": patch
---

Throw `EnvProfileError` from `runWorkflow` instead of calling `process.exit(1)`. Lets CLI, tests, and library consumers decide how to handle the error.
