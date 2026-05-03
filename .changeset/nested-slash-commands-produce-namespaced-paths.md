---
"@generata/core": patch
---

Fix: flatten nested workflow names in slash command generation. Workflows under nested paths now generate commands with just the basename instead of namespaced paths, and collision detection prevents duplicate command names.
