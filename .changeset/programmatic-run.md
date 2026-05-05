---
"@generata/core": minor
---

Expose `runWorkflow` and `runAgent` as public API so workflows and agents can be driven from code. Programmatic callers run silently by default and subscribe to structured `EngineEvent`s via `onEvent`. The CLI is unchanged in behaviour.

`AbortSignal` is now wired through `runWorkflow` end-to-end: a pre-aborted signal short-circuits before precheck/worktree setup, and a signal that fires mid-step bypasses the per-agent retry loop and propagates `AbortError` to the caller.

The `EngineEvent` union now emits a discrete `halt` event when a worker calls `emit --halt`, and `workflow-start` carries the `runId` (the same id stamped into per-step metric records) so subscribers can correlate events with metrics.

One internal-behaviour change worth flagging: critic-step max-retries no longer throws inside the engine. The CLI now exits non-zero by checking `result.success`. Same observable outcome for end users; loop-friendly contract for programmatic callers.
