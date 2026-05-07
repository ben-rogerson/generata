---
"@generata/core": patch
---

Fix preflight uses platform-specific command lookup. Use `where` on Windows and `which` on Unix-like systems to properly detect CLI tools on all platforms.
