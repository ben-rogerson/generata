---
"@generata/core": patch
---

`generata init` no longer crashes when the template scan can't import an agent or workflow file (typically because a fresh template clone has no `node_modules`). Files that fail to load are skipped with a single summary line; the workflow precheck still catches missing env vars at run time.
