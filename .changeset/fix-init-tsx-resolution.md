---
"@generata/core": patch
---

Fix `generata init` failing with ERR_MODULE_NOT_FOUND for `tsx` when run via `pnpm dlx` from a directory that doesn't have tsx in scope. The bin now resolves the tsx loader via an absolute file URL.
