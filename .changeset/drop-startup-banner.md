---
"@generata/core": patch
---

Drop the `generata` ASCII banner and randomised tagline from the start of `generata agent` and `generata workflow` runs. The workflow start header (name, isolation, prompt log) is now the first thing printed. Removes the `logBanner` and `pickWorkflowTagline` exports from `@generata/core/logger`.
