---
"@generata/core": minor
---

Add `each:` to `.step()` so a workflow step can run a sub-workflow once per item from a directory glob, JSON file, or function. Each iteration runs as a normal sub-workflow with its own runId. Per-iteration outputs are recorded in a manifest at `<work_dir>/.generata/loops/<workflow>-<step>-<run>.json`, surfaced downstream as `<step-id>_manifest`. Supports `concurrency` (sequential by default), `onFailure: "halt" | "continue"`, an `onItemFail` agent for per-failure side effects, and `maxRetries` per iteration. New exports: `LoopWorkflowStep` and `EachSource` from `@generata/core`.
