---
"@generata/core": patch
---

Upgrade tooling (TypeScript 6, zod 4, oxlint/oxfmt) and skip template scan during `generata init` when the template's `node_modules` is missing. Avoids confusing import errors during first-run scaffolding before deps are installed.
