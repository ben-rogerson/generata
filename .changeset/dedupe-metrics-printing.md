---
"@generata/core": patch
---

Dedupe metrics printing in the CLI. Internal refactor that extracts a `printSummary` helper so the today/week/agent metrics commands share one formatter; output is unchanged.
