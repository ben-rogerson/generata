---
"@generata/core": minor
---

`generata init` now runs in non-empty directories. Existing files are preserved; template-file conflicts error unless `--force` is passed. Removes the previous "use 'generata add'" loop where users with existing files couldn't init or add.
