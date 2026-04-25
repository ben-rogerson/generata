---
"@generata/core": minor
---

Template `README.md` now lands at `README-<alias>.md` in the destination instead of overwriting the user's own `README.md`. Alias is derived from the manifest name (`@generata/coding` → `README-coding.md`). Multiple templates can now coexist in one project (e.g. via `add`) without README conflicts. Templates can still override the path explicitly via `installPaths` in their manifest.
