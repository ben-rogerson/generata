---
"@generata/core": patch
---

Pin packageManager in scaffolded package.json. Reads the invoking PM/version from npm_config_user_agent so freshly initialised projects don't trigger a Corepack `latest` download prompt.
