---
"@generata/core": minor
---

Chain-builder workflow API + typed factory agents + typed outputs + first-class halts.

- `defineWorkflow` now returns a fluent builder (`.step().step().build()`) and `defineAgent` accepts a factory `(inputs) => config` that types the agent's input contract. Workflow→agent wiring typos and forward-step references error in the editor; the engine no longer auto-leaks prior step outputs to agents (only what a stepFn explicitly maps reaches the agent).
- New `outputs: Record<string, string>` field on agents (key → LLM-facing description). Engine wires a per-agent emit bin with surgical `Bash(<bin>:*)` permission, parses the captured values, and merges them into the runtime params bag. Chain builder threads the literal output keys through `TBaseParams` so downstream stepFns destructure them with full type-safety.
- First-class halts: agents call `--halt "<reason>"` via the emit bin to stop the workflow cleanly (no metric failure, downstream steps skipped, `haltReason` set). Replaces text-sentinel patterns (`STATUS: halt`, `NO_ITEMS`, etc.) across templates and self-improve.
- Factory-form `onReject`: `StepOptions.onReject` accepts a typed stepFn `(params) => StepInvocation` with the same contextual typing as `.step()`. Wrap factories in a stepFn to use them as rejection handlers.
- Internal: `verdict`/`params` bin permissions tightened to surgical `Bash(<bin>:*)` patterns (no more broad `Bash` injection for critics/planners).

Breaking for code on the previous `defineWorkflow({ steps: [...] })` shape — pre-1.0 surface, no published consumers yet, so a minor bump.
