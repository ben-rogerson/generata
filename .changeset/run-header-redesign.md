---
"@generata/core": minor
---

Redesign the run header: rainbow `generata` banner with an italic tagline, a `7d · …` weekly metrics line (new `showWeeklyMetrics` config, default on) that compares against the prior 7 days, and the prompt log path shown in-header when `logPrompts` is on. Prompt log files now live at `<logsDir>/<kind>/<basename>-<runId>.log` with collision-aware fallback. Agent type colours moved to cyan/magenta/orange so they no longer clash with status colours.
