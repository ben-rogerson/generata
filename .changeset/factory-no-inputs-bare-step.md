---
"@generata/core": minor
---

Allow factory-form agents with no declared inputs to be passed bare to `.step()` and `onReject`. Previously, `defineAgent<{}>(() => ({...}))` had to be wrapped as `.step("id", () => agent({}))` even though there were no inputs to thread - the engine now wraps such factories itself, so `.step("id", agent)` works. Factories with declared inputs are still required to be called inside a stepFn so prior-step outputs thread through correctly.
