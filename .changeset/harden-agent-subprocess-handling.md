---
"@generata/core": patch
---

Harden subprocess handling for hung agents and missing critic verdicts. Adds a SIGKILL backstop 10s after a timed-out agent's SIGTERM so a non-responsive Claude CLI can no longer block the parent run, and retries the critic step (up to `maxRetries`) when it returns no verdict instead of halting on the first transient miss.
