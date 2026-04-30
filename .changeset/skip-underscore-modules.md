---
"@generata/core": patch
---

Skip underscore-prefixed files and directories in the agent loader so shared helpers (e.g. `agents/_out-of-scope.ts`) coexist with agent files without tripping the kebab-case path validator.
