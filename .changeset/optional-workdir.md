---
"@generata/core": minor
---

Make `workDir` optional in `defineConfig`. `loadConfig` now back-fills it from the directory containing `generata.config.ts`, so user configs no longer need to repeat the path.
