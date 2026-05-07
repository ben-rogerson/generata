---
"@generata/core": minor
---

Programmatic `runWorkflow` / `runAgent` now write prompt logs to the same `<logsDir>/<kind>/<name>-<runId>.log` paths the CLI uses, mirroring the CLI's `logPrompts` flow. The path is printed once to stderr at run start as `Full log: file:///...` so callers can click through and tail the file as it streams - this fires for both CLI and programmatic runs, with or without `onEvent`. Pass `promptLogFile` to override the path.

Silent-mode programmatic runs also print a header to stderr: `workflow: <name> (<n> steps)` or `agent: <name> [<type>]`. Suppressed when `onEvent` is wired (the caller is driving display).

Auto-derived programmatic log paths now prepend the calling script's basename - e.g. `logs/workflow/batch-script-review-note-<runId>.log` instead of `logs/workflow/review-note-<runId>.log` - so logs from different scripts driving the same workflow are easy to tell apart. CLI runs and explicit `promptLogFile` overrides are unaffected.

`consoleSink` no longer prints the prompt log path itself on `workflow-start` / `agent-welcome` - `runWorkflow` / `runAgent` are now the single source for that line.

The `logPrompts` config default has flipped from `false` to `true` - prompt logs are on by default for both CLI and programmatic runs. Set `logPrompts: false` in `generata.config.ts` to opt out.
