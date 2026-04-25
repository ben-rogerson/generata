---
"@generata/core": minor
---

- Removed `@generata/sws` and `@generata/stock` from the catalog (`templates.json`); only `@generata/coding` exists today.
- Coding template manifest: dropped `WORKDIR` from `requiredEnv` (the working directory is now set in `generata.config.ts`, no longer prompted as an env var). Tidied bin hints and rewrote `postInstall` to match the current init flow.
- Coding README: updated the env table and added a note about configuring `workdir` in `generata.config.ts`.
