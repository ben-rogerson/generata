---
"@generata/core": patch
---

Fix workflow step output printing `↳ undefined <model>` instead of the agent name. The registry's TypeScript loader was creating a fresh module graph per call, so an agent imported transitively by a workflow file was a different object than the one loaded directly into the registry - the name mutation only landed on one copy. Switched to Node's regular `import()` so both references share the ESM cache.
