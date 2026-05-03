---
"@generata/core": minor
---

Typed outputs, first-class halts, and surgical bin permissions.

- New `outputs: Record<string, string>` field on agents (key → LLM-facing description). Engine wires a per-agent emit bin with surgical `Bash(<bin>:*)` permission, parses the captured values, and merges them into the runtime params bag. Chain builder threads the literal output keys through `TBaseParams` so downstream stepFns destructure them with full type-safety.
- First-class halts: agents call `--halt "<reason>"` via the emit bin to stop the workflow cleanly (no metric failure, downstream steps skipped, `haltReason` set). Replaces text-sentinel patterns (`STATUS: halt`, `NO_ITEMS`, etc.).
- Factory-form `onReject`: `StepOptions.onReject` accepts a typed stepFn `(params) => StepInvocation` with the same contextual typing as `.step()`. Wrap factories in a stepFn to use them as rejection handlers.
- Internal: `verdict`/`params` bin permissions tightened to surgical `Bash(<bin>:*)` patterns (no more broad `Bash` injection for critics/planners).
