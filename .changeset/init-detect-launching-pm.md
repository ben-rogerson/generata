---
"@generata/core": minor
---

`generata init` now detects which package manager invoked it (via `npm_config_user_agent`) and uses that PM for the install step in fresh projects. So `npx @generata/core init ...` runs `npm install`, `pnpm dlx @generata/core init ...` runs `pnpm install`, and so on. Existing projects with a lockfile still get matched against that lockfile.
