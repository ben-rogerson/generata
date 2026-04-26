---
"@generata/core": patch
---

`generata init` no longer writes a 0-byte `.env.example` when the template declares no `requiredEnv` and no scanned agent declares `envKeys`. Prints a one-line note in its place so the step output stays accurate.
