---
"@generata/core": patch
---

Fix `[object Object]` rendering in `generata help templates`. The catalog format moved to `{ url, subdir }` objects but the help command was still typing entries as plain strings; now destructures the fields and prints `<url>  (<subdir>)`.
