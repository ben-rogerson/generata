---
"@generata/core": minor
---

Expose `runWorkflow` and `runAgent` as public API so workflows and agents can be driven from code. Programmatic callers run silently by default and subscribe to structured `EngineEvent`s via `onEvent`. The CLI is unchanged in behaviour.

One internal-behaviour change worth flagging: critic-step max-retries no longer throws inside the engine. The CLI now exits non-zero by checking `result.success`. Same observable outcome for end users; loop-friendly contract for programmatic callers.
