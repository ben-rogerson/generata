---
"@generata/core": minor
---

`generata init` now writes a default `generata.config.ts` if one doesn't already exist in the destination. Previously, init scaffolded `agents/`, `package.json`, `.env`, and slash commands but no anchor file, so subsequent commands like `generata help workflows` would fail with "No generata.config.ts found". The default config sets sensible Claude model tiers and points `workdir` at the destination directory; users can edit it freely. Existing config files are preserved.
