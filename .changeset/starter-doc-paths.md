---
"@generata/core": patch
---

Align starter template docs with the flat `agents/` layout. The workflow ships as `agents/hello.ts`, but the templates README, starter README, and starter manifest's `postInstall` still pointed at the old `agents/workflows/hello.ts` path - users following the docs hit a non-existent file. Tables also reflowed for consistent column alignment.
