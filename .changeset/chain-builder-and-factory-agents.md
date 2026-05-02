---
"@generata/core": minor
---

Chain-builder workflow API + typed factory agents. `defineWorkflow` now returns a fluent builder (`.step().step().build()`) and `defineAgent` accepts a factory `(inputs) => config` that types the agent's input contract. Workflow→agent wiring typos and forward-step references error in the editor; the engine no longer auto-leaks prior step outputs to agents (only what a stepFn explicitly maps reaches the agent). Breaking for code on the previous `defineWorkflow({ steps: [...] })` shape — pre-1.0 surface, no published consumers yet, so a minor bump.
