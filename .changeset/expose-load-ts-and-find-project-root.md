---
"@generata/core": minor
---

Expose `loadTs` and `findProjectRoot` as public exports so consumer packages (notably `@generata/serve`) can resolve project-relative TypeScript modules.

Add an optional `serve` field to `GlobalConfig` so `defineConfig({ serve: {...} })` typechecks for users of `@generata/serve`. Core ignores the field; the serve package validates and consumes it.
