---
"@generata/core": patch
---

Show raw token counts under 1000 in logs instead of rounding to "0k tok". Small steps now report e.g. "543 tok"; counts ≥ 1000 keep the existing "Nk tok" format.
